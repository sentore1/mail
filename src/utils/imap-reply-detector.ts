/**
 * IMAP Reply Detector
 *
 * Connects to inbox via IMAP and scans for replies matching sent emails.
 * Handles:
 * - Thread matching by In-Reply-To / References headers
 * - Message-ID matching
 * - Auto-reply detection
 * - Bounce detection
 * - OOO detection
 *
 * Uses imapflow (already in package.json)
 */

import { ImapFlow } from "imapflow";
import { createServiceClient } from "../../supabase/service";
import { classifyReply, classifyReplyWithAI } from "./ai-followup-generator";

export interface InboxConfig {
  id: string;
  user_id: string;
  email_address: string;
  imap_host: string;
  imap_port: number;
  imap_username: string;
  imap_password: string;
  last_uid: number;
  inbox_folder: string;
  smtp_account_id?: string;
}

export interface DetectedReply {
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  subject: string;
  from: string;
  body: string;
  htmlBody?: string;
  receivedAt: Date;
  uid: number;
  isBounce: boolean;
  isAutoReply: boolean;
  classification: string;
  confidence: number;
}

/**
 * Clean HTML to plain text
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect if email is a bounce notification
 */
function isBounceEmail(subject: string, body: string, from: string): boolean {
  const patterns = [
    /delivery (status notification|failure)/i,
    /undeliverable/i,
    /mail delivery (failed|failure)/i,
    /returned mail/i,
    /failed to deliver/i,
    /bounce/i,
    /postmaster/i,
    /mailer-daemon/i,
  ];

  const text = `${subject} ${body} ${from}`;
  return patterns.some((p) => p.test(text));
}

/**
 * Main IMAP scanner
 */
export async function scanInboxForReplies(
  config: InboxConfig,
  userId: string
): Promise<{ repliesFound: number; errors: string[] }> {
  const supabase = createServiceClient();
  const errors: string[] = [];
  let repliesFound = 0;

  const client = new ImapFlow({
    host: config.imap_host,
    port: config.imap_port,
    secure: config.imap_port === 993,
    auth: {
      user: config.imap_username,
      pass: config.imap_password,
    },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const mailbox = await client.mailboxOpen(config.inbox_folder || "INBOX");
    const totalMessages = mailbox.exists;

    if (totalMessages === 0) {
      await client.logout();
      return { repliesFound: 0, errors: [] };
    }

    // Fetch emails newer than last known UID
    const lastUid = config.last_uid || 0;
    const searchCriteria = lastUid > 0 ? { uid: `${lastUid + 1}:*` } : { since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };

    let maxUid = lastUid;

    for await (const message of client.fetch(searchCriteria, {
      uid: true,
      envelope: true,
      bodyStructure: true,
      source: false,
    })) {
      try {
        const uid = message.uid;
        if (uid > maxUid) maxUid = uid;

        const envelope = message.envelope;
        if (!envelope) continue;

        const subject = envelope.subject || "";
        const from = envelope.from?.[0]?.address || "";
        const inReplyTo = envelope.inReplyTo;
        const messageId = envelope.messageId;

        // Skip emails from self
        if (from.toLowerCase() === config.email_address.toLowerCase()) continue;
        if (from.toLowerCase() === config.imap_username.toLowerCase()) continue;

        // Check if this is a reply to any of our sent emails
        const relevantSentEmail = await findSentEmailForReply(
          userId,
          inReplyTo,
          messageId,
          subject
        );

        if (!relevantSentEmail) continue;

        // Already recorded?
        const { data: existing } = await supabase
          .from("email_replies")
          .select("id")
          .eq("message_id", messageId)
          .limit(1)
          .single();

        if (existing) continue;

        // Fetch full body
        let bodyText = "";
        let htmlBody = "";

        try {
          const fullMsg = await client.fetchOne(`${uid}`, {
            bodyParts: ["TEXT"],
            source: true,
          } as any);

          const source = fullMsg?.source?.toString() || "";

          // Extract plain text / HTML from raw source (simplified)
          const htmlMatch = source.match(/Content-Type: text\/html[\s\S]*?\r\n\r\n([\s\S]+?)(?:\r\n--|\r\n\r\n--|$)/i);
          const textMatch = source.match(/Content-Type: text\/plain[\s\S]*?\r\n\r\n([\s\S]+?)(?:\r\n--|\r\n\r\n--|$)/i);

          htmlBody = htmlMatch?.[1] || "";
          bodyText = textMatch?.[1] || (htmlBody ? htmlToText(htmlBody) : "");

          if (!bodyText && source.length > 0) {
            // Fallback: strip headers and use remaining text
            const headerEnd = source.indexOf("\r\n\r\n");
            bodyText = headerEnd > -1 ? source.slice(headerEnd + 4, 1000) : source.slice(0, 1000);
          }
        } catch {
          bodyText = subject;
        }

        bodyText = bodyText.slice(0, 5000);

        const isBounce = isBounceEmail(subject, bodyText, from);

        // AI classification
        const classification = await classifyReplyWithAI(userId, bodyText, subject);

        // Save reply to database
        const { data: savedReply, error: replyError } = await supabase
          .from("email_replies")
          .insert({
            user_id: userId,
            sent_email_id: relevantSentEmail.id,
            lead_id: relevantSentEmail.lead_id,
            thread_id: relevantSentEmail.email_thread_id,
            from_email: from,
            subject,
            body: bodyText,
            html_body: htmlBody,
            message_id: messageId,
            in_reply_to: inReplyTo,
            received_at: envelope.date || new Date(),
            is_bounce: isBounce,
            is_auto_reply: classification.classification === "auto_reply",
            ai_classification: classification.classification,
            ai_confidence: classification.confidence,
            is_positive: classification.isPositive,
            sentiment: classification.classification,
          })
          .select()
          .single();

        if (replyError) {
          errors.push(`Failed to save reply: ${replyError.message}`);
          continue;
        }

        repliesFound++;

        // Stop follow-ups based on classification
        const shouldStop =
          !classification.isAutoReply ||
          isBounce ||
          classification.classification === "unsubscribe" ||
          classification.isPositive;

        if (shouldStop && relevantSentEmail.email_thread_id) {
          const stopReason = isBounce
            ? "bounced"
            : classification.classification === "unsubscribe"
            ? "unsubscribed"
            : "replied";

          await supabase.rpc("stop_followups_for_thread", {
            p_thread_id: relevantSentEmail.email_thread_id,
            p_reason: stopReason,
          });

          // Update lead status
          let leadStatus = "Replied";
          if (isBounce) leadStatus = "bounced";
          else if (classification.classification === "unsubscribe") leadStatus = "unsubscribed";
          else if (classification.classification === "interested" || classification.classification === "meeting_request")
            leadStatus = "Interested";

          await supabase
            .from("leads")
            .update({
              status: leadStatus,
              reply_count: supabase.rpc as any, // Will be updated via trigger
              updated_at: new Date().toISOString(),
            })
            .eq("id", relevantSentEmail.lead_id);

          // Handle unsubscribe
          if (classification.classification === "unsubscribe") {
            await supabase.from("unsubscribe_events").insert({
              user_id: userId,
              lead_id: relevantSentEmail.lead_id,
              email: from,
              source: "reply",
              sent_email_id: relevantSentEmail.id,
            });
          }
        }
      } catch (msgError) {
        errors.push(`Error processing message: ${msgError}`);
      }
    }

    // Update last_uid and stats
    if (maxUid > lastUid) {
      await supabase
        .from("email_inbox_config")
        .update({
          last_uid: maxUid,
          last_checked_at: new Date().toISOString(),
          emails_scanned: (config.emails_scanned || 0) + 1,
          replies_found: (config.replies_found || 0) + repliesFound,
          error_count: errors.length > 0 ? (config.error_count || 0) + 1 : config.error_count,
          last_error: errors.length > 0 ? errors[errors.length - 1] : null,
        })
        .eq("id", config.id);
    } else {
      await supabase
        .from("email_inbox_config")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("id", config.id);
    }

    await client.logout();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`IMAP connection error: ${errorMsg}`);

    await supabase
      .from("email_inbox_config")
      .update({
        last_error: errorMsg,
        error_count: (config.error_count || 0) + 1,
      })
      .eq("id", config.id);
  }

  return { repliesFound, errors };
}

