/**
 * /api/inbox/test
 * Tests IMAP connectivity for all SMTP accounts.
 * Returns detailed errors so the user can diagnose connection issues.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";

export const runtime = "nodejs";
export const maxDuration = 30;

function smtpHostToImap(host: string): string | null {
  const h = (host ?? "").toLowerCase();
  if (h.includes("gmail") || h.includes("google"))  return "imap.gmail.com";
  if (h.includes("outlook") || h.includes("office365") || h.includes("hotmail") || h.includes("live")) return "outlook.office365.com";
  if (h.includes("yahoo"))    return "imap.mail.yahoo.com";
  if (h.includes("zoho"))     return "imap.zoho.com";
  if (h.startsWith("smtp."))  return h.replace("smtp.", "imap.");
  return null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: smtpRows } = await service
    .from("smtp_accounts")
    .select("id, email, host, user_name, password, status")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (!smtpRows || smtpRows.length === 0) {
    return NextResponse.json({ ok: false, message: "No active SMTP accounts found. Add a Gmail account in SMTP Manager first.", accounts: [] });
  }

  const results = [];

  for (const smtp of smtpRows) {
    const imapHost = smtpHostToImap(smtp.host ?? "");
    if (!imapHost) {
      results.push({ email: smtp.email, ok: false, error: `Cannot derive IMAP host from SMTP host: ${smtp.host}` });
      continue;
    }
    if (!smtp.password) {
      results.push({ email: smtp.email, ok: false, error: "No password stored — re-add this account in SMTP Manager" });
      continue;
    }

    try {
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({
        host:   imapHost,
        port:   993,
        secure: true,
        auth:   { user: smtp.user_name ?? smtp.email, pass: smtp.password },
        logger: false,
        tls:    { rejectUnauthorized: false },
      } as any);

      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timed out after 10s")), 10_000)),
      ]);

      const status = await client.status("INBOX", { messages: true, unseen: true });
      await client.logout().catch(() => {});

      results.push({
        email:    smtp.email,
        imapHost,
        ok:       true,
        messages: (status as any).messages,
        unseen:   (status as any).unseen,
      });
    } catch (err: any) {
      let friendly = err?.message ?? String(err);
      // Make common errors human-readable
      if (friendly.includes("AUTHENTICATIONFAILED") || friendly.includes("Invalid credentials")) {
        friendly = "Wrong password. Use an App Password (not your Gmail password). Go to myaccount.google.com/apppasswords";
      } else if (friendly.includes("IMAP access is disabled")) {
        friendly = "IMAP is disabled in Gmail. Go to Gmail Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP";
      } else if (friendly.includes("timed out") || friendly.includes("ECONNREFUSED") || friendly.includes("ETIMEDOUT")) {
        friendly = `Cannot reach ${imapHost}:993 — check firewall or network`;
      }
      results.push({ email: smtp.email, imapHost, ok: false, error: friendly });
    }
  }

  const allOk = results.every(r => r.ok);
  return NextResponse.json({ ok: allOk, accounts: results });
}
