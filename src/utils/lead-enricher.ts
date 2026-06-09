/**
 * LEAD ENRICHER
 * ─────────────
 * Answers Q3, Q4, Q5, Q10, Q11:
 *
 *  Q3  Extract rich per-business fields: name, website, email, phone, address,
 *      employees, services, social links, founding year
 *  Q4  Classify sector from website content + Google category + company name
 *  Q5  Flag ambiguous sectors and require user confirmation before generation
 * Q10  Clean HTML entities, filter noise, produce natural-language business summary
 * Q11  Compute data quality score — generation only allowed at 60+
 */

import { sanitizeNicheForCompany, detectNicheKey } from './prospect-researcher';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RichLead {
  company_name:      string;
  website:           string | null;
  email:             string | null;
  phone:             string | null;
  address:           string | null;
  city:              string | null;
  country:           string | null;
  employees:         string | null;    // e.g. "10–50"
  founding_year:     string | null;
  services:          string[];         // up to 5 services mentioned on website
  social_links:      Record<string, string>;  // { linkedin, facebook, twitter, instagram }
  google_category:   string | null;    // from Maps / Places
  niche:             string | null;    // user-supplied niche (search query)
  detected_sector:   string;           // our classification key (e.g. "healthcare")
  sector_confidence: 'high' | 'medium' | 'low';
  sector_ambiguous:  boolean;          // true → user must confirm before generation
  business_summary:  string;           // clean NL summary for AI context
  data_quality_score: number;          // 0–100
  email_type:        'personal' | 'role' | 'generic' | 'catch_all' | 'unknown';
  email_is_generic:  boolean;          // info@, contact@, etc.
  source_url:        string | null;
  raw_context:       string | null;    // original scraped context
}

export interface SectorClassification {
  key:        string;   // "healthcare", "hotel", "travel", etc.
  label:      string;   // "Medical Clinic"
  confidence: 'high' | 'medium' | 'low';
  ambiguous:  boolean;
  signals:    string[]; // what we found that led to this classification
}

// ─── Sector keyword map ───────────────────────────────────────────────────────
// Maps sector key → { required signals, forbidden signals, display label }

interface SectorDef {
  label: string;
  required: RegExp[];   // at least one must match
  forbidden: RegExp[];  // none can match
  ambiguousIfAlso: string[];  // ambiguous if these OTHER sectors also match
}

