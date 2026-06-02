/**
 * API Route: Pause Follow-Ups
 * POST /api/followup/pause
 *
 * Pause follow-ups temporarily (can be resumed).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "../../../../../supabase/server";
import { pauseFollowUps } from "@/utils/followup-processor";

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
    const { leadId } = body;

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    const count = await pauseFollowUps(user.id, leadId);

    return NextResponse.json({ success: true, paused: count });
  } catch (error) {
    console.error("[followup/pause] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to pause" },
      { status: 500 }
    );
  }
}
