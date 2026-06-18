/**
 * PERSONALIZED EMAIL BUILDER, v10
 * --------------------------------
 * EXACT FORMAT (approved):
 *
 *   Subject:  Why is [Company]'s [department] still [doing X manually]?
 *   Greeting: [Good morning/afternoon/Greetings] [Company] team,
 *
 *   I have seen many [sector] teams your size still tracking [task] on Excel
 *   sheets and Word documents, and [Company] is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro.
 *
 *   Pryro is an ERP that replaces those manual workflows with one unified system
 *   for finance, inventory, HR, and operations. Specifically: [sector fix].
 *
 *   I have 10 minutes free tomorrow afternoon if that works, what do you think?
 *
 *   Alice Umubyeyi, Pryro | 0790038006
 */

import type { ProspectSignals } from './prospect-researcher';
import {
  detectNicheKey,
  isUsableFirstName,
  buildGuaranteedEmail,
} from './prospect-researcher';
import { checkEmailQuality } from './email-quality-checker';

export interface EmailGenerationParams {
  companyName: string;
  niche: string | null;
  location: string | null;
  companyContext?: string | null;
  website?: string | null;
  signals: ProspectSignals;
  senderName: string;
  senderPhone?: string;
  senderTitle?: string;
  senderEmail?: string;
  senderCompany?: string;
  customPainPoint?: string;
  emailIndex?: number;
  // When set, bypasses AI entirely and uses this sentence as the Pryro line.
  // Set from sender_profiles.custom_pryro_sentence.
  customPryroSentence?: string | null;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  model: string;
  personalizationScore: number;
  qualityScore: number;
  qualityPassed: boolean;
  qualityFlagged?: boolean;
  dataSource: 'ai_personalized' | 'ai_industry' | 'template';
}

// --- Greeting -----------------------------------------------------------------
// Time-aware: "Good morning [Company] team," / "Good afternoon [Company] team," / "Greetings [Company] team,"
// Never uses email prefix as a name.
function buildGreetingLine(signals: ProspectSignals): string {
  return signals.greeting.trim();
}

// --- Signature ----------------------------------------------------------------
// Format:
//   Regards,
//   [Name]
//   [Company]
export function buildMultiLineFooter(params: {
  senderName: string;
  senderTitle?: string;
  senderCompany?: string;
  senderPhone?: string;
  senderEmail?: string;
}): string {
  const name    = params.senderName    || 'Alice Umubyeyi';
  const company = params.senderCompany || 'Pryro';
  return `Regards,\n${name}\n${company}`;
}

// --- Department picker --------------------------------------------------------
// --- Subject generation -----------------------------------------------------
// WH-question provocative formats — boss approved.
// Rules: starts with WH word or "I think"/"Don't you", max 10 words,
// ONE pain point, always company name, feels personal and direct.

const SECTOR_PAINS: Record<string, string[]> = {
  pharmacy:     ['stock management', 'inventory', 'payroll'],
  healthcare:   ['payroll', 'patient billing', 'HR'],
  hospital:     ['payroll', 'patient billing', 'HR'],
  hotel:        ['HR', 'supplier invoices', 'payroll'],
  lodge:        ['HR', 'supplier invoices', 'payroll'],
  travel:       ['client billing', 'HR', 'bookings'],
  restaurant:   ['inventory', 'payroll', 'HR'],
  retail:       ['inventory', 'supplier payments', 'payroll'],
  ngo:          ['reporting', 'budgets', 'payroll'],
  construction: ['payroll', 'HR', 'client billing'],
  logistics:    ['fleet management', 'warehouse stock', 'HR'],
  school:       ['payroll', 'HR', 'client billing'],
  banking:      ['HR', 'payroll', 'compliance reporting'],
  accounting:   ['client billing', 'payroll', 'HR'],
  marketing:    ['client invoicing', 'project tracking', 'HR'],
  generic:      ['HR', 'payroll', 'billing'],
};

