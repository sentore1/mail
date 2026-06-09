/**
 * Microsoft Outlook OAuth 2.0 flow
 *
 * Required Azure setup:
 *  1. Go to https://portal.azure.com → Azure Active Directory → App registrations
 *  2. New registration → Web → add redirect URI:
 *     https://yourdomain.com/api/auth/outlook/callback
 *  3. API permissions → add "Mail.Send", "Mail.Read", "IMAP.AccessAsUser.All", "offline_access"
 *  4. Grant admin consent
 *  5. Certificates & secrets → New client secret
 *  6. Copy to .env.local:
 *     MICROSOFT_OAUTH_CLIENT_ID=...
 *     MICROSOFT_OAUTH_CLIENT_SECRET=...
 *     MICROSOFT_OAUTH_TENANT_ID=common  (or your tenant ID)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";

export const runtime = "nodejs";

const SCOPES = [
  "https://outlook.office.com/SMTP.Send",
  "https://outlook.office.com/IMAP.AccessAsUser.All",
  "offline_access",
  "openid",
  "email",
  "profile",
].join(" ");

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const tenantId = process.env.MICROSOFT_OAUTH_TENANT_ID || "common";
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!clientId) {
    return NextResponse.json({
      error: "MICROSOFT_OAUTH_CLIENT_ID not configured",
      setup: "See /api/auth/outlook setup instructions",
    }, { status: 500 });
  }

  const redirectUri = `${appUrl}/api/auth/outlook/callback`;
  const state = Buffer.from(JSON.stringify({ userId: user.id })).toString("base64url");

  const url = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
