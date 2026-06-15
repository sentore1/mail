/**
 * /api/followup/process
 *
 * The follow-up scheduler engine with SMTP threading, AI generation, and smart decision making.
 *
 * Called by:
 *  - Vercel Cron (vercel.json) — runs every hour automatically
 *  - /api/followup/trigger    — manual trigger from the UI
 *
 * What it does:
 *  1. Finds every sent_email where next_followup_at <= NOW() and the lead
 *     hasn't replied, isn't dead, and hasn't hit max_followups.
 *  2. Generates a follow-up email body (AI if enabled, template otherwise).
 *  3. Sends it via SMTP with proper threading headers (In-Reply-To, References).
 *  4. Logs the send, increments followup_count, schedules the next one.
 *  5. Stops the sequence if stop_on_reply is true and a reply was detected.
 *
 * Security:
 *  - Browser requests must be authenticated (Supabase session).
 *  - Cron requests must include the CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";
import { SMTPManager } from "@/utils/smtp-server";
import { generateFollowUp, FollowUpContext } from "@/utils/ai-followup-generator";

// nodemailer requires the Node.js runtime (not Edge)
export const runtime = "nodejs";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DueFollowup {
  sent_email_id: string;
  user_id: string;
  lead_id: string;
  campaign_id: string | null;
  original_subject: string | null;
  original_body: string | null;
  sent_at: string;
  followup_count: number;
  next_followup_at: string;
  smtp_message_id: string | null;
  thread_id: string | null;
  in_reply_to: string | null;
  references_header: string | null;
  company_name: string;
  lead_email: string | null;
  niche: string | null;
  location: string | null;
  company_context: string | null;
  lead_status: string;
  open_count: number;
  click_count: number;
  is_unsubscribed: boolean;
  max_followups: number;
  default_delay_days: number;
  stop_on_reply: boolean;
  followup_tone: string | null;
  use_ai_generation: boolean;
  ai_followup_style: string | null;
  business_days_only: boolean;
  sending_window_start: number;
  sending_window_end: number;
  random_delay_minutes: number;
  your_company: string | null;
  your_service: string | null;
  followup_subject_prefix: string | null;
}

interface ProcessResult {
  userId: string;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

// ─── Core processor ───────────────────────────────────────────────────────────

async function processFollowupsForUser(
  userId: string,
  dueItems: DueFollowup[]
): Promise<ProcessResult> {
  const service = createServiceClient();
  const result: ProcessResult = { userId, sent: 0, skipped: 0, failed: 0, errors: [] };

  // Load SMTP accounts once per user
  const smtpManager = new SMTPManager();
  try {
    await smtpManager.loadAccounts(userId);
  } catch (err) {
    result.errors.push(`Failed to load SMTP accounts: ${err instanceof Error ? err.message : String(err)}`);
    result.failed += dueItems.length;
    return result;
  }

  const capacity = smtpManager.getTotalCapacity();
  if (capacity.remaining === 0) {
    result.errors.push("All SMTP accounts at daily limit");
    result.skipped += dueItems.length;
    return result;
  }

  for (const due of dueItems) {
    try {
      // ── Guard: skip if lead has no email ──────────────────────────────────
      if (!due.lead_email) {
        await markSkipped(service, due, "no_email");
        result.skipped++;
        continue;
      }

      // ── Guard: skip if unsubscribed ───────────────────────────────────────
      if (due.is_unsubscribed) {
        await stopSequence(service, due.sent_email_id, "unsubscribed");
        result.skipped++;
        continue;
      }

      // ── Guard: stop if lead replied / is in a terminal status ─────────────
      if (
        due.stop_on_reply &&
        ["replied", "Replied", "Interested", "Closed", "Dead", "unsubscribed"].includes(due.lead_status)
      ) {
        await stopSequence(service, due.sent_email_id, "lead_replied_or_closed");
        result.skipped++;
        continue;
      }

      // ── Guard: check if a reply exists in email_replies ───────────────────
      if (due.stop_on_reply) {
        const { count } = await service
          .from("email_replies")
          .select("id", { count: "exact", head: true })
          .eq("sent_email_id", due.sent_email_id);

        if ((count ?? 0) > 0) {
          await stopSequence(service, due.sent_email_id, "reply_detected");
          result.skipped++;
          continue;
        }
      }

      // ── Generate follow-up content ────────────────────────────────────────
      let subject: string;
      let body: string;
      let aiGenerated = false;
      let modelUsed = "template";
      let decisionReason = "";

      if (due.use_ai_generation) {
        // AI-powered generation with smart decision engine
        const ctx: FollowUpContext = {
          companyName: due.company_name,
          niche: due.niche,
          location: due.location,
          companyContext: due.company_context,
          originalSubject: due.original_subject ?? "",
          originalBody: due.original_body ?? "",
          sentAt: due.sent_at,
          followupNumber: due.followup_count + 1,
          openCount: due.open_count,
          clickCount: due.click_count,
          hasReplied: false,
          yourCompany: due.your_company ?? "our company",
          yourService: due.your_service ?? "our service",
        };

        const generated = await generateFollowUp(userId, ctx);
        subject = generated.subject;
        body = generated.body;
        aiGenerated = modelUsed !== "template";
        modelUsed = generated.modelUsed;
        decisionReason = generated.decisionReason;

        // Log AI generation
        await service.from("ai_followup_generations").insert({
          user_id: userId,
          sent_email_id: due.sent_email_id,
          lead_id: due.lead_id,
          followup_number: due.followup_count + 1,
          style: generated.style,
          subject,
          body,
          model_used: modelUsed,
          decision_reason: decisionReason,
          lead_opens: due.open_count,
          lead_clicks: due.click_count,
          status: "used",
          used_at: new Date().toISOString(),
        });
      } else {
        // Template-based generation
        const prefix = due.followup_subject_prefix ?? "Re: ";
        subject = `${prefix}${due.original_subject ?? "Following up"}`;
        body = buildTemplateFollowup(due);
      }

      // ── Check SMTP capacity before each send ──────────────────────────────
      const currentCapacity = smtpManager.getTotalCapacity();
      if (currentCapacity.remaining === 0) {
        // Queue this one for tomorrow
        await service.from("followup_queue").insert({
          user_id: userId,
          sent_email_id: due.sent_email_id,
          lead_id: due.lead_id,
          campaign_id: due.campaign_id,
          followup_number: due.followup_count + 1,
          scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          status: "pending",
          subject,
          body,
        });
        result.skipped++;
        continue;
      }

      // ── Send with threading headers ───────────────────────────────────────
      const inReplyTo = due.smtp_message_id ?? due.in_reply_to;
      const references = due.references_header
        ? `${due.references_header} ${inReplyTo}`
        : inReplyTo;

      const sendResult = await smtpManager.sendEmail(
        due.lead_email,
        subject,
        body,
        undefined,
        { inReplyTo: inReplyTo ?? undefined, references: references ?? undefined }
      );

      if (!sendResult.success) {
        throw new Error(sendResult.error ?? "SMTP send failed");
      }

      // ── Resolve smtp_account UUID ─────────────────────────────────────────
      let smtpAccountId: string | null = null;
      if (sendResult.accountUsed) {
        const { data: acct } = await service
          .from("smtp_accounts")
          .select("id")
          .eq("user_id", userId)
          .eq("email", sendResult.accountUsed)
          .single();
        smtpAccountId = acct?.id ?? null;
      }

      const now = new Date().toISOString();
      const newFollowupCount = due.followup_count + 1;
      const isLastFollowup = newFollowupCount >= due.max_followups;

      // ── Log to sent_emails (new row for this follow-up) ───────────────────
      const { data: newSentEmail } = await service
        .from("sent_emails")
        .insert({
          user_id: userId,
          lead_id: due.lead_id,
          campaign_id: due.campaign_id,
          to_email: due.lead_email,
          subject,
          body,
          sent_at: now,
          status: "sent",
          followup_count: newFollowupCount,
          is_followup: true,
          ai_generated: aiGenerated,
          parent_sent_email_id: due.sent_email_id,
          thread_id: due.thread_id,
          smtp_message_id: sendResult.messageId ?? null,
          in_reply_to: inReplyTo,
          references_header: references,
          smtp_account_id: smtpAccountId,
          followup_stopped: isLastFollowup,
          next_followup_at: null,
        })
        .select("id")
        .single();

      // ── Log to followup_queue ─────────────────────────────────────────────
      await service.from("followup_queue").insert({
        user_id: userId,
        sent_email_id: due.sent_email_id,
        lead_id: due.lead_id,
        campaign_id: due.campaign_id,
        followup_number: newFollowupCount,
        scheduled_at: now,
        sent_at: now,
        status: "sent",
        subject,
        body,
      });

      // ── Update the original sent_email row ────────────────────────────────
      const nextFollowupAt = isLastFollowup
        ? null
        : new Date(Date.now() + due.default_delay_days * 24 * 60 * 60 * 1000).toISOString();

      await service
        .from("sent_emails")
        .update({
          followup_count: newFollowupCount,
          followup_stopped: isLastFollowup,
          next_followup_at: nextFollowupAt,
        })
        .eq("id", due.sent_email_id);

      // ── Update lead ───────────────────────────────────────────────────────
      await service
        .from("leads")
        .update({
          followup_count: newFollowupCount,
          last_followup_at: now,
          updated_at: now,
        })
        .eq("id", due.lead_id);

      result.sent++;

      // Small throttle between sends
      await new Promise((r) => setTimeout(r, 1200));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${due.lead_email ?? due.lead_id}: ${msg}`);
      result.failed++;

      // Log failure to followup_queue
      await service.from("followup_queue").insert({
        user_id: userId,
        sent_email_id: due.sent_email_id,
        lead_id: due.lead_id,
        campaign_id: due.campaign_id,
        followup_number: due.followup_count + 1,
        scheduled_at: new Date().toISOString(),
        status: "failed",
        error_message: msg,
      });
    }
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function stopSequence(
  service: ReturnType<typeof createServiceClient>,
  sentEmailId: string,
  reason: string
) {
  await service
    .from("sent_emails")
    .update({ followup_stopped: true, next_followup_at: null })
    .eq("id", sentEmailId);

  const { data: sent } = await service
    .from("sent_emails")
    .select("user_id, lead_id")
    .eq("id", sentEmailId)
    .single();

  if (sent) {
    await service.from("followup_queue").insert({
      user_id: sent.user_id,
      sent_email_id: sentEmailId,
      lead_id: sent.lead_id,
      followup_number: 0,
      scheduled_at: new Date().toISOString(),
      status: "skipped",
      skip_reason: reason,
    });
  }
}

async function markSkipped(
  service: ReturnType<typeof createServiceClient>,
  due: DueFollowup,
  reason: string
) {
  await service.from("followup_queue").insert({
    user_id: due.user_id,
    sent_email_id: due.sent_email_id,
    lead_id: due.lead_id,
    campaign_id: due.campaign_id,
    followup_number: due.followup_count + 1,
    scheduled_at: new Date().toISOString(),
    status: "skipped",
    skip_reason: reason,
  });
}

function buildTemplateFollowup(due: DueFollowup): string {
  const num = due.followup_count + 1;
  const company = due.company_name;
  const yourCompany = due.your_company ?? "Pryro";
  const yourService = due.your_service ?? "our service";

  // Time-aware greeting (EAT default)
  const hour = (new Date().getUTCHours() + 3) % 24;
  const greeting = hour >= 5 && hour < 12 ? 'Good morning,' : hour >= 12 && hour < 17 ? 'Good afternoon,' : 'Greetings,';
  const sig = `Regards,\nAlice\n${yourCompany}`;

  if (num === 1) {
    return `${greeting}\n\nJust following up on my previous email about ${yourService}.\n\nI have 10 minutes free tomorrow afternoon if that works, what do you think?\n\n${sig}`;
  }
  if (num === 2) {
    return `${greeting}\n\nOne more follow-up in case my last email got buried.\n\nStill think ${yourService} could be useful for ${company}. I am free for a quick call later today, does that work?\n\n${sig}`;
  }
  if (num >= 3) {
    return `${greeting}\n\nLast follow-up from me, keeping it short.\n\nIf ${yourService} ever becomes a priority at ${company}, Pryro is here when the time is right.\n\n${sig}`;
  }

  return `${greeting}\n\nJust following up again on ${yourService}. Let me know if you would like to explore this.\n\n${sig}`;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * POST /api/followup/process
 *
 * Accepts two callers:
 *  1. Vercel Cron — must send header: Authorization: Bearer <CRON_SECRET>
 *  2. Authenticated browser — must have a valid Supabase session
 *     (optionally pass { userId } in body to scope to one user)
 */