// 19 WH-based provocative formats — rotate across contacts
// All start with a WH word, "I think", or "Don't you"
// Every format is max 10 words and points at ONE pain
const SUBJECT_FORMATS: Array<(c: string, p: string) => string> = [
  // WHY
  (c, p) => `Why is ${c} still doing ${p} manually?`,
  (c, _) => `Why is ${c}'s HR team still wasting time?`,
  (c, _) => `Why does a company like ${c} still use Excel?`,
  (c, p) => `Why is ${c} not using an ERP for ${p}?`,
  (c, p) => `Why is ${c} still struggling with ${p}?`,
  // HOW
  (c, p) => `How is ${c} managing ${p} right now?`,
  (c, p) => `How much is ${c} losing on manual ${p}?`,
  (c, p) => `How is ${c}'s team handling ${p} every month?`,
  // WHO
  (c, p) => `Who is handling ${p} at ${c} right now?`,
  (c, p) => `Who in ${c} is responsible for fixing ${p}?`,
  // WHAT
  (c, p) => `What is ${c} using for ${p} right now?`,
  (c, p) => `What happens at ${c} when ${p} goes wrong?`,
  // WHEN
  (c, p) => `When will ${c} stop doing ${p} manually?`,
  (c, p) => `When did ${c} last review how ${p} is handled?`,
  // DON'T YOU
  (c, _) => `Don't you think ${c} deserves better than Excel?`,
  (c, p) => `Don't you see ${c}'s team wasting time on ${p}?`,
  // I THINK
  (c, p) => `I think ${c} has a ${p} problem`,
  (c, _) => `I think ${c}'s HR team is wasting hours every week`,
  (c, p) => `I think ${c} is losing money on manual ${p}`,
];

function getSubject(niche: string | null, companyName: string, idx: number): string {
  const key   = detectNicheKey(niche);
  const pains = SECTOR_PAINS[key] ?? SECTOR_PAINS['generic']!;
  const pain  = pains[idx % pains.length]!;
  const fmt   = SUBJECT_FORMATS[idx % SUBJECT_FORMATS.length]!;
  return fmt(companyName, pain);
}

function getDeptPain(niche: string | null): DeptPain {
  const key = detectNicheKey(niche);
  return SECTOR_DEPT[key] ?? SECTOR_DEPT['generic']!;
}

// --- Problem sentence bank ----------------------------------------------------
// Format: "I have seen many [sector] teams your size still tracking [task] on Excel
//          sheets and Word documents, and [Company] is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro."
// Confident observation, not a hedge.

