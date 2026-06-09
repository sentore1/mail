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
  const body = { temperature: 0.75, max_tokens: 420 };  // 0.75 for more variation across bulk sends

  if (p.provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.api_key}` },
      body: JSON.stringify({ model: p.active_model || 'gpt-4o-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...body }),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}`);
    return (await r.json()).choices[0].message.content;
  }

  if (p.provider === 'groq') {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.api_key}` },
      body: JSON.stringify({ model: p.active_model || 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...body }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`Groq ${r.status}`);
    return (await r.json()).choices[0].message.content;
  }

  if (p.provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': p.api_key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: p.active_model || 'claude-3-5-haiku-20241022', max_tokens: 420, system, messages: [{ role: 'user', content: user }], temperature: 0.6 }),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}`);
    return (await r.json()).content[0].text;
  }

  if (p.provider === 'gemini') {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${p.active_model || 'gemini-1.5-flash'}:generateContent?key=${p.api_key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: system + '\n\n' + user }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 420 } }),
        signal: AbortSignal.timeout(12000) }
    );
    if (!r.ok) throw new Error(`Gemini ${r.status}`);
    return (await r.json()).candidates[0].content.parts[0].text;
  }

  if (p.provider === 'mistral') {
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.api_key}` },
      body: JSON.stringify({ model: p.active_model || 'mistral-small', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...body }),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error(`Mistral ${r.status}`);
    return (await r.json()).choices[0].message.content;
  }

  throw new Error(`Unknown provider: ${p.provider}`);
}

// ─── System prompt (all rules including greeting + footer) ───────────────────

function buildSystemPrompt(signals: ProspectSignals): string {
  return `You are writing a cold B2B email on behalf of someone at Pryro.

WHAT PRYRO ACTUALLY IS (use these real facts — never invent features):
Pryro is a complete cloud ERP platform that serves businesses worldwide. Its real modules are:
  - Financial Management: invoicing, budgets, forecasting, cash flow tracking, proposals, quotations
  - Inventory Management: real-time stock tracking, multi-warehouse, supplier management, analytics
  - HR & Payroll: attendance tracking, payroll processing, benefits administration, scheduling
  - Project Management: tasks, time tracking, timesheets, resource management, progress reports
  - CRM: customer relationships, pipeline, invoicing integration
  - AI-powered Analytics: real-time dashboards, business intelligence, instant insights

PRYRO'S REAL CREDIBILITY (you may reference ONE naturally — do not list them all):
  - Free trial available (pryro.com)
  - 1–2 week implementation
  - 99.9% uptime guarantee
  - Trusted by 64,000+ businesses worldwide

The business type being emailed is: ${signals.niche || 'business'}. Write ONLY about what a ${signals.niche || 'business'} actually does. Do NOT mix up industries.

PERMANENT RULES — every single rule is non-negotiable:

RULE 1 — GREETING (first line, mandatory):
Use this exact greeting: "${signals.greeting}"
Copy it verbatim. One line. Followed by a blank line.
This is the ONLY allowed greeting format.
PERMANENTLY BANNED: "Dear Sir/Madam", "To Whom It May Concern", "Hello there", "Dear [Name]".
If the greeting is "Hi there," — use it as-is. Do not invent a name. Do not change it.
The greeting is provided by the system and must be used exactly as given.

RULE 2 — FIRST OBSERVATION (paragraph 1, line 1):
Must name the company AND their city.
Written entirely in your own words — never a quote or paraphrase from their website.
Must feel like a genuine human insight, not a script opener.
BANNED openers: "Most companies", "Many businesses", "Most clinics", "at this stage almost always", "clinics at this stage", "I was looking at your website", "I came across your website", "I noticed on your website".

RULE 3 — SUBJECT LINE (under 8 words):
Sharp specific question or bold observation naming this company's exact pain point.
Must contain the company name OR a specific operational problem.
BANNED: "partnership", "collaboration", "opportunity", "proposal", "introduction", "follow-up", "ERP", "synergy", "question for [team]", "fix worth [time]".

RULE 4 — STRUCTURE AND LENGTH:
  Line 1: Greeting (verbatim from Rule 1)
  Blank line
  P1 (MAXIMUM 2 sentences, each under 20 words): Specific observation about this company.
  Blank line
  P2 (EXACTLY 2 sentences, each under 20 words): One problem sentence. One Pryro module sentence.
  Blank line
  P3 (EXACTLY 1 sentence): CTA question ending with ?
  Blank line
  Footer (verbatim, no changes)
