import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../supabase/server";
import { createServiceClient } from "../../../../supabase/service";
import { SMTPManager } from "@/utils/smtp-server";
import { verifyEmail, verifyEmailDNS } from "@/utils/email-verifier";
import { scheduleFollowUps } from "@/utils/followup-processor";
import { randomUUID } from "crypto";

// nodemailer requires the Node.js runtime (not Edge)
export const runtime = "nodejs";

export interface BulkEmailItem {
  leadId: string;
  to: string;
  companyName: string;
  subject: string;
  body: string;
  /** confidence_score from leads table — 90 = real scraped, 50 = AI predicted */
  confidenceScore?: number;
  /** email_verified from leads table */
  emailVerified?: boolean;
}

export interface SendBulkRequest {
  emails: BulkEmailItem[];
  /** Delay in ms between each send. Defaults to 1500. */
  delayMs?: number;
  /** Whether to verify email DNS before sending. Defaults to true. */
  verifyEmails?: boolean;
  /** Auto-schedule follow-ups for each sent email. Defaults to true. */
  scheduleFollowups?: boolean;
}

export interface SendBulkResponse {
  success: boolean;
  results?: {
    total: number;
    sent: number;
    failed: number;
    queued: number;
    followupsScheduled: number;
    errors: string[];
  };
  campaignId?: string;
  accountStats?: ReturnType<SMTPManager["getAccountStats"]>;
  error?: string;
}

/**
 * Convert plain text email body to clean HTML with tracking pixel.
 */
