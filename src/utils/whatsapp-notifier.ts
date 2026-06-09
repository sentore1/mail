/**
 * WhatsApp Notifier via Twilio
 *
 * Sends WhatsApp messages to the user when webhook events fire.
 * Uses Twilio's WhatsApp sandbox (free) or approved business number.
 *
 * Required .env.local:
 *   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   TWILIO_AUTH_TOKEN=your_auth_token
 *   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   (sandbox) or your approved number
 */

import { createServiceClient } from "../../supabase/service";

export type WAEvent =
  | "email.sent"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "reply.received"
  | "lead.status_changed"
  | "sequence.completed";

interface WASettings {
  whatsapp_number: string;       // e.g. +250788123456
  enabled: boolean;
  events: WAEvent[];             // which events trigger a message
  sender_name: string;           // used in message e.g. "Alice"
}

// ── Message templates per event ───────────────────────────────────────────────

function buildMessage(event: WAEvent, data: Record<string, any>, senderName: string): string {
  const company = data.companyName || data.company || data.leadEmail || "a lead";
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  switch (event) {
    case "email.sent":
      return `📤 *Email Sent* — ${time}\nHi ${senderName}, your email to *${company}* was just delivered successfully.`;

    case "email.opened":
      return `👀 *Email Opened* — ${time}\nHi ${senderName}, *${company}* just opened your email! Consider sending a follow-up.`;

    case "email.clicked":
      return `🖱️ *Link Clicked* — ${time}\nHi ${senderName}, *${company}* clicked a link in your email — high intent signal!`;

    case "email.bounced":
      return `⚠️ *Email Bounced* — ${time}\nHi ${senderName}, your email to *${company}* bounced. The address may be invalid.`;

    case "reply.received":
      return `💬 *Reply Received* — ${time}\nHi ${senderName}, *${company}* just replied to your email!\n\nSentiment: ${data.sentiment || "neutral"}\n\nOpen Pryro Mail to respond.`;

    case "lead.status_changed":
      return `🔄 *Lead Updated* — ${time}\nHi ${senderName}, *${company}* moved to status: *${data.newStatus || data.status || "updated"}*.`;

    case "sequence.completed":
      return `✅ *Sequence Completed* — ${time}\nHi ${senderName}, the follow-up sequence for *${company}* is complete — no more automated emails will be sent.`;

    default:
      return `🔔 *Pryro Mail Alert* — ${time}\nEvent: ${event}\nLead: ${company}`;
  }
}

// ── Send via Twilio ───────────────────────────────────────────────────────────

async function sendTwilioWhatsApp(
  to: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

  if (!accountSid || !authToken) {
    return { success: false, error: "Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)" };
  }

  // Normalise destination number
  const toNormalized = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      From: from,
      To: toNormalized,
      Body: message,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as any)?.message || `Twilio HTTP ${res.status}`;
    return { success: false, error: msg };
  }

  return { success: true };
}

// ── Load user WhatsApp settings ───────────────────────────────────────────────

async function getWASettings(userId: string): Promise<WASettings | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("whatsapp_notification_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!data || !data.enabled || !data.whatsapp_number) return null;

  return {
    whatsapp_number: data.whatsapp_number,
    enabled: data.enabled,
    events: data.events ?? [],
    sender_name: data.sender_name || "there",
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Send a WhatsApp notification to the user if:
 *  1. They have WhatsApp notifications enabled
 *  2. They subscribed to this specific event
 *  3. Twilio credentials are configured
 *
 * Non-blocking — logs errors but never throws.
 */
export async function notifyWhatsApp(
  userId: string,
  event: WAEvent,
  data: Record<string, any>
): Promise<void> {
  try {
    const settings = await getWASettings(userId);
    if (!settings) return; // not configured or disabled

    // Check if this event is enabled for this user
    if (!settings.events.includes(event)) return;

    const message = buildMessage(event, data, settings.sender_name);
    const result  = await sendTwilioWhatsApp(settings.whatsapp_number, message);

    if (!result.success) {
      console.warn(`[whatsapp] Failed to send ${event} to ${settings.whatsapp_number}: ${result.error}`);
      try {
        const service = createServiceClient();
        await service.from("whatsapp_delivery_log").insert({
          user_id: userId, event, to_number: settings.whatsapp_number,
          message, success: false, error_message: result.error,
          sent_at: new Date().toISOString(),
        });
      } catch { /* non-fatal */ }
    } else {
      try {
        const service = createServiceClient();
        await service.from("whatsapp_delivery_log").insert({
          user_id: userId, event, to_number: settings.whatsapp_number,
          message, success: true, sent_at: new Date().toISOString(),
        });
      } catch { /* non-fatal */ }
    }
  } catch (err) {
    // Never let WhatsApp failures break the main flow
    console.error("[whatsapp] Unexpected error:", err instanceof Error ? err.message : err);
  }
}
