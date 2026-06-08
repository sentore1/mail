/**
 * Webhook Dispatcher
 *
 * Fires outbound HTTP POST requests to:
 *  1. ZAPIER_WEBHOOK_URL (env-only, never exposed to users) — always fires if configured
 *  2. User-configured webhook URLs stored in webhook_configs table
 *
 * Usage (server-side only):
 *   import { dispatchWebhook } from "@/utils/webhook-dispatcher";
 *   await dispatchWebhook(userId, "email.sent", { leadId, to, subject, sentAt });
 */

import { createServiceClient } from "../../supabase/service";
import { createHmac } from "crypto";

export type WebhookEvent =
  | "email.sent"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "reply.received"
  | "lead.status_changed"
  | "sequence.completed";

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  platform: "pryro_mail";
  data: Record<string, unknown>;
}

function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Build the canonical Zapier-friendly payload for each event */
function buildPayload(event: WebhookEvent, data: Record<string, unknown>): WebhookPayload {
  return {
    event,
    timestamp: new Date().toISOString(),
    platform: "pryro_mail",
    data: {
      // Standard fields present in every event
      leadId:      data.leadId      ?? null,
      leadEmail:   data.leadEmail   ?? data.to ?? null,
      companyName: data.companyName ?? data.company ?? null,
      userId:      data.userId      ?? null,
      // Event-specific fields passed through as-is
      ...data,
    },
  };
}

/** Fire to the platform-wide Zapier URL from .env.local (never exposed to users) */
async function fireZapierEnvWebhook(
  userId: string,
  payload: WebhookPayload
): Promise<void> {
  const zapierUrl = process.env.ZAPIER_WEBHOOK_URL;
  if (!zapierUrl || zapierUrl.includes("xxxxxxx")) return; // not configured yet

  // Check user's event preferences
  let userWantsEvent = true;
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("zapier_event_settings")
      .select("enabled, events")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      userWantsEvent = data.enabled && Array.isArray(data.events) && data.events.includes(payload.event);
    }
  } catch { /* table may not exist yet, default to fire */ }

  if (!userWantsEvent) return;

  let success = false;
  let statusCode = 0;
  let errorMessage: string | undefined;

  try {
    const res = await fetch(zapierUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pryro-Event": payload.event,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    success = res.ok;
    statusCode = res.status;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.warn(`[zapier] delivery failed for ${payload.event}:`, errorMessage);
  }

  // Log delivery (non-fatal)
  try {
    const service = createServiceClient();
    await service.from("zapier_delivery_log").insert({
      user_id: userId,
      event: payload.event,
      payload,
      success,
      status_code: statusCode,
      error_message: errorMessage ?? null,
      delivered_at: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }
}

export async function dispatchWebhook(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const payload = buildPayload(event, { ...data, userId });
  const body    = JSON.stringify(payload);

  // 1. Always fire to the platform Zapier URL (env-based, invisible to users)
  fireZapierEnvWebhook(userId, payload); // intentionally not awaited — fire and forget

  // 2. Load user-configured webhooks from DB
  let hooks: any[] = [];
  try {
    const service = createServiceClient();
    const { data: rows } = await service
      .from("webhook_configs")
      .select("id, url, secret, events")
      .eq("user_id", userId)
      .eq("is_active", true);
    hooks = rows ?? [];
  } catch { /* DB not ready yet */ }

  const matching = hooks.filter((h: any) =>
    Array.isArray(h.events) && h.events.includes(event)
  );
  if (matching.length === 0) return;

  // 3. Fire user-configured webhooks in parallel
  const service = createServiceClient();
  await Promise.allSettled(
    matching.map(async (hook: any) => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Pryro-Event": event,
          "X-Pryro-Delivery": `${hook.id}-${Date.now()}`,
        };
        if (hook.secret) {
          headers["X-Pryro-Signature"] = `sha256=${signPayload(hook.secret, body)}`;
        }
        const res = await fetch(hook.url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(10_000),
        });

        try {
          await service.from("webhook_deliveries").insert({
            webhook_id: hook.id, user_id: userId, event,
            payload, status_code: res.status, success: res.ok,
            delivered_at: new Date().toISOString(),
          });
        } catch { /* non-fatal log */ }

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        try {
          await service.from("webhook_deliveries").insert({
            webhook_id: hook.id, user_id: userId, event,
            payload, status_code: 0, success: false,
            error_message: msg, delivered_at: new Date().toISOString(),
          });
        } catch { /* non-fatal log */ }
      }
    })
  );
}