const SECTOR_DEFS: Record<string, SectorDef> = {
  pharmacy: {
    label: 'Pharmacy / Dispensary',
    required: [/pharma|dispensary|chemist|drug store|drug shop|medicine|prescription|compounding/i],
    forbidden: [/hospital(?! pharmacy)|clinic(?! pharmacy)/i],
    ambiguousIfAlso: ['healthcare'],
  },
  healthcare: {
    label: 'Medical Clinic / Hospital',
    required: [/clinic|hospital|medical centre|health centre|doctor|physician|surgeon|paediatr|dentist|dental|optom|ophthalmol|dermatol|physiother|radiol|laboratory|diagnostic|nursing home|maternity|ward|patient|consultation/i],
    forbidden: [/veterinary|vet clinic|animal hospital/i],
    ambiguousIfAlso: ['pharmacy'],
  },
  veterinary: {
    label: 'Veterinary Clinic',
    required: [/veterin|vet clinic|animal hospital|animal health|pet clinic|animal care/i],
    forbidden: [],
    ambiguousIfAlso: [],
  },
  hotel: {
    label: 'Hotel / Resort',
    required: [/hotel|resort|inn\b|motel|suites?(?! pharmacy)|guest house|guesthouse(?! travel)/i],
    forbidden: [/travel agency|tour operator/i],
    ambiguousIfAlso: ['lodge'],
  },
  lodge: {
    label: 'Lodge / Guesthouse',
    required: [/lodge|guesthouse|guest house|b&b|bed and breakfast|serviced apartment/i],
    forbidden: [],
    ambiguousIfAlso: ['hotel'],
  },
  travel: {
    label: 'Travel Agency / Tour Operator',
    required: [/travel agent|travel agency|tour operator|tour package|safari|ticketing|visa service|holiday package|excursion/i],
    forbidden: [],
    ambiguousIfAlso: [],
  },
  restaurant: {
    label: 'Restaurant / Food Business',
    required: [/restaurant|bistro|eatery|diner|canteen|food court|fast food|takeaway|takeout|cafe|bakery|catering/i],
    forbidden: [],
    ambiguousIfAlso: [],
  },
  retail: {
    label: 'Retail / Shop',
    required: [/supermarket|hypermarket|grocery|retail store|clothing store|fashion store|shoe store|electronics store|hardware store|furniture store|book store|pharmacy(?! clinic)/i],
    forbidden: [/hospital|clinic|travel agency/i],
    ambiguousIfAlso: [],
  },
  school: {
    label: 'School / Educational Institution',
    required: [/school|college|university|academy|institute of|polytechnic|nursery|kindergarten|vocational|training centre|learning centre/i],
    forbidden: [],
    ambiguousIfAlso: [],
  },
  logistics: {
    label: 'Logistics / Transport',
    required: [/logistics|freight|shipping|courier|transport|trucking|fleet|cargo|warehouse|supply chain|dispatch|delivery service/i],
    forbidden: [],
    ambiguousIfAlso: [],
  },
  manufacturing: {
    label: 'Manufacturing / Factory',
    required: [/manufactur|factory|production|processing plant|assembly|mill\b|textile|packaging plant/i],
    forbidden: [],
    ambiguousIfAlso: [],
  },
  ngo: {
    label: 'NGO / Non-Profit',
    required: [/ngo|non.profit|nonprofit|charity|foundation|civil society|community organisation/i],
    forbidden: [],
    ambiguousIfAlso: [],
  },
  construction: {
    label: 'Construction / Engineering',
    required: [/construction|building contractor|civil engineering|structural engineer|architecture firm|interior design/i],
    forbidden: [],
    ambiguousIfAlso: [],
  },
  finance: {
    label: 'Financial Services',
    required: [/bank\b|microfinance|savings and loan|credit union|insurance|investment firm|forex|stock broker|mortgage|fintech/i],
    forbidden: [],
    ambiguousIfAlso: [],
  },
};

// ─── HTML entity decoder & text cleaner (Q10) ────────────────────────────────

export function cleanText(raw: string): string {
  return raw
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ').replace(/&#(\d+);/gi, (_, c) => String.fromCharCode(+c))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNoiseFromContext(text: string): string {
  const cleaned = cleanText(text);
  // Remove cookie banners, privacy policies, navigation junk
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  return sentences
    .filter(s => {
      const l = s.toLowerCase();
      return (
        s.length > 20 && s.length < 300 &&
        !l.includes('cookie') && !l.includes('privacy policy') &&
        !l.includes('terms of service') && !l.includes('javascript') &&
        !l.includes('subscribe to our newsletter') && !l.includes('follow us on') &&
        !l.includes('all rights reserved') && !l.includes('powered by') &&
        !l.includes('loading...') && !l.includes('please wait')
      );
    })
    .slice(0, 6)
    .join(' ')
    .slice(0, 500);
}

// ─── Sector classification (Q4) ──────────────────────────────────────────────

