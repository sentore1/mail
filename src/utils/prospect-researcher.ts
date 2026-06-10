/**
 * PROSPECT RESEARCHER — v3
 * ─────────────────────────
 * All niche profiles now grounded in Pryro's real product (pryro.com):
 *
 * Pryro's actual modules (verified from pryro.com):
 *   - Financial Management: invoicing, budgets, forecasting, cash flow tracking
 *   - Inventory Management: stock tracking, supplier management, multi-warehouse
 *   - HR & Payroll: attendance, payroll processing, benefits administration
 *   - Project Management: tasks, time tracking, timesheets, reports
 *   - CRM: customer relationships, pipeline, invoicing
 *   - AI-powered Analytics: real-time dashboards, business intelligence
 *
 * Pryro credibility facts (from pryro.com):
 *   - Free trial available (pryro Basic is free)
 *   - 1–2 week implementation
 *   - 99.9% uptime guarantee
 *   - Enterprise-grade security: 256-bit encryption, SOC 2, GDPR, ISO 27001
 *   - 64,000+ businesses worldwide
 *   - $29/mo Premium plan
 *   - 24/7 support
 *
 * Each pryroSentence names the SPECIFIC Pryro module relevant to that sector.
 * CTAs reference Pryro's free trial where appropriate.
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

  // ── PHARMACY ─────────────────────────────────────────────────────────────
  // Pryro module: Inventory Management (stock tracking, expiry alerts, suppliers)
  pharmacy: {
    sectorLabel: 'pharmacy',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — drug expiry write-offs are one of the biggest silent margin killers for pharmacies in the region right now.`,
      (c, l) => `${c} in ${l} — pharmacies at your scale typically end up tracking stock in one system, billing in another, and payroll in a spreadsheet.`,
      (c, l) => `${c} in ${l} — expired stock that wasn't caught in time is usually a systems problem, not a staff problem.`,
    ],
    subjectTemplates: [
      (c) => `${c} — are expiry write-offs eating into margin?`,
      (c) => `${c} — stock and billing still in two places?`,
      (c) => `${c} — catching expiry dates before the write-off?`,
    ],
    problemAngles: [
      `Drug stock, billing, and payroll almost always live in separate systems — which means expired stock often isn't caught until it's already been written off.`,
      `Managing drug expiry manually means someone is always a step behind — by the time you spot it, the write-off has already happened.`,
      `Pharmacy billing errors compound quickly when stock records and invoice systems don't talk to each other — the losses are invisible until month-end.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro's Inventory Management module tracks stock levels, flags drugs approaching expiry, and connects directly to billing — all in one place.`,
    ctaOptions: [
      `Would it be worth a quick look at how Pryro's inventory module handles expiry tracking for a pharmacy your size — there's a free trial if you want to try it on your own data?`,
      `Is expiry management and stock visibility something you'd want to see working in practice before committing to anything?`,
      `Would it make sense to see how Pryro handles stock and billing for a pharmacy like ${'{company}'}?`,
    ],
  },

  // ── CLINIC / HEALTHCARE ──────────────────────────────────────────────────
  // Pryro module: HR & Payroll + Financial Management (patient billing, payroll, attendance)
  healthcare: {
    sectorLabel: 'clinic',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — running HR, billing, and pharmacy stock in separate tools is one of those things that seems manageable until a month-end crunch hits.`,
      (c, l) => `${c} in ${l} — reconciling staff payroll with patient billing is still a manual exercise for most clinics this size, and it costs hours every month.`,
      (c, l) => `${c} in ${l} — when the numbers from your billing system and your HR system don't automatically match, someone on your admin team is doing that work manually every month.`,
    ],
    subjectTemplates: [
      (c) => `${c} — staff payroll and billing still reconciled manually?`,
      (c) => `${c} — HR, billing, and stock still three separate tools?`,
      (c) => `${c} — how long does your end-of-month payroll take?`,
    ],
    problemAngles: [
      `Staff attendance, payroll, patient billing, and pharmacy stock usually live in separate tools — which means your admin team spends hours every week manually reconciling data that should flow automatically.`,
      `When HR payroll and patient billing run in different systems, month-end becomes a multi-day reconciliation exercise that consistently produces small errors that compound over time.`,
      `The cost of running HR, payroll, and billing in separate systems isn't just time — it's the errors that compound when those numbers never automatically match.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro's HR & Payroll module handles staff attendance and payroll — connected to billing so your admin team reconciles both from one screen instead of two.`,
    ctaOptions: [
      `Would it be worth seeing how Pryro handles payroll and billing for a clinic your size — you can start with a free trial if you want to see it on your own numbers?`,
      `Is automating the link between HR and billing something your admin team has been trying to fix?`,
      `Would it make sense to see how Pryro handles staff payroll and patient billing together for ${'{company}'}?`,
    ],
  },

  // ── HOSPITAL ─────────────────────────────────────────────────────────────
  // Separate from clinic — larger scale, project management for departments
  hospital: {
    sectorLabel: 'hospital',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — at that size, getting a live view of actual spend versus approved department budgets is one of those things that never quite happens until something forces it.`,
      (c, l) => `${c} in ${l} — staff shift reconciliation and department procurement are two things that generate a lot of data but almost never end up in the same report.`,
      (c, l) => `${c} in ${l} — HR payroll and department budget tracking are both real-time problems, but they almost never have a real-time system behind them at this scale.`,
    ],
    subjectTemplates: [
      (c) => `${c} — HR payroll and department budgets still separate?`,
      (c) => `${c} — how long does end-of-month payroll take?`,
      (c) => `${c} — staff scheduling and payroll in one system?`,
    ],
    problemAngles: [
      `Staff rosters, attendance, payroll, and department procurement almost never connect — which means your finance and HR teams spend weeks every month on reconciliation that should be automatic.`,
      `When department budgets, procurement, and payroll each run in a different tool, the CFO never has a live view of actual spend versus approved budget until it's too late to act.`,
      `Hospital HR is uniquely complex — shift rotations, department transfers, benefits, and payroll all interact — and managing it across separate tools multiplies the error risk.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro's HR & Payroll module handles shift scheduling, attendance, and payroll — connected to financial management so department spend and headcount costs are visible in one place.`,
    ctaOptions: [
      `Would it be worth a 15-minute look at how Pryro handles HR and department budgets for a hospital your size — there's a free trial if you want to run it against your own data?`,
      `Is the gap between HR payroll and department budget tracking something your finance team has flagged?`,
      `Would it make sense to see how Pryro's HR module handles shift payroll and department reporting for ${'{company}'}?`,
    ],
  },

  // ── HOTEL / LODGE ────────────────────────────────────────────────────────
  // Pryro module: Project Management + HR & Payroll (housekeeping schedules, staff, vendor billing)
  hotel: {
    sectorLabel: 'hotel',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — hotels at this scale almost always end up managing reservations, housekeeping rosters, and vendor billing in completely separate systems.`,
      (c, l) => `${c} in ${l} — front desk teams at properties your size are typically still doing manual reconciliation between reservations and finance at end of day.`,
      (c, l) => `${c} in ${l} — when staff scheduling, vendor invoices, and financial reporting all live in different places, month-end becomes a week-long exercise.`,
    ],
    subjectTemplates: [
      (c) => `${c} — staff scheduling and billing still separate tools?`,
      (c) => `${c} — is month-end still a manual reconciliation?`,
      (c) => `${c} — housekeeping rosters and payroll in one place?`,
    ],
    problemAngles: [
      `Housekeeping schedules, vendor invoices, staff payroll, and end-of-month financials almost never live in the same system — which means your ops and accounts teams lose hours every week moving data between tools.`,
      `When staff scheduling and vendor billing aren't connected to your financial system, the front desk and finance team end up doing manual reconciliation that should be automatic.`,
      `Hotel month-end becomes a multi-day exercise when occupancy data, staff timesheets, and vendor invoices each live in different places — and errors compound quietly.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro's Project Management module handles staff scheduling and timesheets — connected to financial management so your ops and finance teams stop moving numbers between tools.`,
    ctaOptions: [
      `Would it be worth seeing how Pryro handles staff scheduling and billing for a hotel your size — you can try it free and see it on your actual setup?`,
      `Is the gap between staff scheduling and financial reporting something your ops team has been trying to close?`,
      `Would it make sense to see Pryro's HR and financial modules working together for ${'{company}'}?`,
    ],
  },

  lodge: {
    sectorLabel: 'lodge',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — lodges managing bookings, housekeeping, and accounts in separate places are hitting a natural growth ceiling.`,
      (c, l) => `${c} in ${l} — guesthouses at this stage almost always have bookings in one place and accounts in another.`,
    ],
    subjectTemplates: [
      (c) => `${c} — bookings, staff, and billing still three separate places?`,
      (c) => `${c} — is month-end always a scramble?`,
    ],
    problemAngles: [
      `Bookings, housekeeping schedules, staff payroll, and vendor bills rarely connect — which means month-end is always a manual scramble to reconcile numbers that should match automatically.`,
      `When WhatsApp bookings, paper rosters, and supplier invoices aren't in the same system, it's nearly impossible to know your real occupancy margin until after the fact.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro's HR module connects staff schedules and payroll to your financial management — so month-end stops being a reconciliation exercise.`,
    ctaOptions: [
      `Would it be worth a quick look at how Pryro handles bookings, staff, and billing for a lodge your size — there's a free trial if you want to test it?`,
      `Is keeping staff costs and bookings in sync something your team does manually right now?`,
    ],
  },

  // ── TRAVEL AGENCY ────────────────────────────────────────────────────────
  // Pryro module: CRM + Financial Management (invoicing, commissions, P&L)
  travel: {
    sectorLabel: 'travel agency',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — travel agencies at this scale often close bookings without knowing the actual margin until the trip is already over.`,
      (c, l) => `${c} in ${l} — tracking agent commissions and supplier costs in real time is still a manual process at most agencies in the region.`,
      (c, l) => `${c} in ${l} — when client bookings, supplier invoices, and agent commissions all live in spreadsheets, the P&L is always a month behind.`,
    ],
    subjectTemplates: [
      (c) => `${c} — do you know your margin before the trip ends?`,
      (c) => `${c} — CRM, invoicing, and commissions in one place?`,
      (c) => `${c} — supplier costs and agent commissions still in Excel?`,
    ],
    problemAngles: [
      `Client bookings, supplier payments, agent commissions, and monthly P&L almost never live in one place — which means you often don't know your real margin until the trip is already over.`,
      `When agent commissions and supplier invoices are tracked separately from client bookings, the P&L calculation always lands late — and by then you've already committed to the next deal.`,
      `Travel agency profitability is genuinely hard to track when each booking, supplier payment, and commission lives in a different spreadsheet or email thread.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro's CRM tracks client bookings, calculates agent commissions, and feeds directly into P&L reporting — so your margin is visible before the trip lands, not after.`,
    ctaOptions: [
      `Would it be worth seeing how Pryro's CRM and invoicing handle commissions and P&L for a travel agency your size — you can try it free on your own bookings data?`,
      `Is tracking supplier costs and agent commissions in real time something you've been trying to fix?`,
      `Would it make sense to see how Pryro handles booking profitability for ${'{company}'}?`,
    ],
  },

  // ── RESTAURANT ───────────────────────────────────────────────────────────
  // Pryro module: Inventory Management + Financial Management (food cost, supplier billing)
  restaurant: {
    sectorLabel: 'restaurant',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — restaurants at this stage typically don't have a live view of food cost until the end of the month.`,
      (c, l) => `${c} in ${l} — kitchen stock, supplier invoices, and daily sales almost always end up in separate places at this scale.`,
    ],
    subjectTemplates: [
      (c) => `${c} — do you know today's food cost?`,
      (c) => `${c} — stock, suppliers, and sales still three separate tools?`,
    ],
    problemAngles: [
      `Ingredient costs, staff payroll, daily sales, and supplier invoices rarely live in the same system — which means food cost and margin are only visible at month-end, when it's too late to course-correct.`,
      `Without a live view of stock costs against daily sales, most restaurants only discover their food cost problem after it's already eaten into the month's margin.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro's Inventory Management module tracks ingredient stock and connects supplier invoices to purchasing — so food cost is visible daily, not just at month-end.`,
    ctaOptions: [
      `Would it be worth a quick look at how Pryro handles inventory and food cost for a restaurant your size — there's a free trial to test it on your actual numbers?`,
      `Is getting a live view of food cost and supplier spend something your kitchen manager or accountant has been asking for?`,
    ],
  },

  // ── RETAIL ───────────────────────────────────────────────────────────────
  // Pryro module: Inventory Management (multi-location stock, supplier reorders)
  retail: {
    sectorLabel: 'retail',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — retail businesses at this scale usually deal with stock going out of sync across locations without any early warning system.`,
      (c, l) => `${c} in ${l} — supplier reorders and multi-location inventory become a constant manual effort once you're operating at this size.`,
    ],
    subjectTemplates: [
      (c) => `${c} — is stockout still a weekly surprise?`,
      (c) => `${c} — multi-location inventory and reorders still manual?`,
    ],
    problemAngles: [
      `Stock levels, supplier reorders, daily sales, and payroll almost never connect — which means stockouts and margin surprises are a regular part of the month.`,
      `When inventory across locations and supplier reorder points live in different places, the first sign of a stockout is usually an empty shelf — not a system alert.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro's Inventory Management module tracks stock across multiple locations and automates supplier reorders — so a stockout shows up as an alert, not an empty shelf.`,
    ctaOptions: [
      `Would it be worth seeing how Pryro's inventory module handles multi-location stock for a business your size — you can try it free?`,
      `Is real-time stock visibility across locations something your team has been trying to get in place?`,
    ],
  },

  // ── NGO / NON-PROFIT ─────────────────────────────────────────────────────
  // Pryro module: Financial Management (budgets, forecasting, donor reporting)
  ngo: {
    sectorLabel: 'NGO',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — NGOs at this scale almost always struggle to keep grant budgets, field expenses, and donor reporting aligned across separate tools.`,
      (c, l) => `${c} in ${l} — budget-to-actuals reporting is still a manual reconciliation exercise at most NGOs in the region.`,
    ],
    subjectTemplates: [
      (c) => `${c} — grant budgets and field expenses still separate?`,
      (c) => `${c} — how long does donor reporting take each quarter?`,
    ],
    problemAngles: [
      `Grant budgets, field expense submissions, and donor reporting almost never live in the same system — which means financial compliance reports always take longer than they should.`,
      `When programme budgets and actual field spend are tracked in different spreadsheets, the finance team spends more time reconciling than reporting — and donors notice.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro's Financial Management module handles grant budgets, actual spend tracking, and donor reports — so your finance team has one source of truth instead of three reconciliation files.`,
    ctaOptions: [
      `Would it be worth seeing how Pryro handles grant budgets and donor reporting for an NGO your size — there's a free trial if you want to run it against your actual data?`,
      `Is faster, cleaner donor reporting something your finance team has been trying to achieve?`,
    ],
  },

  // ── CONSTRUCTION ─────────────────────────────────────────────────────────
  // Pryro module: Project Management + Financial Management
  construction: {
    sectorLabel: 'construction firm',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — construction firms at this scale almost always manage project budgets, contractor payroll, and procurement in completely separate systems.`,
      (c, l) => `${c} in ${l} — project cost overruns are usually a data problem before they become a budget problem — and separate systems make it worse.`,
    ],
    subjectTemplates: [
      (c) => `${c} — project budgets and contractor payroll still separate?`,
      (c) => `${c} — how early do you see a cost overrun coming?`,
    ],
    problemAngles: [
      `Project timelines, contractor payroll, procurement costs, and client invoices almost never connect — which means cost overruns are usually discovered after they've already happened.`,
      `When project management and financial tracking run in separate tools, budget-to-actuals is always a backward-looking exercise — and by the time the numbers land, the margin is already gone.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro's Project Management module tracks tasks, timesheets, and procurement — connected directly to financial management so you see budget versus actuals in real time, not at month-end.`,
    ctaOptions: [
      `Would it be worth seeing how Pryro handles project budgets and contractor payroll for a firm your size — there's a free trial?`,
      `Is getting real-time budget-to-actuals visibility something your project managers have been asking for?`,
    ],
  },

  // ── LOGISTICS ────────────────────────────────────────────────────────────
  // Pryro module: Inventory Management + Financial Management + HR & Payroll
  logistics: {
    sectorLabel: 'logistics company',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — logistics businesses at this scale almost always have driver payroll, trip billing, and warehouse inventory in completely separate systems.`,
      (c, l) => `${c} in ${l} — end-of-month billing reconciliation is still a manual process at most transport companies in the region.`,
    ],
    subjectTemplates: [
      (c) => `${c} — driver payroll and warehouse stock still separate?`,
      (c) => `${c} — how many days does month-end billing take?`,
    ],
    problemAngles: [
      `Driver trip logs, payroll, fuel costs, warehouse inventory, and client invoicing almost never sit in the same system — which means reconciliation takes days and billing errors are easy to miss.`,
      `When trip records, fuel logs, and client billing aren't connected, month-end reconciliation becomes a multi-day manual exercise — and errors from that gap compound quietly.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro's HR & Payroll module links driver attendance and trip logs directly to payroll — so the numbers that go into billing and the numbers that go into payroll come from the same source.`,
    ctaOptions: [
      `Would it be worth seeing how Pryro handles driver payroll and warehouse inventory for a logistics company your size — you can try it free?`,
      `Is reducing the time your team spends on month-end reconciliation something you've been trying to fix?`,
    ],
  },

  // ── SCHOOL ───────────────────────────────────────────────────────────────
  // Pryro module: Financial Management + HR & Payroll (fee collection, staff payroll)
  school: {
    sectorLabel: 'school',
    firstLineTemplates: [
      (c, l) => `${c} in ${l} — schools at this size almost always manage fee collection, staff payroll, and supplies in three completely separate systems.`,
      (c, l) => `${c} in ${l} — end-of-term reporting is still a week-long reconciliation exercise at most schools in the region.`,
    ],
    subjectTemplates: [
      (c) => `${c} — fee collection and staff payroll still separate?`,
      (c) => `${c} — how long does term-end reporting take?`,
    ],
    problemAngles: [
      `Student fee collection, staff payroll, supplies purchasing, and term reporting almost never live in the same system — which means your bursar spends weeks at term-end chasing numbers that should balance automatically.`,
      `When fee collection and staff payroll run in separate registers, term-end reconciliation becomes a marathon — and errors that were invisible during term surface all at once.`,
    ],
    get problemSentence() { return this.problemAngles[0]!; },
    pryroSentence: `Pryro's Financial Management module handles fee collection and connects directly to HR payroll — so your bursar's numbers balance automatically instead of needing a manual reconciliation at term-end.`,
    ctaOptions: [
      `Would it be worth seeing how Pryro handles fee collection and staff payroll for a school your size — there's a free trial to test it on your actual setup?`,
      `Is having fee income and staff payroll in the same system something your bursar has been asking for?`,
    ],
  },
};

// ─── Niche key detection ─────────────────────────────────────────────────────

export function detectNicheKey(niche: string | null): string {
  if (!niche) return 'generic';
  const n = niche.toLowerCase();
  if (/pharmacy|chemist|dispensary|drug store/.test(n))                                      return 'pharmacy';
  if (/hospital|surgical|referral hospital|health complex/.test(n))                          return 'hospital';
  if (/clinic|dental|medical|doctor|physician|healthcare|optom|physio|vet/.test(n))         return 'healthcare';
  if (/hotel|motel|inn|resort/.test(n))                                                      return 'hotel';
  if (/lodge|guesthouse|guest house|b&b|bed and breakfast/.test(n))                         return 'lodge';
  if (/travel agent|travel agency|tour operator|tour|safari/.test(n))                       return 'travel';
  if (/restaurant|catering|bakery|cafe|coffee|bistro|food|eatery/.test(n))                  return 'restaurant';
  if (/retail|shop|store|supermarket|boutique|clothing|electronics|hardware/.test(n))        return 'retail';
  if (/ngo|non.profit|nonprofit|charity|foundation|civil society|church|mosque/.test(n))    return 'ngo';
  if (/construction|contractor|civil engineer|architecture|builder/.test(n))                 return 'construction';
  if (/logistics|transport|freight|courier|shipping|trucking|fleet|warehouse/.test(n))       return 'logistics';
  if (/school|college|university|academy|education|training|institute|nursery/.test(n))      return 'school';
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

// ─── Name validator — blocks generation for unusable names ───────────────────
// A "usable" first name is a real human name: letters only, 2–12 chars,
// no dots, no digits, not an obvious email prefix like "drsanjaypathare".

export function isUsableFirstName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim();
  if (n.length < 2 || n.length > 12) return false;          // too short or too long
  if (/[0-9._\-@+]/.test(n)) return false;                  // contains digits or punctuation
  if (/^(hi|sir|madam|dear|mr|mrs|ms|dr|prof)$/i.test(n)) return false; // titles
  if (!/^[a-zA-ZÀ-ÖØ-öø-ÿ]+$/.test(n)) return false;       // non-letter chars
  return true;
}

// ─── Sector question bank — one genuine question per sector, varied per index ─
// These are the OPENING LINE — a real question about a real daily challenge.

const SECTOR_QUESTIONS: Record<string, Array<(company: string) => string>> = {
  pharmacy: [
    (c) => `Are you still tracking drug expiry dates and stock manually at ${c}?`,
    (c) => `Is ${c} managing stock, billing, and payroll across separate systems?`,
    (c) => `Are expiry write-offs still a regular problem at ${c}?`,
  ],
  healthcare: [
    (c) => `Are you still reconciling HR, billing, and stock manually at ${c}?`,
    (c) => `Is ${c} running payroll, patient billing, and pharmacy stock in separate tools?`,
    (c) => `How much time does ${c}'s admin team spend reconciling payroll and billing each month?`,
  ],
  hospital: [
    (c) => `Is ${c} still managing department budgets, HR, and procurement in separate systems?`,
    (c) => `Are staff rosters, payroll, and department spend still disconnected at ${c}?`,
    (c) => `Does ${c}'s finance team have a live view of actual spend versus approved budgets?`,
  ],
  hotel: [
    (c) => `Is ${c} still reconciling housekeeping rosters, payroll, and vendor billing manually?`,
    (c) => `Are reservations, staff scheduling, and financials still in separate tools at ${c}?`,
    (c) => `How long does ${c}'s team spend on month-end reconciliation each month?`,
  ],
  lodge: [
    (c) => `Are bookings, housekeeping, and accounts still running in separate places at ${c}?`,
    (c) => `Is ${c} still reconciling bookings and payroll manually at month-end?`,
  ],
  travel: [
    (c) => `Does ${c} know the actual margin on each booking before the trip ends?`,
    (c) => `Is ${c} still tracking agent commissions and supplier costs in spreadsheets?`,
    (c) => `Are client bookings, commissions, and P&L still in separate tools at ${c}?`,
  ],
  restaurant: [
    (c) => `Does ${c} have a live view of food cost today, or only at month-end?`,
    (c) => `Are kitchen stock, supplier invoices, and daily sales still separate at ${c}?`,
  ],
  retail: [
    (c) => `Is ${c} still getting stockout surprises across locations?`,
    (c) => `Are inventory, supplier reorders, and sales reporting still manual at ${c}?`,
  ],
  ngo: [
    (c) => `Is ${c} still reconciling grant budgets and field expenses in separate tools?`,
    (c) => `How long does ${c}'s finance team spend on donor reporting each quarter?`,
  ],
  construction: [
    (c) => `Does ${c} see cost overruns in real time, or only after they've happened?`,
    (c) => `Are project budgets, contractor payroll, and procurement still disconnected at ${c}?`,
  ],
  logistics: [
    (c) => `Is ${c} still reconciling driver payroll, trip billing, and warehouse stock manually?`,
    (c) => `How many days does month-end billing reconciliation take at ${c}?`,
  ],
  school: [
    (c) => `Is ${c} still managing fee collection and staff payroll in separate systems?`,
    (c) => `How long does ${c}'s bursar spend on term-end reconciliation?`,
  ],
  generic: [
    (c) => `Are you still managing HR, billing, and operations in separate tools at ${c}?`,
    (c) => `Is ${c} running finance, inventory, and payroll across disconnected systems?`,
    (c) => `How much time does ${c}'s team spend each month reconciling data across tools?`,
  ],
};

function getSectorQuestion(niche: string | null, companyName: string, idx: number): string {
  const key = detectNicheKey(niche);
  const questions = SECTOR_QUESTIONS[key] ?? SECTOR_QUESTIONS['generic']!;
  const fn = questions[idx % questions.length]!;
  return fn(companyName);
}

// ─── Subject line bank — short conversational questions, varied per index ─────

const SECTOR_SUBJECTS: Record<string, Array<(company: string) => string>> = {
  pharmacy: [
    (c) => `Is ${c} still tracking drug expiry manually?`,
    (c) => `Are stock, billing and payroll separate at ${c}?`,
    (c) => `How is ${c} catching expiry dates before write-offs?`,
  ],
  healthcare: [
    (c) => `Is ${c} still reconciling payroll and billing manually?`,
    (c) => `How long does month-end take at ${c}?`,
    (c) => `Are HR and patient billing still separate at ${c}?`,
  ],
  hospital: [
    (c) => `Are department budgets and payroll connected at ${c}?`,
    (c) => `Is ${c} getting live department spend visibility?`,
    (c) => `How does ${c} track HR and finance together?`,
  ],
  hotel: [
    (c) => `Is month-end still a manual process at ${c}?`,
    (c) => `Are staff scheduling and billing connected at ${c}?`,
    (c) => `How does ${c} reconcile housekeeping and payroll?`,
  ],
  lodge: [
    (c) => `Are bookings and accounts still separate at ${c}?`,
    (c) => `Is month-end reconciliation still manual at ${c}?`,
  ],
  travel: [
    (c) => `Does ${c} know its booking margin before trips end?`,
    (c) => `Are agent commissions still tracked in spreadsheets at ${c}?`,
    (c) => `Is the P&L always a month behind at ${c}?`,
  ],
  restaurant: [
    (c) => `Does ${c} have a live view of food cost?`,
    (c) => `Are kitchen stock and supplier invoices connected at ${c}?`,
  ],
  retail: [
    (c) => `Is ${c} still getting caught by stockouts?`,
    (c) => `Are inventory reorders still managed manually at ${c}?`,
  ],
  ngo: [
    (c) => `Is donor reporting still taking too long at ${c}?`,
    (c) => `Are grant budgets and field spend connected at ${c}?`,
  ],
  construction: [
    (c) => `Does ${c} see cost overruns before they happen?`,
    (c) => `Are project budgets and payroll still separate at ${c}?`,
  ],
  logistics: [
    (c) => `Is month-end billing still taking days at ${c}?`,
    (c) => `Are driver payroll and stock connected at ${c}?`,
  ],
  school: [
    (c) => `Are fees and staff payroll still separate at ${c}?`,
    (c) => `Is term-end reporting still a manual process at ${c}?`,
  ],
  generic: [
    (c) => `Are HR and finance still separate tools at ${c}?`,
    (c) => `Is ${c} still running operations across multiple tools?`,
    (c) => `How does ${c} keep ops data in one place?`,
  ],
};

function getSectorSubject(niche: string | null, companyName: string, idx: number): string {
  const key = detectNicheKey(niche);
  const subjects = SECTOR_SUBJECTS[key] ?? SECTOR_SUBJECTS['generic']!;
  const fn = subjects[idx % subjects.length]!;
  return fn(companyName);
}

// ─── The fixed Pryro description line (never changes) ─────────────────────────
const PRYRO_DESCRIPTION = `Pryro is an ERP that brings HR, payroll, finance, inventory, and CRM into one platform.`;

// ─── Build the guaranteed 4-line email ────────────────────────────────────────

export function buildGuaranteedEmail(params: {
  firstName: string;
  companyName: string;
  niche: string | null;
  emailIndex: number;
  signOff: string;
  useTeamGreeting?: boolean;
}): { subject: string; body: string } {
  const { firstName, companyName, niche, emailIndex, signOff, useTeamGreeting } = params;

  const subject  = getSectorSubject(niche, companyName, emailIndex);
  const greeting = firstName === 'Sir/Madam' || useTeamGreeting ? 'Dear Sir/Madam,' : `Hi ${firstName},`;

  // Sector-specific observation (peer-level industry statement)
  const nicheKey = detectNicheKey(niche);
  const observations: Record<string, string[]> = {
    pharmacy:     ['Most pharmacy teams say drug expiry write-offs are invisible until they hit the monthly count.'],
    healthcare:   ['Most healthcare finance teams say getting payroll and patient billing to match at month-end still takes days of manual work.'],
    hospital:     ['Most hospital finance leads say tracking real-time department spend against approved budgets is nearly impossible due to payroll lag.'],
    hotel:        ['Most hospitality ops leads say month-end reconciliation still takes days because scheduling, billing, and finance never sync automatically.'],
    lodge:        ['Most lodge operators say knowing their real occupancy margin before month-end is difficult when bookings and accounts are separate.'],
    travel:       ['Most travel agency owners say they only find out their actual margin on a booking after the trip ends.'],
    restaurant:   ['Most restaurant operators say food cost is only visible at month-end. By which point the margin problem has already happened.'],
    retail:       ['Most retail ops managers say stockouts are only caught when a shelf is empty. By then the sale is already gone.'],
    ngo:          ['Most NGO finance leads say pulling together grant budget versus actual spend for a donor report still takes the better part of a week.'],
    construction: ['Most construction finance managers say cost overruns are only visible in the P&L after the margin is already gone.'],
    logistics:    ['Most logistics ops leads say matching driver payroll to trip logs at month-end still takes days of manual cross-referencing.'],
    school:       ['Most school bursars say term-end reconciliation between fee collection and staff payroll still takes the better part of two weeks.'],
    generic:      ['Most operations leads say the hours lost to moving data between finance, HR, and inventory systems are invisible until they add up at quarter-end.'],
  };
  const outcomes: Record<string, string[]> = {
    pharmacy:     ['We connect stock, billing, and payroll into one view so your team catches expiry issues before they become write-offs.'],
    healthcare:   ['We connect HR and patient billing into one live view so your admin team stops reconciling manually every month-end.'],
    hospital:     ['We connect HR payroll and department budgets so your finance team sees real-time spend against approved limits, not last month\'s.'],
    hotel:        ['We connect scheduling, vendor billing, and financials so month-end reconciliation goes from five days to same-day.'],
    lodge:        ['We connect bookings, staff costs, and accounts so your real occupancy margin is visible before month-end, not after.'],
    travel:       ['We connect bookings, commissions, and supplier costs so your margin on every deal is visible before the trip ends.'],
    restaurant:   ['We connect kitchen stock and daily sales so food cost is a live number your chef sees every morning, not a month-end surprise.'],
    retail:       ['We connect inventory and reorder points to sales data so stockouts trigger an alert, not an empty shelf.'],
    ngo:          ['We connect grant budgets, field expenses, and payroll so your donor report takes hours instead of a week.'],
    construction: ['We connect project budgets, contractor payroll, and procurement so cost overruns show up before they show up in the P&L.'],
    logistics:    ['We connect driver payroll, trip logs, and billing so month-end reconciliation goes from days to hours.'],
    school:       ['We connect fee collection and staff payroll so your bursar\'s numbers balance automatically instead of needing two weeks of chasing.'],
    generic:      ['We connect finance, inventory, and HR into one live view so your team stops moving data between tools and starts running the business.'],
  };
  const ctas: Record<string, string> = {
    pharmacy: 'Open to seeing the 2-minute workflow we use to fix this?',
    healthcare: 'Open to seeing the 2-minute workflow we use to fix this?',
    hospital: 'Open to seeing how we do it for a hospital your size?',
    hotel: 'Open to a 2-minute look at how it works for a property your size?',
    lodge: 'Open to seeing the 2-minute walkthrough we do for lodges?',
    travel: 'Open to seeing how we surface margin before a trip ends?',
    restaurant: 'Open to seeing the live food cost view your chef would use daily?',
    retail: 'Open to seeing how the stockout alert works in practice?',
    ngo: 'Open to seeing how the donor report pulls together in one click?',
    construction: 'Open to seeing how the real-time budget view works on a live project?',
    logistics: 'Open to seeing how the reconciliation looks when it runs automatically?',
    school: 'Open to seeing how the term-end reconciliation works when it\'s automated?',
    generic: 'Open to seeing the 2-minute workflow we use to fix this?',
  };

  const obs     = (observations[nicheKey] ?? observations['generic']!)[emailIndex % (observations[nicheKey]?.length ?? 1)]!;
  const outcome = (outcomes[nicheKey]    ?? outcomes['generic']!)   [emailIndex % (outcomes[nicheKey]?.length    ?? 1)]!;
  const cta     = ctas[nicheKey] ?? ctas['generic']!;

  const body = `${greeting}

${obs}

${outcome}

We also offer a 20-30% commission for every successfully referred client.

${cta}

${signOff}`;

  return { subject, body };
}

// Names that are definitively not real businesses — skip generation entirely
const INVALID_COMPANY_NAMES = new Set([
  'untitled', 'n/a', 'na', 'test', 'example', 'sample', 'demo',
  'unknown', 'company', 'business', 'organization', 'organisation',
  'null', 'undefined', 'none', 'placeholder', 'your company',
  // Junk scraped names from the logs
  'pain', 'skin', 'contacts us', 'contact us', 'appointments',
  'medical assistance', 'list of medical facilities', 'mis/ur',
  'about', 'home', 'index', 'services', 'products',
]);

export interface CompanyNameResult {
  cleaned: string;
  valid: boolean;
  reason?: string;  // why it was flagged as invalid
}

export function cleanCompanyName(raw: string): CompanyNameResult {
  if (!raw || !raw.trim()) {
    return { cleaned: '', valid: false, reason: 'Empty company name' };
  }

  // Decode HTML entities first
  let name = raw
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ');

  // Strip leading junk patterns
  name = name.replace(/^\[.*?\]\s*/, '');  // [PDF], [DOC], etc.
  name = name.replace(/^https?:\/\/\S+/, '');  // URLs
  name = name.replace(/^[&+,\s]+/, '');    // leading & or + or comma

  // Strip content inside parentheses or brackets — e.g. "(NW)", "(Pvt)", "(Uganda)"
  name = name.replace(/\s*\([^)]*\)\s*/g, ' ');
  name = name.replace(/\s*\[[^\]]*\]\s*/g, ' ');

  // Strip legal suffixes — must be done BEFORE trailing junk stripping
  // Order matters: strip multi-word first, then single-word
  name = name.replace(/\b(Private Limited|Pvt\.?\s*Ltd\.?|Public Limited Company)\b\.?\s*/gi, '');
  name = name.replace(/\b(Ltd|Limited|Inc|LLC|L\.L\.C|LLP|PLC|Corp|Corporation|Co\.?|NW|Pty|Pvt|S\.A|S\.A\.S|GmbH|B\.V)\b\.?\s*$/gi, '');
  // Also strip if not at end (e.g. "Ltd t/a Something")
  name = name.replace(/\b(Ltd|Limited|Inc|LLC|LLP|PLC|Corp|Corporation|NW|Pty|Pvt)\b\.?\s*/gi, ' ');

  // Strip trailing junk
  name = name.replace(/\s*[-–—|/]\s*$/, '');   // trailing dash, pipe, slash
  name = name.replace(/\s*,\s*$/, '');           // trailing comma
  name = name.replace(/\s*\.\s*$/, '');          // trailing dot (unless abbreviation)
  name = name.replace(/[<>{}[\]]/g, '');         // brackets
  name = name.replace(/\s+/g, ' ').trim();

  // Check length
  if (name.length < 2) {
    return { cleaned: name, valid: false, reason: 'Name too short after cleaning' };
  }
  if (name.length > 100) {
    return { cleaned: name.slice(0, 100), valid: false, reason: 'Name too long — likely a description, not a company name' };
  }

  // Check for obvious non-business names
  const lower = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  if (INVALID_COMPANY_NAMES.has(lower)) {
    return { cleaned: name, valid: false, reason: `"${name}" is not a real business name` };
  }

  // Check for single character or just numbers
  if (/^[a-z0-9]$/.test(lower)) {
    return { cleaned: name, valid: false, reason: 'Single character — not a valid company name' };
  }

  // Names that start with a conjunction or connector — scraped from page nav
  if (/^(&|and |or |the |a |an )/i.test(name.trim())) {
    return { cleaned: name, valid: false, reason: 'Starts with a connector — likely scraped page navigation, not a company name' };
  }

  // Names that contain "list of" — directory pages, not companies
  if (/\blist of\b/i.test(name)) {
    return { cleaned: name, valid: false, reason: '"list of" — this is a directory page, not a company name' };
  }

  // Still contains HTML entities or URL fragments after cleaning
  if (/&#|&[a-z]+;|https?:\/\//i.test(name)) {
    return { cleaned: name, valid: false, reason: 'Contains unclean HTML or URL fragments' };
  }

  return { cleaned: name, valid: true };
}

