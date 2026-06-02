/**
 * API Route: Stop Follow-Ups
 * POST /api/followup/stop
 *
 * Stop all pending follow-ups for a lead/thread.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "../../../../../supabase/server";
import { stopFollowUps } from "@/utils/followup-processor";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { leadId, reason = "manual_stop" } = body;

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    await stopFollowUps(user.id, leadId, reason);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[followup/stop] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to stop" },
      { status: 500 }
    );
  }
}
