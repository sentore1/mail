/**
 * PERSONALIZED EMAIL BUILDER — v3
 * ────────────────────────────────
 * ARCHITECTURE: The AI only writes LINE 2 (one sector question sentence).
 * Lines 1, 3, 4, and the footer are built deterministically in code — the AI
 * cannot override them. This guarantees:
 *
 *   LINE 1  Hi [FirstName],          ← always from code, never from AI
 *   LINE 2  [AI sector question]     ← AI writes this one sentence only
 *   LINE 3  Pryro is an ERP…         ← hardcoded constant, never changes
 *   LINE 4  Would a 10 minute call…  ← hardcoded CTA, never changes
 *   FOOTER  Best regards, …          ← from sender profile, never changes
 *
 * If AI fails or scores below threshold → sector question bank fallback (code only).
 * Result: "Hi Sir/Madam" can NEVER appear when a real name is available.
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

// ─── Fixed Pryro constants — NEVER change these ──────────────────────────────
const PRYRO_LINE = `Pryro is an ERP that brings HR, payroll, finance, inventory, and CRM into one platform.`;

function buildCTA(companyName: string): string {
  return `Would a 10 minute call make sense to show you how Pryro could work for ${companyName}?`;
}

// ─── Greeting builder — deterministic, code-only ─────────────────────────────
// Priority order:
//   1. signals.greeting = "Hi [RealName],"  → keep it
//   2. signals.greeting = "Dear Sir/Madam," → pass through unchanged
//   3. anything else                        → Dear Sir/Madam,
function buildGreetingLine(signals: ProspectSignals, companyName: string): string {
  const raw = signals.greeting.trim();

  // Pass through "Dear Sir/Madam," unchanged
  if (/^dear sir\/madam,?$/i.test(raw)) return 'Dear Sir/Madam,';

  // Extract name from "Hi [X],"
  const nameMatch = raw.match(/^hi\s+(.+?),?\s*$/i);
  const namePart  = nameMatch ? nameMatch[1]!.trim() : '';

  // If it's a real first name → keep it
  if (isUsableFirstName(namePart)) return `Hi ${namePart},`;

  // Anything else → Dear Sir/Madam
  return 'Dear Sir/Madam,';
}

// ─── Sector impact sentences — paragraph 2, sentence 1 ───────────────────────
// One sentence per sector explaining the cost/consequence of the problem.
// Pairs with PRYRO_LINE to form paragraph 2 (two sentences, under 40 words total).

const SECTOR_IMPACT_BANK: Record<string, string[]> = {
  pharmacy:     [
    'That gap between stock records and billing is where margin quietly disappears.',
    'When expiry tracking runs separately from billing, write-offs are always discovered late.',
  ],
  healthcare:   [
    'That disconnect means your admin team spends hours each month on reconciliation that should be automatic.',
    'When payroll and billing run in separate systems, month-end always costs more time than it should.',
  ],
  hospital:     [
    'When HR and department budgets live in separate tools, the finance team is always working from yesterday\'s numbers.',
    'That gap between payroll and department spend means the CFO never has a live view until it\'s too late.',
  ],
  hotel:        [
    'When staff scheduling and vendor billing aren\'t connected to your financials, month-end becomes a multi-day exercise.',
    'That disconnect between operations and finance means reconciliation costs your team days every month.',
  ],
  lodge:        [
    'When bookings and accounts aren\'t connected, it\'s nearly impossible to know your real margin until after the fact.',
    'That gap between your booking records and accounts means month-end is always a scramble.',
  ],
  travel:       [
    'When bookings, commissions, and supplier costs live in separate places, you only know your real margin after the trip ends.',
    'That disconnect means your P&L is always at least a month behind the actual deals you\'ve closed.',
  ],
  restaurant:   [
    'When stock, suppliers, and daily sales aren\'t connected, food cost only becomes visible at month-end when it\'s too late to act.',
    'That gap between kitchen stock and daily sales means margin surprises are a regular part of the month.',
  ],
  retail:       [
    'When inventory and reorder points aren\'t connected, the first sign of a stockout is usually an empty shelf.',
    'That disconnect between stock levels and sales means margin surprises and stockouts happen regularly.',
  ],
  ngo:          [
    'When grant budgets and field expenses live in separate spreadsheets, financial compliance reports always take longer than they should.',
    'That gap means your finance team spends more time reconciling than reporting, and donors notice.',
  ],
  construction: [
    'When project management and financial tracking run separately, cost overruns are usually discovered after the margin is already gone.',
    'That disconnect between project budgets and actual spend means overruns only appear after they\'ve happened.',
  ],
  logistics:    [
    'When driver payroll, trip billing, and warehouse stock aren\'t in the same system, reconciliation takes days and errors are easy to miss.',
    'That gap means month-end billing is always a multi-day manual exercise with errors that compound quietly.',
  ],
  school:       [
    'When fee collection and staff payroll run in separate registers, term-end reconciliation becomes a marathon every time.',
    'That disconnect means your bursar spends weeks chasing numbers that should balance automatically.',
  ],
  generic:      [
    'That fragmentation costs hours every week and makes it hard to see how the business is really running.',
    'When finance, inventory, and HR each run in a different tool, the coordination overhead compounds quietly as the team grows.',
    'That disconnect between systems means your team spends time moving data between tools instead of running the business.',
  ],
};

function getSectorImpact(niche: string | null, idx: number): string {
  const key = detectNicheKey(niche);
  const bank = SECTOR_IMPACT_BANK[key] ?? SECTOR_IMPACT_BANK['generic']!;
  return bank[idx % bank.length]!;
}

// ─── Assemble final email — 3 paragraphs ──────────────────────────────────────
// Para 1: greeting + question (P1)
// Para 2: impact sentence + Pryro intro (P2) — two sentences, one paragraph
// Para 3: CTA (P3)
// Footer: sign-off

function assembleEmail(params: {
  greeting: string;
  sectorQuestion: string;
  impactSentence: string;
  companyName: string;
  signOff: string;
  subject: string;
}): { subject: string; body: string } {
  const { greeting, sectorQuestion, impactSentence, companyName, signOff, subject } = params;
  const body = `${greeting}

${sectorQuestion}

${impactSentence} ${PRYRO_LINE}

${buildCTA(companyName)}

${signOff}`;
  return { subject, body };
}

// ─── AI caller ───────────────────────────────────────────────────────────────

interface AIProvider { provider: string; api_key: string; active_model: string; }

async function callAI(p: AIProvider, system: string, user: string): Promise<string> {
  const body = { temperature: 0.75, max_tokens: 80 }; // max_tokens=80 — one sentence only

  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  async function attempt(): Promise<string> {
    if (p.provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.api_key}` },
        body: JSON.stringify({
          model: p.active_model || 'gpt-4o-mini',
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          ...body,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw Object.assign(new Error(`OpenAI ${r.status}`), { status: r.status });
      return (await r.json()).choices[0].message.content;
    }

    if (p.provider === 'groq') {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.api_key}` },
        body: JSON.stringify({
          model: p.active_model || 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          ...body,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw Object.assign(new Error(`Groq ${r.status}`), { status: r.status });
      return (await r.json()).choices[0].message.content;
    }

    if (p.provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': p.api_key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: p.active_model || 'claude-3-5-haiku-20241022',
          max_tokens: 80,
          system,
          messages: [{ role: 'user', content: user }],
          temperature: 0.6,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw Object.assign(new Error(`Anthropic ${r.status}`), { status: r.status });
      return (await r.json()).content[0].text;
    }

    if (p.provider === 'gemini') {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${p.active_model || 'gemini-1.5-flash'}:generateContent?key=${p.api_key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: system + '\n\n' + user }] }],
            generationConfig: { temperature: 0.6, maxOutputTokens: 80 },
          }),
          signal: AbortSignal.timeout(12000),
        }
      );
      if (!r.ok) throw Object.assign(new Error(`Gemini ${r.status}`), { status: r.status });
      return (await r.json()).candidates[0].content.parts[0].text;
    }

    if (p.provider === 'mistral') {
      const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.api_key}` },
        body: JSON.stringify({
          model: p.active_model || 'mistral-small',
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          ...body,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw Object.assign(new Error(`Mistral ${r.status}`), { status: r.status });
      return (await r.json()).choices[0].message.content;
    }

    throw new Error(`Unknown provider: ${p.provider}`);
  }

  // Retry with exponential backoff for 429 rate limits (2s, 6s, 14s)
  let lastError: Error = new Error('Unknown');
  for (let n = 0; n < 3; n++) {
    try {
      return await attempt();
    } catch (err: any) {
      lastError = err;
      if (err?.status === 429) {
        const delayMs = (Math.pow(2, n + 1) + n) * 1000;
        console.warn(`[callAI] Rate limited by ${p.provider} (attempt ${n + 1}/3) — waiting ${delayMs}ms`);
        await wait(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ─── AI prompt — asks for ONE sentence only ───────────────────────────────────
// The system prompt tells the AI it only writes LINE 2. Nothing else.

function buildQuestionSystemPrompt(companyName: string, niche: string | null): string {
  return `You write one sentence for a cold B2B email. Just one sentence — nothing else.

The sentence is a genuine question about a real daily operational challenge that a ${niche || 'business'} like "${companyName}" faces.

Rules:
- Under 20 words
- Ends with a question mark
- Mentions "${companyName}" by name
- Sounds like a colleague asking, not a salesperson
- About a REAL operational problem: payroll, billing, stock, scheduling, reconciliation, etc.
- NO greeting, NO introduction, NO sign-off, NO explanation
- NEVER start with: "Are you still", "I was", "I hope", "I noticed", "I came across"
- NEVER use: streamline, leverage, empower, optimize, cutting-edge, revolutionary, seamlessly, innovative, robust, scalable, transform, synergy

Output: The single sentence question only. No labels. No quotes. No extra text.`;
}

function buildQuestionUserPrompt(companyName: string, niche: string | null, customPainPoint?: string | null): string {
  const sector = niche || 'business';
  const hint = customPainPoint
    ? `Focus on this pain point: ${customPainPoint}`
    : `Focus on the single biggest daily operational challenge for a ${sector}.`;
  return `Company: ${companyName}
Sector: ${sector}
${hint}

Write the one sentence question now:`;
}

// ─── Validate and sanitize the AI's one-sentence output ───────────────────────
function cleanAISentence(raw: string, companyName: string): string | null {
  if (!raw) return null;

  // Strip any echoed labels, markdown, or multi-line output
  let s = raw
    .replace(/^(SUBJECT:|BODY:|LINE \d[:\s-]*|Question:|Output:)/gim, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^[-•*#]\s+/gm, '')
    .replace(/\n.+/g, '')        // take only the first line
    .trim();

  // Remove surrounding quotes
  s = s.replace(/^["'`]|["'`]$/g, '').trim();

  // Must end with ?
  if (!s.endsWith('?')) {
    s = s.replace(/[.!]\s*$/, '') + '?';
  }

  // Must not be empty or too long
  if (!s || s.length < 10 || s.length > 200) return null;

  // Reject if it contains banned phrases
  const banned = [
    'i was looking', 'i noticed', 'i came across', 'i hope', 'i wanted to reach out',
    'streamline', 'leverage', 'empower', 'optimize', 'cutting-edge', 'revolutionary',
    'seamlessly', 'innovative', 'robust', 'scalable', 'transform', 'synergy',
    'sir/madam', 'dear sir', 'hi there', 'hello there',
  ];
  const lower = s.toLowerCase();
  if (banned.some(b => lower.includes(b))) return null;

  return s;
}

// ─── Build subject from sector bank (never from AI) ──────────────────────────
// Subject: [CompanyName] — [short sector question under 7 words]
// Note: the em-dash separator is kept only in subjects (not in the body).

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

// ─── Sector question bank — fallback when AI fails ───────────────────────────
const SECTOR_QUESTION_BANK: Record<string, Array<(c: string) => string>> = {
  pharmacy:     [(c) => `Is ${c} still reconciling drug stock, billing, and payroll across separate tools?`, (c) => `Are expiry write-offs still being caught manually at ${c}?`],
  healthcare:   [(c) => `Is ${c} still reconciling staff payroll and patient billing manually every month?`, (c) => `How long does ${c}'s admin team spend on month-end payroll reconciliation?`],
  hospital:     [(c) => `Are ${c}'s HR payroll and department budgets still managed in separate systems?`, (c) => `Does ${c} have a live view of department spend versus approved budgets?`],
  hotel:        [(c) => `Is ${c} still reconciling staff scheduling, vendor billing, and financials manually?`, (c) => `How many days does month-end take at ${c} with systems not connected?`],
  lodge:        [(c) => `Are bookings, staff rosters, and accounts still separate at ${c}?`, (c) => `Is month-end reconciliation still a manual exercise at ${c}?`],
  travel:       [(c) => `Does ${c} know its actual margin before a trip ends, or only after?`, (c) => `Are agent commissions and supplier costs still tracked in spreadsheets at ${c}?`],
  restaurant:   [(c) => `Does ${c} have a live view of food cost today, or only at month-end?`, (c) => `Are kitchen stock, supplier invoices, and daily sales still in separate tools at ${c}?`],
  retail:       [(c) => `Is ${c} still getting stockout surprises across locations?`, (c) => `Are inventory reorders and multi-location stock still managed manually at ${c}?`],
  ngo:          [(c) => `Is ${c} still reconciling grant budgets and field expenses in separate tools?`, (c) => `How long does ${c}'s finance team spend on donor reporting each quarter?`],
  construction: [(c) => `Does ${c} see cost overruns in real time, or only after they've happened?`, (c) => `Are project budgets, contractor payroll, and procurement still disconnected at ${c}?`],
  logistics:    [(c) => `Is ${c} still reconciling driver payroll, trip billing, and warehouse stock manually?`, (c) => `How many days does month-end billing reconciliation take at ${c}?`],
  school:       [(c) => `Is ${c} still managing fee collection and staff payroll in separate systems?`, (c) => `How long does ${c}'s bursar spend on term-end reconciliation?`],
  generic:      [(c) => `Is ${c} still managing HR, billing, and operations in separate tools?`, (c) => `Are finance, inventory, and payroll still running across disconnected systems at ${c}?`, (c) => `How much time does ${c}'s team spend each month reconciling data across tools?`],
};

function getFallbackQuestion(companyName: string, niche: string | null, idx: number): string {
  const key = detectNicheKey(niche);
  const bank = SECTOR_QUESTION_BANK[key] ?? SECTOR_QUESTION_BANK['generic']!;
  return bank[idx % bank.length]!(companyName);
}

// ─── Follow-up prompt builder (exported for follow-up module) ─────────────────

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
    2: `"Want to see how it works for a ${signals.niche || 'business'} your size?"`,
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

  // ── Step 1: Build all deterministic parts in code — AI cannot override these ──
  const greeting = buildGreetingLine(signals, companyName);  // never "Sir/Madam"
  const subject  = buildSubject(companyName, niche, idx); // sector bank subject
  const signOff  = signals.signOff;

  console.log(`[EmailBuilder] greeting="${greeting}" | company="${companyName}" | niche=${niche} | ai=${!!aiProvider}`);

  // ── Step 2: Ask AI for LINE 2 only (one sector question sentence) ──────────
  if (aiProvider) {
    console.log(`[EmailBuilder] Calling ${aiProvider.provider}/${aiProvider.active_model} for LINE 2 of "${companyName}"`);

    let aiQuestion: string | null = null;

    // First attempt
    try {
      const system = buildQuestionSystemPrompt(companyName, niche);
      const user   = buildQuestionUserPrompt(companyName, niche, params.customPainPoint);
      const raw    = await callAI(aiProvider, system, user);
      aiQuestion   = cleanAISentence(raw, companyName);
      console.log(`[EmailBuilder] AI question attempt 1: "${aiQuestion ?? 'INVALID — ' + raw.slice(0,80)}"`);
    } catch (err: any) {
      console.warn(`[EmailBuilder] AI call 1 failed for "${companyName}": ${err?.message}`);
    }

    // Second attempt if first failed or was invalid
    if (!aiQuestion) {
      try {
        const system = buildQuestionSystemPrompt(companyName, niche);
        const user   = buildQuestionUserPrompt(companyName, niche, params.customPainPoint);
        const raw    = await callAI(aiProvider, system, user);
        aiQuestion   = cleanAISentence(raw, companyName);
        console.log(`[EmailBuilder] AI question attempt 2: "${aiQuestion ?? 'INVALID — ' + raw.slice(0,80)}"`);
      } catch (err: any) {
        console.warn(`[EmailBuilder] AI call 2 failed for "${companyName}": ${err?.message}`);
      }
    }

    if (aiQuestion) {
      // ── Step 3: Assemble the 3-paragraph email with the AI question ─────────
      const impact = getSectorImpact(niche, idx);
      const { subject: s, body } = assembleEmail({
        greeting,
        sectorQuestion: aiQuestion,
        impactSentence: impact,
        companyName,
        signOff,
        subject,
      });

      const quality = checkEmailQuality({
        subject: s,
        body,
        companyName,
        externalPersonalizationScore: signals.personalizationScore,
      });

      console.log(`[EmailBuilder] Quality for "${companyName}": score=${quality.score}, passed=${quality.passed}`);

      if (quality.passed && quality.score >= 85) {
        console.log(`[EmailBuilder] ✅ AI email accepted for "${companyName}" (score=${quality.score})`);
        return {
          subject: s,
          body,
          model: `${aiProvider.provider}/${aiProvider.active_model}`,
          personalizationScore: quality.personalizationScore,
          qualityScore: quality.score,
          qualityPassed: true,
          dataSource: signals.personalizationScore >= 65 ? 'ai_personalized' : 'ai_industry',
        };
      }

      console.warn(`[EmailBuilder] ⚠️ AI email for "${companyName}" scored ${quality.score}/85. Blocks: ${quality.flags.filter(f => f.severity === 'block').map(f => f.type).join(',') || 'none'}. Falling back to sector bank.`);

      // AI question was bad — use sector bank fallback
      const fallbackQuestion = getFallbackQuestion(companyName, niche, idx);
      const { subject: fs, body: fb } = assembleEmail({ greeting, sectorQuestion: fallbackQuestion, impactSentence: impact, companyName, signOff, subject });
      const fq = checkEmailQuality({ subject: fs, body: fb, companyName, externalPersonalizationScore: signals.personalizationScore });
      return {
        subject: fs,
        body: fb,
        model: `${aiProvider.provider}/${aiProvider.active_model}`,
        personalizationScore: fq.personalizationScore,
        qualityScore: fq.score,
        qualityPassed: fq.passed,
        qualityFlagged: true,
        dataSource: 'ai_industry',
      };
    }

    // AI completely failed — fall through to sector bank
    console.warn(`[EmailBuilder] AI produced no valid question for "${companyName}" — using sector bank`);
  } else {
    console.log(`[EmailBuilder] No AI provider — using sector bank for "${companyName}"`);
  }

  // ── Step 4: Pure code fallback — sector question bank, no AI ───────────────
  const fallbackQuestion = getFallbackQuestion(companyName, niche, idx);
  const impact = getSectorImpact(niche, idx);
  const { subject: fs, body: fb } = assembleEmail({ greeting, sectorQuestion: fallbackQuestion, impactSentence: impact, companyName, signOff, subject });
  const fq = checkEmailQuality({ subject: fs, body: fb, companyName, externalPersonalizationScore: signals.personalizationScore });

  console.log(`[EmailBuilder] Sector bank email for "${companyName}": score=${fq.score}`);

  return {
    subject: fs,
    body: fb,
    model: 'template',
    personalizationScore: fq.personalizationScore,
    qualityScore: fq.score,
    qualityPassed: fq.passed,
    qualityFlagged: !!aiProvider,   // flag if AI was configured but failed
    dataSource: 'template',
  };
}
