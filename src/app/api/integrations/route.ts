/**
 * /api/integrations
 * Stores and retrieves API-key based integration configs (HubSpot, Salesforce etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../supabase/server";
import { createServiceClient } from "../../../../supabase/service";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data } = await service
    .from("integration_configs")
    .select("id, status, detail, config")
    .eq("user_id", user.id);

  return NextResponse.json({ integrations: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, config } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const service = createServiceClient();
  await service.from("integration_configs").upsert({
    user_id: user.id,
    id: `${user.id}:${id}`,
    integration_id: id,
    status: "connected",
    config,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,integration_id" });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const service = createServiceClient();
  await service.from("integration_configs").delete()
    .eq("user_id", user.id).eq("integration_id", id);

  return NextResponse.json({ success: true });
}
