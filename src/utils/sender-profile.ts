/**
 * SENDER PROFILE — shared utility
 * ─────────────────────────────────
 * Single source of truth for loading a user's sender profile and
 * rendering the professional email footer.
 *
 * Footer format (Q4):
 *   Best regards,
 *
 *   Alice UMUBYEYI
 *   Executive Sales
 *   Pryro
 *   0790038006
 *
 * Greeting format (Q5):
 *   Hi [FirstName],          ← prospect's first name extracted from company contact
 *   Hi there,                ← fallback when no first name is available
 */

export interface SenderProfile {
  id?: string;
  user_id: string;
  full_name: string;
  job_title: string;
  company_name: string;
  phone: string;
  email?: string | null;
  website?: string | null;
  linkedin_url?: string | null;
  is_complete?: boolean;
}

/** Empty/placeholder profile — used before the DB row loads */
export const EMPTY_PROFILE: Omit<SenderProfile, 'user_id'> = {
  full_name:    '',
  job_title:    '',
  company_name: '',
  phone:        '',
  email:        null,
  website:      null,
  linkedin_url: null,
  is_complete:  false,
};

// ─── Footer renderer (Q4) ────────────────────────────────────────────────────

/**
 * Builds the professional plain-text footer that appears at the bottom of
 * every generated email.
 *
 * Output:
 *   Best regards,
 *
 *   Alice UMUBYEYI
 *   Executive Sales
 *   Pryro
 *   0790038006
 */
export function renderFooter(profile: SenderProfile): string {
  const lines: string[] = ['Best regards,', ''];
  lines.push(profile.full_name || 'Your Name');
  if (profile.job_title)    lines.push(profile.job_title);
  if (profile.company_name) lines.push(profile.company_name);
  if (profile.phone)        lines.push(profile.phone);
  if (profile.email)        lines.push(profile.email);
  return lines.join('\n');
}

/**
 * Builds the casual sign-off used in AI system prompts.
 * Shorter than the full footer — just name + company + phone.
 *
 * Output:  "Alice from Pryro\n0790038006"
 */
export function renderSignOff(profile: SenderProfile): string {
  const firstName = (profile.full_name || 'Your Name').split(' ')[0]!;
  const company   = profile.company_name || 'Pryro';
  const phone     = profile.phone;
  return phone
    ? `${firstName} from ${company}\n${phone}`
    : `${firstName} from ${company}`;
}

// ─── Greeting builder (Q5) ───────────────────────────────────────────────────

/**
 * Extracts a first name from a contact person name field, or falls back
 * to "Hi there," when no name is available.
 *
 * Rules:
 *  - Use prospect's first name when it exists: "Hi John,"
 *  - Never use "Dear Sir/Madam" or "To Whom It May Concern"
 *  - Fallback: "Hi there," — neutral and human
 */
export function buildGreeting(contactName?: string | null): string {
  if (!contactName) return 'Hi there,';
  const first = contactName.trim().split(/[\s,]+/)[0]?.trim();
  if (!first || first.length < 2) return 'Hi there,';
  // Capitalize first letter only
  const name = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return `Hi ${name},`;
}

// ─── Profile completeness check (Q7) ─────────────────────────────────────────

export interface ProfileGap {
  field: keyof SenderProfile;
  label: string;
}

export function getMissingFields(profile: Partial<SenderProfile>): ProfileGap[] {
  const required: Array<{ field: keyof SenderProfile; label: string }> = [
    { field: 'full_name',    label: 'Full name'    },
    { field: 'job_title',    label: 'Job title'    },
    { field: 'company_name', label: 'Company name' },
    { field: 'phone',        label: 'Phone number' },
  ];
  return required.filter(r => !profile[r.field] || String(profile[r.field]).trim() === '');
}

export function isProfileComplete(profile: Partial<SenderProfile>): boolean {
  return getMissingFields(profile).length === 0;
}

// ─── Supabase helpers (client-side) ─────────────────────────────────────────

import { createClient } from '../../supabase/client';

export async function loadSenderProfile(userId: string): Promise<SenderProfile | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('sender_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  } catch {
    return null;
  }
}

export async function saveSenderProfile(
  userId: string,
  profile: Omit<SenderProfile, 'user_id' | 'id' | 'is_complete'>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from('sender_profiles')
      .upsert({ user_id: userId, ...profile }, { onConflict: 'user_id' });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Failed to save profile' };
  }
}
