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
  problemSentence: string;     // one unique angle for THIS email — varies per send
  pryroSentence: string;       // one sentence, Pryro's direct fix (NO commission mention)
  ctaSentence: string;         // one soft question
  signOff: string;             // professional footer built from sender profile
  isGenericEmail: boolean;     // true if email prefix is info@, contact@, etc.

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
  // Multiple problem angles — caller picks by index for variety across bulk sends
  problemAngles:   string[];
  pryroSentence:   string;
  ctaOptions:      string[];
  // Default problem sentence (first angle) — kept for backward compat
  problemSentence: string;
}

export const NICHE_PROFILES: Record<string, NicheProfile> = {

  // ── PHARMACY ──────────────────────────────────────────────────────────────
  pharmacy: {
    sectorLabel: 'pharmacy',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — drug expiry write-offs are one of the biggest silent margin killers for pharmacies in the region right now.`,
      (c, l) => `${c} in ${l} — pharmacies at your scale typically end up tracking stock in one system, billing in another, and payroll in a spreadsheet.`,
      (c, l) => `${c} in ${l} — most pharmacies don't catch expired stock until it's already been written off, and by then the damage is done.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — are expiry write-offs eating into margin?`,
      (c)    => `${c} — stock, billing, payroll in three places?`,
      (c, l) => `Pharmacy ops in ${l} — one gap worth closing`,
    ],
    problemAngles: [
      `Drug stock, billing, and payroll almost always live in separate systems — which means expired stock often isn't caught until it's already been written off.`,
      `Managing drug expiry manually means someone is always a step behind — by the time the alert comes, the write-off has already happened.`,
      `Pharmacy billing errors compound quickly when stock records and invoice systems don't talk to each other — the losses are invisible until month-end.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro is an ERP that tracks stock with expiry alerts, handles billing, and runs payroll in one place.`,
    ctaOptions: [
      `Would a 10-minute call be worth it to see if it fits how you're running ${'{company}'}?`,
      `Is managing expiry dates and billing in separate tools something you're actively trying to fix?`,
      `Would it make sense to see how other pharmacies in the region are handling this?`,
    ],
  },

  healthcare: {
    sectorLabel: 'clinic',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — clinics at this stage almost always hit the same wall: billing, stock, and payroll running in completely separate systems.`,
      (c, l) => `${c} in ${l} — healthcare admin work that should be automatic is still eating hours every week at most clinics this size.`,
      (c, l) => `${c} in ${l} — when patient billing, pharmacy stock, and HR all live in different tools, the reconciliation burden falls on your admin team every single month.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — is your admin team still reconciling manually?`,
      (c)    => `${c} — billing, stock, and payroll still separate?`,
      (c, l) => `Healthcare admin in ${l} — one friction worth fixing`,
    ],
    problemAngles: [
      `Patient scheduling, stock, billing, and payroll usually live in separate tools — which means your admin team spends hours each week manually reconciling data that should flow automatically.`,
      `When pharmacy stock, patient billing, and HR payroll are each in a different system, your admin staff spends more time moving numbers between spreadsheets than doing actual admin work.`,
      `The gap between patient appointment systems and billing reconciliation is where most clinic admin hours quietly disappear every week — and it compounds every month.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro connects patient management, pharmacy stock, billing, and HR into one system.`,
    ctaOptions: [
      `Would a 10-minute call make sense to see if it fits how ${'{company}'} currently runs?`,
      `Is this the kind of problem your admin team has been trying to solve?`,
      `Would you be open to seeing how other clinics in the region deal with this?`,
    ],
  },

  hotel: {
    sectorLabel: 'hotel',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — hotels at this scale almost always end up managing reservations, housekeeping, and vendor billing in completely separate systems.`,
      (c, l) => `${c} in ${l} — front desk teams at properties your size are typically still doing manual reconciliation between reservations and finance at end of day.`,
      (c, l) => `${c} in ${l} — when reservations, housekeeping, and vendor invoices all live in different places, month-end reporting becomes a week-long exercise.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — reservations, housekeeping, finance still separate?`,
      (c)    => `${c} — is month-end still a manual exercise?`,
      (c, l) => `Hotel ops in ${l} — one gap worth closing`,
    ],
    problemAngles: [
      `Reservations, housekeeping rosters, vendor invoices, and end-of-month financials almost never live in the same system — which means your front desk and accounts team lose hours each week moving data between tools.`,
      `When housekeeping schedules and vendor billing aren't connected to your reservations system, the front desk ends up doing manual reconciliation work that should be automatic.`,
      `Hotel month-end becomes a multi-day exercise when occupancy data, vendor invoices, and staff payroll each live in different places — and errors from that gap quietly compound.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro unifies reservations, housekeeping, vendor billing, and financials in one dashboard.`,
    ctaOptions: [
      `Would a 10-minute call make sense to see if it fits how ${'{company}'} operates today?`,
      `Is the reservations-to-finance gap something your team has flagged as a problem?`,
      `Would you be open to seeing how other hotels in ${'{city}'} have handled this?`,
    ],
  },

  lodge: {
    sectorLabel: 'lodge',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — lodges managing bookings across WhatsApp and a paper register are hitting a natural growth ceiling.`,
      (c, l) => `${c} in ${l} — guesthouses at this stage almost always have bookings in one place and accounts in another.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — bookings and payroll still in separate places?`,
      (c)    => `${c} — is month-end always a scramble?`,
    ],
    problemAngles: [
      `Bookings from multiple channels, housekeeping schedules, vendor bills, and end-of-month payroll rarely sit in the same system — which means month-end is always a scramble.`,
      `When WhatsApp bookings, paper registers, and supplier invoices aren't connected, it's nearly impossible to know your actual occupancy margin until after the fact.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro connects bookings, staff schedules, vendor billing, and financials in one place.`,
    ctaOptions: [
      `Would a 10-minute call be worth it to see if it fits how ${'{company}'} currently runs?`,
      `Is keeping bookings and costs in sync something your team does manually right now?`,
    ],
  },

  travel: {
    sectorLabel: 'travel agency',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — travel agencies at this scale often close bookings without knowing the actual margin until the trip is already over.`,
      (c, l) => `${c} in ${l} — tracking agent commissions and supplier costs in real time is still a manual process at most agencies in the region.`,
      (c, l) => `${c} in ${l} — when bookings, supplier payments, and agent commissions all live in spreadsheets, your P&L is always a month behind.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — do you know your margin before the trip ends?`,
      (c)    => `${c} — commissions and supplier costs still in Excel?`,
      (c, l) => `Travel agency margins in ${l} — one fix worth seeing`,
    ],
    problemAngles: [
      `Client bookings, supplier payments, agent commissions, and monthly P&L almost never live in one place — which means you often don't know your real margin until the trip is already over.`,
      `When agent commissions and supplier invoices are tracked separately from bookings, the P&L calculation always lands late — and by then you've already committed to the next deal.`,
      `Travel agency profitability is genuinely hard to track when each booking, supplier payment, and agent commission lives in a different spreadsheet or email thread.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro tracks bookings, supplier costs, agent commissions, and P&L in real time.`,
    ctaOptions: [
      `Would it be worth a 10-minute call to see if it solves what ${'{company}'} is dealing with?`,
      `Is tracking margins per trip in real time something you've been trying to fix?`,
      `Would you be open to seeing how other travel agencies in ${'{city}'} handle this?`,
    ],
  },

  restaurant: {
    sectorLabel: 'restaurant',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — restaurants at this stage typically don't have a clear picture of food cost until the end of the month.`,
      (c, l) => `${c} in ${l} — kitchen inventory, daily sales, and supplier invoices almost always end up in separate places at this scale.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — do you know today's food cost?`,
      (c)    => `${c} — kitchen, sales, suppliers still separate?`,
    ],
    problemAngles: [
      `Ingredient costs, staff attendance, daily sales, and supplier invoices rarely live in the same system — which means food cost and margin are only visible at month-end, when it's too late to act.`,
      `Without a live view of ingredient costs against daily sales, most restaurants only discover their food cost problem after it's already eaten into the month's margin.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro tracks inventory, daily sales, staff payroll, and supplier billing in one place.`,
    ctaOptions: [
      `Would a 10-minute call make sense to see if it fits how ${'{company}'} currently tracks costs?`,
      `Is daily reconciliation between kitchen, suppliers, and payroll something your team does manually?`,
    ],
  },

  retail: {
    sectorLabel: 'retail',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — retail businesses at this scale usually deal with stock going out of sync across locations without any early warning.`,
      (c, l) => `${c} in ${l} — supplier reorders and inventory levels become a constant manual effort once you're operating at this size.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — is stockout still a weekly surprise?`,
      (c)    => `${c} — inventory and reorders still manual?`,
    ],
    problemAngles: [
      `Inventory across locations, supplier reorders, daily sales, and payroll almost never talk to each other — which means stockouts and margin surprises are a regular part of the month.`,
      `When stock levels, supplier reorder points, and sales data live in separate places, the first sign of a stockout is usually an empty shelf — not a system alert.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro syncs inventory, supplier orders, sales reporting, and payroll in one system.`,
    ctaOptions: [
      `Would a short call be worth it to see if it fixes the stock sync issue at ${'{company}'}?`,
      `Is keeping inventory and supplier reorders in sync something your team manages manually?`,
    ],
  },

  logistics: {
    sectorLabel: 'logistics company',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — logistics businesses at this scale almost always have driver payroll, trip billing, and warehouse stock in completely separate places.`,
      (c, l) => `${c} in ${l} — end-of-month billing reconciliation is still a manual process at most transport companies in the region.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — how many days does month-end billing take?`,
      (c)    => `${c} — driver payroll and trip billing still separate?`,
    ],
    problemAngles: [
      `Driver trip logs, payroll, fuel costs, warehouse stock, and client invoicing almost never sit in the same system — which means reconciliation takes days and billing errors are easy to miss.`,
      `When driver trip records, fuel logs, and client billing aren't connected, month-end reconciliation is a manual exercise that takes days and still produces errors.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro connects driver payroll, trip billing, fuel tracking, and warehouse inventory in one system.`,
    ctaOptions: [
      `Would a 10-minute call make sense to see if it fits how ${'{company}'} operates?`,
      `Is reconciling driver trips with billing and payroll something your team does manually right now?`,
    ],
  },

  school: {
    sectorLabel: 'school',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — schools at this size almost always manage fee collection, payroll, and supplies in three completely separate places.`,
      (c, l) => `${c} in ${l} — end-of-term reporting is still a week-long manual exercise at most schools in the region.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — is end-of-term reporting still manual?`,
      (c)    => `${c} — fees, payroll, supplies still in three places?`,
    ],
    problemAngles: [
      `Student fees, staff payroll, school supplies, and exam records almost never live in the same system — which means your bursar and admin office spend weeks at the end of each term chasing reconciliation.`,
      `When fee collection, payroll, and supplies purchasing all run through separate registers or spreadsheets, term-end reporting becomes a reconciliation marathon that eats into the holiday.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro handles fee collection, payroll, supplies, and term reporting in one place.`,
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

  const label = niche ? niche.toLowerCase().replace(/\b(services?|solutions?|ltd|inc|group)\b/gi, '').trim() : 'business';
  return {
    sectorLabel: label,
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — at this stage, manual back-office work usually starts costing more time than the team can afford.`,
      (c, l) => `${c} in ${l} — operations at this scale tend to outgrow spreadsheets faster than most teams expect.`,
    ],
    subjectTemplates: [
      (c)    => `${c} — still running ops manually?`,
      (c, l) => `${c} in ${l} — one back-office fix worth seeing`,
    ],
    problemAngles: [
      `Finance, inventory, payroll, and CRM rarely live in the same system — which means your team spends time moving data between tools instead of running the business.`,
      `When finance, inventory, and HR each run in a different tool, the coordination overhead quietly compounds — and it gets worse as the team grows.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro consolidates finance, inventory, HR, and CRM into one system.`,
    ctaOptions: [
      `Would a 10-minute call make sense to see if it fits how ${'{company}'} currently operates?`,
      `Is this something your team has been trying to solve?`,
    ],
  };
}

