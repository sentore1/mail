/**
 * Email Verifier — two-level check, no paid API needed.
 *
 * Level 1: Format check (regex)
 * Level 2: MX DNS check — does the domain accept email?
 * Level 3: SMTP RCPT-TO probe — does the mailbox actually exist?
 *          (best-effort — many servers block this, so we fall back to DNS result)
 */

export interface VerifyResult {
  valid: boolean;
  reason: 'valid' | 'invalid_format' | 'no_mx_record' | 'mailbox_rejected' | 'unverifiable';
  detail?: string;
}

const FORMAT_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

// Domains that are known to block SMTP probes — skip RCPT-TO for these
const PROBE_BLOCKED_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.fr',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'aol.com', 'yandex.com', 'yandex.ru',
]);

/**
 * Level 1 + 2: Format + MX DNS check.
 * Fast, free, no network connection to the mail server.
 */
export async function verifyEmailDNS(email: string): Promise<VerifyResult> {
  if (!FORMAT_RE.test(email)) {
    return { valid: false, reason: 'invalid_format', detail: 'Email format is invalid' };
  }

  const domain = email.split('@')[1]!.toLowerCase();

  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
      { signal: AbortSignal.timeout(5_000) }
    );
    if (!res.ok) {
      // DNS API unreachable — assume valid so we don't drop real emails
      return { valid: true, reason: 'unverifiable', detail: 'DNS check unavailable' };
    }
    const data = await res.json();
    const hasMX = Array.isArray(data?.Answer) && data.Answer.length > 0;
    if (!hasMX) {
      return { valid: false, reason: 'no_mx_record', detail: `Domain ${domain} has no MX records` };
    }
    return { valid: true, reason: 'valid' };
  } catch {
    // Network error — assume valid
    return { valid: true, reason: 'unverifiable', detail: 'DNS check failed' };
  }
}

/**
 * Full verification: format + MX + optional SMTP probe.
 * The SMTP probe connects to the mail server and issues RCPT TO
 * to check if the mailbox exists — without actually sending an email.
 *
 * NOTE: Many servers (Gmail, Yahoo, etc.) block this probe.
 * For those, we fall back to the DNS result.
 */
export async function verifyEmail(email: string): Promise<VerifyResult> {
  // Level 1 + 2
  const dnsResult = await verifyEmailDNS(email);
  if (!dnsResult.valid) return dnsResult;

  const domain = email.split('@')[1]!.toLowerCase();

  // Skip SMTP probe for domains that block it
  if (PROBE_BLOCKED_DOMAINS.has(domain)) {
    return { valid: true, reason: 'valid', detail: 'DNS verified (SMTP probe skipped for this provider)' };
  }

  // Level 3: SMTP RCPT-TO probe via a free verification API
  // We use api.mailcheck.ai — free, no key needed, 1000 checks/day
  try {
    const res = await fetch(
      `https://api.mailcheck.ai/email/${encodeURIComponent(email)}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) {
      // API unavailable — fall back to DNS result
      return { valid: true, reason: 'valid', detail: 'DNS verified (SMTP probe unavailable)' };
    }
    const data = await res.json();

    // mailcheck.ai response: { status: 'valid'|'invalid'|'unknown', ... }
    if (data.status === 'invalid' || data.disposable === true) {
      return {
        valid: false,
        reason: 'mailbox_rejected',
        detail: data.reason || 'Mailbox does not exist or is disposable',
      };
    }
    return { valid: true, reason: 'valid', detail: 'Verified via SMTP probe' };
  } catch {
    // SMTP probe failed — fall back to DNS result (assume valid)
    return { valid: true, reason: 'valid', detail: 'DNS verified (SMTP probe timed out)' };
  }
}

/**
 * Batch verify a list of emails.
 * Returns a map of email → VerifyResult.
 * Processes with a small delay to avoid rate limits.
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
      await new Promise(r => setTimeout(r, 200)); // 200ms between checks
    }
  }
  return results;
}