const PROBLEM_BANK: Record<string, Array<(c: string, l: string) => string>> = {
  pharmacy: [
    (c) => `I have seen many pharmacy teams still tracking drug stock and expiry dates on Excel sheets, and ${c} is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro.`,
    (c) => `I have seen many pharmacy businesses tracking billing and stock in separate tools, and ${c} is most likely running the same setup, and it is the first thing most businesses in this sector fix with Pryro.`,
  ],
  healthcare: [
    (c) => `I have seen many healthcare teams still reconciling staff payroll and patient billing manually every month, and ${c} is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro.`,
    (c) => `I have seen many healthcare admin teams tracking HR attendance and patient billing in separate systems, and ${c} is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro.`,
  ],
  hospital: [
    (c) => `I have seen many hospital finance teams unable to get a live view of department spend because HR payroll and procurement sit in separate systems, and ${c} is most likely running the same way, and it is the first thing most businesses in this sector fix with Pryro.`,
    (c) => `I have seen many hospitals where the finance team never has a real-time picture of what departments have actually spent, and ${c} is most likely dealing with the same gap, and it is the first thing most businesses in this sector fix with Pryro.`,
  ],
  hotel: [
    (c) => `I have seen many hotel operations teams spending three to five days every month reconciling rosters, vendor invoices, and payroll because none of it connects, and ${c} is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro.`,
    (c) => `I have seen many hospitality businesses where staff scheduling, vendor billing, and financials each live in a different tool, and ${c} is most likely running the same setup, and it is the first thing most businesses in this sector fix with Pryro.`,
  ],
  lodge: [
    (c) => `I have seen many lodges only finding out their real occupancy margin after month-end because bookings and accounts run separately, and ${c} is most likely in the same position, and it is the first thing most businesses in this sector fix with Pryro.`,
    (c) => `I have seen many lodge operators where bookings and accounts are not connected, making every month-end a manual scramble, and ${c} is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro.`,
  ],
  travel: [
    (c) => `I have seen many travel agencies only knowing the real margin on a booking after the trip ends because commissions and supplier costs live in spreadsheets, and ${c} is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro.`,
    (c) => `I have seen many travel businesses tracking bookings, commissions, and supplier invoices in different tools, and ${c} is most likely running the same setup, and it is the first thing most businesses in this sector fix with Pryro.`,
  ],
  restaurant: [
    (c) => `I have seen many restaurant teams only seeing their real food cost at month-end because kitchen stock and daily sales are not in the same system, and ${c} is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro.`,
    (c) => `I have seen many restaurant operations where stock and sales run separately so food cost problems only show up after the margin is already gone, and ${c} is most likely in the same situation, and it is the first thing most businesses in this sector fix with Pryro.`,
  ],
  retail: [
    (c) => `I have seen many retail teams catching stockouts only when the shelf is already empty because inventory and live sales data are not connected, and ${c} is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro.`,
    (c) => `I have seen many retail businesses where inventory and sales run in different systems, turning stockout surprises into a regular cost, and ${c} is most likely running the same setup, and it is the first thing most businesses in this sector fix with Pryro.`,
  ],
  ngo: [
    (c) => `I have seen many NGO finance teams spending close to a week on donor compliance reports because field expenses and grant budgets live in separate spreadsheets, and ${c} is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro.`,
    (c) => `I have seen many NGOs where the finance team spends more time reconciling data than reporting on impact because grants and field costs don't connect, and ${c} is most likely in the same position, and it is the first thing most businesses in this sector fix with Pryro.`,
  ],
  construction: [
    (c) => `I have seen many construction finance teams only finding out about cost overruns after the margin is already gone because project budgets and procurement run separately, and ${c} is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro.`,
    (c) => `I have seen many construction businesses where project management and financial tracking don't share the same data, making budget-to-actuals always a backward exercise, and ${c} is most likely running the same way, and it is the first thing most businesses in this sector fix with Pryro.`,
  ],
  logistics: [
    (c) => `I have seen many logistics teams spending days at month-end reconciling driver payroll, trip logs, and client billing because none of it connects, and ${c} is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro.`,
    (c) => `I have seen many logistics operations where driver records and client invoicing are not connected, letting billing errors build up quietly every month, and ${c} is most likely in the same situation, and it is the first thing most businesses in this sector fix with Pryro.`,
  ],
  school: [
    (c) => `I have seen many school finance teams spending two weeks every term reconciling fee collection and staff payroll because the two systems don't connect, and ${c} is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro.`,
    (c) => `I have seen many schools where fee records and payroll run in different systems, turning term-end into a reconciliation sprint, and ${c} is most likely running the same setup, and it is the first thing most businesses in this sector fix with Pryro.`,
  ],
  generic: [
    (c) => `I have seen many businesses still running finance, HR, and operations in separate tools, with the team spending days every month moving data that should flow automatically, and ${c} is most likely doing the same, and it is the first thing most businesses in this sector fix with Pryro.`,
    (c) => `I have seen many businesses where finance, HR, and operations don't share the same data, and the coordination overhead keeps growing quietly, and ${c} is most likely in the same position, and it is the first thing most businesses in this sector fix with Pryro.`,
    (c) => `I have seen many businesses still managing back-office operations manually across disconnected tools, and ${c} is most likely running the same setup, and it is the first thing most businesses in this sector fix with Pryro.`,
  ],
};

