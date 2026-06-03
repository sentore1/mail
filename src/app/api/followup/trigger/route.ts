/**
 * API Route: Trigger Follow-Up Now
 * POST /api/followup/trigger
 *
 * Manually trigger a single follow-up to be processed immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";
import { processFollowUps } from "@/utils/followup-processor";

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
    const { queueId, leadId } = body;

    const serviceClient = createServiceClient();

    if (queueId) {
      // Trigger specific queue item immediately
      await serviceClient
        .from("followup_queue")
        .update({ scheduled_at: new Date().toISOString() })
        .eq("id", queueId)
        .eq("user_id", user.id)
        .eq("status", "pending");
    } else if (leadId) {
      // Trigger next pending followup for lead
      await serviceClient
        .from("followup_queue")
        .update({ scheduled_at: new Date().toISOString() })
        .eq("lead_id", leadId)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("scheduled_at", { ascending: true })
        .limit(1);
    } else {
      return NextResponse.json({ error: "Missing queueId or leadId" }, { status: 400 });
    }

    // Process immediately
    const result = await processFollowUps(user.id, 1);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[followup/trigger] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to trigger" },
      { status: 500 }
    );
  }
}
