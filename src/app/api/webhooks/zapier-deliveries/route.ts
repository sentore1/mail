/**
 * GET /api/webhooks/zapier-deliveries
 * Returns recent Zapier delivery log entries for the current user.
 */

import { NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const service = createServiceClient();
    const { data } = await service
      .from("zapier_delivery_log")
      .select("event, success, status_code, delivered_at, error_message")
      .eq("user_id", user.id)
      .order("delivered_at", { ascending: false })
      .limit(20);

    return NextResponse.json({ deliveries: data ?? [] });
  } catch {
    return NextResponse.json({ deliveries: [] });
  }
}
