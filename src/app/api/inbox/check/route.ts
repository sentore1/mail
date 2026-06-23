/**
 * /api/inbox/check
 *
 * Scans all SMTP accounts (Gmail, Outlook, etc.) for replies using IMAP.
 * NO separate inbox configuration needed — uses the same App Password
 * already stored in smtp_accounts for SMTP sending.
 *
 * Called by:
 *  - Vercel Cron every 15 min (GET with Authorization: Bearer <CRON_SECRET>)
 *  - "Check Now" button in UI (POST with Supabase session)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";
import { classifyReply } from "@/utils/ai-followup-generator";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

interface InboxConfig {
  id: string;
  user_id: string;
  email_address: string;
  provider: string;
  imap_host: string;
  imap_port: number;
  imap_username: string;
  imap_password: string;
  last_checked_at: string | null;
  auto_reply_enabled: boolean;
}

interface ParsedEmail {
  messageId:  string;
  inReplyTo:  string | null;
  references: string | null;
  subject:    string;
  from:       string;
  fromEmail:  string;
  body:       string;
  receivedAt: Date;
}

interface CheckResult {
  configId:   string;
  email:      string;
  newReplies: number;
  errors:     string[];
}

// ─── Sentiment ────────────────────────────────────────────────────────────────

function analyzeSentiment(body: string): {
  sentiment:   "positive" | "neutral" | "negative" | "interested" | "not_interested";
  is_positive: boolean;
} {
  const lower = body.toLowerCase();
  const pos = ["interested","yes","sounds good","let's talk","schedule","call","demo",
    "tell me more","more info","love to","would like","please send","connect","meeting",
    "happy to"].filter(k => lower.includes(k)).length;
  const neg = ["not interested","unsubscribe","remove me","stop emailing","do not contact",
    "no thanks","not relevant","wrong person","please don't","spam"]
    .filter(k => lower.includes(k)).length;
  if (neg > 0) return { sentiment: "not_interested", is_positive: false };
  if (pos >= 2) return { sentiment: "interested",    is_positive: true  };
  if (pos === 1) return { sentiment: "positive",     is_positive: true  };
  return         { sentiment: "neutral",             is_positive: false };
}

// ─── SMTP host → IMAP host ────────────────────────────────────────────────────

function smtpHostToImap(smtpHost: string): string | null {
  const h = (smtpHost ?? "").toLowerCase();
  if (h.includes("gmail") || h.includes("google"))   return "imap.gmail.com";
  if (h.includes("outlook") || h.includes("office365") ||
      h.includes("hotmail") || h.includes("live"))   return "outlook.office365.com";
  if (h.includes("yahoo"))    return "imap.mail.yahoo.com";
  if (h.includes("zoho"))     return "imap.zoho.com";
  if (h.includes("fastmail")) return "imap.fastmail.com";
  if (h.startsWith("smtp."))  return h.replace("smtp.", "imap.");
  return null;
}

function smtpToImapConfig(smtp: any): InboxConfig | null {
  const imapHost = smtpHostToImap(smtp.host ?? "");
  if (!imapHost || !smtp.password) return null;
  return {
    id:                 `smtp:${smtp.id}`,
    user_id:            smtp.user_id,
    email_address:      smtp.email,
    provider:           smtp.provider ?? "gmail",
    imap_host:          imapHost,
    imap_port:          993,
    imap_username:      smtp.user_name ?? smtp.email,
    imap_password:      smtp.password,
    last_checked_at:    smtp.last_imap_check ?? null,
    auto_reply_enabled: false,
  };
}

// ─── IMAP fetcher ─────────────────────────────────────────────────────────────

async function fetchNewEmails(config: InboxConfig, since: Date): Promise<ParsedEmail[]> {
  const { ImapFlow } = await import("imapflow");

  const client = new ImapFlow({
    host:   config.imap_host,
    port:   config.imap_port,
    secure: true,
    auth:   { user: config.imap_username, pass: config.imap_password },
    logger: false,
    tls:    { rejectUnauthorized: false },
    // Hard connection timeout — don't hang forever
    connectionTimeout: 15_000,
    greetingTimeout:   10_000,
    socketTimeout:     20_000,
  } as any);

  // Wrap the entire IMAP operation in a 45-second timeout
  const fetchWithTimeout = new Promise<ParsedEmail[]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("IMAP timeout after 45s")), 45_000);

    (async () => {
      try {
        await client.connect();
        const emails: ParsedEmail[] = [];

        const lock = await client.getMailboxLock("INBOX");
        try {
          // Limit to last 7 days max — enough to catch recent replies without slow bulk fetch
          const cutoff = new Date(Math.max(since.getTime() - 86_400_000, Date.now() - 7 * 24 * 60 * 60 * 1000));
          const uids: number[] = await client.search({ since: cutoff }, { uid: true });

          if (!uids || uids.length === 0) { resolve(emails); return; }

          // Cap at 200 messages per check to avoid very long runs
          const uidSlice = uids.slice(-200);

          for await (const msg of client.fetch(uidSlice, {
            uid: true, envelope: true, bodyStructure: true, source: true,
          }, { uid: true })) {
            try {
              const env      = msg.envelope;
              const source   = msg.source?.toString("utf8") ?? "";
              const fromAddr = env?.from?.[0]?.address?.toLowerCase() ?? "";
              const fromName = env?.from?.[0]?.name ?? "";

              if (fromAddr === config.imap_username.toLowerCase()) continue;
              if (fromAddr === config.email_address.toLowerCase()) continue;

              const inReplyTo  = source.match(/^In-Reply-To:\s*(.+?)(?:\r?\n(?![ \t]))/im)?.[1]?.trim() ?? null;
              const references = source.match(/^References:\s*([\s\S]+?)(?:\r?\n(?![ \t]))/im)?.[1]?.replace(/\s+/g, " ").trim() ?? null;

              let body = "";
              const headerEnd = source.indexOf("\r\n\r\n");
              if (headerEnd > -1) {
                const rawBody = source.slice(headerEnd + 4);
                const freshLines: string[] = [];
                for (const line of rawBody.split(/\r?\n/)) {
                  const t = line.trim();
                  if (/^On .{5,100} wrote:$/i.test(t)) break;
                  if (t.startsWith(">")) continue;
                  if (/^-{5,}.*Original Message/i.test(t)) break;
                  if (/^_{5,}/.test(t)) break;
                  freshLines.push(line);
                }
                body = freshLines.join("\n").trim().slice(0, 3000);
              }
              if (!body) body = source.slice(0, 500);

              emails.push({
                messageId:  env?.messageId?.trim() ?? `no-id-${Date.now()}`,
                inReplyTo,
                references,
                subject:    env?.subject?.trim() ?? "(no subject)",
                from:       fromName ? `${fromName} <${fromAddr}>` : fromAddr,
                fromEmail:  fromAddr,
                body:       body || "(empty)",
                receivedAt: env?.date ?? new Date(),
              });
            } catch { /* skip bad message */ }
          }
        } finally {
          lock.release();
        }

        await client.logout().catch(() => {});
        clearTimeout(timer);
        resolve(emails);
      } catch (e) {
        clearTimeout(timer);
        client.close();
        reject(e);
      }
    })();
  });

  return fetchWithTimeout;
}

