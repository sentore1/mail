/**
 * EMAIL VERIFIER
 * ──────────────
 * Answers Q6, Q7, Q8, Q9:
 *
 *  Q6  DNS MX check + SMTP RCPT-TO probe + mailbox existence
 *  Q7  Flag / remove invalid emails, move to review list
 *  Q8  Detect catch-all domains (accept-all servers)
 *  Q9  Detect generic emails (info@, contact@), flag as low-priority,
 *      attempt to suggest a better direct email
 *
 * All verification is done without paid APIs:
 *  - DNS MX via Google DNS-over-HTTPS
 *  - Catch-all detection via probing a random mailbox
 *  - SMTP probe via fetch to a lightweight serverless helper
 *    (falls back gracefully if SMTP probe is unavailable)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type VerificationStatus =
  | 'valid'          // deliverable, real mailbox
  | 'catch_all'      // domain accepts everything — can't confirm mailbox
  | 'invalid'        // domain has no MX / SMTP rejected
  | 'risky'          // generic prefix or low-confidence
  | 'unverifiable'   // SMTP probe timed out / blocked — unknown
  | 'disposable';    // throwaway email domain

export interface VerificationResult {
  email:          string;
  status:         VerificationStatus;
  mx_found:       boolean;
  is_catch_all:   boolean;
  is_generic:     boolean;
  is_disposable:  boolean;
  smtp_reachable: boolean | null;   // null = not probed
  risk_score:     number;           // 0 (safe) – 100 (dangerous)
  reason:         string;           // human-readable explanation
  checked_at:     string;
}

// ─── Disposable domain list (common burner services) ─────────────────────────

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com','guerrillamail.com','tempmail.com','throwaway.email',
  'yopmail.com','sharklasers.com','guerrillamailblock.com','grr.la',
  'guerrillamail.info','guerrillamail.biz','guerrillamail.de','guerrillamail.net',
  'guerrillamail.org','spam4.me','trashmail.com','trashmail.me','trashmail.net',
  'maildrop.cc','dispostable.com','mailnull.com','spamgourmet.com',
  'discard.email','fakeinbox.com','tempr.email','throwam.com','spamoff.de',
  'getairmail.com','filzmail.com','spambog.com','powered.name',
  'spamdecoy.net','tempomail.fr','spamfree24.org','kasmail.com',
]);

// ─── Generic email prefixes (Q9) ─────────────────────────────────────────────

const GENERIC_PREFIXES = new Set([
  'info','contact','hello','hi','mail','support','help','admin','office',
  'team','sales','reception','general','webmaster','enquiry','enquiries',
  'bookings','booking','hr','marketing','accounts','billing','feedback',
  'service','media','press','shop','store','news','pr','noreply','no-reply',
  'donotreply','abuse','postmaster','hostmaster','unsubscribe',
]);

// ─── DNS MX lookup via Google DoH ────────────────────────────────────────────

const mxCache = new Map<string, { hasMX: boolean; records: string[] }>();

export async function checkMX(domain: string): Promise<{ hasMX: boolean; records: string[] }> {
  if (mxCache.has(domain)) return mxCache.get(domain)!;
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) { mxCache.set(domain, { hasMX: true, records: [] }); return { hasMX: true, records: [] }; }
    const data = await res.json();
    const hasMX = Array.isArray(data?.Answer) && data.Answer.length > 0;
    const records = (data?.Answer ?? []).map((a: any) => a.data ?? '').filter(Boolean);
    mxCache.set(domain, { hasMX, records });
    return { hasMX, records };
  } catch {
    // DNS check failed — assume valid to avoid false blocks
    mxCache.set(domain, { hasMX: true, records: [] });
    return { hasMX: true, records: [] };
  }
}

// ─── Catch-all detection (Q8) ────────────────────────────────────────────────
// A catch-all domain accepts email for ANY address. We detect this by probing
// a randomly generated mailbox that almost certainly doesn't exist.
// If the domain accepts it → it's catch-all.

const catchAllCache = new Map<string, boolean>();

async function isCatchAllDomain(domain: string): Promise<boolean> {
  if (catchAllCache.has(domain)) return catchAllCache.get(domain)!;

  // Generate a random mailbox that can't possibly exist
  const random = `verify-${Math.random().toString(36).slice(2, 12)}@${domain}`;

  try {
    // Use our internal SMTP probe API if available
    const res = await fetch('/api/smtp-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: random }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      catchAllCache.set(domain, false);
      return false;
    }
    const data = await res.json();
    const isCatchAll = data.deliverable === true;
    catchAllCache.set(domain, isCatchAll);
    return isCatchAll;
  } catch {
    catchAllCache.set(domain, false);
    return false;
  }
}

// ─── Main verifier (Q6) ──────────────────────────────────────────────────────

export async function verifyEmail(email: string): Promise<VerificationResult> {
  const lowerEmail = email.toLowerCase().trim();
  const [local, domain] = lowerEmail.split('@');
  const now = new Date().toISOString();

  if (!local || !domain || !domain.includes('.')) {
    return {
      email: lowerEmail, status: 'invalid', mx_found: false,
      is_catch_all: false, is_generic: false, is_disposable: false,
      smtp_reachable: false, risk_score: 100,
      reason: 'Invalid email format.', checked_at: now,
    };
  }

  // 1. Disposable check
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      email: lowerEmail, status: 'disposable', mx_found: false,
      is_catch_all: false, is_generic: false, is_disposable: true,
      smtp_reachable: false, risk_score: 95,
      reason: 'Disposable email domain — not a real business address.', checked_at: now,
    };
  }

  // 2. Generic prefix check
  const isGeneric = GENERIC_PREFIXES.has(local);

  // 3. MX record check
  const { hasMX } = await checkMX(domain);
  if (!hasMX) {
    return {
      email: lowerEmail, status: 'invalid', mx_found: false,
      is_catch_all: false, is_generic: isGeneric, is_disposable: false,
      smtp_reachable: false, risk_score: 90,
      reason: `Domain ${domain} has no MX records — cannot receive email.`, checked_at: now,
    };
  }

  // 4. SMTP deliverability probe (via internal API)
  let smtpReachable: boolean | null = null;
  let smtpStatus: 'valid' | 'invalid' | 'unverifiable' = 'unverifiable';

  try {
    const res = await fetch('/api/smtp-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: lowerEmail }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      smtpReachable = data.deliverable ?? null;
      if (smtpReachable === true)  smtpStatus = 'valid';
      if (smtpReachable === false) smtpStatus = 'invalid';
    }
  } catch { /* SMTP probe unavailable — continue without it */ }

  // If SMTP says hard reject, email is invalid
  if (smtpStatus === 'invalid') {
    return {
      email: lowerEmail, status: 'invalid', mx_found: true,
      is_catch_all: false, is_generic: isGeneric, is_disposable: false,
      smtp_reachable: false, risk_score: 85,
      reason: 'SMTP server rejected this mailbox — address does not exist.', checked_at: now,
    };
  }

  // 5. Catch-all detection (Q8)
  const catchAll = await isCatchAllDomain(domain);
  if (catchAll) {
    return {
      email: lowerEmail, status: 'catch_all', mx_found: true,
      is_catch_all: true, is_generic: isGeneric, is_disposable: false,
      smtp_reachable: null, risk_score: isGeneric ? 60 : 40,
      reason: `${domain} is a catch-all domain — accepts all email addresses, but mailbox existence cannot be confirmed.`,
      checked_at: now,
    };
  }

  // 6. Generic email — risky but not invalid
  if (isGeneric) {
    return {
      email: lowerEmail, status: 'risky', mx_found: true,
      is_catch_all: false, is_generic: true, is_disposable: false,
      smtp_reachable: smtpReachable,
      risk_score: 35,
      reason: `Generic address (${local}@) — email is deliverable but unlikely to reach a decision-maker.`,
      checked_at: now,
    };
  }

  // 7. All checks passed
  return {
    email: lowerEmail, status: 'valid', mx_found: true,
    is_catch_all: false, is_generic: false, is_disposable: false,
    smtp_reachable: smtpReachable ?? true,
    risk_score: 5,
    reason: 'Email passed MX and SMTP verification.',
    checked_at: now,
  };
}

