/**
 * Email Verifier — three-level check, no paid API needed.
 *
 * Level 1: Format check (regex)
 * Level 2: MX DNS check — does the domain have mail servers?
 * Level 3: SMTP RCPT-TO probe — does the specific mailbox exist?
 *          Connects to the mail server and asks without sending anything.
 *          Falls back gracefully if the server blocks probes.
 */

import * as net from 'net';
import * as dns from 'dns/promises';

export interface VerifyResult {
  valid: boolean;
  reason: 'valid' | 'invalid_format' | 'no_mx_record' | 'mailbox_rejected' | 'unverifiable';
  detail?: string;
}

const FORMAT_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

// Domains that always block SMTP probes — skip RCPT-TO for these
const PROBE_BLOCKED_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.fr',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'office365.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'aol.com', 'yandex.com', 'yandex.ru',
  'zoho.com', 'fastmail.com',
]);

// ─── Level 2: MX DNS check ────────────────────────────────────────────────────

async function getMXRecords(domain: string): Promise<string[]> {
  try {
    const records = await dns.resolveMx(domain);
    if (!records || records.length === 0) return [];
    // Sort by priority (lowest = highest priority)
    records.sort((a, b) => a.priority - b.priority);
    return records.map(r => r.exchange);
  } catch {
    // Try Google DNS API as fallback
    try {
      const res = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
        { signal: AbortSignal.timeout(5_000) }
      );
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data?.Answer)) return [];
      return data.Answer
        .filter((r: any) => r.type === 15)
        .map((r: any) => (r.data as string).split(' ')[1]?.replace(/\.$/, '') ?? '')
        .filter(Boolean);
    } catch {
      return [];
    }
  }
}

// ─── Level 3: SMTP RCPT-TO probe ─────────────────────────────────────────────

// MX host patterns that block SMTP probes (Google Workspace, Microsoft 365, etc.)
const BLOCKED_MX_PATTERNS = [
  'google.com', 'googlemail.com', 'aspmx', 'gmail',
  'outlook.com', 'hotmail.com', 'protection.outlook.com', 'mail.protection.outlook',
  'zoho.com', 'zohomail.com',
  'mimecast.com', 'pphosted.com', 'messagelabs.com',
  'proofpoint.com', 'barracuda', 'spamfilter',
];

function smtpProbe(mxHost: string, email: string, timeoutMs = 10_000): Promise<'valid' | 'invalid' | 'unknown'> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.destroy();
      resolve('unknown');
    }, timeoutMs);

    const socket = net.createConnection(25, mxHost);
    let step = 0;
    let buffer = '';

    const send = (cmd: string) => socket.write(cmd + '\r\n');

    socket.on('connect', () => {
      // Connection established — wait for banner
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\r\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const code = parseInt(line.slice(0, 3), 10);
        if (isNaN(code)) continue;

        if (step === 0 && code === 220) {
          // Server banner received
          send('EHLO verify.pryro.com');
          step = 1;
        } else if (step === 1 && (code === 250 || code === 220)) {
          // EHLO accepted
          send(`MAIL FROM:<verify@pryro.com>`);
          step = 2;
        } else if (step === 2 && code === 250) {
          // MAIL FROM accepted
          send(`RCPT TO:<${email}>`);
          step = 3;
        } else if (step === 3) {
          clearTimeout(timer);
          socket.destroy();
          if (code === 250 || code === 251) {
            resolve('valid');   // Mailbox exists
          } else if (code >= 500 && code < 600) {
            resolve('invalid'); // Mailbox rejected (550, 551, 553, etc.)
          } else if (code === 450 || code === 451 || code === 452) {
            resolve('unknown'); // Temporary failure — can't determine
          } else {
            resolve('unknown');
          }
        } else if (code >= 400) {
          // Server error or rejection at any step
          clearTimeout(timer);
          socket.destroy();
          resolve('unknown');
        }
      }
    });

    socket.on('error', () => {
      clearTimeout(timer);
      resolve('unknown');
    });

    socket.on('close', () => {
      clearTimeout(timer);
      if (step < 3) resolve('unknown');
    });
  });
}

// ─── Main verifier ────────────────────────────────────────────────────────────

export async function verifyEmail(email: string): Promise<VerifyResult> {
  // Level 1: Format
  if (!FORMAT_RE.test(email)) {
    return { valid: false, reason: 'invalid_format', detail: 'Email format is invalid' };
  }

  const domain = email.split('@')[1]!.toLowerCase();

  // Level 2: MX DNS
  const mxRecords = await getMXRecords(domain);
  if (mxRecords.length === 0) {
    return { valid: false, reason: 'no_mx_record', detail: `Domain ${domain} has no MX records` };
  }

  // Get the top MX server
  const mxHost = mxRecords[0]!;

  // Level 3: SMTP probe — skip for providers that block it
  if (PROBE_BLOCKED_DOMAINS.has(domain)) {
    return { valid: true, reason: 'valid', detail: 'DNS verified (SMTP probe skipped for this provider)' };
  }

  // Also skip if MX host is a known blocking provider (e.g. Google Workspace)
  const mxHostLower = mxHost.toLowerCase();
  const mxBlocked = BLOCKED_MX_PATTERNS.some(p => mxHostLower.includes(p));
  if (mxBlocked) {
    return { valid: true, reason: 'unverifiable', detail: `MX host ${mxHost} blocks SMTP probes — DNS verified only` };
  }

  // Try the top MX server
  try {
    const result = await smtpProbe(mxHost, email, 10_000);
    if (result === 'invalid') {
      return {
        valid: false,
        reason: 'mailbox_rejected',
        detail: `Mailbox ${email} does not exist on ${mxHost}`,
      };
    }
    if (result === 'valid') {
      return { valid: true, reason: 'valid', detail: `Verified via SMTP probe on ${mxHost}` };
    }
    // 'unknown' — server blocked probe, fall back to DNS result
    return { valid: true, reason: 'unverifiable', detail: 'SMTP probe blocked — DNS verified only' };
  } catch {
    return { valid: true, reason: 'unverifiable', detail: 'SMTP probe failed — DNS verified only' };
  }
}

// DNS-only version (faster, used when SMTP probe is not needed)
export async function verifyEmailDNS(email: string): Promise<VerifyResult> {
  if (!FORMAT_RE.test(email)) {
    return { valid: false, reason: 'invalid_format', detail: 'Email format is invalid' };
  }
  const domain = email.split('@')[1]!.toLowerCase();
  const mxRecords = await getMXRecords(domain);
  if (mxRecords.length === 0) {
    return { valid: false, reason: 'no_mx_record', detail: `Domain ${domain} has no MX records` };
  }
  return { valid: true, reason: 'valid' };
}

/**
 * Batch verify a list of emails.
 * Returns a map of email → VerifyResult.
 */
export async function verifyEmailBatch(
  emails: string[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, VerifyResult>> {
  const results = new Map<string, VerifyResult>();
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i]!;
    results.set(email, await verifyEmail(email));
    onProgress?.(i + 1, emails.length);
    if (i < emails.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return results;
}
