/**
 * BULK EMAIL GENERATION — v2 (SSE Streaming)
 * ────────────────────────────────────────────
 * Uses the v2 personalization pipeline for every lead:
 *   - Loads active AI provider from ai_settings
 *   - Builds prospect signals (sync, no web calls for speed)
 *   - Generates AI email with strict quality gate
 *   - Falls back to industry-specific template that passes the gate natively
 *   - Streams each email as it's ready
 */

import { NextRequest }         from 'next/server';
import { createClient }        from '../../../../supabase/server';
import { createServiceClient } from '../../../../supabase/service';
import { researchProspectSync, isGenericEmailAddress, extractFirstName, cleanCompanyName, isUsableFirstName, buildGuaranteedEmail } from '@/utils/prospect-researcher';
import { buildPersonalizedEmail } from '@/utils/personalized-email-builder';

export const runtime    = 'nodejs';
export const maxDuration = 300;

interface LeadInput {
  id: string;
  company_name: string;
  niche: string | null;
  location: string | null;
  company_context: string | null;
  email: string | null;
  contact_name?: string | null;   // prospect's first name for greeting
  website?: string | null;
  source_url?: string | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x27;/gi, "'").replace(/&#39;/gi, "'").replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function cleanName(name: string): string {
  return decodeEntities(name.replace(/\s*[-|–·]\s*.+$/, '').replace(/\s*,\s*.+$/, '').replace(/\s+/g, ' ').trim());
}

function isJunk(name: string): boolean {
  const l = name.toLowerCase().trim();
  return /^(list of|top \d+|best \d+|\d+ best|businesses in .+\|)/.test(l)
    || /wikipedia$/.test(l) || /\.com$/.test(l) || /^https?:\/\//.test(l) || l.length > 80;
}

// ─── Fake / test contact detector ────────────────────────────────────────────
// ─── Fake / test contact detector ────────────────────────────────────────────
// Returns a rejection reason string if the lead should be skipped, else null.

const FAKE_COMPANY_NAMES = new Set([
  'default', 'test', 'n/a', 'na', 'untitled', 'unknown', 'sample', 'demo',
  'example', 'company', 'business', 'placeholder', 'your company', 'none',
  'null', 'undefined',
]);

const FAKE_EMAIL_PREFIXES = new Set([
  'test', 'testing', 'fake', 'dummy', 'sample', 'demo', 'noreply', 'no-reply',
  'mci', 'ims', 'admin123', 'user', 'user1', 'webmaster',
]);

const FAKE_EMAIL_DOMAINS = ['test.com', 'example.com', 'localhost', 'test.org',
  'xyz.com', 'fake.com', 'mailtest.com', 'test.net'];

