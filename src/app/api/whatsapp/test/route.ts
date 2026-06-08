/**
 * POST /api/whatsapp/test
 * Sends a test WhatsApp message to the user's configured number.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const toNumber: string = body.whatsapp_number;
  const senderName: string = body.sender_name || "there";

  if (!toNumber || !/^\+\d{7,15}$/.test(toNumber)) {
    return NextResponse.json(
      { error: "Invalid phone number. Use format: +250788123456" },
      { status: 400 }
    );
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

  if (!accountSid || !authToken) {
    return NextResponse.json(
      { error: "Twilio credentials not set. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env.local" },
      { status: 400 }
    );
  }

  const message = `👋 *Test Message from Pryro Mail*\n\nHi ${senderName}! Your WhatsApp notifications are working correctly.\n\nYou'll receive alerts here when leads open emails, reply, or bounce. ✅`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const toNormalized = toNumber.startsWith("whatsapp:") ? toNumber : `whatsapp:${toNumber}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
    },
    body: new URLSearchParams({ From: from, To: toNormalized, Body: message }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as any)?.message || `Twilio error ${res.status}`;

    // Common Twilio error guidance
    let hint = "";
    if (msg.includes("not a valid WhatsApp") || res.status === 400) {
      hint = " — Make sure your number has joined the Twilio WhatsApp sandbox (send 'join <sandbox-word>' to +14155238886 on WhatsApp first).";
    } else if (res.status === 401) {
      hint = " — Check your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.";
    }

    return NextResponse.json({ error: msg + hint }, { status: 400 });
  }

  // Log the test — wrapped in try/catch since table may not exist yet
  try {
    const service = createServiceClient();
    await service.from("whatsapp_delivery_log").insert({
      user_id: user.id,
      event: "test",
      to_number: toNumber,
      message,
      success: true,
      sent_at: new Date().toISOString(),
    });
  } catch { /* non-fatal — log failure doesn't affect the response */ }

  return NextResponse.json({ success: true, message: `Test message sent to ${toNumber}` });
}
