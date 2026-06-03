/**
 * CRON Endpoint: Scan Inbox for Replies
 *
 * Scans all user inboxes via IMAP to detect replies.
 * Schedule: every 5 minutes
 *
 * Vercel cron:
 * { "path": "/api/cron/scan-inbox", "schedule": "*/5 * * * *" }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "../../../../../supabase/service";
import { scanAllInboxes } from "@/utils/imap-reply-detector";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    // Get all users with active inbox configs
    const { data: configs } = await supabase
      .from("email_inbox_config")
      .select("user_id")
      .eq("is_active", true);

    if (!configs || configs.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active inbox configs",
        totalReplies: 0,
      });
    }

    // Unique user IDs
    const userIds = [...new Set(configs.map((c) => c.user_id))];

    const results = [];

    for (const userId of userIds) {
      const result = await scanAllInboxes(userId);
      results.push({ userId, ...result });
    }

    const totalReplies = results.reduce((sum, r) => sum + r.totalReplies, 0);

    return NextResponse.json({
      success: true,
      usersScanned: userIds.length,
      totalReplies,
      details: results,
    });
  } catch (error) {
    console.error("[cron] Inbox scan error:", error);

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