/**
 * Find the sent email that this reply corresponds to
 */
async function findSentEmailForReply(
  userId: string,
  inReplyTo: string | undefined,
  messageId: string | undefined,
  subject: string
): Promise<any | null> {
  const supabase = createServiceClient();

  // Try matching In-Reply-To header (most reliable)
  if (inReplyTo) {
    // Check both message_id (new column) and smtp_message_id (legacy column)
    const { data: byNew } = await supabase
      .from("sent_emails")
      .select("*")
      .eq("user_id", userId)
      .eq("message_id", inReplyTo)
      .limit(1)
      .single();

    if (byNew) return byNew;

    const { data: byLegacy } = await supabase
      .from("sent_emails")
      .select("*")
      .eq("user_id", userId)
      .eq("smtp_message_id", inReplyTo)
      .limit(1)
      .single();

    if (byLegacy) return byLegacy;
  }

  // Try matching References header (check most recent sent emails)
  if (inReplyTo) {
    const { data } = await supabase
      .from("sent_emails")
      .select("*")
      .eq("user_id", userId)
      .ilike("references_header", `%${inReplyTo}%`)
      .limit(1)
      .single();

    if (data) return data;
  }

  // Try subject matching (last resort, unreliable)
  const cleanSubject = subject.replace(/^(re:|fwd?:|RE:|FWD?:)\s*/gi, "").trim();
  if (cleanSubject.length > 5) {
    const { data } = await supabase
      .from("sent_emails")
      .select("*")
      .eq("user_id", userId)
      .ilike("subject", `%${cleanSubject}%`)
      .order("sent_at", { ascending: false })
      .limit(1)
      .single();

    if (data) return data;
  }

  return null;
}

/**
 * Scan all active inbox configs for a user
 */
export async function scanAllInboxes(userId: string): Promise<{
  totalReplies: number;
  scannedInboxes: number;
  errors: string[];
}> {
  const supabase = createServiceClient();

  const { data: configs } = await supabase
    .from("email_inbox_config")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!configs || configs.length === 0) {
    return { totalReplies: 0, scannedInboxes: 0, errors: [] };
  }

  let totalReplies = 0;
  const allErrors: string[] = [];

  for (const config of configs) {
    const { repliesFound, errors } = await scanInboxForReplies(config, userId);
    totalReplies += repliesFound;
    allErrors.push(...errors);
  }

  return {
    totalReplies,
    scannedInboxes: configs.length,
    errors: allErrors,
  };
}
