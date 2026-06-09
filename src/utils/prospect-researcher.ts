/**
 * PROSPECT RESEARCHER
 * ───────────────────
 * Builds a prospect intelligence profile before any email is written.
 *
 * Rules enforced here (Q1, Q2, Q7, Q10):
 *  - Opening hook must reference THIS company by name, city, or observed fact
 *  - NEVER produces "Most companies…" or "Many businesses…" openers
 *  - Subject line is a specific question about THIS company's situation
 *  - Industry profiles cover pharmacy / hotel / travel agency at depth
 */

export interface ProspectSignals {
  companyName: string;
  niche: string | null;
  location: string | null;

  // Discovered facts (drive Q1 first-line specificity)
  websiteDescription: string | null;   // scraped from their site
  recentActivity: string | null;       // news / expansion signal
  techMentions: string[];              // tools found on their site
  staffCount: string | null;           // e.g. "~30 staff"

  // Pre-resolved email building blocks
  greeting: string;            // "Hi John," or "Hi there," — never "Dear Sir/Madam"
  firstLine: string;           // must contain company name or city — never generic
  subjectLine: string;         // question or specific observation
  problemSentence: string;     // one sentence, THIS industry's dominant pain
  pryroSentence: string;       // one sentence, Pryro's direct fix (NO commission mention)
  ctaSentence: string;         // one soft question
  signOff: string;             // professional footer built from sender profile

  personalizationScore: number;   // 0–100
  dataSource: 'website' | 'news' | 'industry';
}

// ─── Industry intelligence (Q10) ────────────────────────────────────────────
// Each niche has exactly:
//   firstLineTemplates  – use company name + city (never "most X")
//   subjectTemplates    – specific question about THEIR situation
//   problemSentence     – one sentence, their daily grind
//   pryroSentence       – one sentence how Pryro fixes it
//   ctaOptions          – soft questions only

interface NicheProfile {
  sectorLabel: string;
  firstLineTemplates: Array<(company: string, city: string) => string>;
  subjectTemplates:   Array<(company: string, city: string) => string>;
  problemSentence:    string;
  pryroSentence:      string;
  ctaOptions:         string[];
}

