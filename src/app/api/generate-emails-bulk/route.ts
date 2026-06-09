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
import { researchProspectSync, isGenericEmailAddress, extractFirstName } from '@/utils/prospect-researcher';
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

      // Build the professional footer exactly as renderFooter() does:
      //   Best regards,
      //
      //   Alice UMUBYEYI
      //   Executive Sales
      //   Pryro
      //   0790038006
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

  // Build minimal footer if profile load failed
  if (!profileSignOff) {
    const firstName = senderName.split(' ')[0] || senderName;
    profileSignOff = senderPhone
      ? `Best regards,\n\n${senderName}\nPryro\n${senderPhone}`
      : `Best regards,\n\n${senderName}\nPryro`;
  }

  // ── AI provider ──────────────────────────────────────────────────────────
  let aiProvider: { provider: string; api_key: string; active_model: string } | null = null;
  try {
    const { data } = await serviceSupabase
      .from('ai_settings')
      .select('provider, api_key, active_model')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('is_connected', true)
      .limit(1);
    if (data?.length) {
      const p = data[0];
      if (p.api_key && p.provider && p.active_model) {
        aiProvider = { provider: p.provider, api_key: p.api_key, active_model: p.active_model };
      }
    }
  } catch { /* no AI */ }

  // ── SSE stream ────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: object) => {
        try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { /* client gone */ }
      };

      send('start', { total: leads.length, aiEnabled: !!aiProvider, provider: aiProvider ? `${aiProvider.provider}/${aiProvider.active_model}` : 'template' });

      let aiCount = 0, fallbackCount = 0, done = 0;

      for (let idx = 0; idx < leads.length; idx++) {
        const lead = leads[idx]!;

        if (isJunk(lead.company_name)) {
          done++;
          send('skipped', { company_name: lead.company_name, done, total: leads.length });
          continue;
        }

        const name = cleanName(lead.company_name);

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
          signals.greeting = resolvedContactName
            ? `Hi ${resolvedContactName},`
            : (lead.email && !genericEmail
                ? (() => {
                    const { extractFirstName } = require('@/utils/prospect-researcher');
                    const { name } = extractFirstName(null, lead.email);
                    return name ? `Hi ${name},` : 'Hi there,';
                  })()
                : 'Hi there,');

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
          console.error(`[bulk-gen] Failed for "${name}":`, err?.message);
          fallbackCount++;
          done++;

          // Emergency fallback — name from contact field or email prefix, no commission
          const city     = (lead.location || 'your city').split(',')[0]?.trim() || 'your city';
          const { name: fbName } = extractFirstName(lead.contact_name, lead.email);
          const fbGreeting = fbName ? `Hi ${fbName},` : 'Hi there,';
          const genericEmail = isGenericEmailAddress(lead.email);

          send('email', {
            email: {
              lead_id:            lead.id,
              lead_email:         lead.email,
              company_name:       name,
              subject:            `${name} — still running ops manually?`,
              body:               `${fbGreeting}\n\n${name} in ${city} — at this scale, managing operations across separate tools usually starts costing more time than the team can afford.\n\nPryro is an ERP that consolidates finance, inventory, HR, and CRM into one system.\n\nWould a 10-minute call be worth it to see if it fits how you run ${name}?\n\n${profileSignOff}`,
              model:              'template',
              isFallback:         true,
              isGenericEmail:     genericEmail,
              greetingIsFallback: !fbName,
              personalizationScore: genericEmail ? 30 : 40,
              qualityScore:       genericEmail ? 55 : 65,
              dataSource:         'template',
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