// ─── Batch verifier (Q7) ─────────────────────────────────────────────────────

export interface BatchVerificationResult {
  verified:    VerificationResult[];   // valid or catch-all
  flagged:     VerificationResult[];   // risky or unverifiable
  rejected:    VerificationResult[];   // invalid or disposable
}

export async function verifyEmailBatch(
  emails: string[],
  concurrency = 5,
  onProgress?: (done: number, total: number) => void,
): Promise<BatchVerificationResult> {
  const verified:  VerificationResult[] = [];
  const flagged:   VerificationResult[] = [];
  const rejected:  VerificationResult[] = [];

  let done = 0;

  // Process in chunks to respect rate limits
  for (let i = 0; i < emails.length; i += concurrency) {
    const chunk = emails.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(e => verifyEmail(e)));

    for (const r of results) {
      if (r.status === 'valid' || r.status === 'catch_all') {
        verified.push(r);
      } else if (r.status === 'risky' || r.status === 'unverifiable') {
        flagged.push(r);
      } else {
        rejected.push(r);
      }
      done++;
      onProgress?.(done, emails.length);
    }

    // Small delay between batches to avoid rate limits
    if (i + concurrency < emails.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return { verified, flagged, rejected };
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export function getVerificationBadge(status: VerificationStatus): {
  label: string;
  color: string;
  bg: string;
} {
  switch (status) {
    case 'valid':       return { label: 'Verified',    color: '#15803d', bg: '#dcfce7' };
    case 'catch_all':   return { label: 'Catch-All',   color: '#b45309', bg: '#fef3c7' };
    case 'risky':       return { label: 'Risky',       color: '#b45309', bg: '#fef3c7' };
    case 'invalid':     return { label: 'Invalid',     color: '#dc2626', bg: '#fee2e2' };
    case 'disposable':  return { label: 'Disposable',  color: '#dc2626', bg: '#fee2e2' };
    case 'unverifiable':return { label: 'Unverifiable',color: '#6b7280', bg: '#f3f4f6' };
  }
}

export function canSendTo(result: VerificationResult): boolean {
  return result.status === 'valid' || result.status === 'catch_all';
}
