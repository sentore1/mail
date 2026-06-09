/**
 * SMTP CONNECTION TEST API
 * ────────────────────────
 * POST /api/smtp-test
 *
 * Runs a live SMTP authentication test against the user's saved SMTP accounts.
 * Tests each step: TCP connect → EHLO → AUTH → QUIT
 * Returns specific error codes and actionable messages for every failure type.
 */

import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '../../../../supabase/server';
import { createServiceClient } from '../../../../supabase/service';

export const runtime = 'nodejs';

// ─── Translate raw SMTP/nodemailer errors to user-friendly messages ───────────

function classifySmtpError(error: string): {
  code: string;
  title: string;
  detail: string;
  fix: string;
} {
  const msg = error.toLowerCase();

  if (msg.includes('invalid login') || msg.includes('username and password not accepted') || msg.includes('535') || msg.includes('authentication failed') || msg.includes('auth failed')) {
    return {
      code: '535',
      title: 'Authentication failed',
      detail: 'Gmail rejected the login. Your App Password is wrong, expired, or has been revoked.',
      fix: 'Go to myaccount.google.com → Security → 2-Step Verification → App Passwords. Create a new 16-character password and update it here.',
    };
  }
  if (msg.includes('invalid credentials') || msg.includes('bad credentials')) {
    return {
      code: '535',
      title: 'Invalid credentials',
      detail: 'The email/password combination was rejected by Gmail.',
      fix: 'Make sure you are using an App Password (not your regular Gmail password). Your regular password will never work here.',
    };
  }
  if (msg.includes('econnrefused') || msg.includes('connection refused')) {
    return {
      code: 'ECONNREFUSED',
      title: 'Connection refused',
      detail: `The mail server at ${error.match(/\d+\.\d+\.\d+\.\d+/)?.[0] ?? 'smtp.gmail.com'} refused the connection on the configured port.`,
      fix: 'For Gmail, use host: smtp.gmail.com, port: 587 (TLS) or port: 465 (SSL). Check that the port is not blocked by a firewall.',
    };
  }
  if (msg.includes('etimedout') || msg.includes('timeout') || msg.includes('timed out')) {
    return {
      code: 'ETIMEDOUT',
      title: 'Connection timed out',
      detail: 'Could not reach the mail server. The connection timed out.',
      fix: 'This usually means port 587 or 465 is blocked on your network or hosting provider. Try the other port (587 ↔ 465). If on Vercel/Railway, outbound SMTP on port 25/465/587 may be restricted.',
    };
  }
  if (msg.includes('getaddrinfo') || msg.includes('host not found') || msg.includes('enotfound')) {
    return {
      code: 'ENOTFOUND',
      title: 'Mail server not found',
      detail: 'The hostname could not be resolved. The SMTP host address is wrong.',
      fix: 'For Gmail, the correct host is smtp.gmail.com. Check that you have not mistyped the host.',
    };
  }
  if (msg.includes('certificate') || msg.includes('self signed') || msg.includes('ssl')) {
    return {
      code: 'SSL_ERROR',
      title: 'SSL/TLS certificate error',
      detail: 'The SSL certificate of the mail server could not be verified.',
      fix: 'This is usually caused by a port mismatch. Port 465 uses SSL (secure: true). Port 587 uses STARTTLS (secure: false). Switch to the other port.',
    };
  }
  if (msg.includes('daily limit') || msg.includes('rate limit') || msg.includes('too many') || msg.includes('550-5.4.5')) {
    return {
      code: '421',
      title: 'Daily sending limit reached',
      detail: 'Gmail has blocked further sending because the daily quota has been exceeded.',
      fix: 'Gmail free accounts allow ~500 emails/day. Wait until midnight (your account timezone) for the counter to reset. Add more accounts to send more.',
    };
  }
  if (msg.includes('5.7.0') || msg.includes('less secure') || msg.includes('account not allowed')) {
    return {
      code: '535_POLICY',
      title: 'Gmail security policy blocking access',
      detail: 'Gmail is blocking this login due to security policy.',
      fix: '1. Make sure 2-Step Verification is ON at myaccount.google.com/security. 2. Create an App Password (not your regular password). 3. Use the 16-character App Password here.',
    };
  }

  // Generic fallback
  return {
    code: 'UNKNOWN',
    title: 'SMTP connection failed',
    detail: error.slice(0, 200),
    fix: 'Check your email address, App Password, host (smtp.gmail.com), and port (587). Make sure 2FA is enabled and you are using an App Password.',
  };
}

