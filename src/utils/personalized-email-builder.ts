/**
 * PERSONALIZED EMAIL BUILDER — v2
 * ────────────────────────────────
 * Generates emails that follow every rule from Q1–Q10:
 *
 *  Q1  First line names the company + city — never "Most companies…"
 *  Q2  Subject is a specific question about THIS company's situation
 *  Q3  Body under 120 words, 3 short paragraphs
 *  Q4  Pryro introduced in paragraph 2, one sentence only
 *  Q5  CTA is a single soft question at the end
 *  Q6  Sign-off is casual: "Alice from Pryro · +256 700 …"
 *  Q7  Company name, city, niche, and pain point always present
 *  Q8  Quality gate runs before returning — re-generates or falls back
 *  Q9  All banned phrases blocked from AI output via system prompt
 * Q10  Pharmacy / hotel / travel agency each get a completely different email
 */

import type { ProspectSignals } from './prospect-researcher';
import { getNicheProfile }       from './prospect-researcher';
import { checkEmailQuality }     from './email-quality-checker';

export interface EmailGenerationParams {
  companyName: string;
  niche: string | null;
  location: string | null;
  companyContext?: string | null;
  website?: string | null;
  signals: ProspectSignals;          // always required — build with researchProspect[Sync]
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
  dataSource: 'ai_personalized' | 'ai_industry' | 'template';
}

// ─── AI caller ───────────────────────────────────────────────────────────────

interface AIProvider { provider: string; api_key: string; active_model: string; }

async function callAI(p: AIProvider, system: string, user: string): Promise<string> {
  const body = { temperature: 0.75, max_tokens: 420 };

  // Helper: delay for rate limit backoff
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Helper: single attempt to one provider
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
        body: JSON.stringify({ model: p.active_model || 'claude-3-5-haiku-20241022', max_tokens: 420, system, messages: [{ role: 'user', content: user }], temperature: 0.6 }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw Object.assign(new Error(`Anthropic ${r.status}`), { status: r.status });
      return (await r.json()).content[0].text;
    }

    if (p.provider === 'gemini') {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${p.active_model || 'gemini-1.5-flash'}:generateContent?key=${p.api_key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: system + '\n\n' + user }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 420 } }),
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

  // Retry loop with exponential backoff for 429 rate limits
  let lastError: Error = new Error('Unknown');
  for (let attempt_n = 0; attempt_n < 3; attempt_n++) {
    try {
      return await attempt();
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? 0;
      if (status === 429) {
        // Rate limited — wait with exponential backoff: 2s, 6s, 14s
        const delayMs = (Math.pow(2, attempt_n + 1) + attempt_n) * 1000;
        console.warn(`[callAI] Rate limited by ${p.provider} (attempt ${attempt_n + 1}/3) — waiting ${delayMs}ms`);
        await wait(delayMs);
        continue;
      }
      // Non-429 error — don't retry
      throw err;
    }
  }
  throw lastError;
}

// ─── System prompt — proven cold email structure ─────────────────────────────

