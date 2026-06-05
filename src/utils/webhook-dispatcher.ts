/**
 * Webhook Dispatcher
 *
 * Fires outbound HTTP POST requests to all active webhook endpoints
 * configured for a given user and event type.
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
  data: Record<string, unknown>;
}

function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export async function dispatchWebhook(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const service = createServiceClient();

  // Load active webhooks that subscribe to this event
  const { data: hooks } = await service
    .from("webhook_configs")
    .select("id, url, secret, events")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!hooks || hooks.length === 0) return;

  const matching = hooks.filter((h: any) =>
    Array.isArray(h.events) && h.events.includes(event)
  );
  if (matching.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data: { ...data, userId },
  };
  const body = JSON.stringify(payload);

  // Fire all webhooks in parallel, non-blocking
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

        // Log delivery result
        await service.from("webhook_deliveries").insert({
          webhook_id: hook.id,
          user_id: userId,
          event,
          payload: payload,
          status_code: res.status,
          success: res.ok,
          delivered_at: new Date().toISOString(),
        }).catch(() => {});

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await service.from("webhook_deliveries").insert({
          webhook_id: hook.id,
          user_id: userId,
          event,
          payload: payload,
          status_code: 0,
          success: false,
          error_message: msg,
          delivered_at: new Date().toISOString(),
        }).catch(() => {});
      }
    })
  );
}