export const NICHE_PROFILES: Record<string, NicheProfile> = {

  // ── PHARMACY ──────────────────────────────────────────────────────────────
  pharmacy: {
    sectorLabel: 'pharmacy',
    firstLineTemplates: [
      (c, l) => `I noticed ${c} is based in ${l} — pharmacies there are dealing with a specific stock-management headache right now.`,
      (c, l) => `${c} in ${l} caught my attention — drug expiry write-offs are quietly eating into pharmacy margins across the region.`,
      (c, l) => `Running a pharmacy in ${l} like ${c} means tracking stock, expiry dates, and billing in at least three different places.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — how are you catching expiry dates today?`,
      (c)    => `Quick question about ${c}'s stock system`,
      (c, l) => `Pharmacies in ${l} — one thing worth fixing`,
    ],
    problemSentence: `Most pharmacies end up managing drug stock in one place, billing in another, and staff payroll in a spreadsheet — and expired stock usually isn't caught until it's too late.`,
    pryroSentence:   `Pryro is an ERP that tracks stock with expiry alerts, handles billing, and runs payroll in one place.`,
    ctaOptions: [
      `Would a 10-minute call be worth it to see if it fits how you're running ${'{company}'}?`,
      `Is managing expiry dates and billing in separate tools something you're actively trying to fix?`,
      `Would it make sense to see how other pharmacies in the region are handling this?`,
    ],
  },

  // ── CLINIC / HEALTHCARE ───────────────────────────────────────────────────
  healthcare: {
    sectorLabel: 'clinic',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — clinics your size usually hit the same admin wall around patient billing and stock.`,
      (c, l) => `I came across ${c} in ${l} — healthcare providers there are spending a lot of admin time on reconciliation work that should be automatic.`,
      (c, l) => `Running a clinic like ${c} in ${l} means patient billing, pharmacy stock, and staff schedules rarely live in the same system.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — patient billing question`,
      (c)    => `Quick question for ${c}'s admin team`,
      (c, l) => `Clinics in ${l} — an admin fix worth 2 min`,
    ],
    problemSentence: `Patient scheduling, stock, billing, and payroll usually live in separate tools — which means your admin team spends hours each week manually reconciling data that should flow automatically.`,
    pryroSentence:   `Pryro connects patient management, pharmacy stock, billing, and HR into one system.`,
    ctaOptions: [
      `Would a 10-minute call make sense to see if it fits how ${'{company}'} currently runs?`,
      `Is this the kind of problem your admin team has been trying to solve?`,
      `Would you be open to seeing how other clinics in the region deal with this?`,
    ],
  },

  // ── HOTEL / LODGE ─────────────────────────────────────────────────────────
  hotel: {
    sectorLabel: 'hotel',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — hotels your size usually manage reservations, housekeeping, and vendor billing in completely separate places.`,
      (c, l) => `I came across ${c} in ${l} — front desk teams there are still doing manual end-of-day reconciliation between reservations and finance.`,
      (c, l) => `Running a property like ${c} in ${l} means your ops team is probably moving between at least four different tools every day.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — still reconciling reservations manually?`,
      (c)    => `Quick question for ${c}'s ops team`,
      (c, l) => `Hotels in ${l} — one daily friction worth fixing`,
    ],
    problemSentence: `Reservations, housekeeping rosters, vendor invoices, and end-of-month financials almost never live in the same system — which means your front desk and accounts team lose hours each week moving data between tools.`,
    pryroSentence:   `Pryro unifies reservations, housekeeping, vendor billing, and financials in one dashboard.`,
    ctaOptions: [
      `Would a 10-minute call make sense to see if it fits how ${'{company}'} operates today?`,
      `Is the reservations-to-finance gap something your team has flagged as a problem?`,
      `Would you be open to seeing how other hotels in ${'{city}'} have handled this?`,
    ],
  },

  lodge: {
    sectorLabel: 'lodge',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — lodges managing bookings across WhatsApp and a paper register are hitting a natural ceiling.`,
      (c, l) => `I noticed ${c} is in ${l} — guesthouses there often end up with bookings in one place and accounts in another.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — bookings and payroll in one place?`,
      (c)    => `Quick question about ${c}'s booking setup`,
    ],
    problemSentence: `Bookings from multiple channels, housekeeping schedules, vendor bills, and end-of-month payroll rarely sit in the same system — which means month-end is always a scramble.`,
    pryroSentence:   `Pryro connects bookings, staff schedules, vendor billing, and financials in one place.`,
    ctaOptions: [
      `Would a 10-minute call be worth it to see if it fits how ${'{company}'} currently runs?`,
      `Is keeping bookings and costs in sync something your team does manually right now?`,
    ],
  },

  // ── TRAVEL AGENCY ─────────────────────────────────────────────────────────
  travel: {
    sectorLabel: 'travel agency',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — travel agencies your size often don't know their actual margin per trip until the booking is already closed.`,
      (c, l) => `I came across ${c} in ${l} — tracking agent commissions and supplier costs in real time is something most agencies in the region are still doing manually.`,
      (c, l) => `Running an agency like ${c} in ${l} means your team is probably reconciling bookings, supplier payments, and commission in Excel at the end of every month.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — do you know your margin per booking?`,
      (c)    => `Quick question about ${c}'s commission tracking`,
      (c, l) => `Travel agencies in ${l} — margin tracking fix`,
    ],
    problemSentence: `Client bookings, supplier payments, agent commissions, and monthly P&L almost never live in one place — which means you often don't know your real margin until the trip is already over.`,
    pryroSentence:   `Pryro tracks bookings, supplier costs, agent commissions, and P&L in real time.`,
    ctaOptions: [
      `Would it be worth a 10-minute call to see if it solves what ${'{company}'} is dealing with?`,
      `Is tracking margins per trip in real time something you've been trying to fix?`,
      `Would you be open to seeing how other travel agencies in ${'{city}'} handle this?`,
    ],
  },

  // ── RESTAURANT ────────────────────────────────────────────────────────────
  restaurant: {
    sectorLabel: 'restaurant',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — restaurants your size usually don't have a clear picture of food cost until the end of the month.`,
      (c, l) => `I came across ${c} in ${l} — kitchen inventory, daily sales, and supplier invoices are almost always in separate places at this stage.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — what's your food cost today?`,
      (c)    => `Quick question about ${c}'s daily reporting`,
    ],
    problemSentence: `Ingredient costs, staff attendance, daily sales, and supplier invoices rarely live in the same system — which means food cost and margin are only visible at month-end, when it's too late to act.`,
    pryroSentence:   `Pryro tracks inventory, daily sales, staff payroll, and supplier billing in one place.`,
    ctaOptions: [
      `Would a 10-minute call make sense to see if it fits how ${'{company}'} currently tracks costs?`,
      `Is daily reconciliation between kitchen, suppliers, and payroll something your team does manually?`,
    ],
  },

  // ── RETAIL ────────────────────────────────────────────────────────────────
  retail: {
    sectorLabel: 'retail',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — retail businesses your size usually deal with stock going out of sync across locations without any warning.`,
      (c, l) => `I came across ${c} in ${l} — supplier reorders and inventory levels are a constant manual effort at this scale.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — is stockout still a weekly issue?`,
      (c)    => `Quick question about ${c}'s inventory`,
    ],
    problemSentence: `Inventory across locations, supplier reorders, daily sales, and payroll almost never talk to each other — which means stockouts and margin surprises are a regular part of the month.`,
    pryroSentence:   `Pryro syncs inventory, supplier orders, sales reporting, and payroll in one system.`,
    ctaOptions: [
      `Would a short call be worth it to see if it fixes the stock sync issue at ${'{company}'}?`,
      `Is keeping inventory and supplier reorders in sync something your team manages manually?`,
    ],
  },

  // ── LOGISTICS ─────────────────────────────────────────────────────────────
  logistics: {
    sectorLabel: 'logistics company',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — logistics businesses your size usually have driver payroll, trip billing, and warehouse stock in completely separate places.`,
      (c, l) => `I came across ${c} in ${l} — end-of-month billing reconciliation is still mostly manual for transport companies in the region.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — how long does month-end billing take?`,
      (c)    => `Quick question about ${c}'s ops setup`,
    ],
    problemSentence: `Driver trip logs, payroll, fuel costs, warehouse stock, and client invoicing almost never sit in the same system — which means reconciliation takes days and billing errors are easy to miss.`,
    pryroSentence:   `Pryro connects driver payroll, trip billing, fuel tracking, and warehouse inventory in one system.`,
    ctaOptions: [
      `Would a 10-minute call make sense to see if it fits how ${'{company}'} operates?`,
      `Is reconciling driver trips with billing and payroll something your team does manually right now?`,
    ],
  },

  // ── SCHOOL ────────────────────────────────────────────────────────────────
  school: {
    sectorLabel: 'school',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — schools your size usually manage fee collection, payroll, and supplies in three completely separate places.`,
      (c, l) => `I came across ${c} in ${l} — end-of-term reporting is still a week-long manual exercise for most schools in the region.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — is end-of-term still manual?`,
      (c)    => `Quick question about ${c}'s admin setup`,
    ],
    problemSentence: `Student fees, staff payroll, school supplies, and exam records almost never live in the same system — which means your bursar and admin office spend weeks at the end of each term chasing reconciliation.`,
    pryroSentence:   `Pryro handles fee collection, payroll, supplies, and term reporting in one place.`,
    ctaOptions: [
      `Would a short call make sense to see if it fits how ${'{company}'} currently runs?`,
      `Is managing fees and payroll across separate systems something your admin team deals with daily?`,
    ],
  },
};

