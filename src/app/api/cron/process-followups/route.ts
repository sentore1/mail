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
    // Get all users with active follow-ups configured OR who have overdue pending items
    // This ensures users whose auto_followup_enabled may be off still get processed
    // if they have items that were manually queued and are now overdue.
    const { data: autoUsers } = await supabase
      .from("followup_settings")
      .select("user_id")
      .eq("auto_followup_enabled", true);

    // Also pick up users who have overdue pending queue items but may not have the setting
    const { data: overdueUsers } = await supabase
      .from("followup_queue")
      .select("user_id")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString());

    // Merge unique user IDs
    const allUserIds = new Set<string>([
      ...(autoUsers ?? []).map((u: any) => u.user_id),
      ...(overdueUsers ?? []).map((u: any) => u.user_id),
    ]);

    const users = Array.from(allUserIds).map(user_id => ({ user_id }));

    if (users.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users with pending follow-ups",
        processed: 0,
      });
    }

    const results = [];

    for (const { user_id } of users) {
      const result = await processFollowUps(user_id, 50);
      results.push({ user_id, ...result });

      // Insert a per-user daily summary into followup_activity_log
      try {
        await supabase.from("followup_activity_log").insert({
          user_id,
          lead_id: null,
          followup_number: 0,
          subject: `Cron run: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`,
          status: "daily_summary",
          is_auto: true,
          sent_at: new Date().toISOString(),
        });
      } catch {
        // Non-critical
      }
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