export function classifySector(params: {
  companyName: string;
  niche: string | null;            // user search query
  googleCategory: string | null;   // from Maps
  websiteText: string | null;      // cleaned text from website
  companyContext: string | null;   // scraped description
}): SectorClassification {
  const { companyName, niche, googleCategory, websiteText, companyContext } = params;

  // Build a combined text corpus for matching
  const corpus = [
    companyName,
    niche || '',
    googleCategory || '',
    websiteText?.slice(0, 800) || '',
    companyContext || '',
  ].join(' ');

  // First: use the existing sanity check from prospect-researcher
  const sanitized = sanitizeNicheForCompany(companyName, niche);

  const matches: Array<{ key: string; def: SectorDef; signals: string[] }> = [];

  for (const [key, def] of Object.entries(SECTOR_DEFS)) {
    const requiredMatch = def.required.some(re => re.test(corpus));
    const forbiddenMatch = def.forbidden.some(re => re.test(corpus));
    if (requiredMatch && !forbiddenMatch) {
      const signals = def.required
        .filter(re => re.test(corpus))
        .map(re => re.source.split('|')[0]?.replace(/\\/g, '') || '');
      matches.push({ key, def, signals });
    }
  }

  // No match → use sanitized niche from prospect-researcher
  if (matches.length === 0) {
    const fallbackKey = detectNicheKey(sanitized !== 'generic' ? sanitized : niche);
    const def = SECTOR_DEFS[fallbackKey];
    return {
      key: fallbackKey,
      label: def?.label || (niche || 'Business'),
      confidence: niche ? 'low' : 'low',
      ambiguous: false,
      signals: niche ? [niche] : [],
    };
  }

  // Single clear match
  if (matches.length === 1) {
    const m = matches[0]!;
    return {
      key: m.key,
      label: m.def.label,
      confidence: 'high',
      ambiguous: false,
      signals: m.signals,
    };
  }

  // Multiple matches — check if they are expected co-matches
  const primary = matches[0]!;
  const others = matches.slice(1).map(m => m.key);
  const isExpectedAmbiguity = primary.def.ambiguousIfAlso.some(k => others.includes(k));

  return {
    key: primary.key,
    label: primary.def.label,
    confidence: isExpectedAmbiguity ? 'medium' : 'low',
    ambiguous: !isExpectedAmbiguity && matches.length > 1,
    signals: primary.signals,
  };
}

// ─── Email type classifier (Q9) ──────────────────────────────────────────────

export function classifyEmailType(email: string | null): {
  type: 'personal' | 'role' | 'generic' | 'catch_all' | 'unknown';
  isGeneric: boolean;
} {
  if (!email) return { type: 'unknown', isGeneric: false };

  const local = email.split('@')[0]?.toLowerCase() ?? '';

  // Personal: first.last@ or firstlast@ patterns
  if (/^[a-z]{2,}[._][a-z]{2,}$/.test(local)) return { type: 'personal', isGeneric: false };
  if (/^[a-z]{4,}$/.test(local) && !['info','mail','help','team','sales','admin','office','contact','hello','support','hr','pr','news','shop','store','marketing','billing','accounts','reception','general','feedback','service','media','press','booking','bookings','enquiry','enquiries','admin'].includes(local)) {
    return { type: 'personal', isGeneric: false };
  }

  // Role-based (valuable but not personal)
  const ROLE_EMAILS = ['ceo','founder','owner','director','manager','doctor','dr','principal','head','chairman'];
  if (ROLE_EMAILS.some(r => local === r || local.startsWith(r + '.') || local.startsWith(r + '_'))) {
    return { type: 'role', isGeneric: false };
  }

  // Generic catch-all prefixes
  const GENERIC = ['info','contact','hello','hi','mail','support','help','admin','office','team','sales','reception','general','webmaster','enquiry','enquiries','bookings','booking','hr','marketing','accounts','billing','feedback','service','media','press','shop','store','news','pr'];
  if (GENERIC.includes(local)) return { type: 'generic', isGeneric: true };

  return { type: 'role', isGeneric: false };
}

// ─── Service extractor (Q3) ──────────────────────────────────────────────────

function extractServices(text: string, niche: string | null): string[] {
  const clean = cleanText(text);
  const sentences = clean.split(/[.!?]/).filter(s => {
    const l = s.toLowerCase();
    return s.length > 20 && s.length < 200 && (
      l.includes('we offer') || l.includes('we provide') || l.includes('our services') ||
      l.includes('we speciali') || l.includes('our specialit') || l.includes('we help') ||
      l.includes('services include') || l.includes('offering') || l.includes('we deliver')
    );
  });
  return sentences.slice(0, 5).map(s => s.trim());
}