// ─── Niche key detection ─────────────────────────────────────────────────────

export function detectNicheKey(niche: string | null): string {
  if (!niche) return 'generic';
  const n = niche.toLowerCase();
  if (/pharmacy|chemist|dispensary|drug store/.test(n))                              return 'pharmacy';
  if (/clinic|dental|hospital|medical|doctor|physician|healthcare|optom|physio|vet/.test(n)) return 'healthcare';
  if (/hotel|motel|inn|resort/.test(n))                                              return 'hotel';
  if (/lodge|guesthouse|guest house|b&b|bed and breakfast/.test(n))                 return 'lodge';
  if (/travel agent|travel agency|tour operator|tour|safari/.test(n))               return 'travel';
  if (/restaurant|catering|bakery|cafe|coffee|bistro|food|eatery/.test(n))         return 'restaurant';
  if (/retail|shop|store|supermarket|boutique|clothing|electronics|hardware/.test(n)) return 'retail';
  if (/logistics|transport|freight|courier|shipping|trucking|fleet|warehouse/.test(n)) return 'logistics';
  if (/school|college|university|academy|education|training|institute|nursery/.test(n)) return 'school';
  return 'generic';
}

export function getNicheProfile(niche: string | null): NicheProfile {
  const key = detectNicheKey(niche);
  if (NICHE_PROFILES[key]) return NICHE_PROFILES[key]!;

  // Generic fallback — still uses company name + city, never "most companies"
  const label = niche ? niche.toLowerCase().replace(/\b(services?|solutions?|ltd|inc|group)\b/gi, '').trim() : 'business';
  return {
    sectorLabel: label,
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — businesses at your stage usually hit a wall with manual back-office work.`,
      (c, l) => `I came across ${c} in ${l} — operations at this scale tend to outgrow spreadsheets fast.`,
    ],
    subjectTemplates: [
      (c)    => `Quick question about ${c}'s back-office setup`,
      (c, l) => `${c} in ${l} — worth 2 minutes on this`,
    ],
    problemSentence: `Finance, inventory, payroll, and CRM rarely live in the same system — which means your team spends time moving data between tools instead of running the business.`,
    pryroSentence:   `Pryro consolidates finance, inventory, HR, and CRM into one system.`,
    ctaOptions: [
      `Would a 10-minute call make sense to see if it fits how ${'{company}'} currently operates?`,
      `Is this something your team has been trying to solve?`,
    ],
  };
}

