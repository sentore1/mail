import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../supabase/server";
import { createServiceClient } from "../../../../supabase/service";
import nodemailer from "nodemailer";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? req.nextUrl.searchParams.get("userId");
    const testSend = req.nextUrl.searchParams.get("test") === "1";

    if (!userId) {
      return NextResponse.json({
        error: "Not logged in. Visit this URL while logged into the dashboard.",
      }, { status: 401 });
    }

    const service = createServiceClient();

    const { data: accounts, error } = await service
      .from("smtp_accounts")
      .select("id, email, status, sent_today, daily_limit, last_reset, user_name, password, host, port, user_id")
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    }

    const now = new Date();
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    // Optional: test SMTP connection for each account
    const accountResults = [];
    for (const a of (accounts ?? [])) {
      let smtpTest: string | null = null;
      if (testSend) {
        try {
          const transporter = nodemailer.createTransport({
            host: a.host || 'smtp.gmail.com',
            port: a.port || 587,
            secure: (a.port || 587) === 465,
            auth: { user: a.user_name || a.email, pass: a.password },
            connectionTimeout: 8_000,
            greetingTimeout: 8_000,
          });
          await transporter.verify();
          smtpTest = "✅ Connection OK";
        } catch (e: any) {
          smtpTest = `❌ ${e.message}`;
        }
      }
      accountResults.push({
        email: a.email,
        status: a.status,
        sent_today: a.sent_today,
        daily_limit: a.daily_limit,
        remaining: (a.daily_limit ?? 0) - (a.sent_today ?? 0),
        last_reset: a.last_reset,
        needs_reset: a.last_reset ? new Date(a.last_reset) < todayMidnight : true,
        has_user_name: !!a.user_name,
        user_name_value: a.user_name ?? "(missing — will use email)",
        smtp_test: smtpTest,
      });
    }

    return NextResponse.json({
      success: true,
      userId,
      count: accounts?.length ?? 0,
      serverTime: now.toISOString(),
      tip: testSend ? null : "Add ?test=1 to test SMTP connections",
      accounts: accountResults,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