// ─── Social link extractor (Q3) ──────────────────────────────────────────────

function extractSocialLinks(html: string): Record<string, string> {
  const links: Record<string, string> = {};
  const patterns: Record<string, RegExp> = {
    linkedin:  /href="(https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"?#\s]+)"/i,
    facebook:  /href="(https?:\/\/(?:www\.)?facebook\.com\/[^"?#\s]+)"/i,
    twitter:   /href="(https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"?#\s]+)"/i,
    instagram: /href="(https?:\/\/(?:www\.)?instagram\.com\/[^"?#\s]+)"/i,
  };
  for (const [platform, re] of Object.entries(patterns)) {
    const m = html.match(re);
    if (m?.[1]) links[platform] = m[1];
  }
  return links;
}

// ─── Employee count extractor (Q3) ───────────────────────────────────────────

function extractEmployees(text: string): string | null {
  const m = text.match(/\b(\d+[\s,]?\d*)\s*(?:\+)?\s*(?:staff|employees|team members|professionals|people|workforce)\b/i);
  if (m) return m[1].replace(/,/g, '').trim();
  // Ranges like "50–100 employees"
  const m2 = text.match(/\b(\d+[\s–-]+\d+)\s*(?:staff|employees|people)\b/i);
  if (m2) return m2[1];
  return null;
}

// ─── Founding year extractor (Q3) ────────────────────────────────────────────

function extractFoundingYear(text: string): string | null {
  const m = text.match(/\b(?:founded|established|since|est\.?)\s*(?:in)?\s*(19[5-9]\d|20[0-2]\d)\b/i);
  return m?.[1] ?? null;
}

// ─── Data quality score (Q11) ────────────────────────────────────────────────

export function computeDataQualityScore(lead: Partial<RichLead>): number {
  let score = 0;

  // Required fields (60 points total — must have these for generation)
  if (lead.company_name && lead.company_name.length >= 3)    score += 20;
  if (lead.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) score += 20;
  if (lead.detected_sector && lead.detected_sector !== 'generic') score += 20;

  // Enrichment bonuses (40 points)
  if (lead.business_summary && lead.business_summary.length > 50) score += 15;
  if (lead.phone)                                              score += 5;
  if (lead.website)                                            score += 5;
  if (lead.address || lead.city)                               score += 5;
  if (lead.services && lead.services.length > 0)               score += 5;
  if (lead.employees)                                          score += 3;
  if (lead.founding_year)                                      score += 2;

  // Penalties
  if (lead.email_is_generic)        score -= 10;   // generic email is lower value
  if (lead.sector_ambiguous)        score -= 10;   // ambiguous sector needs confirmation
  if (lead.sector_confidence === 'low') score -= 5;

  return Math.max(0, Math.min(100, score));
}

// ─── Website enrichment (Q3) ─────────────────────────────────────────────────

export async function enrichFromWebsite(website: string, companyName: string, niche: string | null): Promise<{
  services: string[];
  social_links: Record<string, string>;
  employees: string | null;
  founding_year: string | null;
  business_summary: string;
  websiteText: string;
}> {
  const defaultResult = {
    services: [],
    social_links: {},
    employees: null,
    founding_year: null,
    business_summary: '',
    websiteText: '',
  };

  try {
    const origin = new URL(website.startsWith('http') ? website : `https://${website}`).origin;
    const pages = [origin, `${origin}/about`, `${origin}/about-us`, `${origin}/services`];
    let combinedHtml = '';

    for (const page of pages) {
      try {
        const res = await fetch(page, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) continue;
        const html = await res.text();
        combinedHtml += ' ' + html;
        if (combinedHtml.length > 20000) break;
      } catch { continue; }
    }

    if (!combinedHtml) return defaultResult;

    const cleanedText = cleanText(combinedHtml).slice(0, 5000);
    const usefulText  = stripNoiseFromContext(cleanedText);

    return {
      services:       extractServices(cleanedText, niche),
      social_links:   extractSocialLinks(combinedHtml),
      employees:      extractEmployees(cleanedText),
      founding_year:  extractFoundingYear(cleanedText),
      business_summary: usefulText,
      websiteText:    cleanedText.slice(0, 2000),
    };
  } catch {
    return defaultResult;
  }
}