// ─── Greeting builder (Q1 / Q4) ─────────────────────────────────────────────
// Always "Hi [FirstName]," or "Hi there," — never "Dear Sir/Madam"

export function buildGreeting(contactName?: string | null): string {
  if (!contactName) return 'Hi there,';
  const first = contactName.trim().split(/[\s,]+/)[0]?.trim() ?? '';
  if (first.length < 2) return 'Hi there,';
  return `Hi ${first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()},`;
}

// ─── Niche sanity check (Q5) ─────────────────────────────────────────────────
// Catches mismatches like writing "your team helps many animals" for a hospital.
// Returns a corrected niche key when the company name strongly implies a different niche.

export function sanitizeNicheForCompany(companyName: string, detectedNiche: string | null): string {
  const n = companyName.toLowerCase();
  // If company name clearly signals a niche that contradicts the detected one, override
  if (/hospital|clinic|medical|dental|health|pharma|dispensary|chemist/.test(n) &&
      !/hotel|lodge|travel/.test(n)) {
    if (!detectedNiche || !/(healthcare|pharmacy|clinic|medical|hospital)/.test(detectedNiche.toLowerCase())) {
      return /pharma|dispensary|chemist/.test(n) ? 'pharmacy' : 'healthcare';
    }
  }
  if (/hotel|lodge|resort|inn|guesthouse/.test(n) &&
      !/clinic|medical|pharmacy/.test(n)) {
    if (!detectedNiche || !/(hotel|lodge|hospitality)/.test(detectedNiche.toLowerCase())) {
      return /lodge|guesthouse/.test(n) ? 'lodge' : 'hotel';
    }
  }
  if (/travel|tour|safari|agency/.test(n) &&
      !/clinic|hotel/.test(n)) {
    if (!detectedNiche || !/(travel|tour|safari)/.test(detectedNiche.toLowerCase())) {
      return 'travel';
    }
  }
  return detectedNiche ?? 'generic';
}

// ─── Website content fetcher ─────────────────────────────────────────────────

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ').trim().slice(0, 3000);
  } catch { return null; }
}