// ─── Match reply to sent_email ────────────────────────────────────────────────

async function matchReplyToSentEmail(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  parsed: ParsedEmail
): Promise<{ sentEmailId: string | null; leadId: string | null }> {

  // 1. In-Reply-To → smtp_message_id or message_id
  if (parsed.inReplyTo) {
    const clean = parsed.inReplyTo.replace(/[<>]/g, "");
    const { data } = await service.from("sent_emails").select("id, lead_id")
      .eq("user_id", userId)
      .or(`smtp_message_id.eq.${clean},message_id.eq.${clean}`)
      .limit(1).maybeSingle();
    if (data) return { sentEmailId: data.id, leadId: data.lead_id };
  }

  // 2. References header tokens
  if (parsed.references) {
    for (const token of (parsed.references.match(/<[^>]+>/g) ?? [])) {
      const raw = token.replace(/[<>]/g, "");
      const { data } = await service.from("sent_emails").select("id, lead_id")
        .eq("user_id", userId)
        .or(`smtp_message_id.eq.${raw},message_id.eq.${raw}`)
        .limit(1).maybeSingle();
      if (data) return { sentEmailId: data.id, leadId: data.lead_id };
    }
  }

  // 3. Sender email → to_email
  if (parsed.fromEmail) {
    const { data } = await service.from("sent_emails").select("id, lead_id")
      .eq("user_id", userId).eq("to_email", parsed.fromEmail)
      .order("sent_at", { ascending: false }).limit(1).maybeSingle();
    if (data) return { sentEmailId: data.id, leadId: data.lead_id };

    const { data: lead } = await service.from("leads").select("id")
      .eq("user_id", userId).eq("email", parsed.fromEmail).maybeSingle();
    if (lead) return { sentEmailId: null, leadId: lead.id };
  }

  // 4. Subject match
  const clean = parsed.subject.replace(/^(Re|Fwd|FW|RE|FWD|AW|SV):\s*/gi, "").trim();
  if (clean.length >= 5) {
    const { data } = await service.from("sent_emails").select("id, lead_id")
      .eq("user_id", userId).ilike("subject", clean)
      .order("sent_at", { ascending: false }).limit(1).maybeSingle();
    if (data) return { sentEmailId: data.id, leadId: data.lead_id };

    const { data: p } = await service.from("sent_emails").select("id, lead_id")
      .eq("user_id", userId).ilike("subject", `%${clean}%`)
      .order("sent_at", { ascending: false }).limit(1).maybeSingle();
    if (p) return { sentEmailId: p.id, leadId: p.lead_id };
  }

  return { sentEmailId: null, leadId: null };
}

