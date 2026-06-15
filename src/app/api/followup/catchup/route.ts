/**
 * POST /api/followup/catchup
 *
 * Processes ALL overdue pending follow-ups for the authenticated user,
 * regardless of whether auto_followup_enabled is set.
 *
 * This is the "Catch Up Now" button endpoint — handles backlog of leads
 * whose scheduled_at has already passed but were never auto-processed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { processFollowUps } from "@/utils/followup-processor";

export const runtime    = "nodejs";
export const maxDuration = 300;
export const dynamic    = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // processFollowUps reads from the followup_due view which filters
    // scheduled_at <= NOW() and status = 'pending', so all overdue items
    // will be picked up in one batch.
    const result = await processFollowUps(user.id, 100); // larger batch for catch-up

    return NextResponse.json({
      success: true,
      message: `Catch-up complete: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed`,
      ...result,
    });
  } catch (err: any) {
    console.error("[followup/catchup]", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