// ─── Generic email detector ──────────────────────────────────────────────────

const GENERIC_EMAIL_PREFIXES = new Set([
  'info','contact','hello','hi','mail','support','help','admin','office',
  'team','sales','reception','general','webmaster','enquiry','enquiries',
  'bookings','booking','hr','marketing','accounts','billing','feedback',
  'service','media','press','shop','store','news','pr','noreply','no-reply',
]);

export function isGenericEmailAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  return GENERIC_EMAIL_PREFIXES.has(local);
}

// ─── First name extractor (Q5 — always try to get a real name) ───────────────
// Priority: contactName field → email prefix → fallback to company-based greeting

export function extractFirstName(
  contactName?: string | null,
  email?: string | null,
): { name: string | null; source: 'contact_field' | 'email_prefix' | 'none' } {
  // 1. Use contact name field if present
  if (contactName) {
    const first = contactName.trim().split(/[\s,]+/)[0]?.trim() ?? '';
    if (first.length >= 2 && /^[a-zA-Z]/.test(first)) {
      return { name: first.charAt(0).toUpperCase() + first.slice(1).toLowerCase(), source: 'contact_field' };
    }
  }

  // 2. Try email prefix — only for personal-looking prefixes (first.last, firstname, etc.)
  if (email && !isGenericEmailAddress(email)) {
    const local = email.split('@')[0]?.toLowerCase() ?? '';
    // firstname.lastname@ or firstname_lastname@ → take first part
    const parts = local.split(/[._\-]/);
    const first = parts[0]?.trim() ?? '';
    if (
      first.length >= 2 &&
      /^[a-z]+$/.test(first) &&          // only letters
      !GENERIC_EMAIL_PREFIXES.has(first) && // not a generic prefix
      first.length <= 20                 // not a domain fragment
    ) {
      return { name: first.charAt(0).toUpperCase() + first.slice(1), source: 'email_prefix' };
    }
  }

  return { name: null, source: 'none' };
}