// ─── Build first line (Q1 — must be company-specific, never generic) ─────────

function pickFirstLine(
  companyName: string,
  city: string,
  profile: NicheProfile,
  websiteDesc: string | null,
  recentActivity: string | null,
  staffCount: string | null,
  idx: number,
): { line: string; score: number; source: 'website' | 'news' | 'industry' } {

  // Tier 1 — real news / expansion found via search
  if (recentActivity && recentActivity.length > 40) {
    const line = `I noticed ${companyName} ${recentActivity.slice(0, 120).replace(/[.!?]\s*$/, '').toLowerCase()} — that usually brings a specific ops challenge with it.`;
    return { line, score: 90, source: 'news' };
  }

  // Tier 2 — scraped website description
  if (websiteDesc && websiteDesc.length > 60) {
    const clean = websiteDesc.slice(0, 140).replace(/[.!?]\s*$/, '');
    const line = `I was looking at ${companyName}'s website — ${clean.toLowerCase().startsWith('we ') || clean.toLowerCase().startsWith('you ') ? clean : `you ${clean.slice(0, 120)}`}.`;
    return { line: line.slice(0, 230), score: 75, source: 'website' };
  }

  // Tier 3 — staff count signal
  if (staffCount) {
    const line = `${companyName} in ${city} has ${staffCount} — at that scale, back-office coordination usually becomes a daily friction point.`;
    return { line, score: 60, source: 'website' };
  }

  // Tier 4 — industry template (always has company name + city, never "most X")
  const tpl = profile.firstLineTemplates[idx % profile.firstLineTemplates.length]!;
  return { line: tpl(companyName, city), score: 40, source: 'industry' };
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function researchProspect(params: {
  companyName: string;
  niche: string | null;
  location: string | null;
  website?: string | null;
  companyContext?: string | null;
  contactName?: string | null;   // prospect's first name for greeting
  senderName: string;
  senderPhone?: string;
  emailIndex?: number;
}): Promise<ProspectSignals> {
  const { companyName, location, website, companyContext, contactName, senderName, senderPhone, emailIndex = 0 } = params;

  // Sanity-check niche against company name to avoid factual errors (Q5)
  const niche = sanitizeNicheForCompany(companyName, params.niche);

  const city     = (location || 'your city').split(',')[0]?.trim() || 'your city';
  const profile  = getNicheProfile(niche);

  // ── Parallel research ────────────────────────────────────────────────────
  const [websiteText, searchSignal] = await Promise.all([
    website ? fetchPageText(website).catch(() => null) : Promise.resolve(null),
    // Only call Serper if the key is set (server-side env)
    (async () => {
      const key = process.env.SERPER_API_KEY;
      if (!key) return null;
      try {
        const res = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: `"${companyName}" ${city} 2024 OR 2025 OR expansion OR opened OR launched`, num: 3 }),
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        for (const item of data.organic ?? []) {
          const snip = item.snippet ?? '';
          if (snip.length > 50 && /2024|2025|new |expan|open|launch/i.test(snip)) return snip.slice(0, 180);
        }
        return null;
      } catch { return null; }
    })(),
  ]);

  // ── Parse website ────────────────────────────────────────────────────────
  let websiteDesc: string | null = null;
  let techMentions: string[] = [];
  let staffCount: string | null = null;

  if (websiteText) {
    // Extract description sentences
    const descSentences = websiteText.split(/[.!?]/).filter(s => {
      const l = s.toLowerCase();
      return s.length > 40 && s.length < 200
        && !l.includes('cookie') && !l.includes('privacy') && !l.includes('javascript')
        && (l.includes('we ') || l.includes('our ') || l.includes(companyName.toLowerCase().slice(0, 6)));
    }).slice(0, 2).map(s => s.trim()).join('. ');
    if (descSentences.length > 40) websiteDesc = descSentences.slice(0, 300);

    // Tech mentions
    techMentions = ['excel', 'quickbooks', 'sage', 'tally', 'zoho', 'sap', 'whatsapp', 'manual']
      .filter(kw => websiteText.toLowerCase().includes(kw));

    // Staff count
    const m = websiteText.match(/\b(\d+)\s*(?:staff|employees|team members|doctors|nurses|teachers)\b/i);
    if (m) staffCount = `${m[1]} staff`;
  }

  // Also use existing company_context if website failed
  if (!websiteDesc && companyContext && companyContext.length > 50) {
    websiteDesc = companyContext.slice(0, 300);
  }

  // ── Build first line ─────────────────────────────────────────────────────
  const { line: firstLine, score: personalizationScore, source: dataSource } = pickFirstLine(
    companyName, city, profile, websiteDesc, searchSignal, staffCount, emailIndex
  );

  // ── Subject line ─────────────────────────────────────────────────────────
  const subjectFn = profile.subjectTemplates[emailIndex % profile.subjectTemplates.length]!;
  const subjectLine = subjectFn(companyName, city);

  // ── CTA — fill in placeholders ───────────────────────────────────────────
  const ctaRaw = profile.ctaOptions[Math.abs(companyName.charCodeAt(0)) % profile.ctaOptions.length]
    ?? profile.ctaOptions[0]!;
  const ctaSentence = ctaRaw.replace(/\{company\}/g, companyName).replace(/\{city\}/g, city);

  // ── Greeting (Q1 — prospect's first name or "Hi there,") ─────────────────
  const greeting = buildGreeting(contactName);

  // ── Sign-off — caller overrides this with profile footer ─────────────────
  const firstName = senderName.split(' ')[0] || senderName;
  const signOff = senderPhone
    ? `${firstName} from Pryro\n${senderPhone}`
    : `${firstName} from Pryro`;

  return {
    companyName,
    niche,
    location,
    websiteDescription: websiteDesc,
    recentActivity: searchSignal,
    techMentions,
    staffCount,
    greeting,
    firstLine,
    subjectLine,
    problemSentence: profile.problemSentence,
    pryroSentence:   profile.pryroSentence,
    ctaSentence,
    signOff,
    personalizationScore,
    dataSource,
  };
}

