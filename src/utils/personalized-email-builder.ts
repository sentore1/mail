/**
 * PERSONALIZED EMAIL BUILDER — v9
 * ────────────────────────────────
 * EXACT FORMAT (from approved screenshot):
 *
 *   Subject:  Still managing [X] manually? [Company Name]
 *   Greeting: Hi there,  (or Hi [FirstName], if name is available)
 *
 *   [Company] in [Location], many [sector] businesses often deal with
 *   [specific operational problem that slows teams down].
 *
 *   Pryro is an ERP that [specific fix for their sector] and we offer a
 *   20–30% commission for every successfully referred client.
 *
 *   Would you be open to a 10-minute call to see if it is relevant?
 *
 *   Best regards,
 *   [Name]
 *   [Title]
 *   [Company]
 *   [Phone]
 *   [Email]
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
// Real first name → "Hi [Name],"
// No name → "Hi there,"  (never uses company name — could be junk)
function buildGreetingLine(signals: ProspectSignals): string {
  const raw = signals.greeting.trim();
  const m = raw.match(/^hi\s+(.+?),?\s*$/i);
  const name = m ? m[1]!.trim() : '';
  if (isUsableFirstName(name)) return `Hi ${name},`;
  return 'Hi there,';
}

// ─── Footer ───────────────────────────────────────────────────────────────────
export function buildMultiLineFooter(params: {
  senderName: string;
  senderTitle?: string;
  senderCompany?: string;
  senderPhone?: string;
  senderEmail?: string;
}): string {
  const lines: string[] = ['Best regards,'];
  if (params.senderName)    lines.push(params.senderName);
  if (params.senderTitle)   lines.push(params.senderTitle);
  if (params.senderCompany) lines.push(params.senderCompany);
  if (params.senderPhone)   lines.push(params.senderPhone);
  if (params.senderEmail)   lines.push(params.senderEmail);
  return lines.join('\n');
}

// ─── Subject bank ─────────────────────────────────────────────────────────────
// Format: "Still [doing X] manually? [Company Name]"

const SUBJECT_BANK: Record<string, Array<(c: string) => string>> = {
  pharmacy:     [(c) => `Still tracking drug expiry manually? ${c}`,
                 (c) => `Stock and billing still in separate systems? ${c}`],
  healthcare:   [(c) => `Still reconciling payroll and billing manually? ${c}`,
                 (c) => `HR and patient billing still separate? ${c}`],
  hospital:     [(c) => `Still managing department budgets manually? ${c}`,
                 (c) => `Department spend and payroll still disconnected? ${c}`],
  hotel:        [(c) => `Still reconciling housekeeping and payroll manually? ${c}`,
                 (c) => `Month-end still a multi-day process? ${c}`],
  lodge:        [(c) => `Still tracking bookings and accounts separately? ${c}`,
                 (c) => `Month-end still a manual reconciliation? ${c}`],
  travel:       [(c) => `Still finding out booking margin after trips end? ${c}`,
                 (c) => `Commissions still tracked in spreadsheets? ${c}`],
  restaurant:   [(c) => `Still finding out food cost at month-end? ${c}`,
                 (c) => `Stock and sales still in separate systems? ${c}`],
  retail:       [(c) => `Still getting caught by stockouts? ${c}`,
                 (c) => `Inventory reorders still managed manually? ${c}`],
  ngo:          [(c) => `Donor reporting still taking a week to prepare? ${c}`,
                 (c) => `Grant budgets and field spend still separate? ${c}`],
  construction: [(c) => `Still seeing cost overruns after they happen? ${c}`,
                 (c) => `Project budgets and payroll still disconnected? ${c}`],
  logistics:    [(c) => `Month-end billing still taking days to close? ${c}`,
                 (c) => `Driver payroll and trip records still separate? ${c}`],
  school:       [(c) => `Still reconciling fees and payroll manually? ${c}`,
                 (c) => `Term-end still a manual process? ${c}`],
  generic:      [(c) => `Still managing financial services manually? ${c}`,
                 (c) => `Finance, HR, and ops still in separate tools? ${c}`,
                 (c) => `Still running operations across disconnected systems? ${c}`],
};

// ─── Problem sentence bank ────────────────────────────────────────────────────
// Format: "[Company] in [Location], many [sector] businesses often deal with [pain]."
// One sentence. Uses company name + location. Specific to their sector.

const PROBLEM_BANK: Record<string, Array<(c: string, l: string) => string>> = {
  pharmacy: [
    (c, l) => `${c} in ${l}, many pharmacy businesses often deal with drug expiry write-offs and billing errors that only surface at month-end because stock and invoicing run in separate systems.`,
    (c, l) => `${c} in ${l}, many pharmacy teams deal with stock, billing, and payroll each running in a different tool — which means margin losses often go unnoticed until month-end.`,
  ],
  healthcare: [
    (c, l) => `${c} in ${l}, many healthcare businesses often deal with days of manual work every month reconciling staff payroll against patient billing because HR and finance run separately.`,
    (c, l) => `${c} in ${l}, many healthcare admin teams deal with HR attendance and patient billing living in separate systems — which means month-end reconciliation takes days it shouldn't.`,
  ],
  hospital: [
    (c, l) => `${c} in ${l}, many hospital finance teams often deal with the challenge of getting a live view of actual department spend because HR payroll and procurement aren't connected.`,
    (c, l) => `${c} in ${l}, many hospitals deal with department budgets and HR payroll running in separate systems — which means the CFO is always working from last month's numbers.`,
  ],
  hotel: [
    (c, l) => `${c} in ${l}, many hospitality businesses often deal with month-end reconciliation taking three to five days because housekeeping rosters, vendor invoices, and payroll each live in a different system.`,
    (c, l) => `${c} in ${l}, many hotel operations deal with staff scheduling, vendor billing, and financials running in separate tools — which means every month-end becomes a manual exercise.`,
  ],
  lodge: [
    (c, l) => `${c} in ${l}, many lodge operators often deal with only finding out their real occupancy margin after month-end because bookings and accounts run in separate places.`,
    (c, l) => `${c} in ${l}, many lodges deal with bookings and accounts not being connected — which means month-end is always a scramble to match numbers that should balance automatically.`,
  ],
  travel: [
    (c, l) => `${c} in ${l}, many travel agencies often deal with only knowing the real margin on a booking after the trip has ended because commissions and supplier costs live in spreadsheets.`,
    (c, l) => `${c} in ${l}, many travel businesses deal with client bookings, agent commissions, and supplier invoices tracked in different tools — which means the P&L is always a month behind.`,
  ],
  restaurant: [
    (c, l) => `${c} in ${l}, many restaurant businesses often deal with food cost only becoming visible at month-end because kitchen stock, supplier invoices, and daily sales aren't in the same system.`,
    (c, l) => `${c} in ${l}, many restaurants deal with stock and sales running separately — which means food cost problems only show up after the margin is already gone.`,
  ],
  retail: [
    (c, l) => `${c} in ${l}, many retail businesses often deal with stockouts only being caught when the shelf is already empty because inventory levels and reorder points aren't connected to live sales.`,
    (c, l) => `${c} in ${l}, many retail operations deal with inventory and sales running in different systems — which means stockout surprises become a regular cost of doing business.`,
  ],
  ngo: [
    (c, l) => `${c} in ${l}, many NGO finance teams often deal with donor compliance reports taking the better part of a week because field expenses and grant budgets live in separate spreadsheets.`,
    (c, l) => `${c} in ${l}, many NGOs deal with grant budgets and field costs tracked in different tools — which means the finance team spends more time reconciling data than reporting on impact.`,
  ],
  construction: [
    (c, l) => `${c} in ${l}, many construction businesses often deal with cost overruns only showing up in the P&L after the margin is already gone because project budgets and procurement run separately.`,
    (c, l) => `${c} in ${l}, many construction firms deal with project management and financial tracking not sharing the same data — which means budget-to-actuals is always a backward-looking exercise.`,
  ],
  logistics: [
    (c, l) => `${c} in ${l}, many logistics businesses often deal with month-end reconciliation taking days because driver payroll, trip logs, and client billing all live in separate places.`,
    (c, l) => `${c} in ${l}, many transport operations deal with driver records and client invoicing not being connected — which means billing errors compound quietly every month.`,
  ],
  school: [
    (c, l) => `${c} in ${l}, many schools often deal with bursar reconciliation taking two weeks every term because fee collection and staff payroll run in separate registers.`,
    (c, l) => `${c} in ${l}, many educational institutions deal with fee records and payroll running in different systems — which means term-end is always a reconciliation sprint.`,
  ],
  generic: [
    (c, l) => `${c} in ${l}, many financial services businesses often deal with manual workflows and fragmented tools that slow teams down.`,
    (c, l) => `${c} in ${l}, many businesses deal with finance, HR, inventory, and operations each running in a different tool — which means the team spends days every month moving data that should flow automatically.`,
    (c, l) => `${c} in ${l}, many businesses deal with disconnected back-office systems where finance, HR, and operations don't share the same data — and the coordination overhead grows quietly.`,
  ],
};

// ─── Pryro solution bank ──────────────────────────────────────────────────────
// Format: "Pryro is an ERP that [fix] and we offer a 20–30% commission..."
// Commission is embedded in this sentence — same line as the solution.

const PRYRO_BANK: Record<string, string[]> = {
  pharmacy: [
    'Pryro is an ERP that connects your drug stock, billing, and payroll into one live platform so expiry losses and billing errors surface before month-end',
    'Pryro is an ERP that links drug stock, supplier invoicing, and HR payroll so your team catches expiry and billing problems in real time — not at month-end',
  ],
  healthcare: [
    'Pryro is an ERP that connects HR attendance and patient billing into one platform so your admin team reconciles both from one screen instead of two separate systems',
    'Pryro is an ERP that links staff payroll and patient billing so month-end takes minutes instead of days',
  ],
  hospital: [
    "Pryro is an ERP that connects department budgets and HR payroll so your finance team sees live spend against approved limits — not last month's figures",
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
    "Pryro is an ERP that links CRM and Financial Management so your P&L reflects this week's deals — not last month's",
  ],
  restaurant: [
    'Pryro is an ERP that connects kitchen stock and daily sales so food cost is a live number your team sees every morning — not a month-end surprise',
    'Pryro is an ERP that links Inventory Management and Financial Management so food cost variance shows up the day it happens',
  ],
  retail: [
    'Pryro is an ERP that connects inventory, reorder points, and live sales so a stockout triggers an alert in the system — not an empty shelf in your store',
    'Pryro is an ERP that links Inventory Management and sales data so your team gets a reorder warning before the shelf runs out',
  ],
  ngo: [
    'Pryro is an ERP that connects grant budgets, field expenses, and payroll so donor compliance reports pull together in hours instead of a week',
    'Pryro is an ERP that links Financial Management and HR Payroll so your finance team reports on impact instead of reconciling spreadsheets',
  ],
  construction: [
    'Pryro is an ERP that connects project budgets, contractor payroll, and procurement so cost overruns show up before they show up in the P&L',
    'Pryro is an ERP that links Project Management and Financial Management so your team sees budget versus actuals in real time — not at month-end',
  ],
  logistics: [
    'Pryro is an ERP that connects driver payroll, trip logs, and client billing so month-end reconciliation drops from days to hours',
    'Pryro is an ERP that links HR Payroll and Financial Management so driver payroll and client invoicing always come from the same numbers',
  ],
  school: [
    "Pryro is an ERP that connects fee collection and staff payroll so your bursar's numbers balance automatically — no two-week reconciliation sprint",
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

function getProblem(niche: string | null, companyName: string, location: string | null, idx: number): string {
  const key = detectNicheKey(niche);
  const bank = PROBLEM_BANK[key] ?? PROBLEM_BANK['generic']!;
  const loc = (location || 'your area').split(',')[0]?.trim() || 'your area';
  return bank[idx % bank.length]!(companyName, loc);
}

function getPryro(niche: string | null, idx: number): string {
  const key = detectNicheKey(niche);
  const bank = PRYRO_BANK[key] ?? PRYRO_BANK['generic']!;
  const base = bank[idx % bank.length]!;
  // Commission always appended to the Pryro sentence
  return base.replace(/[.!]?\s*$/, '') + ' and we offer a 20–30% commission for every successfully referred client.';
}

// ─── Email assembler ──────────────────────────────────────────────────────────

function assembleEmail(params: {
  greeting: string;
  problem: string;
  pryro: string;
  footer: string;
  subject: string;
}): { subject: string; body: string } {
  const { greeting, problem, pryro, footer, subject } = params;

  if (!greeting.trim().toLowerCase().startsWith('hi ')) {
    throw new Error('GREETING_MISSING: must start with Hi');
  }

  const cta = 'Would you be open to a 10-minute call to see if it is relevant?';

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
// AI writes the Pryro solution sentence (WITHOUT commission — that gets appended by code).

function buildAISystemPrompt(companyName: string, niche: string | null, companyContext?: string | null): string {
  const ctxHint = companyContext
    ? `\nWhat this company does: "${companyContext.slice(0, 180)}"\nUse this to make the solution specific to their actual operation.`
    : '';
  return `You write one sentence for a cold email about Pryro (pryro.com), an ERP.

Pryro: Financial Management, Inventory Management, HR & Payroll, Project Management, CRM, AI Analytics.
${ctxHint}
Write ONE sentence that starts with "Pryro is an ERP that" describing what Pryro fixes for a ${niche || 'business'} like "${companyName}".

Rules:
- Start with exactly: "Pryro is an ERP that"
- Name at least one Pryro module
- Describe the outcome — what stops happening or what starts working
- Under 35 words. No commission mention (added separately). No greeting. No sign-off.
- No buzzwords: streamline, leverage, empower, optimize, seamless, innovative, robust

Output: the sentence only.`;
}

function buildAIUserPrompt(companyName: string, niche: string | null, customPainPoint?: string | null): string {
  const focus = customPainPoint
    ? `Specific problem: ${customPainPoint}`
    : `Biggest daily operational friction for a ${niche || 'business'}.`;
  return `Company: ${companyName}\nSector: ${niche || 'business'}\n${focus}\n\nWrite the sentence now:`;
}

function cleanAISentence(raw: string): string | null {
  if (!raw) return null;
  let s = raw
    .replace(/^(OUTPUT:|Sentence:|Result:)/gim, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^[-•*#]\s+/gm, '')
    .replace(/\n.+/g, '')
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .trim();
  if (!s || s.length < 20 || s.length > 280) return null;
  if (!s.toLowerCase().startsWith('pryro is an erp that')) return null;
  const banned = ['commission', 'referral', 'percent', '20-30', '20\u201330',
    'free trial', 'dear sir', 'best regards', 'streamline', 'leverage',
    'empower', 'optimize', 'seamlessly', 'innovative', 'robust', 'scalable'];
  if (banned.some(b => s.toLowerCase().includes(b))) return null;
  return s;
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
CTA: "Would you be open to a 10-minute call to see if it is relevant?"
Footer: ${senderFooter}
Rules: mention Pryro, different angle, no commission.
FORMAT:
SUBJECT: Re: ${originalSubject}
BODY:
[greeting]
[new angle + Pryro]
[CTA]
[footer]`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function buildPersonalizedEmail(
  params: EmailGenerationParams,
  aiProvider: AIProvider | null,
): Promise<GeneratedEmail> {
  const { companyName, niche, location, signals } = params;
  const idx = params.emailIndex ?? 0;

  const greeting = buildGreetingLine(signals);
  const subject  = getSubject(niche, companyName, idx);
  const problem  = getProblem(niche, companyName, location, idx);
  const footer   = buildMultiLineFooter({
    senderName:    params.senderName,
    senderTitle:   params.senderTitle,
    senderCompany: params.senderCompany || 'Pryro',
    senderPhone:   params.senderPhone,
    senderEmail:   params.senderEmail,
  });

  console.log(`[EmailBuilder] company="${companyName}" | niche=${niche} | ai=${!!aiProvider}`);

  // AI writes the Pryro solution sentence — commission appended by code
  if (aiProvider) {
    let aiBase: string | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const sys = buildAISystemPrompt(companyName, niche, params.companyContext);
        const usr = buildAIUserPrompt(companyName, niche, params.customPainPoint);
        const raw = await callAI(aiProvider, sys, usr);
        aiBase = cleanAISentence(raw);
        console.log(`[EmailBuilder] AI attempt ${attempt}: "${aiBase ?? 'INVALID — ' + raw.slice(0, 60)}"`);
        if (aiBase) break;
      } catch (err: any) {
        console.warn(`[EmailBuilder] AI attempt ${attempt} failed: ${err?.message}`);
      }
    }

    if (aiBase) {
      const pryro = aiBase.replace(/[.!]?\s*$/, '') + ' and we offer a 20–30% commission for every successfully referred client.';
      const { subject: s, body } = assembleEmail({ greeting, problem, pryro, footer, subject });
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

  // Sector bank fallback
  const pryro = getPryro(niche, idx);
  const { subject: fs, body: fb } = assembleEmail({ greeting, problem, pryro, footer, subject });
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