// ─── Main enricher ────────────────────────────────────────────────────────────

export function buildRichLead(params: {
  company_name: string;
  email: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  niche: string | null;
  google_category?: string | null;
  company_context?: string | null;
  source_url?: string | null;
  // from enrichFromWebsite()
  services?: string[];
  social_links?: Record<string, string>;
  employees?: string | null;
  founding_year?: string | null;
  business_summary?: string;
  websiteText?: string;
}): RichLead {
  const {
    company_name, email, phone, website, address, city, country,
    niche, google_category, company_context, source_url,
    services = [], social_links = {}, employees = null, founding_year = null,
    business_summary = '', websiteText = '',
  } = params;

  // Classify sector
  const sectorClass = classifySector({
    companyName: company_name,
    niche,
    googleCategory: google_category ?? null,
    websiteText: websiteText || null,
    companyContext: company_context || null,
  });

  // Classify email
  const emailClass = classifyEmailType(email);

  // Build natural-language business summary
  const contextSources = [
    business_summary,
    company_context ? stripNoiseFromContext(company_context) : '',
    google_category ? `Google category: ${google_category}` : '',
  ].filter(s => s.length > 10);

  const finalSummary = contextSources.join(' ').slice(0, 600) || `${company_name} is a ${sectorClass.label} business${city ? ` in ${city}` : ''}.`;

  const lead: RichLead = {
    company_name:       cleanText(company_name),
    website:            website || null,
    email:              email || null,
    phone:              phone || null,
    address:            address || null,
    city:               city || null,
    country:            country || null,
    employees:          employees,
    founding_year:      founding_year,
    services,
    social_links,
    google_category:    google_category || null,
    niche:              niche || null,
    detected_sector:    sectorClass.key,
    sector_confidence:  sectorClass.confidence,
    sector_ambiguous:   sectorClass.ambiguous,
    business_summary:   finalSummary,
    data_quality_score: 0,
    email_type:         emailClass.type,
    email_is_generic:   emailClass.isGeneric,
    source_url:         source_url || null,
    raw_context:        company_context || null,
  };

  lead.data_quality_score = computeDataQualityScore(lead);
  return lead;
}

// ─── Generation readiness check (Q11) ────────────────────────────────────────

export const DATA_QUALITY_THRESHOLD = 60;  // minimum score to allow email generation

export interface ReadinessCheck {
  ready:   boolean;
  score:   number;
  blockers: string[];   // reasons generation is blocked
  warnings: string[];   // non-blocking issues to show user
}

export function checkGenerationReadiness(lead: Partial<RichLead>): ReadinessCheck {
  const score  = lead.data_quality_score ?? computeDataQualityScore(lead);
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Hard blockers
  if (!lead.company_name || lead.company_name.length < 3)
    blockers.push('Company name is missing or too short.');
  if (!lead.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email))
    blockers.push('No valid email address.');
  if (!lead.detected_sector || lead.detected_sector === 'generic')
    blockers.push('Business sector could not be identified.');
  if (lead.sector_ambiguous)
    blockers.push('Sector is ambiguous — please confirm the correct category before generating.');
  if (!lead.business_summary || lead.business_summary.length < 20)
    blockers.push('No business context found — enrich the lead first.');

  // Soft warnings
  if (lead.email_is_generic)
    warnings.push('Email is a generic address (info@, contact@). Consider finding a direct contact.');
  if (lead.sector_confidence === 'low')
    warnings.push('Sector classification confidence is low — review before sending.');
  if (!lead.phone)
    warnings.push('No phone number available.');

  return {
    ready:    blockers.length === 0 && score >= DATA_QUALITY_THRESHOLD,
    score,
    blockers,
    warnings,
  };
}