// --- Pryro solution bank ------------------------------------------------------
// Format: "Pryro is an ERP that [specific sector fix]"
// No commission. No referral. Just the outcome.
const PRYRO_BANK: Record<string, string[]> = {
  pharmacy: [
    'Pryro is an ERP that connects your drug stock, billing, and payroll into one live platform so expiry losses and billing errors surface before the end of the month',
    'Pryro is an ERP that links drug stock, supplier invoicing, and HR payroll so your team catches expiry and billing problems in real time, not at the end of the month',
  ],
  healthcare: [
    'Pryro is an ERP that connects HR attendance and patient billing into one platform so your admin team reconciles both from one screen instead of two separate systems',
    'Pryro is an ERP that links staff payroll and patient billing so month end takes minutes instead of days',
  ],
  hospital: [
    "Pryro is an ERP that connects department budgets and HR payroll so your finance team sees live spend against approved limits before decisions are made, not after",
    'Pryro is an ERP that gives your CFO real-time budget versus actuals visibility by connecting payroll and department procurement in one system',
  ],
  hotel: [
    'Pryro is an ERP that connects staff scheduling, vendor billing, and financial management so month end reconciliation drops from five days to same day',
    'Pryro is an ERP that links housekeeping rosters, vendor invoices, and payroll so your ops and accounts teams stop moving numbers between tools every month',
  ],
  lodge: [
    'Pryro is an ERP that connects bookings, staff costs, and accounts so your real occupancy margin is visible before month end instead of after',
    'Pryro is an ERP that links your booking records and accounts so month end becomes a five minute check instead of a multi-day exercise',
  ],
  travel: [
    'Pryro is an ERP that connects bookings, commissions, and supplier invoicing so your margin on every deal is visible before the trip ends',
    "Pryro is an ERP that links CRM and Financial Management so your P&L reflects this week's deals in real time",
  ],
  restaurant: [
    'Pryro is an ERP that connects kitchen stock and daily sales so food cost is a live number your team sees every morning, not an end of month surprise',
    'Pryro is an ERP that links Inventory Management and Financial Management so food cost variance shows up the day it happens',
  ],
  retail: [
    'Pryro is an ERP that connects inventory, reorder points, and live sales so a stockout triggers an alert in the system, not an empty shelf in your store',
    'Pryro is an ERP that links Inventory Management and sales data so your team gets a reorder warning before the shelf runs out',
  ],
  ngo: [
    'Pryro is an ERP that connects grant budgets, field expenses, and payroll so donor compliance reports pull together in hours instead of a week',
    'Pryro is an ERP that links Financial Management and HR Payroll so your finance team reports on impact instead of reconciling spreadsheets',
  ],
  construction: [
    'Pryro is an ERP that connects project budgets, contractor payroll, and procurement so cost overruns show up before they reach the P&L',
    'Pryro is an ERP that links Project Management and Financial Management so your team sees budget versus actuals in real time, not at month end',
  ],
  logistics: [
    'Pryro is an ERP that connects driver payroll, trip logs, and client billing so month end reconciliation drops from days to hours',
    'Pryro is an ERP that links HR Payroll and Financial Management so driver payroll and client invoicing always come from the same numbers',
  ],
  school: [
    "Pryro is an ERP that connects fee collection and staff payroll so your bursar's numbers balance automatically with no two week reconciliation sprint",
    'Pryro is an ERP that links fee registers and HR Payroll so term end becomes a one day check instead of a multi-week exercise',
  ],
  generic: [
    'Pryro is an ERP that replaces those manual workflows and fragmented tools with one unified system for finance, inventory, HR, and operations',
    'Pryro is an ERP that connects Financial Management, Inventory, HR and Payroll, and CRM into one platform so your team runs the business instead of managing tools',
  ],
};

function getProblem(niche: string | null, companyName: string, _location: string | null, idx: number): string {
  const key = detectNicheKey(niche);
  const bank = PROBLEM_BANK[key] ?? PROBLEM_BANK['generic']!;
  // Problem bank functions now only take (company), location no longer used
  return (bank[idx % bank.length] as (c: string, l: string) => string)(companyName, '');
}