// ─── Generic email detector ──────────────────────────────────────────────────

const GENERIC_EMAIL_PREFIXES = new Set([
  'info','contact','hello','hi','mail','support','help','admin','office',
  'team','sales','reception','general','webmaster','enquiry','enquiries',
  'bookings','booking','hr','marketing','accounts','billing','feedback',
  'service','media','press','shop','store','news','pr','noreply','no-reply',
  'recruiting','recruitment','jobs','careers','apply',
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

  // Known title prefixes to strip from names and email prefixes
  const TITLE_PREFIXES = /^(dr|prof|mr|mrs|ms|miss|rev|eng|sir|doc)\.*\s*/i;

  // Helper: validate a candidate name token
  const isValidName = (s: string): boolean => {
    const clean = s.replace(TITLE_PREFIXES, '').trim();
    return (
      clean.length >= 2 &&
      clean.length <= 15 &&           // reject concatenated strings like "drsanjaypathare"
      /^[a-zA-Z]+$/.test(clean) &&    // only letters
      !GENERIC_EMAIL_PREFIXES.has(clean.toLowerCase())
    );
  };

  const capitalize = (s: string): string =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  // ── 1. Contact name field ────────────────────────────────────────────────
  if (contactName) {
    const raw = contactName.trim();
    // Split on whitespace, commas, dots
    const parts = raw.split(/[\s,./]+/);
    // Strip titles — find first non-title token
    for (const part of parts) {
      const stripped = part.replace(TITLE_PREFIXES, '').trim();
      if (isValidName(stripped)) {
        return { name: capitalize(stripped), source: 'contact_field' };
      }
    }
    // If no valid part found from splitting, the whole field may be junk — skip
  }

  // ── 2. Email prefix ──────────────────────────────────────────────────────
  if (email && !isGenericEmailAddress(email)) {
    const local = email.split('@')[0]?.toLowerCase() ?? '';

    // Strategy A: dot/underscore/dash separator → first segment
    if (/[._\-]/.test(local)) {
      const parts = local.split(/[._\-]/);
      const first = parts[0]?.replace(TITLE_PREFIXES, '').trim() ?? '';
      if (isValidName(first)) {
        return { name: capitalize(first), source: 'email_prefix' };
      }
    }

    // Strategy B: camelCase split (e.g. "drsanjaypathare" → try splitting on capital letters
    // but since email prefixes are lowercase, detect by title prefix stripping + length check)
    // Strip known title prefixes then check remainder length
    const withoutTitle = local.replace(TITLE_PREFIXES, '').trim();
    if (withoutTitle !== local && withoutTitle.length <= 15 && /^[a-z]+$/.test(withoutTitle)) {
      // e.g. "drsanjay" → "sanjay"
      return { name: capitalize(withoutTitle), source: 'email_prefix' };
    }

    // Strategy C: pure single word that looks like a name
    if (/^[a-z]+$/.test(local) && isValidName(local)) {
      return { name: capitalize(local), source: 'email_prefix' };
    }
  }

  return { name: null, source: 'none' };
}

// ─── Greeting builder ────────────────────────────────────────────────────────
// 3-tier priority — "Hi Sir/Madam" is NEVER used:
//
//   Tier 1: usable first name from contact_name or email prefix  → "Hi [Name],"
//   Tier 2: email exists but prefix is a generic word            → "Hi [CompanyName] team,"
//   Tier 3: no name AND no email (or email prefix also unusable) → null (caller must block)
//
// companyName is required for the Tier-2 team fallback.

export function buildGreeting(
  contactName?: string | null,
  email?: string | null,
  companyName?: string | null,
): string {
  // Tier 1 — real name from contact field or email prefix
  const { name } = extractFirstName(contactName, email);
  if (name) return `Hi ${name},`;

  // Tier 2 — no usable name found → Dear Sir/Madam (no company name)
  return 'Dear Sir/Madam,';
}

/** True when no real first name was found (greeting used company team or "Hi there,") */
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
  if (/hospital|surgical|referral|health complex/.test(n) && !/hotel|lodge|travel/.test(n)) {
    if (!detectedNiche || !/(hospital|healthcare|clinic|medical)/.test(detectedNiche.toLowerCase()))
      return 'hospital';
  }
  if (/pharma|dispensary|chemist|drug store|drug shop/.test(n) && !/hotel|lodge|travel/.test(n)) {
    if (!detectedNiche || !/(pharmacy|dispensary|chemist)/.test(detectedNiche.toLowerCase()))
      return 'pharmacy';
  }
  if (/clinic|dental|medical|health centre|health center/.test(n) && !/hotel|lodge|travel/.test(n)) {
    if (!detectedNiche || !/(healthcare|clinic|medical|hospital)/.test(detectedNiche.toLowerCase()))
      return 'healthcare';
  }
  if (/hotel|resort|inn\b/.test(n) && !/clinic|medical|pharmacy/.test(n)) {
    if (!detectedNiche || !/(hotel|lodge|hospitality)/.test(detectedNiche.toLowerCase()))
      return /lodge|guesthouse/.test(n) ? 'lodge' : 'hotel';
  }
  if (/lodge|guesthouse|guest house/.test(n) && !/clinic|medical|pharmacy/.test(n)) {
    if (!detectedNiche || !/(lodge|hotel|hospitality)/.test(detectedNiche.toLowerCase()))
      return 'lodge';
  }
  if (/travel|tour|safari|agency/.test(n) && !/clinic|hotel/.test(n)) {
    if (!detectedNiche || !/(travel|tour|safari)/.test(detectedNiche.toLowerCase()))
      return 'travel';
  }
  if (/ngo|non.profit|nonprofit|charity|foundation/.test(n)) {
    if (!detectedNiche || !/(ngo|nonprofit|charity)/.test(detectedNiche.toLowerCase()))
      return 'ngo';
  }
  return detectedNiche ?? 'generic';
}