function buildSystemPrompt(signals: ProspectSignals): string {
  return `You are a cold email specialist writing a highly personalized outreach email on behalf of someone at Pryro.

ABOUT PRYRO (facts only — never invent, never list everything):
Pryro is a cloud ERP at pryro.com. Key modules: Financial Management, Inventory Management, HR & Payroll, Project Management, CRM, AI Analytics. Free trial available. Trusted by 64,000+ businesses worldwide. 1–2 week implementation.

The prospect works in: ${signals.niche || 'business'}.
Write ONLY about what a ${signals.niche || 'business'} actually does. Never mix industries.

YOUR TASK:
Write a cold email that feels like a message from one professional to another — not a marketing email, not a support ticket, not a newsletter. The prospect should think "this person actually understands my world."

MANDATORY EMAIL STRUCTURE (follow exactly, no deviation):

Line 1: Greeting — use this verbatim: "${signals.greeting}"
[blank line]
Paragraph 1 (ONE sentence, max 20 words): Opening hook — a genuine insight about what running a ${signals.niche || 'business'} in ${(signals.location || 'their region').split(',')[0]?.trim()} actually involves right now. This must feel like real sector knowledge, not a generic observation. Never start with a compliment. Never mention their website. Never say "I was looking at..."
[blank line]
Paragraph 2 (TWO sentences, each max 20 words):
  Sentence 1: Their most likely pain point, stated plainly. Include one social proof line like "teams like yours typically cut admin time once everything runs from one place."
  Sentence 2: Introduce Pryro in one natural sentence. Name ONLY the single most relevant module for their sector. End with: "— free trial at pryro.com."
[blank line]
Paragraph 3 (ONE sentence): A soft, low-friction CTA question. Easy to answer in 5 seconds. Examples: "Would it be worth a quick 10-minute look?" or "Open to seeing how it works for ${signals.companyName}?"
[blank line]
Footer — copy VERBATIM, no changes.

SUBJECT LINE RULES:
Under 6 words. Reads like a message from a colleague.
Formats that work: "Quick question — ${signals.companyName}", "${signals.companyName} + Pryro?", a specific sector observation, or a direct question about their pain point.
NEVER: clickbait, salesy phrases, support-ticket titles, "partnership", "opportunity", "ERP solution", "introduction".

TONE RULES:
Short sentences. Natural language. One professional to another.
BANNED WORDS (instant disqualification): streamline, leverage, empower, optimize, cutting-edge, revolutionary, game-changing, seamlessly, robust, scalable, innovative, transform, synergy, excited to share, pleased to inform, i hope this email finds you well, i wanted to reach out, i am reaching out, touching base, circling back, best-in-class, world-class, industry-leading, state-of-the-art, we help companies like yours, unlock potential, drive growth, scale your business, warm regards, yours sincerely, kindly revert, referral commission.

LENGTH: Entire body under 100 words (not counting footer). Every sentence under 20 words. Maximum 2 sentences per paragraph. Scannable on mobile in under 30 seconds.

OUTPUT FORMAT — respond with exactly this:
SUBJECT: [subject line]
BODY:
[email body]`;
}

// ─── Follow-up sequence builder ───────────────────────────────────────────────
// Generates 3 follow-ups on the same thread, each shorter than the last,
// each approaching the pain point from a different angle.

export interface FollowUpEmail {
  dayOffset: number;   // 3, 7, or 14
  subject: string;     // "Re: [original subject]" — same thread
  body: string;
}

export function buildFollowUpPrompt(
  signals: ProspectSignals,
  originalSubject: string,
  followUpNumber: 1 | 2 | 3,
): string {
  const configs = {
    1: {
      day: 3,
      angle: 'approach the same pain point from the angle of time cost — how many hours per month is this taking their team',
      cta: 'Soft curiosity question, e.g. "Still worth a quick look?"',
      maxWords: 60,
    },
    2: {
      day: 7,
      angle: 'approach from the angle of risk — what happens when things fall through the cracks when systems are disconnected',
      cta: 'Slightly more direct but still low commitment, e.g. "Want me to show you how it works for a ${signals.niche || "business"} your size?"',
      maxWords: 45,
    },
    3: {
      day: 14,
      angle: 'approach from a competitor or peer angle — others in this sector are solving this, offer to share how',
      cta: 'Most direct so far but never pushy, e.g. "Happy to share a quick example if useful?"',
      maxWords: 35,
    },
  };

  const cfg = configs[followUpNumber];

  return `Write follow-up #${followUpNumber} (day ${cfg.day}) on the same email thread for this cold email sequence.

Context:
- Company: ${signals.companyName}
- Sector: ${signals.niche || 'business'}
- City: ${(signals.location || 'their city').split(',')[0]?.trim()}
- Original subject: "${originalSubject}"
- Greeting: "${signals.greeting}"

Rules for this follow-up:
1. Subject: start with "Re: ${originalSubject}" — same thread, builds on the previous email
2. Greeting: use "${signals.greeting}" verbatim
3. Angle for this follow-up: ${cfg.angle}
4. CTA style: ${cfg.cta}
5. Max words: ${cfg.maxWords} (shorter than the previous email)
6. Same tone rules apply: no banned words, natural language, one professional to another
7. Do NOT repeat the previous email's content word-for-word — different angle, different sentences
8. End with the footer verbatim

Footer:
${signals.signOff}

OUTPUT FORMAT:
SUBJECT: Re: ${originalSubject}
BODY:
[follow-up body]`;
}

