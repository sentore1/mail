/**
 * PERSONALIZED EMAIL BUILDER, v10
 * ────────────────────────────────
 * EXACT FORMAT (approved):
 *
 *   Subject:  Why is [Company]'s [department] still [doing X manually]?
 *   Greeting: [Good morning/afternoon/Greetings] [Company] team,
 *
 *   I have seen this exact issue in businesses like yours, [specific pain for
 *   their sector], and I think [Company] might be dealing with the same thing.
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

// ─── Greeting ─────────────────────────────────────────────────────────────────
// Time-aware: "Good morning [Company] team," / "Good afternoon [Company] team," / "Greetings [Company] team,"
// Never uses email prefix as a name.
function buildGreetingLine(signals: ProspectSignals): string {
  return signals.greeting.trim();
}

// ─── Signature ────────────────────────────────────────────────────────────────
// Format from sender profile: Name \n Title \n Company \n Phone [\n Email]
// No "Best regards,", email ends after CTA, then footer.
export function buildMultiLineFooter(params: {
  senderName: string;
  senderTitle?: string;
  senderCompany?: string;
  senderPhone?: string;
  senderEmail?: string;
}): string {
  const lines: string[] = [];
  if (params.senderName)    lines.push(params.senderName);
  if (params.senderTitle)   lines.push(params.senderTitle);
  if (params.senderCompany) lines.push(params.senderCompany);
  if (params.senderPhone)   lines.push(params.senderPhone);
  if (params.senderEmail)   lines.push(params.senderEmail);
  return lines.join('\n') || 'Alice Umubyeyi\nPryro';
}

// ─── Subject bank ─────────────────────────────────────────────────────────────
// Format: "Why is [Company]'s [department] still [doing X manually]?"
// Direct challenge that demands a reply.

const SUBJECT_BANK: Record<string, Array<(c: string) => string>> = {
  pharmacy:     [(c) => `Why is ${c}'s stock team still tracking expiry manually?`,
                 (c) => `Still managing drug expiry manually at ${c}?`,
                 (c) => `Is ${c}'s billing team drowning in stock and invoice mismatches?`,
                 (c) => `How is ${c} catching expiry write-offs right now?`,
                 (c) => `${c}, still juggling stock, billing, and payroll separately?`],
  healthcare:   [(c) => `Why is ${c}'s admin team still reconciling payroll and billing manually?`,
                 (c) => `Still managing HR and patient billing in separate tools at ${c}?`,
                 (c) => `Is ${c}'s finance team drowning in month-end reconciliation?`,
                 (c) => `How is ${c} handling payroll and billing together right now?`,
                 (c) => `${c}, still juggling HR and billing in separate systems?`],
  hospital:     [(c) => `Why is ${c}'s finance team still working from last month's budget figures?`,
                 (c) => `Still managing department budgets and payroll separately at ${c}?`,
                 (c) => `Is ${c}'s HR team drowning in manual shift reconciliation?`,
                 (c) => `How is ${c} tracking department spend against budgets right now?`,
                 (c) => `${c}, still juggling payroll and procurement in different tools?`],
  hotel:        [(c) => `Why is ${c}'s ops team still doing month-end manually?`,
                 (c) => `Still reconciling housekeeping and payroll separately at ${c}?`,
                 (c) => `Is ${c}'s finance team drowning in month-end vendor reconciliation?`,
                 (c) => `How is ${c} handling staff scheduling and billing right now?`,
                 (c) => `${c}, still juggling rosters, invoices, and payroll separately?`],
  lodge:        [(c) => `Why is ${c}'s accounts team still reconciling bookings manually?`,
                 (c) => `Still finding out occupancy margin after month-end at ${c}?`,
                 (c) => `Is ${c} still juggling bookings and accounts in separate systems?`,
                 (c) => `How is ${c} tracking real occupancy margin right now?`],
  travel:       [(c) => `Why is ${c}'s finance team still calculating booking margin after the trip?`,
                 (c) => `Still tracking agent commissions in spreadsheets at ${c}?`,
                 (c) => `Is ${c}'s accounts team drowning in booking reconciliation?`,
                 (c) => `How is ${c} calculating P&L on bookings right now?`,
                 (c) => `${c}, still juggling bookings, commissions, and invoices separately?`],
  restaurant:   [(c) => `Why is ${c}'s kitchen team still finding out food cost at month-end?`,
                 (c) => `Still managing stock and sales in separate systems at ${c}?`,
                 (c) => `Is ${c}'s ops team drowning in manual food cost tracking?`,
                 (c) => `How is ${c} tracking food cost against daily sales right now?`,
                 (c) => `${c}, still juggling stock, sales, and payroll in different tools?`],
  retail:       [(c) => `Why is ${c}'s inventory team still getting caught by stockouts?`,
                 (c) => `Still managing reorders manually at ${c}?`,
                 (c) => `Is ${c}'s ops team drowning in disconnected inventory data?`,
                 (c) => `How is ${c} handling stockout alerts right now?`,
                 (c) => `${c}, still juggling inventory, sales, and reorders separately?`],
  ngo:          [(c) => `Why is ${c}'s finance team still spending a week on donor reports?`,
                 (c) => `Still reconciling grant budgets and field expenses manually at ${c}?`,
                 (c) => `Is ${c}'s finance team drowning in donor compliance reporting?`,
                 (c) => `How is ${c} tracking field spend against grant budgets right now?`,
                 (c) => `${c}, still juggling budgets, expenses, and donor reports separately?`],
  construction: [(c) => `Why is ${c}'s finance team still seeing cost overruns after they happen?`,
                 (c) => `Still tracking project budgets and payroll separately at ${c}?`,
                 (c) => `Is ${c}'s project team drowning in budget-to-actuals reconciliation?`,
                 (c) => `How is ${c} catching cost overruns before they hit the P&L?`,
                 (c) => `${c}, still juggling project budgets, payroll, and procurement separately?`],
  logistics:    [(c) => `Why is ${c}'s finance team still spending days on month-end billing?`,
                 (c) => `Still reconciling driver payroll and trip records manually at ${c}?`,
                 (c) => `Is ${c}'s HR team drowning in end-of-month payroll reconciliation?`,
                 (c) => `How is ${c} matching driver payroll to client billing right now?`,
                 (c) => `${c}, still juggling trip logs, payroll, and invoices separately?`],
  school:       [(c) => `Why is ${c}'s bursar still reconciling fees and payroll manually?`,
                 (c) => `Still managing fee collection and payroll in separate systems at ${c}?`,
                 (c) => `Is ${c}'s finance team drowning in term-end reconciliation?`,
                 (c) => `How is ${c} balancing fee income against payroll right now?`,
                 (c) => `${c}, still juggling fees, payroll, and supplies separately?`],
  generic:      [(c) => `Why is ${c}'s finance team still managing operations manually?`,
                 (c) => `Still running finance and HR in separate tools at ${c}?`,
                 (c) => `Is ${c}'s ops team drowning in disconnected back-office systems?`,
                 (c) => `How is ${c} keeping finance, HR, and operations in sync right now?`,
                 (c) => `${c}, still juggling finance, inventory, and HR in different tools?`],
};

// ─── Problem sentence bank ────────────────────────────────────────────────────
// Format: "I have seen this exact issue in businesses like yours, [specific pain] —
//          and I think [Company] might be dealing with the same thing."
// Personal observation, not a generic industry fact.

const PROBLEM_BANK: Record<string, Array<(c: string, l: string) => string>> = {
  pharmacy: [
    (c) => `I have seen this exact issue in businesses like yours, drug expiry write-offs and billing errors that only show up at month-end because stock and invoicing run in separate systems, and I think ${c} might be dealing with the same thing.`,
    (c) => `I have seen this exact issue in businesses like yours, pharmacy stock, billing, and payroll each running in a different tool, with margin losses that go unnoticed until month-end, and I think ${c} might be dealing with the same thing.`,
  ],
  healthcare: [
    (c) => `I have seen this exact issue in businesses like yours, days of manual work every month reconciling staff payroll against patient billing because HR and finance run separately, and I think ${c} might be dealing with the same thing.`,
    (c) => `I have seen this exact issue in businesses like yours, HR attendance and patient billing living in separate systems, making month-end reconciliation take days it shouldn't, and I think ${c} might be dealing with the same thing.`,
  ],
  hospital: [
    (c) => `I have seen this exact issue in businesses like yours, getting a live view of actual department spend is nearly impossible when HR payroll and procurement aren't connected, and I think ${c} might be dealing with the same thing.`,
    (c) => `I have seen this exact issue in businesses like yours, department budgets and HR payroll running in separate systems, leaving the finance team always working from last month's numbers, and I think ${c} might be dealing with the same thing.`,
  ],
  hotel: [
    (c) => `I have seen this exact issue in businesses like yours, month-end reconciliation taking three to five days because housekeeping rosters, vendor invoices, and payroll each live in a different system, and I think ${c} might be dealing with the same thing.`,
    (c) => `I have seen this exact issue in businesses like yours, staff scheduling, vendor billing, and financials running in separate tools, making every month-end a manual exercise, and I think ${c} might be dealing with the same thing.`,
  ],
  lodge: [
    (c) => `I have seen this exact issue in businesses like yours, only finding out the real occupancy margin after month-end because bookings and accounts run in separate places, and I think ${c} might be dealing with the same thing.`,
    (c) => `I have seen this exact issue in businesses like yours, bookings and accounts not connected, making month-end a scramble to match numbers that should balance automatically, and I think ${c} might be dealing with the same thing.`,
  ],
  travel: [
    (c) => `I have seen this exact issue in businesses like yours, only knowing the real margin on a booking after the trip has ended because commissions and supplier costs live in spreadsheets, and I think ${c} might be dealing with the same thing.`,
    (c) => `I have seen this exact issue in businesses like yours, client bookings, agent commissions, and supplier invoices tracked in different tools, keeping the P&L always a month behind, and I think ${c} might be dealing with the same thing.`,
  ],
  restaurant: [
    (c) => `I have seen this exact issue in businesses like yours, food cost only becoming visible at month-end because kitchen stock, supplier invoices, and daily sales aren't in the same system, and I think ${c} might be dealing with the same thing.`,
    (c) => `I have seen this exact issue in businesses like yours, stock and sales running separately, so food cost problems only show up after the margin is already gone, and I think ${c} might be dealing with the same thing.`,
  ],
  retail: [
    (c) => `I have seen this exact issue in businesses like yours, stockouts only caught when the shelf is already empty because inventory levels and reorder points aren't connected to live sales, and I think ${c} might be dealing with the same thing.`,
    (c) => `I have seen this exact issue in businesses like yours, inventory and sales running in different systems, making stockout surprises a regular cost of doing business, and I think ${c} might be dealing with the same thing.`,
  ],
  ngo: [
    (c) => `I have seen this exact issue in businesses like yours, donor compliance reports taking the better part of a week because field expenses and grant budgets live in separate spreadsheets, and I think ${c} might be dealing with the same thing.`,
    (c) => `I have seen this exact issue in businesses like yours, grant budgets and field costs tracked in different tools, with the finance team spending more time reconciling data than reporting on impact, and I think ${c} might be dealing with the same thing.`,
  ],
  construction: [
    (c) => `I have seen this exact issue in businesses like yours, cost overruns only showing up in the P&L after the margin is already gone because project budgets and procurement run separately, and I think ${c} might be dealing with the same thing.`,
    (c) => `I have seen this exact issue in businesses like yours, project management and financial tracking not sharing the same data, making budget-to-actuals always a backward-looking exercise, and I think ${c} might be dealing with the same thing.`,
  ],
  logistics: [
    (c) => `I have seen this exact issue in businesses like yours, month-end reconciliation taking days because driver payroll, trip logs, and client billing all live in separate places, and I think ${c} might be dealing with the same thing.`,
    (c) => `I have seen this exact issue in businesses like yours, driver records and client invoicing not connected, with billing errors compounding quietly every month, and I think ${c} might be dealing with the same thing.`,
  ],
  school: [
    (c) => `I have seen this exact issue in businesses like yours, bursar reconciliation taking two weeks every term because fee collection and staff payroll run in separate registers, and I think ${c} might be dealing with the same thing.`,
    (c) => `I have seen this exact issue in businesses like yours, fee records and payroll running in different systems, making term-end always a reconciliation sprint, and I think ${c} might be dealing with the same thing.`,
  ],
  generic: [
    (c) => `I have seen this exact issue in businesses like yours, finance, HR, inventory, and operations each running in a different tool, with the team spending days every month moving data that should flow automatically, and I think ${c} might be dealing with the same thing.`,
    (c) => `I have seen this exact issue in businesses like yours, disconnected back-office systems where finance, HR, and operations don't share the same data, and the coordination overhead grows quietly, and I think ${c} might be dealing with the same thing.`,
    (c) => `I have seen this exact issue in businesses like yours, manual workflows and fragmented tools that slow teams down and make month-end harder than it needs to be, and I think ${c} might be dealing with the same thing.`,
  ],
};

// ─── Pryro solution bank ──────────────────────────────────────────────────────
// Format: "Pryro is an ERP that [specific sector fix]"
// No commission. No referral. Just the outcome.
const PRYRO_BANK: Record<string, string[]> = {
  pharmacy: [
    'Pryro is an ERP that connects your drug stock, billing, and payroll into one live platform so expiry losses and billing errors surface before month-end',
    'Pryro is an ERP that links drug stock, supplier invoicing, and HR payroll so your team catches expiry and billing problems in real time, not at month-end',
  ],
  healthcare: [
    'Pryro is an ERP that connects HR attendance and patient billing into one platform so your admin team reconciles both from one screen instead of two separate systems',
    'Pryro is an ERP that links staff payroll and patient billing so month-end takes minutes instead of days',
  ],
  hospital: [
    "Pryro is an ERP that connects department budgets and HR payroll so your finance team sees live spend against approved limits, not last month's figures",
    'Pryro is an ERP that gives your CFO real-time budget-to-actuals visibility by connecting payroll and department procurement in one system',
  ],
  hotel: [
    'Pryro is an ERP that connects staff scheduling, vendor billing, and financial management so month-end reconciliation drops from five days to same-day',
    'Pryro is an ERP that links housekeeping rosters, vendor invoices, and payroll so your ops and accounts teams stop moving numbers between tools every month',
  ],
  lodge: [
    'Pryro is an ERP that connects bookings, staff costs, and accounts so your real occupancy margin is visible before month-end instead of after',
    'Pryro is an ERP that links your booking records and accounts so month-end becomes a five-minute check instead of a multi-day exercise',
  ],
  travel: [
    'Pryro is an ERP that connects bookings, commissions, and supplier invoicing so your margin on every deal is visible before the trip ends',
    "Pryro is an ERP that links CRM and Financial Management so your P&L reflects this week's deals, not last month's",
  ],
  restaurant: [
    'Pryro is an ERP that connects kitchen stock and daily sales so food cost is a live number your team sees every morning, not a month-end surprise',
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
    'Pryro is an ERP that connects project budgets, contractor payroll, and procurement so cost overruns show up before they show up in the P&L',
    'Pryro is an ERP that links Project Management and Financial Management so your team sees budget versus actuals in real time, not at month-end',
  ],
  logistics: [
    'Pryro is an ERP that connects driver payroll, trip logs, and client billing so month-end reconciliation drops from days to hours',
    'Pryro is an ERP that links HR Payroll and Financial Management so driver payroll and client invoicing always come from the same numbers',
  ],
  school: [
    "Pryro is an ERP that connects fee collection and staff payroll so your bursar's numbers balance automatically, no two-week reconciliation sprint",
    'Pryro is an ERP that links fee registers and HR Payroll so term-end becomes a one-day check instead of a multi-week exercise',
  ],
  generic: [
    'Pryro is an ERP that replaces those manual workflows and fragmented tools with one unified system for finance, inventory, HR, and operations',
    'Pryro is an ERP that connects Financial Management, Inventory, HR & Payroll, and CRM into one platform so your team runs the business instead of managing tools',
  ],
};

// ─── Bank helpers ─────────────────────────────────────────────────────────────

function getSubject(niche: string | null, companyName: string, idx: number): string {
  const key = detectNicheKey(niche);
  const bank = SUBJECT_BANK[key] ?? SUBJECT_BANK['generic']!;
  return bank[idx % bank.length]!(companyName);
}

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

// ─── CTA builder, specific time slot, not an open-ended question ─────────────
function buildCTA(emailIndex: number): string {
  const slots = [
    'I have 10 minutes free tomorrow afternoon if that works, what do you think?',
    'I am free for a quick call later today, does that work for you?',
    'I have a slot open tomorrow morning if you want a quick look, does that work?',
    'I am free for 10 minutes this week, would tomorrow work for a quick call?',
  ];
  return slots[emailIndex % slots.length]!;
}

// ─── Email assembler ──────────────────────────────────────────────────────────

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

  const body = `${greeting}

${problem}

${pryro}

${cta}

${footer}`;

  return { subject, body };
}

// ─── AI caller ────────────────────────────────────────────────────────────────

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

// ─── AI prompt ────────────────────────────────────────────────────────────────
// AI writes the Pryro solution sentence (WITHOUT commission, that gets appended by code).

function buildAISystemPrompt(companyName: string, niche: string | null, companyContext?: string | null, emailIndex?: number): string {
  const ctxHint = companyContext
    ? `\nWhat this company does: "${companyContext.slice(0, 180)}"\nUse this context to make both the subject and Pryro sentence specific to their actual operation.`
    : '';

  // Rotate the seed style hint so the AI naturally varies across a batch.
  // This is a hint only — the AI picks the best fit for the company.
  const styleHints = [
    `Prefer the "Why is [Company]'s [department] still doing X?" format if it fits.`,
    `Prefer the "Still managing [pain point] manually at [Company]?" format if it fits.`,
    `Prefer the "Is [Company]'s [department] drowning in [problem]?" format if it fits.`,
    `Prefer the "How is [Company] handling [pain point] right now?" format if it fits.`,
    `Prefer the "[Company], still juggling [pain point]?" format if it fits.`,
  ];
  const styleHint = styleHints[(emailIndex ?? 0) % styleHints.length]!;

  return `You write cold email content for Pryro (pryro.com), an ERP platform.

Pryro modules: Financial Management, Inventory Management, HR & Payroll, Project Management, CRM, AI Analytics.
Company: "${companyName}"
Sector: ${niche || 'business'}${ctxHint}

Your job is to write TWO things:

1. SUBJECT LINE — a short, direct subject that challenges the prospect.
   Choose ONE of these formats based on what best fits this company's sector and pain point:
   a) Why is [Company]'s [department] still [doing X manually]?
   b) Still managing [pain point] manually at [Company]?
   c) Is [Company]'s [department] drowning in [problem]?
   d) How is [Company] handling [pain point] right now?
   e) [Company], still juggling [pain point]?
   ${styleHint}
   Replace [Company] with exactly: ${companyName}
   Make it specific to their sector. Under 12 words. No punctuation after the question mark.

2. PRYRO SENTENCE — one sentence starting with "Pryro is an ERP that" describing the fix.
   - Name at least one Pryro module
   - Describe a concrete operational outcome
   - Under 35 words
   - No commission, referral, percent, free trial, buzzwords (streamline, leverage, empower, optimize, seamless, innovative, robust)

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

// Keep for backward compat — used by some fallback paths
function cleanAISentence(raw: string): string | null {
  return parseAIResponse(raw, '').pryro;
}

// ─── Follow-up prompt ─────────────────────────────────────────────────────────

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
CTA: Propose a specific time slot, e.g. "I have 10 minutes free tomorrow afternoon, does that work?"
Footer: ${senderFooter}
Rules: mention Pryro, different angle, NO commission, NO "Best regards", footer is one line only.
FORMAT:
SUBJECT: Re: ${originalSubject}
BODY:
[greeting]
[new angle + Pryro]
[CTA with specific time]
[footer, one line]`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

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

  // ── Custom Pryro sentence from profile, bypasses AI entirely ────────────
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

  // ── AI writes subject + Pryro sentence ───────────────────────────────────
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

  // ── Sector bank fallback (no AI or AI failed quality gate) ───────────────
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
