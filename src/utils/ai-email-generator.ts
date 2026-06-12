/**
 * AI EMAIL GENERATOR — v4
 * ────────────────────────
 * Wires together:
 *   1. Sender profile loaded from sender_profiles table (all fields)
 *   2. Prospect research
 *   3. AI generation via buildPersonalizedEmail
 *
 * Footer is multi-line, generated from whatever sender profile fields exist.
 * Never a single-line signature. Never blank placeholders.
 */

import { createClient } from '../../supabase/client';
import {
  researchProspect,
  researchProspectSync,
  isGenericEmailAddress,
  extractFirstName,
  cleanCompanyName,
  isUsableFirstName,
  buildGreeting,
} from './prospect-researcher';
import { buildPersonalizedEmail } from './personalized-email-builder';

export interface EmailGenerationParams {
  lead: {
    company_name: string;
    niche: string | null;
    location: string | null;
    company_context: string | null;
    website?: string | null;
    contact_name?: string | null;
    email?: string | null;
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

interface SenderProfile {
  senderName: string;
  senderTitle: string;
  senderCompany: string;
  senderPhone: string;
  senderEmail: string;
  profileComplete: boolean;
}

/**
 * Load full sender profile from sender_profiles table.
 * Falls back to legacy param fields, then SMTP account name.
 * Returns all fields so the multi-line footer can be built from real data.
 */
async function resolveSenderProfile(
  userId: string,
  legacyName?: string,
  legacyPhone?: string,
): Promise<SenderProfile> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from('sender_profiles')
      .select('full_name, job_title, company_name, phone, email, is_complete')
      .eq('user_id', userId)
      .maybeSingle();

    if (data && data.full_name) {
      return {
        senderName:    data.full_name,
        senderTitle:   data.job_title   || '',
        senderCompany: data.company_name || 'Pryro',
        senderPhone:   data.phone        || '',
        senderEmail:   data.email        || '',
        profileComplete: !!data.is_complete,
      };
    }
  } catch { /* fall through */ }

  // Legacy param fallback
  if (legacyName) {
    return {
      senderName:    legacyName,
      senderTitle:   '',
      senderCompany: 'Pryro',
      senderPhone:   legacyPhone || '',
      senderEmail:   '',
      profileComplete: false,
    };
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
      return { senderName: name, senderTitle: '', senderCompany: 'Pryro', senderPhone: '', senderEmail: '', profileComplete: false };
    }
  } catch { /* ignore */ }

  return { senderName: 'Sales Team', senderTitle: '', senderCompany: 'Pryro', senderPhone: '', senderEmail: '', profileComplete: false };
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
}> {
  const { lead, userId, emailIndex = 0 } = params;

  // ── 0. Clean and validate company name ──────────────────────────────────
  const nameResult = cleanCompanyName(lead.company_name);
  if (!nameResult.valid) {
    throw new Error(`Invalid company name: ${nameResult.reason} — "${lead.company_name}". Please correct before generating.`);
  }
  const cleanedCompanyName = nameResult.cleaned;

  // ── 1. Sender profile ────────────────────────────────────────────────────
  const profile = await resolveSenderProfile(userId, params.senderName, params.senderPhone);

  // ── 2. AI provider ───────────────────────────────────────────────────────
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
        aiDiagnostic = `found: ${p.provider}/${p.active_model}`;
      } else {
        aiDiagnostic = 'ai_settings row exists but missing api_key/provider/model';
      }
    } else {
      aiDiagnostic = 'no active ai_settings row — go to AI Settings to add one';
    }
  } catch (e: any) {
    aiDiagnostic = `ai_settings query failed: ${e?.message}`;
  }

  // ── 3. Contact name ──────────────────────────────────────────────────────
  const { name: resolvedName } = extractFirstName(lead.contact_name, lead.email);
  const effectiveContactName = resolvedName && isUsableFirstName(resolvedName) ? resolvedName : null;
  const genericEmail = isGenericEmailAddress(lead.email);

  // ── 4. Research ──────────────────────────────────────────────────────────
  const researchParams = {
    companyName:    cleanedCompanyName,
    niche:          lead.niche,
    location:       lead.location,
    companyContext: lead.company_context,
    contactName:    effectiveContactName,
    senderName:     profile.senderName,
    senderPhone:    profile.senderPhone,
    emailIndex,
  };

  const signals = params.skipResearch
    ? researchProspectSync(researchParams)
    : await researchProspect({ ...researchParams, website: lead.website ?? null }).catch(
        () => researchProspectSync(researchParams),
      );

  signals.isGenericEmail = genericEmail;
  signals.greeting = buildGreeting(effectiveContactName, lead.email, cleanedCompanyName);

  // ── 5. Generate ──────────────────────────────────────────────────────────
  const result = await buildPersonalizedEmail(
    {
      companyName:    cleanedCompanyName,
      niche:          lead.niche,
      location:       lead.location,
      companyContext: lead.company_context,
      website:        lead.website,
      signals,
      senderName:     profile.senderName,
      senderTitle:    profile.senderTitle,
      senderCompany:  profile.senderCompany,
      senderPhone:    profile.senderPhone,
      senderEmail:    profile.senderEmail,
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
    profileIncomplete:    !profile.profileComplete,
    isGenericEmail:       genericEmail,
    greetingIsFallback:   !effectiveContactName,
    fallbackReason:       result.model === 'template'
      ? (aiProvider ? 'AI output failed quality gate after 2 attempts' : aiDiagnostic)
      : undefined,
  };
}

export default generateAIEmail;
