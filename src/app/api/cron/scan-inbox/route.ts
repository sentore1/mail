/**
 * CRON Endpoint: Scan Inbox for Replies
 *
 * Calls /api/inbox/check internally for all users.
 * Schedule: every 15 minutes (*/15 * * * *)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "../../../../../supabase/service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Forward to /api/inbox/check as a cron call
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${baseUrl}/api/inbox/check`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret ?? ""}` },
    });
    const data = await res.json();
    return NextResponse.json({ success: true, ...data });
  } catch (err: any) {
    console.error("[cron/scan-inbox]", err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
