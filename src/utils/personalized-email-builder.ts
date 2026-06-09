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
  return `You are writing a cold B2B email on behalf of someone at Pryro (an ERP platform for businesses in Africa and Asia).

You will be given facts about one specific company. Write an email that reads like it was personally written for them by a human — not a template, not an advertisement.

The business type is: ${signals.niche || 'business'}. Write ONLY about what a ${signals.niche || 'business'} actually does. Do NOT mix up industries (e.g. never write about animals for a hospital, never write about bookings for a pharmacy).

═══════════════════════════════════════
ABSOLUTE RULES — violating any single rule means the email fails:
═══════════════════════════════════════

RULE 1 — GREETING (first line of body):
The very first line must be the greeting: "${signals.greeting}"
Use this exactly. It must be on its own line, followed by a blank line, then the first observation sentence.
NEVER use: "Dear Sir/Madam", "To Whom It May Concern", "Dear [Name]", "Hello there".

RULE 2 — FIRST OBSERVATION (second element, after greeting):
Must include the company's name AND their city/location.
Must be written in your own words as an observation about their operational situation — NOT a quote or paraphrase from their website.
Must NEVER start with: "Most companies", "Many businesses", "Most clinics", "A lot of".
Must NEVER use phrases like: "I was looking at your website", "I came across your website", "I noticed on your website", "I saw on your website", "According to your website", "Based on your website", "your website mentions", "I visited your website", "I found on your website".
GOOD: "${signals.companyName} in ${signals.location || 'your city'} — clinics at this scale almost always end up managing billing, stock, and payroll in separate systems."
BAD: "I was looking at ${signals.companyName}'s website — you provide healthcare services." / "Most pharmacies struggle with…"

RULE 3 — SUBJECT LINE:
Must be a sharp, specific observation or bold question about THIS company's business situation. Under 8 words ideally.
End with a question mark OR a clear bold observation.
NEVER use these subject line patterns (they read like support tickets, announcements, or generic outreach):
  - "patient billing question" or "[X] question" format
  - "quick question for [company]'s [team]" format
  - "[X] — an [adjective] fix worth [time]" format
  - "partnership", "collaboration", "opportunity", "proposal", "introduction", "follow-up", "ERP", "synergy"
GOOD examples that work for healthcare:
  "${signals.companyName} — billing, stock, and payroll still separate?"
  "${signals.companyName} — is your admin team still reconciling manually?"
  "${signals.companyName} — how long does month-end take?"
  "Healthcare ops in [city] — one gap worth closing"
  "${signals.companyName} — patient scheduling and billing in one place?"

RULE 4 — LENGTH & STRUCTURE:
Body: greeting line + 3 short paragraphs. Under 120 words total (not counting the footer). Short sentences.
Paragraph 1 (after greeting): Observation about their specific business (2 sentences)
Paragraph 2: Problem sentence + Pryro sentence (2 sentences)
Paragraph 3: CTA only (1 sentence ending with ?)
Then: blank line + footer

RULE 5 — PRYRO MENTION:
One sentence only in paragraph 2. Never list features. Never "best-in-class", "innovative", "cutting-edge", "seamless", "robust".
NEVER mention "referral commission", "20-30%", or any commission offer in a first cold email. That is for follow-ups only.
GOOD: "Pryro is an ERP that [specific fix for their specific problem]."

RULE 6 — CTA:
Final paragraph = one soft question only. Must end with "?".
NEVER: "Let's schedule a call", "Book a demo", "Let me know if you're interested", "Please revert".
GOOD: "Would a 10-minute call be worth it to see if this fits how you run ${signals.companyName}?"

RULE 7 — FOOTER (mandatory, exact format):
After the CTA paragraph, leave a blank line then write the footer EXACTLY as provided below.
Do not alter it, do not add "Kind regards" or "Yours faithfully" before it.
The footer is already correctly formatted — copy it verbatim.

RULE 8 — COMPLETELY BANNED PHRASES (instant fail):
i hope this email finds you well | i hope you are doing well | i wanted to reach out | i am reaching out | touching base | circling back | checking in | as per | kindly revert | leverage | synergy | game-changer | cutting-edge | revolutionary | disruptive | world-class | industry-leading | state-of-the-art | innovative solution | seamless | robust | best-in-class | we help companies like yours | businesses like yours | unlock potential | drive growth | scale your business | warm regards | yours sincerely | best wishes | streamline | optimize | empower | transform | referral commission | 20-30% | 20–30% | i was looking at your website | i came across your website | i noticed on your website | i saw on your website | according to your website | based on your website | your website mentions | i visited your website | i found on your website | patient billing question | quick question for | an admin fix worth

RULE 9 — INDUSTRY ACCURACY:
Only write about what a ${signals.niche || 'business'} actually does.
Never mix in unrelated industry language. If the niche is "clinic", write about patients, billing, and medical stock — not animals, bookings, or crops.

OUTPUT FORMAT — respond with exactly:
SUBJECT: [subject line]
BODY:
[email body including greeting, paragraphs, and footer]`;
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
  // Try SUBJECT: / BODY: format
  const sm = raw.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
  const bm = raw.match(/BODY:\s*([\s\S]+?)$/i);
  if (sm && bm) {
    const subject = sm[1]?.trim().replace(/^["']|["']$/g, '').replace(/\*\*(.+?)\*\*/g, '$1') ?? '';
    const body    = bm[1]?.trim().replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/^[-*+]\s+/gm, '') ?? '';
    if (subject && body) return { subject, body };
  }
  // Fallback: first non-empty line = subject, rest = body
  const lines = raw.trim().split('\n').filter(l => l.trim());
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
  // signOff from sender profile always starts with "Best regards,"
  // If the body already ends with the footer (or close to it), don't double-stamp.
  const footerSignal = signOff.split('\n')[2] ?? ''; // e.g. the full name line
  if (footerSignal && body.includes(footerSignal)) return body;
  // Strip any existing sign-off attempts so we don't get two footers
  const stripped = body
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
    try {
      const system = buildSystemPrompt(signals);
      const user   = buildUserPrompt(params);
      const raw    = await callAI(aiProvider, system, user);
      const parsed = parseAIResponse(raw);

      if (parsed) {
        // Enforce footer: if AI dropped or altered it, stamp the correct one back
        const bodyWithFooter = enforceFooter(parsed.body, signals.signOff);

        const quality = checkEmailQuality({
          subject: parsed.subject,
          body: bodyWithFooter,
          companyName,
          externalPersonalizationScore: signals.personalizationScore,
        });

        if (quality.passed && quality.score >= 60) {
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
        console.warn(`[EmailBuilder] AI output for "${companyName}" failed quality (score ${quality.score}). Falling back to template.`);
      }
    } catch (err: any) {
      console.warn(`[EmailBuilder] AI failed for "${companyName}": ${err?.message}. Using template.`);
    }
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
