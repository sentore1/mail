/**
 * /api/webhooks
 * Manage webhook configurations (CRUD) and fire outbound webhook calls.
 *
 * GET  — list all webhooks for the user
 * POST — create a new webhook
 * PUT  — update a webhook
 * DELETE — delete a webhook
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../supabase/server";
import { createServiceClient } from "../../../../supabase/service";

export const runtime = "nodejs";

export type WebhookEvent =
  | "email.sent"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "reply.received"
  | "lead.status_changed"
  | "sequence.completed";

export interface WebhookConfig {
  id: string;
  user_id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  is_active: boolean;
  created_at: string;
}

// ── GET — list webhooks ───────────────────────────────────────────────────────
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data, error: dbErr } = await service
    .from("webhook_configs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ webhooks: data ?? [] });
}

// ── POST — create webhook ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, url, events, secret } = body;

  if (!url || !url.startsWith("https://")) {
    return NextResponse.json({ error: "URL must be a valid HTTPS URL" }, { status: 400 });
  }
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "At least one event must be selected" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error: dbErr } = await service
    .from("webhook_configs")
    .insert({ user_id: user.id, name: name || url, url, events, secret: secret || null, is_active: true })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ webhook: data });
}

// ── PUT — update webhook ──────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const service = createServiceClient();
  const { data, error: dbErr } = await service
    .from("webhook_configs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ webhook: data });
}

// ── DELETE — remove webhook ───────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const service = createServiceClient();
  await service.from("webhook_configs").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ success: true });
}
