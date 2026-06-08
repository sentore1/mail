/**
 * POST /api/webhooks/test-zapier
 * Fires a test event to the platform Zapier URL (ZAPIER_WEBHOOK_URL in .env.local).
 * Used by the developer/admin to confirm the env variable is wired correctly.
 * Never exposes the URL to the frontend.
 */

import { NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const zapierUrl = process.env.ZAPIER_WEBHOOK_URL;

  if (!zapierUrl || zapierUrl.includes("xxxxxxx")) {
    return NextResponse.json({
      error: "ZAPIER_WEBHOOK_URL is not configured in .env.local. Add your Zapier Catch Hook URL and restart the server.",
    }, { status: 400 });
  }

  const payload = {
    event: "test",
    timestamp: new Date().toISOString(),
    platform: "pryro_mail",
    data: {
      test: true,
      message: "Test event from Pryro Mail — your Zapier connection is working!",
      userId: user.id,
      leadId: "test-lead-id",
      leadEmail: "test@example.com",
      companyName: "Test Company",
    },
  };

  try {
    const res = await fetch(zapierUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Pryro-Event": "test" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      return NextResponse.json({
        success: true,
        message: "Test event sent to Zapier successfully. Check your Zap's task history.",
        statusCode: res.status,
      });
    } else {
      return NextResponse.json({
        error: `Zapier returned ${res.status}. Check your Catch Hook URL is correct and the Zap is turned on.`,
      }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({
      error: `Failed to reach Zapier: ${err.message}`,
    }, { status: 500 });
  }
}
