/**
 * Gmail OAuth 2.0 flow
 *
 * GET  /api/auth/gmail        — redirect to Google consent screen
 * GET  /api/auth/gmail/callback — exchange code for tokens, save to DB
 *
 * Required Google Cloud setup:
 *  1. Go to https://console.cloud.google.com
 *  2. Create a project → Enable "Gmail API"
 *  3. OAuth consent screen → External → add your domain
 *  4. Credentials → Create OAuth 2.0 Client ID (Web application)
 *  5. Add redirect URI: https://yourdomain.com/api/auth/gmail/callback
 *  6. Copy Client ID + Secret to .env.local:
 *     GOOGLE_OAUTH_CLIENT_ID=...
 *     GOOGLE_OAUTH_CLIENT_SECRET=...
 *     NEXT_PUBLIC_APP_URL=https://yourdomain.com
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";

export const runtime = "nodejs";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",        // send emails
  "https://www.googleapis.com/auth/gmail.readonly",    // read inbox for reply detection
  "https://www.googleapis.com/auth/userinfo.email",    // get email address
].join(" ");

// ── Step 1: Redirect to Google ────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!clientId) {
    return NextResponse.json({
      error: "GOOGLE_OAUTH_CLIENT_ID not configured",
      setup: "See /api/auth/gmail setup instructions",
    }, { status: 500 });
  }

  const redirectUri = `${appUrl}/api/auth/gmail/callback`;
  const state = Buffer.from(JSON.stringify({ userId: user.id })).toString("base64url");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");   // get refresh token
  url.searchParams.set("prompt", "consent");        // always show consent to get refresh token
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