// ─── Process one inbox ────────────────────────────────────────────────────────

async function processInbox(
  service: ReturnType<typeof createServiceClient>,
  config: InboxConfig
): Promise<CheckResult> {
  const result: CheckResult = { configId: config.id, email: config.email_address, newReplies: 0, errors: [] };

  const since = config.last_checked_at
    ? new Date(config.last_checked_at)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7-day lookback on first run

  let emails: ParsedEmail[] = [];
  try {
    emails = await fetchNewEmails(config, since);
    console.log(`[inbox] ${config.email_address}: ${emails.length} msgs since ${since.toDateString()}`);
  } catch (err: any) {
    result.errors.push(`IMAP error: ${err?.message ?? err}`);
    return result;
  }

  for (const parsed of emails) {
    try {
      // Dedup by from+subject
      const { count } = await service.from("email_replies")
        .select("id", { count: "exact", head: true })
        .eq("user_id", config.user_id)
        .eq("from_email", parsed.fromEmail)
        .eq("subject", parsed.subject);
      if ((count ?? 0) > 0) continue;

      const { sentEmailId, leadId } = await matchReplyToSentEmail(service, config.user_id, parsed);
      const isReply = /^(Re|Fwd|FW|RE|FWD|AW|SV):/i.test(parsed.subject);
      if (!sentEmailId && !leadId && !isReply) continue;

      const { sentiment, is_positive } = analyzeSentiment(parsed.body);
      let cls = { classification: sentiment as string, isPositive: is_positive, isAutoReply: false, isUnsubscribe: false as boolean | undefined };
      try { const r = classifyReply(parsed.body, parsed.subject); cls = { ...r, isPositive: r.isPositive ?? is_positive }; } catch {}

      const { error: insertErr } = await service.from("email_replies").insert({
        user_id:               config.user_id,
        sent_email_id:         sentEmailId,
        lead_id:               leadId,
        from_email:            parsed.fromEmail,
        subject:               parsed.subject,
        body:                  parsed.body,
        received_at:           parsed.receivedAt.toISOString(),
        sentiment:             cls.classification,
        is_positive:           cls.isPositive,
        classification:        cls.classification,
        is_auto_reply:         cls.isAutoReply,
        is_unsubscribe:        cls.isUnsubscribe ?? false,
        ai_response_generated: false,
        ai_response_sent:      false,
      });
      if (insertErr) { result.errors.push(`Insert: ${insertErr.message}`); continue; }

      result.newReplies++;

      if (sentEmailId) {
        await service.from("sent_emails")
          .update({ status: "replied", replied_at: parsed.receivedAt.toISOString() })
          .eq("id", sentEmailId);
      }
      if (leadId) {
        await service.from("leads")
          .update({ status: "replied", updated_at: new Date().toISOString() })
          .eq("id", leadId);
      }

      // In-app notification
      await service.from("notifications").insert({
        user_id: config.user_id,
        type: "reply",
        title: `Reply from ${parsed.fromEmail}`,
        message: `"${parsed.subject}" — ${parsed.body.slice(0, 80)}`,
        data: { sent_email_id: sentEmailId, lead_id: leadId, from_email: parsed.fromEmail },
        is_read: false,
      }).catch(() => {});

      // WhatsApp (fire and forget)
      import("@/utils/whatsapp-notifier").then(({ notifyWhatsApp }) =>
        notifyWhatsApp(config.user_id, "reply.received", {
          leadId, companyName: parsed.fromEmail, sentiment: cls.classification, subject: parsed.subject,
        })
      ).catch(() => {});

    } catch (err: any) {
      result.errors.push(`Msg: ${err?.message ?? err}`);
    }
  }

  // Save last_checked_at
  const now = new Date().toISOString();
  if (config.id.startsWith("smtp:")) {
    await service.from("smtp_accounts")
      .update({ last_imap_check: now })
      .eq("id", config.id.replace("smtp:", ""))
      .catch(() => {});
  } else {
    await service.from("email_inbox_config")
      .update({ last_checked_at: now })
      .eq("id", config.id);
  }

  console.log(`[inbox] ${config.email_address}: ${result.newReplies} new replies`);
  return result;
}

