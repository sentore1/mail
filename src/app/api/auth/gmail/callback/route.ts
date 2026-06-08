/**
 * Gmail OAuth callback — exchanges code for tokens and saves SMTP/IMAP config.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "../../../../../../supabase/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(`${appUrl}/dashboard?oauth_error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard?oauth_error=missing_params`);
  }

  // Decode state to get userId
  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = decoded.userId;
  } catch {
    return NextResponse.redirect(`${appUrl}/dashboard?oauth_error=invalid_state`);
  }

  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
  const redirectUri  = `${appUrl}/api/auth/gmail/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("[gmail/callback] token exchange failed:", err);
    return NextResponse.redirect(`${appUrl}/dashboard?oauth_error=token_exchange_failed`);
  }

  const tokens = await tokenRes.json();
  const { access_token, refresh_token, expires_in } = tokens;

  // Get user's Gmail address
  const infoRes = await fetch("https://www.googleapis.com/userinfo/v2/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const info = await infoRes.json();
  const email = info.email as string;

  const service = createServiceClient();
  const expiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString();

  // Save as SMTP account (OAuth-based)
  await service.from("smtp_accounts").upsert({
    user_id: userId,
    email,
    provider: "gmail_oauth",
    host: "smtp.gmail.com",
    port: 587,
    user_name: email,
    password: "", // not used for OAuth
    oauth_access_token: access_token,
    oauth_refresh_token: refresh_token,
    oauth_expires_at: expiresAt,
    sender_name: info.name || email.split("@")[0],
    daily_limit: 500,
    sent_today: 0,
    status: "active",
    auth_type: "oauth2",
  }, { onConflict: "email,user_id" });

  // Save inbox config for reply detection
  await service.from("email_inbox_config").upsert({
    user_id: userId,
    email_address: email,
    provider: "gmail",
    access_token,
    refresh_token,
    imap_host: "imap.gmail.com",
    imap_port: 993,
    imap_username: email,
    imap_password: "",
    is_active: true,
    auth_type: "oauth2",
  }, { onConflict: "email_address,user_id" });

  return NextResponse.redirect(`${appUrl}/dashboard?oauth_success=gmail&email=${encodeURIComponent(email)}`);
}
