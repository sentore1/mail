/**
 * CRON Endpoint: Process Follow-Ups
 *
 * This endpoint should be called every 5-15 minutes by:
 * - Vercel Cron (recommended)
 * - External cron service (e.g., cron-job.org)
 * - GitHub Actions scheduled workflow
 *
 * Vercel cron config (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/cron/process-followups",
 *     "schedule": "0 8 * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "../../../../../supabase/service";
import { processFollowUps } from "@/utils/followup-processor";

export const maxDuration = 300; // 5 minutes
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    // Get all users with active follow-ups configured
    const { data: users } = await supabase
      .from("followup_settings")
      .select("user_id")
      .eq("auto_followup_enabled", true);

    if (!users || users.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users with auto-followup enabled",
        processed: 0,
      });
    }

    const results = [];

    for (const { user_id } of users) {
      const result = await processFollowUps(user_id, 50);
      results.push({ user_id, ...result });
    }

    const totals = results.reduce(
      (acc, r) => ({
        processed: acc.processed + r.processed,
        sent: acc.sent + r.sent,
        skipped: acc.skipped + r.skipped,
        failed: acc.failed + r.failed,
      }),
      { processed: 0, sent: 0, skipped: 0, failed: 0 }
    );

    return NextResponse.json({
      success: true,
      users_processed: users.length,
      ...totals,
      details: results,
    });
  } catch (error) {
    console.error("[cron] Follow-up processing error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
