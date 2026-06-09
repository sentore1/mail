/**
 * GET  /api/webhooks/zapier-settings  — load user's event preferences + check if URL is configured
 * POST /api/webhooks/zapier-settings  — save user's event preferences
 *
 * The actual Zapier URL lives in ZAPIER_WEBHOOK_URL (.env.local) and is NEVER sent to the client.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";

export const runtime = "nodejs";

const DEFAULT_EVENTS = ["reply.received", "email.opened", "email.clicked", "email.bounced"];

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Tell the UI whether the env URL is configured — without revealing the URL itself
  const zapierUrl = process.env.ZAPIER_WEBHOOK_URL ?? "";
  const configured = zapierUrl.length > 0 && !zapierUrl.includes("xxxxxxx");

  try {
    const service = createServiceClient();
    const { data } = await service
      .from("zapier_event_settings")
      .select("enabled, events")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({
      configured,
      settings: data ?? { enabled: true, events: DEFAULT_EVENTS },
    });
  } catch {
    return NextResponse.json({
      configured,
      settings: { enabled: true, events: DEFAULT_EVENTS },
    });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  try {
    const service = createServiceClient();
    await service
      .from("zapier_event_settings")
      .upsert({
        user_id: user.id,
        enabled:  body.enabled  ?? true,
        events:   body.events   ?? DEFAULT_EVENTS,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