function plainToHtml(text: string, trackingPixelId?: string, baseUrl?: string): string {
  // If already HTML, inject pixel before </body>
  if (/<html[\s>]/i.test(text) || /<p[\s>]/i.test(text)) {
    if (trackingPixelId && baseUrl) {
      const pixel = `<img src="${baseUrl}/api/track/open?id=${trackingPixelId}" width="1" height="1" style="display:none;border:0;" alt="" />`;
      return text.includes('</body>') ? text.replace(/<\/body>/i, `${pixel}</body>`) : text + pixel;
    }
    return text;
  }

  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const paragraphs = escaped
    .trim()
    .split(/\n\n+/)
    .map(para => {
      const lines = para.trim().split('\n').map(l => l.trim()).join('<br>');
      return `<p style="margin:0 0 16px 0;line-height:1.65;color:#222222;">${lines}</p>`;
    })
    .join('\n');

  const pixel = trackingPixelId && baseUrl
    ? `\n<img src="${baseUrl}/api/track/open?id=${trackingPixelId}" width="1" height="1" style="display:none;border:0;" alt="" />`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222222;max-width:580px;margin:0 auto;padding:24px 20px;background:#ffffff;">
${paragraphs}${pixel}
</body>
</html>`;
}

/** Lightweight DNS-based email validation — uses imported verifyEmailDNS */

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const payload = (await request.json()) as SendBulkRequest;
    const {
      emails,
      delayMs = 800,
      verifyEmails = true,
      scheduleFollowups = true,
    } = payload;

    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { success: false, error: "emails array is required and must not be empty" },
        { status: 400 }
      );
    }

    const serviceSupabase = createServiceClient();

    // Load SMTP accounts
    const smtpManager = new SMTPManager();
    await smtpManager.loadAccounts(user.id);

    const capacity = smtpManager.getTotalCapacity();
    if (capacity.remaining === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "All SMTP accounts have reached their daily limit. Try again tomorrow.",
        },
        { status: 429 }
      );
    }

    // Create a campaign record to group this batch
    const { data: campaign } = await serviceSupabase
      .from("email_campaigns")
      .insert({
        user_id: user.id,
        name: `Bulk Campaign — ${new Date().toLocaleString()}`,
        template_subject: emails[0]?.subject ?? "Bulk Email",
        template_body: "Personalized bulk emails",
        status: "active",
        total_recipients: emails.length,
      })
      .select("id")
      .single();

    const campaignId = campaign?.id ?? null;

    const results = {
      total: emails.length,
      sent: 0,
      failed: 0,
      queued: 0,
      followupsScheduled: 0,
      errors: [] as string[],
    };

    for (const email of emails) {
      try {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.to)) {
          results.failed++;
          results.errors.push(`${email.to}: invalid email format`);
          await serviceSupabase.from("email_queue").insert({
            user_id: user.id, campaign_id: campaignId, lead_id: email.leadId,
            recipient_email: email.to, recipient_name: email.companyName,
            subject: email.subject, body: email.body,
            status: "failed", error_message: "Invalid email format",
          });
          continue;
        }

        // Block obviously fake/placeholder local parts only
        const localPart = email.to.split('@')[0]?.toLowerCase() ?? '';
        const FAKE_LOCALS = new Set([
          'johndoe', 'john.doe', 'john_doe', 'janedoe', 'jane.doe',
          'test', 'test1', 'test2', 'testuser', 'testing',
          'example', 'sample', 'demo', 'dummy', 'fake', 'placeholder',
          'user', 'user1', 'user123', 'myemail', 'email', 'yourname',
          'firstname', 'lastname', 'name', 'noreply', 'no-reply',
        ]);
        if (FAKE_LOCALS.has(localPart)) {
          results.failed++;
          results.errors.push(`${email.to}: skipped — placeholder/fake email address`);
          await serviceSupabase.from("sent_emails").insert({
            user_id: user.id, lead_id: email.leadId || null, campaign_id: campaignId,
            to_email: email.to, subject: email.subject, body: email.body,
            sent_at: new Date().toISOString(), status: "failed",
            bounce_reason: `Email not sent — placeholder email address`,
          });
          if (email.leadId) {
            await serviceSupabase.from("leads")
              .update({ status: "invalid_email", updated_at: new Date().toISOString() })
              .eq("id", email.leadId);
          }
          continue;
        }

        // Only skip AI-predicted emails with very low confidence (below 40)
        // Many scraped leads have confidence 50 which is acceptable
        const score = email.confidenceScore ?? 90;
        const verified = email.emailVerified ?? false;
        if (!verified && score < 40) {
          results.failed++;
          results.errors.push(`${email.to}: skipped — very low confidence AI-predicted email`);
          await serviceSupabase.from("sent_emails").insert({
            user_id: user.id, lead_id: email.leadId || null, campaign_id: campaignId,
            to_email: email.to, subject: email.subject, body: email.body,
            sent_at: new Date().toISOString(), status: "failed",
            bounce_reason: "Email not sent — AI-predicted address (very low confidence)",
          });
          if (email.leadId) {
            await serviceSupabase.from("leads")
              .update({ status: "invalid_email", updated_at: new Date().toISOString() })
              .eq("id", email.leadId);
          }
          continue;
        }        // Email verification — skip SMTP probe (blocked on cloud hosts, causes false negatives)
        // We only log and continue — we do not block sends based on verification results
        if (verifyEmails) {
          try {
            const verification = await verifyEmail(email.to);
            // Only hard-block confirmed disposable domains
            if (verification.status === 'disposable') {
              results.failed++;
              results.errors.push(`${email.to}: disposable email domain — skipped`);
              await serviceSupabase.from("sent_emails").insert({
                user_id: user.id, lead_id: email.leadId || null, campaign_id: campaignId,
                to_email: email.to, subject: email.subject, body: email.body,
                sent_at: new Date().toISOString(), status: "failed",
                bounce_reason: "Disposable email domain",
              }).catch(() => {});
              continue;
            }
            // For everything else (valid, catch_all, risky, unverifiable, invalid) — proceed to send
            // The actual SMTP delivery will confirm whether the address works
          } catch { /* verification failed — proceed anyway */ }
        }

        // Check remaining capacity before each send
        const currentCapacity = smtpManager.getTotalCapacity();
        if (currentCapacity.remaining === 0) {
          // Queue the rest for tomorrow
          await serviceSupabase.from("email_queue").insert({
            user_id: user.id,
            campaign_id: campaignId,
            lead_id: email.leadId,
            recipient_email: email.to,
            recipient_name: email.companyName,
            subject: email.subject,
            body: email.body,
            status: "pending",
            scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          });
          results.queued++;
          continue;
        }

        // Generate tracking pixel ID and build HTML body
        const trackingPixelId = randomUUID();
        const baseUrl = (
          process.env.NEXT_PUBLIC_APP_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
          'http://localhost:3000'
        ).replace(/\/$/, '');
        const htmlBody = plainToHtml(email.body, trackingPixelId, baseUrl);

        // Send
        const sendResult = await smtpManager.sendEmail(
          email.to,
          email.subject,
          htmlBody
        );

        console.log(`[send-bulk] ${email.to}: ${sendResult.success ? '✅ sent' : '❌ ' + sendResult.error}`);

        if (sendResult.success) {
          results.sent++;

          // Resolve smtp_account id from the email address used
          let smtpAccountId: string | null = null;
          if (sendResult.accountUsed) {
            const { data: smtpAccount } = await serviceSupabase
              .from("smtp_accounts")
              .select("id")
              .eq("user_id", user.id)
              .eq("email", sendResult.accountUsed)
              .single();
            smtpAccountId = smtpAccount?.id ?? null;
          }

          // Log to email_queue
          await serviceSupabase.from("email_queue").insert({
            user_id: user.id,
            campaign_id: campaignId,
            lead_id: email.leadId,
            smtp_account_id: smtpAccountId,
            recipient_email: email.to,
            recipient_name: email.companyName,
            subject: email.subject,
            body: email.body,
            status: "sent",
            sent_at: new Date().toISOString(),
          });

          // Log to sent_emails (include to_email so reply matching works)
          const { data: sentRow } = await serviceSupabase
            .from("sent_emails")
            .insert({
              user_id: user.id,
              lead_id: email.leadId,
              campaign_id: campaignId,
              to_email: email.to,
              subject: email.subject,
              body: htmlBody,
              sent_at: new Date().toISOString(),
              status: "sent",
              message_id: sendResult.messageId ?? null,
              tracking_pixel_id: trackingPixelId,
            })
            .select("id")
            .single();

          // ── Schedule follow-ups ─────────────────────────────────────────
          const sentId = sentRow?.id ?? null;
          const smtpMessageId = sendResult.messageId ?? null;

          if (scheduleFollowups && sentId && campaignId && email.leadId && smtpMessageId) {
            try {
              const { data: threadId, error: threadErr } = await serviceSupabase.rpc(
                "get_or_create_thread",
                {
                  p_user_id: user.id,
                  p_lead_id: email.leadId,
                  p_campaign_id: campaignId,
                  p_subject: email.subject,
                  p_message_id: smtpMessageId,
                }
              );

              if (!threadErr && threadId) {
                // Link the sent_emails row to the thread
                await serviceSupabase
                  .from("sent_emails")
                  .update({ email_thread_id: threadId })
                  .eq("id", sentId);

                const count = await scheduleFollowUps(
                  user.id,
                  sentId,
                  threadId as string,
                  email.leadId,
                  campaignId,
                  smtpMessageId
                );

                results.followupsScheduled += count;
              } else if (threadErr) {
                console.error(`[send-bulk] Thread error for ${email.to}:`, threadErr.message);
              }
            } catch (fuErr) {
              // Never fail the bulk send because of a follow-up error
              console.error(`[send-bulk] Follow-up scheduling failed for ${email.to}:`, fuErr);
            }
          }

          // Update lead status to "contacted" if still "new"
          await serviceSupabase
            .from("leads")
            .update({ status: "contacted", updated_at: new Date().toISOString(), last_contacted_at: new Date().toISOString() })
            .eq("id", email.leadId)
            .in("status", ["new", "New"]); // Only update if still new
        } else {
          results.failed++;
          results.errors.push(`${email.to}: ${sendResult.error}`);

          // Detect hard bounces — "address not found", "user unknown", etc.
          const errorMsg = (sendResult.error ?? '').toLowerCase();
          const isHardBounce = /address.*not.*found|user.*unknown|no.*such.*user|mailbox.*not.*found|does.*not.*exist|invalid.*recipient|550|551|553/.test(errorMsg);
          const leadStatus = isHardBounce ? "bounced" : "failed";

          await serviceSupabase.from("sent_emails").insert({
            user_id: user.id,
            lead_id: email.leadId,
            campaign_id: campaignId,
            to_email: email.to,
            subject: email.subject,
            body: email.body,
            sent_at: new Date().toISOString(),
            status: "failed",
            bounce_reason: sendResult.error ?? "Send failed",
          });

          if (email.leadId) {
            await serviceSupabase
              .from("leads")
              .update({
                status: leadStatus,
                email_verified: isHardBounce ? false : undefined,
                updated_at: new Date().toISOString(),
              })
              .eq("id", email.leadId);
          }
        }

        // Throttle between sends
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (err) {
        results.failed++;
        const msg = err instanceof Error ? err.message : "Unknown error";
        results.errors.push(`${email.to}: ${msg}`);
      }
    }

    // Update campaign with final stats
    if (campaignId) {
      await serviceSupabase
        .from("email_campaigns")
        .update({
          sent_count: results.sent,
          status:
            results.sent === results.total
              ? "completed"
              : results.queued > 0
              ? "active"
              : "completed",
        })
        .eq("id", campaignId);
    }

    return NextResponse.json({
      success: true,
      results,
      campaignId,
      accountStats: smtpManager.getAccountStats(),
    } satisfies SendBulkResponse);
  } catch (error) {
    console.error("[/api/send-bulk] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
