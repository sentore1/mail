/**
 * Microsoft Outlook OAuth callback
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "../../../../../supabase/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const tenantId = process.env.MICROSOFT_OAUTH_TENANT_ID || "common";

  if (error) {
    return NextResponse.redirect(`${appUrl}/dashboard?oauth_error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard?oauth_error=missing_params`);
  }

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = decoded.userId;
  } catch {
    return NextResponse.redirect(`${appUrl}/dashboard?oauth_error=invalid_state`);
  }

  const clientId     = process.env.MICROSOFT_OAUTH_CLIENT_ID!;
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET!;
  const redirectUri  = `${appUrl}/api/auth/outlook/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: "authorization_code",
      }),
    }
  );

  if (!tokenRes.ok) {
    console.error("[outlook/callback] token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(`${appUrl}/dashboard?oauth_error=token_exchange_failed`);
  }

  const tokens = await tokenRes.json();
  const { access_token, refresh_token, expires_in } = tokens;

  // Get user's email address from Microsoft Graph
  const meRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,displayName", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const me = await meRes.json();
  const email = me.mail || me.userPrincipalName;

  const service = createServiceClient();
  const expiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString();

  // Save as SMTP account
  await service.from("smtp_accounts").upsert({
    user_id: userId,
    email,
    provider: "outlook_oauth",
    host: "smtp.office365.com",
    port: 587,
    user_name: email,
    password: "",
    oauth_access_token: access_token,
    oauth_refresh_token: refresh_token,
    oauth_expires_at: expiresAt,
    sender_name: me.displayName || email.split("@")[0],
    daily_limit: 300,
    sent_today: 0,
    status: "active",
    auth_type: "oauth2",
  }, { onConflict: "email,user_id" });

  // Save inbox config
  await service.from("email_inbox_config").upsert({
    user_id: userId,
    email_address: email,
    provider: "outlook",
    access_token,
    refresh_token,
    imap_host: "outlook.office365.com",
    imap_port: 993,
    imap_username: email,
    imap_password: "",
    is_active: true,
    auth_type: "oauth2",
  }, { onConflict: "email_address,user_id" });

  return NextResponse.redirect(`${appUrl}/dashboard?oauth_success=outlook&email=${encodeURIComponent(email)}`);
}