// ─── Build inbox config list ──────────────────────────────────────────────────

async function buildConfigs(
  service: ReturnType<typeof createServiceClient>,
  userId: string | null
): Promise<InboxConfig[]> {
  // Dedicated inbox configs
  let inboxQ = service.from("email_inbox_config").select("*").eq("is_active", true);
  if (userId) inboxQ = inboxQ.eq("user_id", userId);
  const { data: inboxRows } = await inboxQ;

  // SMTP accounts → auto-derive IMAP
  let smtpQ = service
    .from("smtp_accounts")
    .select("id, user_id, email, host, port, user_name, password, provider, last_imap_check, status")
    .eq("status", "active");
  if (userId) smtpQ = smtpQ.eq("user_id", userId);
  const { data: smtpRows } = await smtpQ;

  const configs: InboxConfig[] = [];
  const seen = new Set<string>();

  for (const c of inboxRows ?? []) {
    seen.add((c.email_address ?? "").toLowerCase());
    configs.push(c as InboxConfig);
  }
  for (const smtp of smtpRows ?? []) {
    const key = (smtp.email ?? "").toLowerCase();
    if (seen.has(key)) continue;
    const derived = smtpToImapConfig(smtp);
    if (derived) { seen.add(key); configs.push(derived); }
  }

  return configs;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleCheck(userId: string | null): Promise<NextResponse> {
  const service = createServiceClient();
  const configs  = await buildConfigs(service, userId);

  if (configs.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No active SMTP/inbox accounts found. Add a Gmail account in SMTP Manager first.",
      results: [],
      totalNewReplies: 0,
    });
  }

  const results: CheckResult[] = [];
  for (const config of configs) {
    results.push(await processInbox(service, config));
  }

  const totalNewReplies = results.reduce((s, r) => s + r.newReplies, 0);
  const totalErrors     = results.reduce((s, r) => s + r.errors.length, 0);

  return NextResponse.json({
    success: true,
    message: `Checked ${configs.length} inbox(es). ${totalNewReplies} new replies. ${totalErrors} errors.`,
    results,
    totalNewReplies,
  });
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleCheck(null);
  } catch (err: any) {
    console.error("[inbox/check GET]", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleCheck(user.id);
  } catch (err: any) {
    console.error("[inbox/check POST]", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