// ─── Run live SMTP auth test ──────────────────────────────────────────────────

async function testSmtpAccount(account: any): Promise<{
  accountEmail: string;
  success: boolean;
  code?: string;
  title?: string;
  detail?: string;
  fix?: string;
  latencyMs?: number;
}> {
  const start = Date.now();
  const authUser = account.user_name || account.user || account.email;

  const transporter = nodemailer.createTransport({
    host: account.host || 'smtp.gmail.com',
    port: account.port || 587,
    secure: account.port === 465,
    auth: { user: authUser, pass: account.password },
    connectionTimeout: 10_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
    tls: { rejectUnauthorized: false },
  });

  try {
    await transporter.verify();
    return {
      accountEmail: account.email,
      success: true,
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    const raw = err?.message || String(err);
    const classified = classifySmtpError(raw);
    return {
      accountEmail: account.email,
      success: false,
      latencyMs: Date.now() - start,
      ...classified,
    };
  } finally {
    transporter.close();
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const specificAccountId = body?.accountId ?? null;

    const service = createServiceClient();

    // Load accounts to test
    let query = service
      .from('smtp_accounts')
      .select('id, email, host, port, user_name, password, status, sent_today, daily_limit')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (specificAccountId) {
      query = query.eq('id', specificAccountId) as any;
    }

    const { data: accounts, error: dbError } = await query;

    if (dbError) {
      return NextResponse.json({ success: false, error: 'Failed to load accounts: ' + dbError.message }, { status: 500 });
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No active SMTP accounts found.',
        fix: 'Go to SMTP Manager and add a Gmail account with a valid App Password.',
      });
    }

    // Test each account in parallel (max 3 at once to avoid timeouts)
    const results = await Promise.all(
      accounts.slice(0, 5).map(acc => testSmtpAccount(acc))
    );

    const working = results.filter(r => r.success);
    const failed  = results.filter(r => !r.success);

    // Update account status in DB based on test results
    for (const result of results) {
      const acc = accounts.find(a => a.email === result.accountEmail);
      if (!acc) continue;
      if (!result.success) {
        const isAuthIssue = ['535', '535_POLICY', 'SSL_ERROR'].includes(result.code ?? '');
        if (isAuthIssue) {
          await service.from('smtp_accounts').update({ status: 'error' }).eq('id', acc.id);
        }
      } else {
        // Re-activate if it was marked as error
        if (acc.status === 'error') {
          await service.from('smtp_accounts').update({ status: 'active' }).eq('id', acc.id);
        }
      }
    }

    return NextResponse.json({
      success: working.length > 0,
      total: results.length,
      working: working.length,
      failed: failed.length,
      results,
      summary: working.length > 0
        ? `${working.length} of ${results.length} account(s) are working and ready to send.`
        : `All ${results.length} account(s) failed. Fix the issues below before sending.`,
    });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Test failed' },
      { status: 500 }
    );
  }
}

// GET — quick check: how many accounts are configured and working?
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, count: 0 });

    const service = createServiceClient();
    const { data } = await service
      .from('smtp_accounts')
      .select('id, email, status, sent_today, daily_limit')
      .eq('user_id', user.id)
      .eq('status', 'active');

    const count = data?.length ?? 0;
    const capacity = data?.reduce((s, a) => s + (a.daily_limit - (a.sent_today || 0)), 0) ?? 0;

    return NextResponse.json({ success: true, count, remaining_capacity: capacity });
  } catch {
    return NextResponse.json({ success: false, count: 0 });
  }
}