// ─── Lightweight version for bulk (no web calls) ────────────────────────────

export function researchProspectSync(params: {
  companyName: string;
  niche: string | null;
  location: string | null;
  companyContext?: string | null;
  contactName?: string | null;   // prospect's first name for greeting
  senderName: string;
  senderPhone?: string;
  emailIndex?: number;
}): ProspectSignals {
  const { companyName, location, companyContext, contactName, senderName, senderPhone, emailIndex = 0 } = params;

  // Sanity-check niche against company name (Q5)
  const niche   = sanitizeNicheForCompany(companyName, params.niche);
  const city    = (location || 'your city').split(',')[0]?.trim() || 'your city';
  const profile = getNicheProfile(niche);

  const websiteDesc = companyContext && companyContext.length > 50 ? companyContext.slice(0, 300) : null;

  const { line: firstLine, score: personalizationScore, source: dataSource } = pickFirstLine(
    companyName, city, profile, websiteDesc, null, null, emailIndex
  );

  const subjectFn = profile.subjectTemplates[emailIndex % profile.subjectTemplates.length]!;
  const subjectLine = subjectFn(companyName, city);

  const ctaRaw = profile.ctaOptions[Math.abs(companyName.charCodeAt(0)) % profile.ctaOptions.length]
    ?? profile.ctaOptions[0]!;
  const ctaSentence = ctaRaw.replace(/\{company\}/g, companyName).replace(/\{city\}/g, city);

  const greeting = buildGreeting(contactName);

  const firstName = senderName.split(' ')[0] || senderName;
  const signOff = senderPhone
    ? `${firstName} from Pryro\n${senderPhone}`
    : `${firstName} from Pryro`;

  return {
    companyName, niche, location,
    websiteDescription: websiteDesc,
    recentActivity: null,
    techMentions: [],
    staffCount: null,
    greeting,
    firstLine,
    subjectLine,
    problemSentence: profile.problemSentence,
    pryroSentence:   profile.pryroSentence,
    ctaSentence,
    signOff,
    personalizationScore,
    dataSource,
  };
}

// Keep old export name for any existing callers
export { getNicheProfile as getNicheIntelligence };