function getPryro(niche: string | null, idx: number): string {
  const key = detectNicheKey(niche);
  const bank = PRYRO_BANK[key] ?? PRYRO_BANK['generic']!;
  // Return as-is, no commission appended
  return bank[idx % bank.length]!;
}

// --- CTA builder - all 4 slots end with "what do you think?" ----------------
function buildCTA(emailIndex: number): string {
  const slots = [
    'I have 10 minutes free Tuesday or Wednesday if that works, what do you think?',
    'I am free for a quick call Thursday or Friday this week, what do you think?',
    'I have 10 minutes tomorrow afternoon if that works, what do you think?',
    'Could we connect for 10 minutes this week, what do you think?',
  ];
  return slots[emailIndex % slots.length]!;
}

// --- Hyphen / dash stripper --------------------------------------------------
// Runs on every generated body before it is returned.
// Removes hyphens, en dashes, em dashes that slip through from AI or templates.
function stripDashes(text: string): string {
  return text
    // em dash and en dash → comma space
    .replace(/\s*[—–]\s*/g, ', ')
    // hyphenated compound words used in our copy → plain words
    .replace(/\bmonth-end\b/gi, 'month end')
    .replace(/\bmonth-End\b/gi, 'month end')
    .replace(/\bbudget-to-actuals\b/gi, 'budget versus actuals')
    .replace(/\bday-to-day\b/gi, 'day to day')
    .replace(/\breal-time\b/gi, 'real time')
    .replace(/\bback-office\b/gi, 'back office')
    .replace(/\bend-of-month\b/gi, 'end of month')
    .replace(/\bterm-end\b/gi, 'term end')
    .replace(/\bsame-day\b/gi, 'same day')
    .replace(/\bone-day\b/gi, 'one day')
    .replace(/\btwo-week\b/gi, 'two week')
    .replace(/\bfive-minute\b/gi, 'five minute')
    .replace(/\bfive-day\b/gi, 'five day')
    .replace(/\bmulti-day\b/gi, 'multi day')
    .replace(/\bmulti-week\b/gi, 'multi week')
    .replace(/\bno-reply\b/gi, 'no reply')
    .replace(/\bno-repeat\b/gi, 'no repeat')
    // any remaining standalone hyphen between words → space
    .replace(/(\w)-(\w)/g, '$1 $2');
}

// --- Email assembler ----------------------------------------------------------

function assembleEmail(params: {
  greeting: string;
  problem: string;
  pryro: string;
  footer: string;
  subject: string;
  emailIndex?: number;
}): { subject: string; body: string } {
  const { greeting, problem, pryro, footer, subject } = params;
  const idx = params.emailIndex ?? 0;

  const cta = buildCTA(idx);

  const body = stripDashes(`${greeting}

${problem}

${pryro}

${cta}

${footer}`);

  return { subject: stripDashes(subject), body };
}

// --- AI caller ----------------------------------------------------------------

interface AIProvider { provider: string; api_key: string; active_model: string; }

