/**
 * SMTP CHECK API
 * ──────────────
 * Runs a DNS MX lookup + optional SMTP RCPT-TO probe to verify
 * whether an email address is deliverable.
 *
 * Used by email-verifier.ts for:
 *  - Step 3: Confirming SMTP reachability
 *  - Catch-all detection (probe a random mailbox on the same domain)
 *
 * Falls back gracefully — if the SMTP probe cannot connect (firewall,
 * timeout, etc.) we return { deliverable: null } rather than false.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as dns from 'dns/promises';
import * as net from 'net';

export const runtime = 'nodejs';

// ─── DNS MX lookup ────────────────────────────────────────────────────────────

async function getMXRecords(domain: string): Promise<string[]> {
  try {
    const records = await dns.resolveMx(domain);
    return records
      .sort((a, b) => a.priority - b.priority)
      .map(r => r.exchange);
  } catch {
    return [];
  }
}

// ─── SMTP RCPT-TO probe ───────────────────────────────────────────────────────
// Connects to the mail server, runs through EHLO → MAIL FROM → RCPT TO
// and reads the response code without actually sending any email.
// Returns true = mailbox exists, false = rejected, null = inconclusive.

function smtpProbe(mxHost: string, email: string, timeoutMs = 7000): Promise<boolean | null> {
  return new Promise((resolve) => {
    let buf = '';
    let stage = 0;  // 0=greeting, 1=EHLO, 2=MAIL FROM, 3=RCPT TO

    const timer = setTimeout(() => { socket.destroy(); resolve(null); }, timeoutMs);

    const socket = net.createConnection({ host: mxHost, port: 25 });

    socket.on('error', () => { clearTimeout(timer); resolve(null); });
    socket.on('timeout', () => { clearTimeout(timer); socket.destroy(); resolve(null); });
    socket.setTimeout(timeoutMs);

    const send = (cmd: string) => {
      try { socket.write(cmd + '\r\n'); } catch { /* ignore */ }
    };

    const close = (result: boolean | null) => {
      clearTimeout(timer);
      try { send('QUIT'); } catch { /* ignore */ }
      socket.destroy();
      resolve(result);
    };

    socket.on('data', (data) => {
      buf += data.toString();
      const lines = buf.split('\r\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.slice(0, 3), 10);

        if (stage === 0 && code === 220) {
          stage = 1;
          send(`EHLO verify.pryro.com`);
        } else if (stage === 1 && (code === 250 || code === 220)) {
          stage = 2;
          send(`MAIL FROM:<verify@pryro.com>`);
        } else if (stage === 2 && code === 250) {
          stage = 3;
          send(`RCPT TO:<${email}>`);
        } else if (stage === 3) {
          if (code === 250 || code === 251) {
            close(true);   // Mailbox accepted
          } else if (code === 550 || code === 551 || code === 553 || code === 554) {
            close(false);  // Hard reject — mailbox doesn't exist
          } else if (code === 421 || code === 450 || code === 451 || code === 452) {
            close(null);   // Soft reject — temporary, inconclusive
          } else {
            close(null);   // Unknown response
          }
          return;
        } else if (code >= 500) {
          close(null);  // Server error — inconclusive
          return;
        }
      }
    });
  });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json() as { email: string };

    if (!email || !email.includes('@')) {
      return NextResponse.json({ deliverable: false, reason: 'Invalid format' }, { status: 400 });
    }

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      return NextResponse.json({ deliverable: false, reason: 'No domain' }, { status: 400 });
    }

    // Step 1: MX records
    const mxHosts = await getMXRecords(domain);
    if (mxHosts.length === 0) {
      return NextResponse.json({
        deliverable: false,
        mx_found: false,
        reason: `No MX records for ${domain}`,
      });
    }

    // Step 2: Try SMTP probe on first MX host
    // Many servers block port 25 from cloud environments — graceful fallback
    const primaryMX = mxHosts[0]!;
    const smtpResult = await smtpProbe(primaryMX, email, 6000).catch(() => null);

    return NextResponse.json({
      deliverable: smtpResult,   // true / false / null
      mx_found: true,
      mx_host: primaryMX,
      reason: smtpResult === true
        ? 'Mailbox confirmed reachable'
        : smtpResult === false
        ? 'Mailbox rejected by SMTP server'
        : 'SMTP inconclusive — server may block probing',
    });

  } catch (err: any) {
    return NextResponse.json(
      { deliverable: null, reason: err?.message || 'Check failed' },
      { status: 500 }
    );
  }
}