// ─── User prompt ──────────────────────────────────────────────────────────────

function buildUserPrompt(params: EmailGenerationParams): string {
  const { signals, customPainPoint } = params;

  let ctx = `Company: ${signals.companyName}
Sector: ${signals.niche || 'Business'}
City: ${(signals.location || 'your city').split(',')[0]?.trim()}
Relevant Pryro module for this sector: ${signals.pryroSentence}
`;

  if (signals.websiteDescription) ctx += `\nBusiness context (understand what they do — DO NOT quote or paraphrase in the email):\n"${signals.websiteDescription.slice(0, 300)}"\n`;
  if (signals.recentActivity)     ctx += `\nRecent activity (write in your own words, DO NOT quote directly):\n"${signals.recentActivity.slice(0, 180)}"\n`;
  if (signals.techMentions.length > 0) ctx += `\nTools they may use: ${signals.techMentions.join(', ')}\n`;
  if (signals.staffCount)         ctx += `\nSize signal: ${signals.staffCount}\n`;
  if (customPainPoint)            ctx += `\nSpecific pain point: ${customPainPoint}\n`;

  return `${ctx}
WRITE THE EMAIL NOW using the mandatory structure.

Greeting (copy verbatim): ${signals.greeting}

Opening hook idea (rewrite in your own words — must be a genuine sector insight):
"${signals.firstLine}"

Pain point angle for THIS email (write fresh — not word-for-word):
"${signals.problemSentence}"

Pryro solution sentence (use this, add "— free trial at pryro.com" at the end):
"${signals.pryroSentence}"

CTA idea (make it easy to answer in 5 seconds):
"${signals.ctaSentence}"

${signals.isGenericEmail ? `NOTE: This is a generic inbox (info@, contact@, etc). Address whoever handles operations. Do not mention the generic address.\n` : ''}
Footer (copy VERBATIM, no changes):
${signals.signOff}

Write the email now. Subject line first. Then body. Follow the mandatory structure exactly. Under 100 words in the body.`;
}

// ─── Parse AI response ────────────────────────────────────────────────────────