async function callAI(p: AIProvider, system: string, user: string): Promise<string> {
  const reqBody = { temperature: 0.7, max_tokens: 100 };
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  async function attempt(): Promise<string> {
    if (p.provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.api_key}` },
        body: JSON.stringify({ model: p.active_model || 'gpt-4o-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...reqBody }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw Object.assign(new Error(`OpenAI ${r.status}`), { status: r.status });
      return (await r.json()).choices[0].message.content;
    }
    if (p.provider === 'groq') {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.api_key}` },
        body: JSON.stringify({ model: p.active_model || 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...reqBody }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw Object.assign(new Error(`Groq ${r.status}`), { status: r.status });
      return (await r.json()).choices[0].message.content;
    }
    if (p.provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': p.api_key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: p.active_model || 'claude-3-5-haiku-20241022', max_tokens: 100, system, messages: [{ role: 'user', content: user }], temperature: 0.6 }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw Object.assign(new Error(`Anthropic ${r.status}`), { status: r.status });
      return (await r.json()).content[0].text;
    }
    if (p.provider === 'gemini') {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${p.active_model || 'gemini-1.5-flash'}:generateContent?key=${p.api_key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: system + '\n\n' + user }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 100 } }),
          signal: AbortSignal.timeout(12000) }
      );
      if (!r.ok) throw Object.assign(new Error(`Gemini ${r.status}`), { status: r.status });
      return (await r.json()).candidates[0].content.parts[0].text;
    }
    if (p.provider === 'mistral') {
      const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.api_key}` },
        body: JSON.stringify({ model: p.active_model || 'mistral-small', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...reqBody }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw Object.assign(new Error(`Mistral ${r.status}`), { status: r.status });
      return (await r.json()).choices[0].message.content;
    }
    throw new Error(`Unknown provider: ${p.provider}`);
  }

  let lastError: Error = new Error('Unknown');
  for (let n = 0; n < 3; n++) {
    try { return await attempt(); }
    catch (err: any) {
      lastError = err;
      if (err?.status === 429) { await wait((Math.pow(2, n + 1) + n) * 1000); continue; }
      throw err;
    }
  }
  throw lastError;
}

// --- AI prompt ----------------------------------------------------------------
// AI writes the Pryro solution sentence (WITHOUT commission, that gets appended by code).

function buildAISystemPrompt(companyName: string, niche: string | null, companyContext?: string | null, emailIndex?: number): string {
  const ctxHint = companyContext
    ? `\nWhat this company does: "${companyContext.slice(0, 180)}"\nUse this context to make both the subject and Pryro sentence specific to their actual operation.`
    : '';

  // Rotate the formula hint so subjects vary naturally across a batch.
  // These are the three approved formulas from the boss.
  // The AI picks whichever fits the sector - Excel is only appropriate for sectors
  // where spreadsheet habits are realistic (retail, restaurant, logistics, school,
  // construction, travel, hotel, lodge). For clinical/regulated sectors (hospital,
  // healthcare, pharmacy, NGO) the AI should avoid mentioning Excel and use
  // the "Why is..." or "As a big company like [Company]..." formulas instead.
  const formulaHints = [
    `Use Format 0: "[Company], still doing [pain] on Excel?"`,
    `Use Format 1: "I always wonder why [Company] uses Excel for [pain]"`,
    `Use Format 2: "Why is [Company] not using an ERP for [pain]?"`,
    `Use Format 3: "[Company], is [pain] still done manually?"`,
    `Use Format 4: "A company like [Company] still using Excel for [pain]?"`,
  ];
  const formulaHint = formulaHints[(emailIndex ?? 0) % formulaHints.length]!;

  return `You write cold email content for Pryro (pryro.com), an ERP platform.

Pryro modules: Financial Management, Inventory Management, HR & Payroll, Project Management, CRM, AI Analytics.
Company: "${companyName}"
Sector: ${niche || 'business'}${ctxHint}

Your job is to write TWO things:

1. SUBJECT LINE - pick ONE pain point for this sector and write it using one of the five formats below. Rotate format based on emailIndex. Max 8 words. ONE issue only. Must feel like a human typed it.

   Format 0: "[Company], still doing [pain] on Excel?"
   Format 1: "I always wonder why [Company] uses Excel for [pain]"
   Format 2: "Why is [Company] not using an ERP for [pain]?"
   Format 3: "[Company], is [pain] still done manually?"
   Format 4: "A company like [Company] still using Excel for [pain]?"

   Pain points by sector:
   healthcare/hospital: staff payroll, patient billing, staff scheduling
   pharmacy: stock expiry, inventory tracking, supplier orders
   hotel/lodge: staff rosters, supplier invoices, occupancy reporting
   travel: client bookings, commission management, invoice tracking
   ngo: donor reporting, budget tracking, project management
   logistics: fleet tracking, driver payroll, delivery management
   retail: inventory management, supplier payments, staff scheduling
   construction: project budgets, contractor payroll, procurement records
   school: fee collection, payroll processing, student records
   generic: payroll, billing, operations

   ${formulaHint}

   Rules: replace [Company] with exactly ${companyName}, [pain] = 2-3 words max, no hyphens, under 8 words total, question mark only where format requires it.

