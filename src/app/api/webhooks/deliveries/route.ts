import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const webhookId = searchParams.get("webhookId");
  if (!webhookId) return NextResponse.json({ error: "webhookId required" }, { status: 400 });

  const service = createServiceClient();

  // Verify this webhook belongs to the user
  const { data: hook } = await service
    .from("webhook_configs")
    .select("id")
    .eq("id", webhookId)
    .eq("user_id", user.id)
    .single();

  if (!hook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data } = await service
    .from("webhook_deliveries")
    .select("id, event, status_code, success, delivered_at, error_message")
    .eq("webhook_id", webhookId)
    .order("delivered_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ deliveries: data ?? [] });
}