// ─── Context cleaner — strips contact page junk before using as email context ─
// Removes: addresses, phone numbers, email addresses in the text, "CONTACT DETAILS",
// "Contact us for", all-caps lines, lines that are purely numbers/codes.
// Only keeps sentences that describe what the business DOES.

function cleanContextForEmail(raw: string): string | null {
  if (!raw || raw.length < 20) return null;

  // Remove common contact page boilerplate
  const stripped = raw
    .replace(/CONTACT\s+(US|DETAILS?)[^.]*[.\n]/gi, ' ')
    .replace(/contact us for[^.]*\./gi, ' ')
    .replace(/\b\d{6,}\b/g, ' ')               // long numbers (phone, zip, etc.)
    .replace(/\b\d{3}[\s\-]\d{3,4}[\s\-]\d{3,4}\b/g, ' ')  // phone patterns
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, ' ')  // email addresses in text
    .replace(/\b(P\.?O\.?\s*Box|Plot|Street|Road|Avenue|Lane|Drive|Blvd)\b[^.]*\./gi, ' ')
    .replace(/[A-Z\s]{10,}/g, ' ')              // all-caps blocks (navigation, headers)
    .replace(/\s+/g, ' ')
    .trim();

  // Keep only sentences that look like business descriptions
  const sentences = stripped.split(/[.!?]/).filter(s => {
    const l = s.toLowerCase().trim();
    return (
      s.trim().length > 30 &&
      s.trim().length < 250 &&
      !l.includes('cookie') &&
      !l.includes('privacy') &&
      !l.includes('copyright') &&
      !l.includes('all rights reserved') &&
      !l.includes('contact us') &&
      !l.includes('follow us') &&
      !l.includes('subscribe') &&
      (l.includes('we ') || l.includes('our ') || l.includes('provide') ||
       l.includes('offer') || l.includes('speciali') || l.includes('service') ||
       l.includes('product') || l.includes('help') || l.includes('deliver'))
    );
  });

  const result = sentences.slice(0, 2).map(s => s.trim()).join('. ');
  return result.length > 30 ? result.slice(0, 300) : null;
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
  // Strip contact-page junk before using as context
  if (!websiteDesc && companyContext && companyContext.length > 50) {
    websiteDesc = cleanContextForEmail(companyContext);
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
  // email is not available in this async path — pass null (caller overrides via lead.email)
  const greeting = buildGreeting(contactName, null, companyName);

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

  const websiteDesc = companyContext && companyContext.length > 50
    ? cleanContextForEmail(companyContext)
    : null;

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

  // ── Greeting — contact name first, email prefix fallback ─────────────────
  // email not available in sync path — caller re-builds greeting with lead.email if needed
  const greeting = buildGreeting(contactName, null, companyName);

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