function detectFakeContact(lead: {
  company_name: string;
  email: string | null;
}): string | null {
  const cn = lead.company_name?.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '') ?? '';

  if (!cn || cn.length < 2) return 'Company name is blank or too short';
  if (FAKE_COMPANY_NAMES.has(cn)) return `"${lead.company_name}" is not a real company name`;

  if (lead.email) {
    const lower = lead.email.toLowerCase();
    const [prefix = '', domain = ''] = lower.split('@');
    if (FAKE_EMAIL_DOMAINS.some(d => domain === d || domain.endsWith('.' + d)))
      return `Email domain "${domain}" is a test domain`;
    if (FAKE_EMAIL_PREFIXES.has(prefix))
      return `Email prefix "${prefix}" is a test or system address`;
    if (/\btest\b/.test(prefix))
      return `Email prefix "${prefix}" contains "test"`;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const {
    leads,
    tone,
    customPainPoint,
    senderName: bodySenderName,
    senderPhone: bodySenderPhone,
  } = (await request.json()) as {
    leads: LeadInput[];
    yourCompany?: string;
    yourService?: string;
    tone?: string;
    customPainPoint?: string;
    senderName?: string;
    senderTitle?: string;
    senderPhone?: string;
    useResearch?: boolean;
  };

  if (!leads?.length) {
    return new Response(JSON.stringify({ error: 'No leads provided' }), { status: 400 });
  }

  const serviceSupabase = createServiceClient();

  // ── Sender profile — load full profile from DB ───────────────────────────
  let senderName  = bodySenderName || '';
  let senderPhone = bodySenderPhone || '';
  let profileSignOff = '';   // full footer built from DB profile

  try {
    const { data } = await serviceSupabase
      .from('sender_profiles')
      .select('full_name, job_title, company_name, phone, email')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data?.full_name) {
      senderName  = data.full_name;
      senderPhone = data.phone || bodySenderPhone || '';
      // Multi-line professional footer
      const footerLines = ['Best regards,', ''];
      footerLines.push(data.full_name);
      if (data.job_title)    footerLines.push(data.job_title);
      if (data.company_name) footerLines.push(data.company_name);
      if (data.phone)        footerLines.push(data.phone);
      if (data.email)        footerLines.push(data.email);
      profileSignOff = footerLines.join('\n');
    }
  } catch { /* fall through */ }

  // Fall back to SMTP account name if profile not found
  if (!senderName) {
    try {
      const { data } = await serviceSupabase
        .from('smtp_accounts')
        .select('email, sender_name')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('sent_today', { ascending: true })
        .limit(1)
        .single();
      if (data) {
        senderName = data.sender_name ||
          data.email.split('@')[0].replace(/[._\-]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
    } catch { /* use default */ }
  }
  if (!senderName) senderName = 'Sales Team';

  // Build multi-line footer if profile load failed
  if (!profileSignOff) {
    profileSignOff = senderPhone
      ? `Best regards,\n\n${senderName}\nPryro\n${senderPhone}`
      : `Best regards,\n\n${senderName}\nPryro`;
  }

  // ── AI provider — load from ai_settings ─────────────────────────────────
  // Do NOT filter by is_connected — that field is set by a mock test many users skip.
  // A saved, active key is sufficient to attempt AI generation.
  let aiProvider: { provider: string; api_key: string; active_model: string } | null = null;
  let aiDiagnosticMsg = 'no_provider';
  try {
    const { data } = await serviceSupabase
      .from('ai_settings')
      .select('provider, api_key, active_model, is_connected')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1);
    if (data?.length) {
      const p = data[0];
      if (p.api_key && p.provider && p.active_model) {
        aiProvider = { provider: p.provider, api_key: p.api_key, active_model: p.active_model };
        aiDiagnosticMsg = `${p.provider}/${p.active_model}`;
        console.log(`[bulk-gen] ✅ AI provider loaded: ${aiDiagnosticMsg}`);
      } else {
        aiDiagnosticMsg = 'ai_settings row found but missing key/provider/model';
        console.warn(`[bulk-gen] ⚠️ ${aiDiagnosticMsg}`);
      }
    } else {
      aiDiagnosticMsg = 'no active AI provider configured — go to AI Settings to add one';
      console.warn(`[bulk-gen] ⚠️ ${aiDiagnosticMsg}`);
    }
  } catch { /* no AI */ }

  // ── Pre-send SMTP health check ───────────────────────────────────────────
  // Run a quick live auth test before touching any leads.
  // If all accounts are broken, stream an error immediately.
  let smtpHealthy = false;
  try {
    const healthRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/smtp-test`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forward the auth cookie so the test route can identify the user
          Cookie: request.headers.get('cookie') ?? '',
        },
        body: JSON.stringify({}),
      }
    );
    const health = await healthRes.json();
    smtpHealthy = health.success && health.working > 0;

    if (!smtpHealthy) {
      // Stream an actionable error back instead of silently failing 78 emails
      const enc = new TextEncoder();
      const errStream = new ReadableStream({
        start(c) {
          const firstResult = health.results?.[0];
          c.enqueue(enc.encode(`event: smtp_error\ndata: ${JSON.stringify({
            error: firstResult?.title ?? 'SMTP connection failed',
            detail: firstResult?.detail ?? health.error ?? 'Could not connect to your Gmail account.',
            fix: firstResult?.fix ?? 'Check your App Password and port settings in SMTP Manager.',
            code: firstResult?.code ?? 'UNKNOWN',
          })}\n\n`));
          c.close();
        },
      });
      return new Response(errStream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      });
    }
  } catch {
    // Health check itself failed — proceed anyway, let the actual sends report errors
    smtpHealthy = true;
  }

  // ── SSE stream ────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: object) => {
        try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { /* client gone */ }
      };

      send('start', {
        total: leads.length,
        aiEnabled: !!aiProvider,
        provider: aiProvider ? aiDiagnosticMsg : null,
        aiDiagnostic: aiProvider ? null : aiDiagnosticMsg,
      });

      let aiCount = 0, fallbackCount = 0, done = 0;

      for (let idx = 0; idx < leads.length; idx++) {
        const lead = leads[idx]!;

        // Clean and validate company name before anything else
        const nameResult = cleanCompanyName(lead.company_name);
        if (!nameResult.valid) {
          done++;
          send('skipped', {
            company_name: lead.company_name,
            reason: nameResult.reason || 'Invalid company name',
            done,
            total: leads.length,
          });
          continue;
        }

        const name = nameResult.cleaned;

        // ── Fake/test contact gate ───────────────────────────────────────────
        const fakeReason = detectFakeContact({ company_name: name, email: lead.email });
        if (fakeReason) {
          done++;
          send('skipped', {
            company_name: lead.company_name,
            reason: fakeReason,
            done,
            total: leads.length,
          });
          continue;
        }

        try {
          // Resolve contact name from contact_name field or email prefix
          const { name: resolvedContactName } = extractFirstName(lead.contact_name, lead.email);
          const genericEmail = isGenericEmailAddress(lead.email);

          // Build prospect signals (sync — no web calls in bulk for speed)
          const signals = researchProspectSync({
            companyName:    name,
            niche:          lead.niche,
            location:       lead.location,
            companyContext: lead.company_context,
            contactName:    resolvedContactName,
            senderName,
            senderPhone,
            emailIndex:     idx,
          });

          // Stamp correct values from lead data
          signals.signOff        = profileSignOff;
          signals.isGenericEmail = genericEmail;

          // Re-build greeting with the actual lead email so prefix extraction works
          if (resolvedContactName && isUsableFirstName(resolvedContactName)) {
            signals.greeting = `Hi ${resolvedContactName},`;
          } else if (lead.email && !genericEmail) {
            const { name: emailName } = extractFirstName(null, lead.email);
            signals.greeting = (emailName && isUsableFirstName(emailName)) ? `Hi ${emailName},` : 'Dear Sir/Madam,';
          } else {
            signals.greeting = 'Dear Sir/Madam,';
          }

          console.log(`[bulk-gen] Generating for "${name}" | ai=${!!aiProvider} | greeting="${signals.greeting}" | niche=${lead.niche}`);

          // Small delay between AI calls to avoid Groq/OpenAI rate limits on free tier
          // Skip delay for first email and when no AI provider is configured
          if (aiProvider && idx > 0) {
            await new Promise(r => setTimeout(r, 600)); // 600ms = ~100 req/min max
          }

          const result = await buildPersonalizedEmail(
            { companyName: name, niche: lead.niche, location: lead.location, companyContext: lead.company_context, website: lead.website, signals, senderName, senderPhone, customPainPoint, emailIndex: idx },
            aiProvider,
          );

          if (result.model !== 'template') aiCount++; else fallbackCount++;
          done++;

          send('email', {
            email: {
              lead_id:            lead.id,
              lead_email:         lead.email,
              company_name:       name,
              subject:            result.subject,
              body:               result.body,
              model:              result.model,
              isFallback:         result.model === 'template',
              qualityFlagged:     result.qualityFlagged ?? false,
              isGenericEmail:     genericEmail,
              greetingIsFallback: !resolvedContactName,
              personalizationScore: result.personalizationScore,
              qualityScore:       result.qualityScore,
              dataSource:         result.dataSource,
            },
            done,
            total: leads.length,
          });

        } catch (err: any) {
          console.error(`[bulk-gen] ❌ Failed for "${name}":`, err?.message);
          fallbackCount++;
          done++;

          // Emergency fallback — always use the guaranteed 4-line structure
          const { name: fbName } = extractFirstName(lead.contact_name, lead.email);
          const fbIsUsable = fbName && isUsableFirstName(fbName);
          const genericEmail = isGenericEmailAddress(lead.email);

          const guaranteed = buildGuaranteedEmail({
            firstName:       fbIsUsable ? fbName! : 'Sir/Madam',
            companyName:     name,
            niche:           lead.niche,
            emailIndex:      idx,
            signOff:         profileSignOff,
            useTeamGreeting: false,
          });

          send('email', {
            email: {
              lead_id:            lead.id,
              lead_email:         lead.email,
              company_name:       name,
              subject:            guaranteed.subject,
              body:               guaranteed.body,
              model:              'template',
              isFallback:         true,
              qualityFlagged:     false,
              isGenericEmail:     genericEmail,
              greetingIsFallback: !fbIsUsable,
              personalizationScore: genericEmail ? 30 : 45,
              qualityScore:       genericEmail ? 55 : 68,
              dataSource:         'template',
              fallbackReason:     err?.message?.slice(0, 120) ?? 'generation error',
            },
            done,
            total: leads.length,
          });
        }
      }

      send('done', { total: leads.length, ai: aiCount, fallback: fallbackCount, aiEnabled: !!aiProvider });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