// ─── Greeting builder ────────────────────────────────────────────────────────
// Always uses the best available name. Never "Dear Sir/Madam".
// Falls back to "Hi there," only when absolutely no name source exists.

export function buildGreeting(
  contactName?: string | null,
  email?: string | null,
): string {
  const { name } = extractFirstName(contactName, email);
  if (name) return `Hi ${name},`;
  return 'Hi there,';
}

/** True when no real first name was found — caller should prompt user to add one */
export function greetingIsFallback(
  contactName?: string | null,
  email?: string | null,
): boolean {
  return extractFirstName(contactName, email).source === 'none';
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
  // Re-frame in the AI's own voice, not quoting the news snippet
  if (recentActivity && recentActivity.length > 40) {
    // Detect promotional/award/mission content and skip it
    const promo = /award|winner|proud|mission|vision|celebrat|recogni[sz]|honor|honour|accolade|rated #|ranked #|best in|voted/i;
    if (!promo.test(recentActivity)) {
      const line = `${companyName} in ${city} — looks like there's been some recent activity there, which usually brings specific ops challenges with it.`;
      return { line, score: 85, source: 'news' };
    }
  }

  // Tier 2 — staff count signal (concrete, no website quoting)
  if (staffCount) {
    const line = `${companyName} in ${city} has ${staffCount} — at that scale, back-office coordination usually becomes a daily friction point.`;
    return { line, score: 60, source: 'website' };
  }

  // Tier 3 — industry template (always company name + city, never "I came across" or "I was looking at")
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

  // ── Problem sentence — rotate by emailIndex for variety across bulk sends ─
  const problemAngles = profile.problemAngles;
  const problemSentence = problemAngles[emailIndex % problemAngles.length]!;

  // ── Greeting — try contact name first, then email prefix ──────────────────
  const greeting = buildGreeting(contactName, undefined);

  // ── Generic email flag ────────────────────────────────────────────────────
  // (email not available in async path — caller sets this via lead.email)
  const isGenericEmail = false; // overridden by caller after research

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
    problemSentence,
    pryroSentence:   profile.pryroSentence,
    ctaSentence,
    signOff,
    isGenericEmail,
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

  // ── Problem sentence — rotate by emailIndex for variety ──────────────────
  const problemAngles = profile.problemAngles;
  const problemSentence = problemAngles[emailIndex % problemAngles.length]!;

  // ── Greeting — contact name first, then email prefix ─────────────────────
  const greeting = buildGreeting(contactName, undefined);

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
    problemSentence,
    pryroSentence:   profile.pryroSentence,
    ctaSentence,
    signOff,
    isGenericEmail: false, // caller sets via lead.email
    personalizationScore,
    dataSource,
  };
}

// Keep old export name for any existing callers
export { getNicheProfile as getNicheIntelligence };
