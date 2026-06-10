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
import { researchProspect, researchProspectSync, isGenericEmailAddress, extractFirstName, cleanCompanyName, isUsableFirstName } from './prospect-researcher';
import { buildPersonalizedEmail }                 from './personalized-email-builder';

export interface EmailGenerationParams {
  lead: {
    company_name: string;
    niche: string | null;
    location: string | null;
    company_context: string | null;
    website?: string | null;
    contact_name?: string | null;
    email?: string | null;        // used for name extraction + generic email detection
  };
  yourCompany: string;
  yourService: string;
  tone: 'Direct' | 'Aggressive' | 'Surgical';
  customPainPoint?: string;
  userId: string;
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
      const complete = !!data.is_complete;
      const phone    = data.phone || '';

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
    const phone   = legacyPhone || '';
    const signOff = phone
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
  qualityFlagged?: boolean;
  dataSource?: string;
  profileIncomplete?: boolean;
  isGenericEmail?: boolean;
  greetingIsFallback?: boolean;
  fallbackReason?: string;
  needsFirstName?: boolean;        // true when no usable name — caller should ask user to fix
}> {
  const { lead, userId, emailIndex = 0 } = params;

  // ── 0. Clean and validate company name ──────────────────────────────────
  const nameResult = cleanCompanyName(lead.company_name);
  if (!nameResult.valid) {
    throw new Error(`Invalid company name: ${nameResult.reason} — "${lead.company_name}". Please correct the name before generating.`);
  }
  const cleanedCompanyName = nameResult.cleaned;

  // ── 1. Sender profile ────────────────────────────────────────────────────
  const { senderName, senderPhone, signOff, profileComplete } = await resolveSenderProfile(
    userId, params.senderName, params.senderPhone,
  );

  // ── 2. AI provider — load from ai_settings ──────────────────────────────
  let aiProvider: { provider: string; api_key: string; active_model: string } | null = null;
  let aiDiagnostic = 'no_provider';
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from('ai_settings')
      .select('provider, api_key, active_model, is_active, is_connected')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1);
    if (data?.length) {
      const p = data[0];
      if (p.api_key && p.provider && p.active_model) {
        aiProvider = { provider: p.provider, api_key: p.api_key, active_model: p.active_model };
        aiDiagnostic = `found: ${p.provider}/${p.active_model} (connected=${p.is_connected})`;
      } else {
        aiDiagnostic = `ai_settings row exists but missing api_key/provider/model`;
      }
    } else {
      aiDiagnostic = 'no active ai_settings row (set AI provider in AI Settings)';
    }
  } catch (e: any) {
    aiDiagnostic = `ai_settings query failed: ${e?.message}`;
  }

  // ── 3. Resolve contact name ───────────────────────────────────────────────
  const { name: resolvedName } = extractFirstName(lead.contact_name, lead.email);
  const effectiveContactName = resolvedName && isUsableFirstName(resolvedName) ? resolvedName : null;
  const genericEmail   = isGenericEmailAddress(lead.email);
  const nameIsFallback = !effectiveContactName;

  // ── 4. Research prospect ─────────────────────────────────────────────────
  const researchParams = {
    companyName:    cleanedCompanyName,
    niche:          lead.niche,
    location:       lead.location,
    companyContext: lead.company_context,
    contactName:    effectiveContactName,
    senderName,
    senderPhone,
    emailIndex,
  };

  const signals = params.skipResearch
    ? researchProspectSync(researchParams)
    : await researchProspect({ ...researchParams, website: lead.website ?? null }).catch(
        () => researchProspectSync(researchParams),
      );

  // Stamp the correct values derived from lead data
  signals.signOff      = signOff;
  signals.isGenericEmail = genericEmail;

  // Re-build greeting with the actual name/email from the lead
  const { buildGreeting: buildGreetingFn } = await import('./prospect-researcher');
  signals.greeting = buildGreetingFn(effectiveContactName, lead.email, cleanedCompanyName);

  // ── 5. Generate ──────────────────────────────────────────────────────────
  const result = await buildPersonalizedEmail(
    {
      companyName:    cleanedCompanyName,
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
    qualityFlagged:       result.qualityFlagged,
    dataSource:           result.dataSource,
    profileIncomplete:    !profileComplete,
    isGenericEmail:       genericEmail,
    greetingIsFallback:   nameIsFallback,
    fallbackReason:       result.model === 'template' ? (aiProvider ? `AI output scored below 85% threshold after 2 attempts` : aiDiagnostic) : undefined,
  };
}

export default generateAIEmail;