function parseAIResponse(raw: string): { subject: string; body: string } | null {
  // Strip any separator lines the AI may have echoed from the system prompt
  const cleaned = raw
    .replace(/[═─━=]{4,}/g, '')        // ════ or ──── or ==== lines
    .replace(/[-─]{4,}/g, '')            // ---- lines
    .replace(/\*{4,}/g, '')              // **** lines
    .replace(/^PERMANENT RULES.*$/gm, '')
    .replace(/^RULE \d+.*$/gm, '')       // "RULE 1 —" lines echoed from prompt
    .trim();
  // Try SUBJECT: / BODY: format
  const sm = cleaned.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
  const bm = cleaned.match(/BODY:\s*([\s\S]+?)$/i);
  if (sm && bm) {
    const subject = sm[1]?.trim().replace(/^["']|["']$/g, '').replace(/\*\*(.+?)\*\*/g, '$1') ?? '';
    const body    = bm[1]?.trim().replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/^[-*+]\s+/gm, '') ?? '';
    if (subject && body) return { subject, body };
  }
  // Fallback: first non-empty line = subject, rest = body
  const lines = cleaned.split('\n').filter(l => l.trim());
  if (lines.length >= 2) {
    const subject = (lines[0] ?? '').replace(/^(SUBJECT:|Subject:)\s*/i, '').trim();
    const body    = lines.slice(1).join('\n').replace(/^(BODY:|Body:)\s*/i, '').trim();
    if (subject && body) return { subject, body };
  }
  return null;
}

// ─── Footer enforcement ───────────────────────────────────────────────────────
// If the AI dropped or mangled the footer, stamp the correct one back on.

function enforceFooter(body: string, signOff: string): string {
  // Strip separator lines the AI may have echoed from the system prompt
  const cleanBody = body
    .replace(/[═─━=]{4,}/gm, '')
    .replace(/[-─]{4,}/gm, '')
    .replace(/^PERMANENT RULES.*$/gm, '')
    .replace(/^RULE \d+.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // signOff from sender profile always starts with "Best regards,"
  // If the body already ends with the footer (or close to it), don't double-stamp.
  const footerSignal = signOff.split('\n')[2] ?? ''; // e.g. the full name line
  if (footerSignal && cleanBody.includes(footerSignal)) return cleanBody;
  // Strip any existing sign-off attempts so we don't get two footers
  const stripped = cleanBody
    .replace(/\n+(best regards|kind regards|warm regards|yours (sincerely|faithfully)|regards)[,.]?[\s\S]*$/i, '')
    .replace(/\n+[A-Z][a-z]+ from [A-Z][a-z]+[\s\S]*$/m, '')
    .trimEnd();
  return `${stripped}\n\n${signOff}`;
}

// ─── Fallback template (completely different per industry) ────────────────────
// Used when AI is not configured OR AI output fails the quality gate.
// Greeting is always first. Footer always comes from the sender profile.

function buildFallbackEmail(params: EmailGenerationParams): { subject: string; body: string } {
  const { signals } = params;

  const body =
`${signals.greeting}

${signals.firstLine}

${signals.problemSentence} ${signals.pryroSentence}

${signals.ctaSentence}

${signals.signOff}`;

  return { subject: signals.subjectLine, body };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function buildPersonalizedEmail(
  params: EmailGenerationParams,
  aiProvider: AIProvider | null,
): Promise<GeneratedEmail> {
  const { companyName, signals } = params;

  // ── Try AI ─────────────────────────────────────────────────────────────
  if (aiProvider) {
    console.log(`[EmailBuilder] Calling ${aiProvider.provider}/${aiProvider.active_model} for "${companyName}" (niche=${params.niche}, idx=${params.emailIndex ?? 0})`);
    try {
      const system = buildSystemPrompt(signals);
      const user   = buildUserPrompt(params);
      const raw    = await callAI(aiProvider, system, user);
      const parsed = parseAIResponse(raw);

      if (!parsed) {
        console.warn(`[EmailBuilder] Could not parse AI response for "${companyName}" — raw: ${raw.slice(0, 200)}`);
      } else {
        // Enforce footer: if AI dropped or altered it, stamp the correct one back
        const bodyWithFooter = enforceFooter(parsed.body, signals.signOff);

        const quality = checkEmailQuality({
          subject: parsed.subject,
          body: bodyWithFooter,
          companyName,
          externalPersonalizationScore: signals.personalizationScore,
        });

        console.log(`[EmailBuilder] Quality check for "${companyName}": score=${quality.score}, passed=${quality.passed}, blocks=${quality.flags.filter(f=>f.severity==='block').map(f=>f.type).join(',') || 'none'}`);

        if (quality.passed && quality.score >= 70) {
          console.log(`[EmailBuilder] ✅ AI email accepted for "${companyName}" (score=${quality.score})`);
          return {
            subject: parsed.subject,
            body: bodyWithFooter,
            model: `${aiProvider.provider}/${aiProvider.active_model}`,
            personalizationScore: quality.personalizationScore,
            qualityScore: quality.score,
            qualityPassed: true,
            dataSource: signals.personalizationScore >= 65 ? 'ai_personalized' : 'ai_industry',
          };
        }
        console.warn(`[EmailBuilder] ⚠️ AI output for "${companyName}" scored ${quality.score}/70. Blocks: ${quality.flags.filter(f=>f.severity==='block').map(f=>f.message.slice(0,60)).join(' | ') || 'none'}. Falling back.`);
      }
    } catch (err: any) {
      console.error(`[EmailBuilder] ❌ AI call failed for "${companyName}": ${err?.message}`);
    }
  } else {
    console.log(`[EmailBuilder] No AI provider available for "${companyName}" — using template directly`);
  }

  // ── Fallback ───────────────────────────────────────────────────────────
  const fallback = buildFallbackEmail(params);
  const quality  = checkEmailQuality({
    subject: fallback.subject,
    body:    fallback.body,
    companyName,
    externalPersonalizationScore: signals.personalizationScore,
  });

  return {
    subject: fallback.subject,
    body:    fallback.body,
    model:   'template',
    personalizationScore: quality.personalizationScore,
    qualityScore: quality.score,
    qualityPassed: quality.passed,
    dataSource: 'template',
  };
}