2. PRYRO SENTENCE - one sentence starting with "Pryro is an ERP that" describing the fix for that SAME single department pain.
   - Name at least one Pryro module
   - Describe a concrete operational outcome for that one department
   - Under 35 words
   - No hyphens, no commission, no referral, no buzzwords (streamline, leverage, empower, optimize, seamless, innovative, robust)

OUTPUT FORMAT (exactly, no extra text):
SUBJECT: [your subject line]
PRYRO: [your Pryro sentence]`;
}

function buildAIUserPrompt(companyName: string, niche: string | null, customPainPoint?: string | null): string {
  const focus = customPainPoint
    ? `Specific problem to reference: ${customPainPoint}`
    : `Focus on the biggest daily operational friction for a ${niche || 'business'}.`;
  return `${focus}\n\nWrite the SUBJECT and PRYRO lines now:`;
}

function parseAIResponse(raw: string, fallbackSubject: string): { subject: string | null; pryro: string | null } {
  if (!raw) return { subject: null, pryro: null };

  const subjectMatch = raw.match(/^SUBJECT:\s*(.+?)(?:\n|$)/im);
  const pryroMatch   = raw.match(/^PRYRO:\s*(.+?)(?:\n|$)/im);

  const rawSubject = subjectMatch?.[1]?.trim().replace(/^["'`]|["'`]$/g, '').trim() ?? null;
  const rawPryro   = pryroMatch?.[1]?.trim().replace(/^["'`]|["'`]$/g, '').trim() ?? null;

  // Validate subject: non-empty, reasonable length, contains company name reference
  const subject = (rawSubject && rawSubject.length >= 10 && rawSubject.length <= 100)
    ? rawSubject
    : null;

  // Validate Pryro sentence
  const pryro = (() => {
    if (!rawPryro || rawPryro.length < 20 || rawPryro.length > 280) return null;
    if (!rawPryro.toLowerCase().startsWith('pryro is an erp that')) return null;
    const banned = ['commission', 'referral', 'percent', '20-30', '20\u201330',
      'free trial', 'dear sir', 'best regards', 'streamline', 'leverage',
      'empower', 'optimize', 'seamlessly', 'innovative', 'robust', 'scalable'];
    if (banned.some(b => rawPryro.toLowerCase().includes(b))) return null;
    return rawPryro;
  })();

  return { subject, pryro };
}

// Keep for backward compat - used by some fallback paths
function cleanAISentence(raw: string): string | null {
  return parseAIResponse(raw, '').pryro;
}

// --- Follow-up prompt ---------------------------------------------------------

export function buildFollowUpPrompt(
  signals: ProspectSignals,
  originalSubject: string,
  followUpNumber: 1 | 2 | 3,
  senderFooter: string,
): string {
  return `Follow-up #${followUpNumber} for Pryro ERP outreach.
Company: ${signals.companyName} | Sector: ${signals.niche || 'business'}
Greeting: ${signals.greeting}
Max words: ${followUpNumber === 1 ? 50 : followUpNumber === 2 ? 40 : 30}
CTA: Propose two specific days, e.g. "I have 10 minutes free Tuesday or Wednesday if that works, what do you think?"
Footer (copy VERBATIM, three lines):
${senderFooter}
Rules: mention Pryro, different angle, NO commission, signature must be exactly three lines: "Regards," then name then company.
FORMAT:
SUBJECT: Re: ${originalSubject}
BODY:
[greeting]
[new angle + Pryro]
[CTA with specific time]
${senderFooter}`;
}

// --- Main export --------------------------------------------------------------

export async function buildPersonalizedEmail(
  params: EmailGenerationParams,
  aiProvider: AIProvider | null,
): Promise<GeneratedEmail> {
  const { companyName, niche, location, signals } = params;
  const idx = params.emailIndex ?? 0;

  const greeting      = buildGreetingLine(signals);
  const fallbackSubj  = getSubject(niche, companyName, idx);   // used only if AI fails
  const problem       = getProblem(niche, companyName, location, idx);
  const footer        = buildMultiLineFooter({
    senderName:    params.senderName,
    senderTitle:   params.senderTitle,
    senderCompany: params.senderCompany || 'Pryro',
    senderPhone:   params.senderPhone,
    senderEmail:   params.senderEmail,
  });

  console.log(`[EmailBuilder] company="${companyName}" | niche=${niche} | ai=${!!aiProvider} | customPryro=${!!params.customPryroSentence}`);

  // -- Custom Pryro sentence from profile, bypasses AI entirely ------------
  const customPryro = params.customPryroSentence?.trim() || null;
  if (customPryro) {
    const pryro = customPryro.toLowerCase().startsWith('pryro is an erp that')
      ? customPryro
      : `Pryro is an ERP that ${customPryro.replace(/^pryro\s*/i, '')}`;
    const { subject: s, body } = assembleEmail({ greeting, problem, pryro, footer, subject: fallbackSubj, emailIndex: idx });
    const quality = checkEmailQuality({ subject: s, body, companyName, externalPersonalizationScore: signals.personalizationScore });
    return {
      subject: s, body,
      model: 'custom_pryro',
      personalizationScore: quality.personalizationScore,
      qualityScore: quality.score,
      qualityPassed: true,
      dataSource: 'ai_industry',
    };
  }

  // -- AI writes subject + Pryro sentence -----------------------------------
  if (aiProvider) {
    let aiSubject: string | null = null;
    let aiPryro:   string | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const sys = buildAISystemPrompt(companyName, niche, params.companyContext, idx);
        const usr = buildAIUserPrompt(companyName, niche, params.customPainPoint);
        const raw = await callAI(aiProvider, sys, usr);
        const parsed = parseAIResponse(raw, fallbackSubj);
        aiSubject = parsed.subject;
        aiPryro   = parsed.pryro;
        console.log(`[EmailBuilder] AI attempt ${attempt}: subject="${aiSubject ?? 'NONE'}" pryro="${aiPryro ? aiPryro.slice(0, 50) + '...' : 'NONE'}"`);
        if (aiPryro) break; // subject is nice-to-have; pryro is required
      } catch (err: any) {
        console.warn(`[EmailBuilder] AI attempt ${attempt} failed: ${err?.message}`);
      }
    }

    if (aiPryro) {
      // Use AI subject if valid, otherwise fall back to bank subject
      const subject = aiSubject ?? fallbackSubj;
      const { subject: s, body } = assembleEmail({ greeting, problem, pryro: aiPryro, footer, subject, emailIndex: idx });
      const quality = checkEmailQuality({ subject: s, body, companyName, externalPersonalizationScore: signals.personalizationScore });
      if (quality.passed) {
        return {
          subject: s, body,
          model: `${aiProvider.provider}/${aiProvider.active_model}`,
          personalizationScore: quality.personalizationScore,
          qualityScore: quality.score,
          qualityPassed: true,
          dataSource: signals.personalizationScore >= 65 ? 'ai_personalized' : 'ai_industry',
        };
      }
    }
  }

  // -- Sector bank fallback (no AI or AI failed quality gate) ---------------
  const pryro = getPryro(niche, idx);
  const { subject: fs, body: fb } = assembleEmail({ greeting, problem, pryro, footer, subject: fallbackSubj, emailIndex: idx });
  const fq = checkEmailQuality({ subject: fs, body: fb, companyName, externalPersonalizationScore: signals.personalizationScore });

  return {
    subject: fs, body: fb,
    model: aiProvider ? `${aiProvider.provider}/${aiProvider.active_model}` : 'template',
    personalizationScore: fq.personalizationScore,
    qualityScore: fq.score,
    qualityPassed: fq.passed,
    qualityFlagged: !!aiProvider,
    dataSource: 'template',
  };
}
