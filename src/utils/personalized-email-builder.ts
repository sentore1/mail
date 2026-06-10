/**
 * PERSONALIZED EMAIL BUILDER — v4
 * ────────────────────────────────
 * NEW STRUCTURE (4 elements, under 100 words):
 *
 *   GREETING   Hi [Name] / Dear Sir/Madam,
 *   LINE 1     Confident industry observation — peer-level, not a rhetorical question
 *   LINE 2     Outcome sentence — what Pryro delivers, not a feature list
 *   LINE 3     Commission line
 *   CTA        Low-friction interest ask — "Open to seeing this?" not "Book a call"
 *   SIGNATURE  One line: Name — Pryro | Phone
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

// ─── Greeting builder ─────────────────────────────────────────────────────────
function buildGreetingLine(signals: ProspectSignals): string {
  const raw = signals.greeting.trim();
  if (/^dear sir\/madam,?$/i.test(raw)) return 'Dear Sir/Madam,';
  const m = raw.match(/^hi\s+(.+?),?\s*$/i);
  const name = m ? m[1]!.trim() : '';
  if (isUsableFirstName(name)) return `Hi ${name},`;
  return 'Dear Sir/Madam,';
}

// ─── One-line signature builder ───────────────────────────────────────────────
// Format: "Alice Umubyeyi — Pryro | 0790038006"
// Strips the old multi-line block down to one clean phone-typed line.
export function buildOneLineSignature(senderName: string, senderPhone?: string): string {
  const phone = senderPhone?.trim() || '';
  if (phone) return `${senderName} — Pryro | ${phone}`;
  return `${senderName} — Pryro`;
}

// ─── Sector observation bank (LINE 1) ────────────────────────────────────────
// Confident industry statements — NOT rhetorical questions.
// Sound like a peer who works in this space, not a salesperson reading a script.

const SECTOR_OBSERVATION_BANK: Record<string, string[]> = {
  pharmacy: [
    'Most pharmacy teams say drug expiry write-offs are invisible until they hit the monthly count. By then the margin is already gone.',
    'Pharmacy billing errors almost always trace back to stock records and invoicing systems that never talk to each other.',
  ],
  healthcare: [
    'Most healthcare finance teams say getting payroll and patient billing to match at month-end still takes days of manual work.',
    'Reconciling staff attendance, payroll, and patient billing across separate systems is one of those problems that never fully goes away.',
  ],
  hospital: [
    'Most hospital finance leads say tracking real-time department spend against approved budgets is nearly impossible due to payroll lag.',
    'When HR and department procurement run in separate systems, the CFO is always working from last month\'s numbers.',
  ],
  hotel: [
    'Most hospitality ops leads say month-end reconciliation still takes three to five days because scheduling, billing, and finance never sync automatically.',
    'When housekeeping rosters, vendor invoices, and payroll each live in a different system, the numbers never match on the first pass.',
  ],
  lodge: [
    'Most lodge operators say knowing their real occupancy margin before month-end is genuinely difficult when bookings and accounts are in separate places.',
    'When staff rosters and supplier bills are not connected to accounts, month-end is always a scramble to match numbers that should already balance.',
  ],
  travel: [
    'Most travel agency owners say they only find out their actual margin on a booking after the trip ends, sometimes weeks later.',
    'When agent commissions, supplier costs, and client bookings live in separate spreadsheets, the P&L is always a month behind the real picture.',
  ],
  restaurant: [
    'Most restaurant operators say food cost is only visible at month-end. By which point the margin problem has already happened.',
    'When kitchen stock, supplier invoices, and daily sales do not connect, food cost surprises are just part of running the month.',
  ],
  retail: [
    'Most retail ops managers say stockouts are only caught when a shelf is empty. By then the sale and the customer are already gone.',
    'When inventory and reorder points are not connected to sales data, stockout surprises become a regular cost of doing business.',
  ],
  ngo: [
    'Most NGO finance leads say pulling together grant budget versus actual spend for a donor report still takes the better part of a week.',
    'When field expenses, grant budgets, and payroll each live in a separate spreadsheet, financial compliance reports are always late.',
  ],
  construction: [
    'Most construction finance managers say cost overruns are only visible in the P&L after the margin is already gone.',
    'When project budgets, contractor payroll, and procurement are tracked in separate systems, the budget view is always backward-looking.',
  ],
  logistics: [
    'Most logistics ops leads say matching driver payroll to trip logs at month-end still takes days of manual cross-referencing.',
    'When driver records, fuel costs, and client billing are not in the same system, month-end reconciliation is always a multi-day exercise.',
  ],
  school: [
    'Most school bursars say term-end reconciliation between fee collection and staff payroll still takes the better part of two weeks.',
    'When fee registers and payroll run in separate systems, the numbers almost never balance automatically. Someone always has to chase the difference.',
  ],
  generic: [
    'Most operations leads say the hours lost to moving data between finance, HR, and inventory systems are invisible until they add up at quarter-end.',
    'When finance, inventory, and HR each run in a different tool, the coordination overhead grows quietly until it becomes a full-time job.',
    'Most teams only see the real cost of fragmented back-office tools when month-end arrives and the numbers do not match.',
  ],
};

// ─── Sector outcome bank (LINE 2) ────────────────────────────────────────────
// Outcome sentences — what the prospect gets, not what features Pryro has.
// Always describes a before → after operational change.

const SECTOR_OUTCOME_BANK: Record<string, string[]> = {
  pharmacy: [
    'We connect stock, billing, and payroll into one view so your team catches expiry issues before they become write-offs.',
    'We link your drug stock and billing data so margin leaks from expiry and billing errors show up before month-end.',
  ],
  healthcare: [
    'We connect HR and patient billing into one live view so your admin team stops reconciling manually every month-end.',
    'We sync staff payroll and billing so your team spends month-end reviewing numbers instead of chasing them.',
  ],
  hospital: [
    'We connect HR payroll and department budgets so your finance team sees real-time spend against approved limits, not last month\'s.',
    'We give your CFO a live view of department spend versus approved budget so overruns surface in days not months.',
  ],
  hotel: [
    'We connect scheduling, vendor billing, and financials so month-end reconciliation goes from five days to same-day.',
    'We sync your ops and finance data so your team stops moving numbers between systems every single month.',
  ],
  lodge: [
    'We connect bookings, staff costs, and accounts so your real occupancy margin is visible before month-end, not after.',
    'We link bookings and accounts so month-end stops being a reconciliation exercise and starts being a five-minute check.',
  ],
  travel: [
    'We connect bookings, commissions, and supplier costs so your margin on every deal is visible before the trip ends.',
    'We sync client records, supplier invoices, and agent commissions so your P&L reflects today\'s deals, not last month\'s.',
  ],
  restaurant: [
    'We connect kitchen stock and daily sales so food cost is a live number your chef sees every morning, not a month-end surprise.',
    'We link supplier invoices and daily sales so food cost variance shows up the day it happens, not at month-end.',
  ],
  retail: [
    'We connect inventory and reorder points to sales data so stockouts trigger an alert, not an empty shelf.',
    'We sync stock levels and supplier reorders so your team gets a system warning before a customer finds an empty shelf.',
  ],
  ngo: [
    'We connect grant budgets, field expenses, and payroll so your donor report takes hours instead of a week.',
    'We give your finance team one live view of grant spend versus budget so compliance reports write themselves.',
  ],
  construction: [
    'We connect project budgets, contractor payroll, and procurement so cost overruns show up in the system before they show up in the P&L.',
    'We sync project management and financial tracking so your team sees budget versus actuals in real time, not at month-end.',
  ],
  logistics: [
    'We connect driver payroll, trip logs, and billing so month-end reconciliation goes from days to hours.',
    'We link driver records and client billing so the numbers that go into payroll and the numbers that go into invoicing come from the same source.',
  ],
  school: [
    'We connect fee collection and staff payroll so your bursar\'s numbers balance automatically instead of needing two weeks of chasing.',
    'We sync fee registers and payroll so term-end reconciliation becomes a one-day check instead of a two-week exercise.',
  ],
  generic: [
    'We connect finance, inventory, and HR into one live view so your team stops moving data between tools and starts running the business.',
    'We give your ops and finance teams one system instead of three so the coordination overhead disappears.',
    'We connect your back-office tools into one live view so month-end stops being a reconciliation exercise.',
  ],
};

// ─── Sector CTA bank (low-friction, interest-based) ──────────────────────────
// Ask for permission, not calendar time. Prospect can say yes with one word.

const SECTOR_CTA_BANK: Record<string, string[]> = {
  pharmacy:     ['Open to seeing the 2-minute workflow we use to fix this?', 'Worth a quick look at how it works for a pharmacy your size?'],
  healthcare:   ['Open to seeing the 2-minute workflow we use to fix this?', 'Does this match what your admin team runs into every month-end?'],
  hospital:     ['Open to seeing how we do it for a hospital your size?', 'Worth a quick look at the live dashboard your CFO would see?'],
  hotel:        ['Open to a 2-minute look at how it works for a property your size?', 'Does this match what your ops team deals with every month-end?'],
  lodge:        ['Open to seeing the 2-minute walkthrough we do for lodges?', 'Worth a quick look at how other lodges use it?'],
  travel:       ['Open to seeing how we surface margin before a trip ends?', 'Does this sound like what your team runs into on every booking?'],
  restaurant:   ['Open to seeing the live food cost view your chef would use daily?', 'Does this sound like what happens every month-end at your place?'],
  retail:       ['Open to seeing how the stockout alert works in practice?', 'Worth a quick look at how other retailers use it?'],
  ngo:          ['Open to seeing how the donor report pulls together in one click?', 'Does this match what your finance team deals with each quarter?'],
  construction: ['Open to seeing how the real-time budget view works on a live project?', 'Does this match what your project managers run into every month?'],
  logistics:    ['Open to seeing how the reconciliation looks when it runs automatically?', 'Does this match what your ops team goes through every month-end?'],
  school:       ['Open to seeing how the term-end reconciliation works when it\'s automated?', 'Does this sound like what your bursar runs into every term?'],
  generic:      ['Open to seeing the 2-minute workflow we use to fix this?', 'Worth a quick look at how it works for a business your size?', 'Does this sound familiar?'],
};

function getSectorObservation(niche: string | null, idx: number): string {
  const key = detectNicheKey(niche);
  const bank = SECTOR_OBSERVATION_BANK[key] ?? SECTOR_OBSERVATION_BANK['generic']!;
  return bank[idx % bank.length]!;
}

function getSectorOutcome(niche: string | null, idx: number): string {
  const key = detectNicheKey(niche);
  const bank = SECTOR_OUTCOME_BANK[key] ?? SECTOR_OUTCOME_BANK['generic']!;
  return bank[idx % bank.length]!;
}

function getSectorCTA(niche: string | null, idx: number): string {
  const key = detectNicheKey(niche);
  const bank = SECTOR_CTA_BANK[key] ?? SECTOR_CTA_BANK['generic']!;
  return bank[idx % bank.length]!;
}

// ─── Subject bank ─────────────────────────────────────────────────────────────
const SECTOR_SUBJECT_BANK: Record<string, Array<(c: string) => string>> = {
  pharmacy:     [
    (c) => `Is ${c} still tracking drug expiry manually?`,
    (c) => `Are stock, billing and payroll separate at ${c}?`,
    (c) => `How is ${c} catching expiry dates before write-offs?`,
  ],
  healthcare:   [
    (c) => `Is ${c} still reconciling payroll and billing manually?`,
    (c) => `How long does month-end take at ${c}?`,
    (c) => `Are HR and patient billing still separate at ${c}?`,
  ],
  hospital:     [
    (c) => `Are department budgets and payroll connected at ${c}?`,
    (c) => `Is ${c} getting live department spend visibility?`,
    (c) => `How does ${c} track HR and finance together?`,
  ],
  hotel:        [
    (c) => `Is month-end still a manual process at ${c}?`,
    (c) => `Are staff scheduling and billing connected at ${c}?`,
    (c) => `How does ${c} reconcile housekeeping and payroll?`,
  ],
  lodge:        [
    (c) => `Are bookings and accounts still separate at ${c}?`,
    (c) => `Is month-end reconciliation still manual at ${c}?`,
  ],
  travel:       [
    (c) => `Does ${c} know its booking margin before trips end?`,
    (c) => `Are agent commissions still tracked in spreadsheets at ${c}?`,
    (c) => `Is the P&L always a month behind at ${c}?`,
  ],
  restaurant:   [
    (c) => `Does ${c} have a live view of food cost?`,
    (c) => `Are kitchen stock and supplier invoices connected at ${c}?`,
  ],
  retail:       [
    (c) => `Is ${c} still getting caught by stockouts?`,
    (c) => `Are inventory reorders still managed manually at ${c}?`,
  ],
  ngo:          [
    (c) => `Is donor reporting still taking too long at ${c}?`,
    (c) => `Are grant budgets and field spend connected at ${c}?`,
  ],
  construction: [
    (c) => `Does ${c} see cost overruns before they happen?`,
    (c) => `Are project budgets and payroll still separate at ${c}?`,
  ],
  logistics:    [
    (c) => `Is month-end billing still taking days at ${c}?`,
    (c) => `Are driver payroll and stock connected at ${c}?`,
  ],
  school:       [
    (c) => `Are fees and staff payroll still separate at ${c}?`,
    (c) => `Is term-end reporting still a manual process at ${c}?`,
  ],
  generic:      [
    (c) => `Are HR and finance still separate tools at ${c}?`,
    (c) => `Is ${c} still running operations across multiple tools?`,
    (c) => `How does ${c} keep ops data in one place?`,
  ],
};

function buildSubject(companyName: string, niche: string | null, idx: number): string {
  const key = detectNicheKey(niche);
  const bank = SECTOR_SUBJECT_BANK[key] ?? SECTOR_SUBJECT_BANK['generic']!;
  return bank[idx % bank.length]!(companyName);
}

// ─── Assemble final email ─────────────────────────────────────────────────────
// Structure: greeting → observation → outcome → commission → CTA → one-line sig

function assembleEmail(params: {
  greeting: string;
  observation: string;
  outcome: string;
  cta: string;
  signOff: string;
  subject: string;
}): { subject: string; body: string } {
  const { greeting, observation, outcome, cta, signOff, subject } = params;
  const body = `${greeting}

${observation}

${outcome}

We also offer a 20-30% commission for every successfully referred client.

${cta}

${signOff}`;
  return { subject, body };
}

// ─── AI caller ───────────────────────────────────────────────────────────────

interface AIProvider { provider: string; api_key: string; active_model: string; }

async function callAI(p: AIProvider, system: string, user: string): Promise<string> {
  const body = { temperature: 0.75, max_tokens: 80 };
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  async function attempt(): Promise<string> {
    if (p.provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.api_key}` },
        body: JSON.stringify({ model: p.active_model || 'gpt-4o-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...body }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw Object.assign(new Error(`OpenAI ${r.status}`), { status: r.status });
      return (await r.json()).choices[0].message.content;
    }
    if (p.provider === 'groq') {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.api_key}` },
        body: JSON.stringify({ model: p.active_model || 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...body }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw Object.assign(new Error(`Groq ${r.status}`), { status: r.status });
      return (await r.json()).choices[0].message.content;
    }
    if (p.provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': p.api_key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: p.active_model || 'claude-3-5-haiku-20241022', max_tokens: 80, system, messages: [{ role: 'user', content: user }], temperature: 0.6 }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw Object.assign(new Error(`Anthropic ${r.status}`), { status: r.status });
      return (await r.json()).content[0].text;
    }
    if (p.provider === 'gemini') {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${p.active_model || 'gemini-1.5-flash'}:generateContent?key=${p.api_key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: system + '\n\n' + user }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 80 } }),
          signal: AbortSignal.timeout(12000) }
      );
      if (!r.ok) throw Object.assign(new Error(`Gemini ${r.status}`), { status: r.status });
      return (await r.json()).candidates[0].content.parts[0].text;
    }
    if (p.provider === 'mistral') {
      const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.api_key}` },
        body: JSON.stringify({ model: p.active_model || 'mistral-small', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...body }),
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

// ─── AI prompt — asks for ONE outcome sentence ────────────────────────────────
// The AI writes a single custom outcome sentence for LINE 2 only.
// Everything else is from code.

function buildOutcomeSystemPrompt(companyName: string, niche: string | null): string {
  return `You write one sentence for a cold B2B email. Just one sentence — nothing else.

The sentence describes the specific operational outcome a ${niche || 'business'} like "${companyName}" gets from connecting their back-office systems.

Rules:
- Under 20 words
- Starts with "We" (as in Pryro)
- Describes what stops happening or what starts working — an operational before/after
- Mentions a process specific to ${niche || 'this type of business'} (payroll, billing, stock, scheduling, etc.)
- NO product features, NO module names, NO adjectives like "powerful" or "seamless"
- NO question mark — this is a statement
- NO greeting, NO sign-off, NO extra text

Good examples:
- "We connect HR and finance so your team stops reconciling manually every month-end."
- "We link stock and billing so expiry write-offs show up before they hit the count."
- "We sync driver payroll and trip logs so month-end reconciliation takes hours not days."

Output: The single outcome sentence only. No labels. No quotes. No extra text.`;
}

function buildOutcomeUserPrompt(companyName: string, niche: string | null, customPainPoint?: string | null): string {
  const hint = customPainPoint
    ? `The specific problem to fix: ${customPainPoint}`
    : `Focus on the single biggest daily operational problem for a ${niche || 'business'} and describe the outcome of fixing it.`;
  return `Company: ${companyName}\nSector: ${niche || 'business'}\n${hint}\n\nWrite the one outcome sentence now:`;
}

function cleanAISentence(raw: string): string | null {
  if (!raw) return null;
  let s = raw
    .replace(/^(SUBJECT:|BODY:|LINE \d[:\s-]*|Output:|Sentence:)/gim, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^[-•*#]\s+/gm, '')
    .replace(/\n.+/g, '')
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .trim();
  if (!s || s.length < 10 || s.length > 200) return null;
  const banned = ['streamline', 'leverage', 'empower', 'optimize', 'cutting-edge', 'revolutionary',
    'seamlessly', 'innovative', 'robust', 'scalable', 'transform', 'synergy',
    'i was looking', 'i noticed', 'i came across', 'i hope', 'i wanted to'];
  if (banned.some(b => s.toLowerCase().includes(b))) return null;
  return s;
}

// ─── Follow-up prompt builder ─────────────────────────────────────────────────

export function buildFollowUpPrompt(
  signals: ProspectSignals,
  originalSubject: string,
  followUpNumber: 1 | 2 | 3,
): string {
  const angles: Record<number, string> = {
    1: `Time cost angle: how many hours per month is this problem costing their team?`,
    2: `Risk angle: what quietly goes wrong when systems don't connect?`,
    3: `Peer angle: others in this sector have solved this — offer to share briefly.`,
  };
  const ctas: Record<number, string> = {
    1: `"Still worth a quick look?"`,
    2: `"Open to seeing how it works for a ${signals.niche || 'business'} your size?"`,
    3: `"Happy to share a quick example if useful?"`,
  };
  const maxWords = followUpNumber === 1 ? 50 : followUpNumber === 2 ? 40 : 30;

  return `Write follow-up #${followUpNumber} on the same thread.
Company: ${signals.companyName} | Sector: ${signals.niche || 'business'}
Greeting (verbatim): ${signals.greeting}
Angle: ${angles[followUpNumber]}
CTA style: ${ctas[followUpNumber]}
Max words: ${maxWords}. Shorter than the previous email. Different sentences.
Subject must start with: Re: ${originalSubject}
Footer (verbatim): ${signals.signOff}

OUTPUT FORMAT:
SUBJECT: Re: ${originalSubject}
BODY:
[follow-up body]`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function buildPersonalizedEmail(
  params: EmailGenerationParams,
  aiProvider: AIProvider | null,
): Promise<GeneratedEmail> {
  const { companyName, niche, signals } = params;
  const idx = params.emailIndex ?? 0;

  // All structural elements built in code — AI cannot touch them
  const greeting    = buildGreetingLine(signals);
  const subject     = buildSubject(companyName, niche, idx);
  const observation = getSectorObservation(niche, idx);
  const cta         = getSectorCTA(niche, idx);
  const signOff     = signals.signOff;

  console.log(`[EmailBuilder] greeting="${greeting}" | company="${companyName}" | niche=${niche} | ai=${!!aiProvider}`);

  // AI writes ONE custom outcome sentence. All other lines are from code.
  if (aiProvider) {
    console.log(`[EmailBuilder] Calling ${aiProvider.provider}/${aiProvider.active_model} for outcome sentence — "${companyName}"`);

    let aiOutcome: string | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const system = buildOutcomeSystemPrompt(companyName, niche);
        const user   = buildOutcomeUserPrompt(companyName, niche, params.customPainPoint);
        const raw    = await callAI(aiProvider, system, user);
        aiOutcome    = cleanAISentence(raw);
        console.log(`[EmailBuilder] AI outcome attempt ${attempt}: "${aiOutcome ?? 'INVALID — ' + raw.slice(0, 80)}"`);
        if (aiOutcome) break;
      } catch (err: any) {
        console.warn(`[EmailBuilder] AI attempt ${attempt} failed for "${companyName}": ${err?.message}`);
      }
    }

    if (aiOutcome) {
      const { subject: s, body } = assembleEmail({ greeting, observation, outcome: aiOutcome, cta, signOff, subject });
      const quality = checkEmailQuality({ subject: s, body, companyName, externalPersonalizationScore: signals.personalizationScore });
      console.log(`[EmailBuilder] Quality for "${companyName}": score=${quality.score}, passed=${quality.passed}`);

      if (quality.passed && quality.score >= 85) {
        console.log(`[EmailBuilder] ✅ Accepted for "${companyName}" (score=${quality.score})`);
        return {
          subject: s, body,
          model: `${aiProvider.provider}/${aiProvider.active_model}`,
          personalizationScore: quality.personalizationScore,
          qualityScore: quality.score,
          qualityPassed: true,
          dataSource: signals.personalizationScore >= 65 ? 'ai_personalized' : 'ai_industry',
        };
      }
      console.warn(`[EmailBuilder] ⚠️ Scored ${quality.score}/85 for "${companyName}" — using sector bank outcome.`);
    } else {
      console.warn(`[EmailBuilder] AI produced no valid outcome for "${companyName}" — using sector bank`);
    }
  } else {
    console.log(`[EmailBuilder] No AI provider — using sector bank for "${companyName}"`);
  }

  // Sector bank fallback — always produces a passing email
  const outcome = getSectorOutcome(niche, idx);
  const { subject: fs, body: fb } = assembleEmail({ greeting, observation, outcome, cta, signOff, subject });
  const fq = checkEmailQuality({ subject: fs, body: fb, companyName, externalPersonalizationScore: signals.personalizationScore });
  console.log(`[EmailBuilder] Sector bank email for "${companyName}": score=${fq.score}`);

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