export async function POST(request: NextRequest) {
  // ── Auth: cron secret OR user session ─────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCronCall =
    cronSecret && authHeader === `Bearer ${cronSecret}`;

  let callerUserId: string | null = null;

  if (!isCronCall) {
    // Must be an authenticated user
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    callerUserId = user.id;
  }

  // ── Parse optional body ───────────────────────────────────────────────────
  let bodyUserId: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    bodyUserId = body?.userId ?? null;
  } catch {
    // no body — fine
  }

  // Cron can process all users; browser session is scoped to their own userId
  const targetUserId = isCronCall ? (bodyUserId ?? null) : callerUserId;

  const service = createServiceClient();

  // ── Fetch due follow-ups ──────────────────────────────────────────────────
  let query = service.from("followup_due").select("*");
  if (targetUserId) {
    query = query.eq("user_id", targetUserId);
  }

  const { data: dueItems, error: fetchError } = await query;

  if (fetchError) {
    console.error("[/api/followup/process] fetch error:", fetchError);
    return NextResponse.json(
      { success: false, error: fetchError.message },
      { status: 500 }
    );
  }

  if (!dueItems || dueItems.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No follow-ups due right now",
      processed: 0,
      results: [],
    });
  }

  // ── Group by user so we load SMTP accounts once per user ─────────────────
  const byUser = new Map<string, DueFollowup[]>();
  for (const item of dueItems as DueFollowup[]) {
    const list = byUser.get(item.user_id) ?? [];
    list.push(item);
    byUser.set(item.user_id, list);
  }

  // ── Process each user's queue ─────────────────────────────────────────────
  const allResults: ProcessResult[] = [];
  for (const [uid, items] of byUser) {
    const result = await processFollowupsForUser(uid, items);
    allResults.push(result);
  }

  const totals = allResults.reduce(
    (acc, r) => ({
      sent: acc.sent + r.sent,
      skipped: acc.skipped + r.skipped,
      failed: acc.failed + r.failed,
    }),
    { sent: 0, skipped: 0, failed: 0 }
  );

  console.log(
    `[followup/process] done — sent:${totals.sent} skipped:${totals.skipped} failed:${totals.failed}`
  );

  return NextResponse.json({
    success: true,
    message: `Processed ${dueItems.length} due follow-ups: ${totals.sent} sent, ${totals.skipped} skipped, ${totals.failed} failed`,
    processed: dueItems.length,
    totals,
    results: allResults,
  });
}

// GET is used by Vercel Cron (it sends GET requests)
export async function GET(request: NextRequest) {
  return POST(request);
}
