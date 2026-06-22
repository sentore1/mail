/**
 * CRON Endpoint: Send Monthly Report Ready Notifications
 *
 * Schedule: 0 8 1 * *  (8am on the 1st of every month)
 *
 * Sends each user:
 *   1. An in-app notification
 *   2. A WhatsApp message (if configured)
 *
 * Add to vercel.json:
 * { "crons": [{ "path": "/api/cron/monthly-report-notify", "schedule": "0 8 1 * *" }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "../../../../../supabase/service";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://pryromail.com").replace(/\/$/, "");

  // Previous month
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const monthName = new Date(prevYear, prevMonth - 1, 1).toLocaleString("en", { month: "long" });

  // Get all users who sent at least one email last month
  const startOfPrevMonth = new Date(prevYear, prevMonth - 1, 1).toISOString();
  const endOfPrevMonth   = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999).toISOString();

  const { data: activeUsers } = await service
    .from("sent_emails")
    .select("user_id")
    .gte("sent_at", startOfPrevMonth)
    .lte("sent_at", endOfPrevMonth);

  const userIds = [...new Set((activeUsers ?? []).map((r: any) => r.user_id))];

  if (userIds.length === 0) {
    return NextResponse.json({ success: true, notified: 0, message: "No active users last month" });
  }

  const reportLink = `${appUrl}/dashboard?module=monthly-report&year=${prevYear}&month=${prevMonth}`;
  let notified = 0;

  for (const userId of userIds) {
    try {
      // 1. In-app notification
      await service.from("notifications").insert({
        user_id: userId,
        type: "info",
        title: `📊 ${monthName} ${prevYear} Report Ready`,
        message: `Your monthly outreach report for ${monthName} ${prevYear} is ready. View your email stats, follow-ups, replies, and more.`,
        data: {
          year: prevYear,
          month: prevMonth,
          report_url: reportLink,
          type: "monthly_report",
        },
        is_read: false,
      });

      // 2. WhatsApp notification (non-blocking, best-effort)
      try {
        const { data: waSettings } = await service
          .from("whatsapp_notification_settings")
          .select("whatsapp_number, enabled, sender_name, events")
          .eq("user_id", userId)
          .single();

        if (waSettings?.enabled && waSettings?.whatsapp_number) {
          const senderName = waSettings.sender_name || "there";
          const message = `📊 *Monthly Report Ready* — ${monthName} ${prevYear}\n\nHi ${senderName}, your outreach report for *${monthName} ${prevYear}* is now ready!\n\nView your full report here:\n${reportLink}`;

          const accountSid = process.env.TWILIO_ACCOUNT_SID;
          const authToken  = process.env.TWILIO_AUTH_TOKEN;
          const from       = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

          if (accountSid && authToken) {
            const to = waSettings.whatsapp_number.startsWith("whatsapp:")
              ? waSettings.whatsapp_number
              : `whatsapp:${waSettings.whatsapp_number}`;

            const twilioRes = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
                },
                body: new URLSearchParams({ From: from, To: to, Body: message }),
                signal: AbortSignal.timeout(10_000),
              }
            );

            if (!twilioRes.ok) {
              console.warn(`[monthly-notify] WhatsApp failed for ${userId}`);
            } else {
              // Log delivery
              await service.from("whatsapp_delivery_log").insert({
                user_id: userId,
                event: "monthly_report",
                to_number: waSettings.whatsapp_number,
                message,
                success: true,
                sent_at: new Date().toISOString(),
              }).catch(() => {});
            }
          }
        }
      } catch {
        // WhatsApp failure must never break the notification loop
      }

      notified++;
    } catch (err) {
      console.error(`[monthly-notify] Failed for user ${userId}:`, err);
    }
  }

  return NextResponse.json({
    success: true,
    notified,
    month: prevMonth,
    year: prevYear,
    month_name: monthName,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
