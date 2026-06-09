/**
 * AI EMAIL GENERATOR — v3
 * ────────────────────────
 * Wires together:
 *   1. Sender profile loaded from sender_profiles table (single source of truth)
 *   2. Prospect research
 *   3. AI generation with quality gate
 *
 * Sender profile is authoritative — no more scattered senderName/senderTitle/senderPhone fields.
 */

import { createClient }                          from '../../supabase/client';
import { researchProspect, researchProspectSync } from './prospect-researcher';
import { buildPersonalizedEmail }                 from './personalized-email-builder';

export interface EmailGenerationParams {
  lead: {
    company_name: string;
    niche: string | null;
    location: string | null;
    company_context: string | null;
    website?: string | null;
    contact_name?: string | null;   // prospect's first name for greeting
  };
  yourCompany: string;
  yourService: string;
  tone: 'Direct' | 'Aggressive' | 'Surgical';
  customPainPoint?: string;
  userId: string;
  // Legacy fields — still accepted but profile takes precedence
  senderName?: string;
  senderEmail?: string;
  senderTitle?: string;
  senderPhone?: string;
  emailIndex?: number;
  skipResearch?: boolean;
}

/** Load sender profile from DB, fall back to legacy param fields, then SMTP name. */
async function resolveSenderProfile(
  userId: string,
  legacyName?: string,
  legacyPhone?: string,
): Promise<{ senderName: string; senderPhone: string; signOff: string; profileComplete: boolean }> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from('sender_profiles')
      .select('full_name, job_title, company_name, phone, email, is_complete')
      .eq('user_id', userId)
      .maybeSingle();

    if (data && data.full_name) {
      const complete   = !!data.is_complete;
      const firstName  = (data.full_name || '').split(' ')[0] || data.full_name;
      const phone      = data.phone || '';

      // Full professional footer (Q4):
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
      if (phone)             footerLines.push(phone);
      if (data.email)        footerLines.push(data.email);
      const signOff = footerLines.join('\n');

      return { senderName: data.full_name, senderPhone: phone, signOff, profileComplete: complete };
    }
  } catch { /* fall through */ }

  // Legacy param fallback
  if (legacyName) {
    const firstName = legacyName.split(' ')[0] || legacyName;
    const phone     = legacyPhone || '';
    const signOff   = phone
      ? `Best regards,\n\n${legacyName}\nPryro\n${phone}`
      : `Best regards,\n\n${legacyName}\nPryro`;
    return { senderName: legacyName, senderPhone: phone, signOff, profileComplete: false };
  }

  // SMTP account name last resort
  try {
    const supabase = createClient();
    const { data: rows } = await supabase
      .from('smtp_accounts')
      .select('email, sender_name')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('sent_today', { ascending: true })
      .limit(1);
    if (rows?.length) {
      const row = rows[0];
      const name = row.sender_name ||
        row.email.split('@')[0].replace(/[._\-]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      return { senderName: name, senderPhone: '', signOff: `Best regards,\n\n${name}\nPryro`, profileComplete: false };
    }
  } catch { /* ignore */ }

  return { senderName: 'Sales Team', senderPhone: '', signOff: 'Best regards,\n\nSales Team\nPryro', profileComplete: false };
}

export async function generateAIEmail(params: EmailGenerationParams): Promise<{
  subject: string;
  body: string;
  model?: string;
  personalizationScore?: number;
  qualityScore?: number;
  qualityPassed?: boolean;
  dataSource?: string;
  profileIncomplete?: boolean;
}> {
  const { lead, userId, emailIndex = 0 } = params;

  // ── 1. Sender profile ────────────────────────────────────────────────────
  const { senderName, senderPhone, signOff, profileComplete } = await resolveSenderProfile(
    userId, params.senderName, params.senderPhone,
  );

  // ── 2. AI provider ────────────────────────────────────────────────────────
  let aiProvider: { provider: string; api_key: string; active_model: string } | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from('ai_settings')
      .select('provider, api_key, active_model')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_connected', true)
      .limit(1);
    if (data?.length) {
      const p = data[0];
      if (p.api_key && p.provider && p.active_model)
        aiProvider = { provider: p.provider, api_key: p.api_key, active_model: p.active_model };
    }
  } catch { /* no AI */ }

  // ── 3. Research prospect ─────────────────────────────────────────────────
  const researchParams = {
    companyName:    lead.company_name,
    niche:          lead.niche,
    location:       lead.location,
    companyContext: lead.company_context,
    contactName:    lead.contact_name ?? null,
    senderName,
    senderPhone,
    emailIndex,
  };

  const signals = params.skipResearch
    ? researchProspectSync(researchParams)
    : await researchProspect({ ...researchParams, website: lead.website ?? null }).catch(
        () => researchProspectSync(researchParams),
      );

  // Override the sign-off in signals with the one built from the DB profile
  signals.signOff = signOff;

  // ── 4. Generate ──────────────────────────────────────────────────────────
  const result = await buildPersonalizedEmail(
    {
      companyName:    lead.company_name,
      niche:          lead.niche,
      location:       lead.location,
      companyContext: lead.company_context,
      website:        lead.website,
      signals,
      senderName,
      senderPhone,
      customPainPoint: params.customPainPoint,
      emailIndex,
    },
    aiProvider,
  );

  return {
    subject:              result.subject,
    body:                 result.body,
    model:                result.model,
    personalizationScore: result.personalizationScore,
    qualityScore:         result.qualityScore,
    qualityPassed:        result.qualityPassed,
    dataSource:           result.dataSource,
    profileIncomplete:    !profileComplete,
  };
}

export default generateAIEmail;