Total body words (not counting footer): under 100.
NEVER write 3 or 4 sentences in a single paragraph.

RULE 5 — PRYRO SENTENCE (P2, sentence 2):
ONE sentence only. Name the SPECIFIC Pryro module for this industry.
End with a brief mention of the free trial.
BANNED: listing multiple modules, "best-in-class", "innovative", "cutting-edge", "seamless", "robust", "referral commission", "20-30%".
GOOD: "Pryro's HR & Payroll module handles attendance and payroll in one place — there's a free trial if you want to test it on your own numbers."

RULE 6 — CTA (P3, one sentence):
One soft question ending with ?
MUST naturally reference Pryro's free trial.
BANNED: "Let's schedule a call", "Book a demo", "Let me know if interested", "Please revert".

RULE 7 — FOOTER:
Copy the footer below VERBATIM after P3. Blank line before it. No changes.

RULE 8 — PERMANENTLY BANNED PHRASES (instant disqualification):
i hope this email finds you well | i wanted to reach out | i am reaching out | touching base | circling back | checking in | kindly revert | leverage | synergy | game-changer | cutting-edge | revolutionary | disruptive | world-class | industry-leading | state-of-the-art | innovative solution | seamless | robust | best-in-class | we help companies like yours | unlock potential | drive growth | scale your business | warm regards | yours sincerely | best wishes | streamline | optimize | empower | transform | referral commission | 20-30% | 20–30% | i was looking at your website | i came across your website | based on your website | your website mentions | should have been automated a long time ago | easy to miss until an audit | clinics at this stage almost always | businesses at this stage | companies at this stage | at this stage almost always hit the same wall

RULE 9 — INDUSTRY ACCURACY:
Write ONLY about what a ${signals.niche || 'business'} does. Never mix in unrelated industry language.

RULE 10 — COMPANY NAME:
Use the company name exactly as provided: "${signals.companyName}"
Do not add, remove, or change any characters. Do not add "(Ltd)", "(Inc)", etc.
If the company name looks incomplete or contains special characters, still use it as-is.

OUTPUT FORMAT (respond with exactly this structure):
SUBJECT: [subject line]
BODY:
[email body]`;
}

// ─── User prompt ──────────────────────────────────────────────────────────────

function buildUserPrompt(params: EmailGenerationParams): string {
  const { signals, customPainPoint } = params;

  let ctx = `Company: ${signals.companyName}
Industry: ${signals.niche || 'Business'}
City: ${(signals.location || 'your city').split(',')[0]?.trim()}
`;

  if (signals.websiteDescription) ctx += `\nBackground context about their business (use this to understand what they do — DO NOT quote or paraphrase this text in the email):\n"${signals.websiteDescription.slice(0, 300)}"\n`;
  if (signals.recentActivity)     ctx += `\nRecent activity (use this as context — write in your own words, do NOT quote it directly):\n"${signals.recentActivity.slice(0, 180)}"\n`;
  if (signals.techMentions.length > 0) ctx += `\nTools detected on their site: ${signals.techMentions.join(', ')}\n`;
  if (signals.staffCount)         ctx += `\nStaff count: ${signals.staffCount}\n`;
  if (customPainPoint)            ctx += `\nSpecific pain point to address: ${customPainPoint}\n`;

  return `${ctx}
Greeting to use as first line (copy exactly):
${signals.greeting}

Suggested observation line after greeting (use this or write a better one — must follow Rule 2):
"${signals.firstLine}"

Problem angle for THIS email — use this as the basis but write it in fresh language, not the same sentence as any other email you have written for this industry:
"${signals.problemSentence}"

How Pryro fixes it (use this exact sentence — do NOT add commission mention):
"${signals.pryroSentence}"

CTA to end with (use this or write a better one — must be a soft question ending with ?):
"${signals.ctaSentence}"

${signals.isGenericEmail ? `⚠ NOTE: The recipient email address appears to be a generic address (info@, contact@, etc.). This means the email may not reach a decision-maker. Write the email as if addressing whoever manages operations or admin — do NOT reference that you are writing to a generic inbox.\n` : ''}
Footer to copy VERBATIM after the CTA paragraph (blank line, then this, no changes):
${signals.signOff}

Write the email now. Follow all 9 rules exactly. The problem paragraph MUST be written in fresh language — do not copy the problem angle sentence word-for-word.`;
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
