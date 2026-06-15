/**
 * AI Follow-Up Generator
 *
 * Generates intelligent, contextual follow-up emails using:
 * - Original cold email context
 * - Previous follow-ups history
 * - Lead engagement data (opens, clicks, reply history)
 * - Campaign context
 * - Smart decision engine (adjusts style based on behavior)
 *
 * Supports styles: professional | casual | friendly | soft_reminder |
 *                  value_focused | direct | final_bump | breakup
 */

import { createServiceClient } from "../../supabase/service";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FollowUpStyle =
  | "professional"
  | "casual"
  | "friendly"
  | "soft_reminder"
  | "value_focused"
  | "direct"
  | "final_bump"
  | "breakup";

export type FollowUpTone = "Direct" | "Aggressive" | "Surgical";

export interface FollowUpContext {
  // Lead info
  companyName: string;
  niche: string | null;
  location: string | null;
  companyContext: string | null;

  // Original email
  originalSubject: string;
  originalBody: string;
  sentAt: string;

  // Follow-up history
  followupNumber: number;
  previousFollowups?: Array<{ subject: string; body: string; sentAt: string }>;

  // Engagement signals
  openCount: number;
  clickCount: number;
  hasReplied: boolean;

  // Sender context
  yourCompany: string;
  yourService: string;
  senderName?: string;
  senderPhone?: string;
  senderTitle?: string;
  senderCompany?: string;
  senderEmail?: string;
  contactName?: string;

  // Override
  style?: FollowUpStyle;
  tone?: FollowUpTone;
}

export interface GeneratedFollowUp {
  subject: string;
  body: string;
  style: FollowUpStyle;
  decisionReason: string;
  modelUsed: string;
}

// ── Smart Decision Engine ─────────────────────────────────────────────────────

/**
 * Determines the best follow-up style based on engagement signals.
 * This mirrors what Lemlist/Instantly do under the hood.
 */
export function decideFollowUpStyle(ctx: FollowUpContext): {
  style: FollowUpStyle;
  reason: string;
} {
  const { followupNumber, openCount, clickCount, hasReplied } = ctx;

  // Never send if already replied (caller should check this first)
  if (hasReplied) {
    return { style: "professional", reason: "Lead has replied — should not send follow-up" };
  }

  // Lead opened multiple times → they're interested but haven't replied → stronger CTA
  if (openCount >= 3 && followupNumber <= 2) {
    return {
      style: "value_focused",
      reason: `Lead opened ${openCount} times — showing interest. Value-focused CTA.`,
    };
  }

  // Lead clicked a link → conversion-focused follow-up
  if (clickCount > 0) {
    return {
      style: "direct",
      reason: "Lead clicked a link — high intent signal. Direct conversion follow-up.",
    };
  }

  // Lead opened once but no click → soft engagement reminder
  if (openCount === 1 && followupNumber === 1) {
    return {
      style: "soft_reminder",
      reason: "Single open detected. Gentle reminder to keep it light.",
    };
  }

  // First follow-up, no engagement → friendly approach
  if (followupNumber === 1) {
    return {
      style: "friendly",
      reason: "First follow-up with no engagement. Friendly tone to warm up.",
    };
  }

  // Second follow-up, still no engagement → casual
  if (followupNumber === 2) {
    return {
      style: "casual",
      reason: "Second follow-up. Casual tone to stand out.",
    };
  }

  // Third follow-up → try a different angle
  if (followupNumber === 3) {
    return {
      style: "value_focused",
      reason: "Third follow-up. Lead hasn't responded to previous approaches — lead with value.",
    };
  }

  // Fourth follow-up → start winding down
  if (followupNumber === 4) {
    return {
      style: "final_bump",
      reason: "Fourth follow-up. Final attempt with a low-pressure nudge.",
    };
  }

  // Last follow-up ever → breakup email (highest response rate for last email)
  if (followupNumber >= 5) {
    return {
      style: "breakup",
      reason: `Follow-up #${followupNumber}. Breakup email — highest reply rate for final touchpoints.`,
    };
  }

  return { style: "professional", reason: "Default professional follow-up." };
}

// ── Style-specific prompt builders ────────────────────────────────────────────

// ── Company name cleaner ──────────────────────────────────────────────────────
// Re-uses the shared helper from prospect-researcher via import.
import { getTimeGreeting, cleanCompanyNameForGreeting as cleanCompanyNameShared } from './prospect-researcher';

function cleanCompanyNameForGreeting(raw: string): string {
  return cleanCompanyNameShared(raw);
}

// ── Greeting — time-aware, always company team ────────────────────────────────
// "Good morning Ke.Cicinsurancegroup team," / "Good afternoon Xyz team,"
function resolveGreeting(contactName?: string | null, companyName?: string): string {
  const cleaned = cleanCompanyNameForGreeting(companyName || 'there');
  const timeGreet = getTimeGreeting();
  return `${timeGreet} ${cleaned} team,`;
}

// ── Signature builder — one-line format ──────────────────────────────────────
// Format: Name \n Title \n Company \n Phone
// No "Best regards".
function buildSignature(
  senderName: string,
  senderPhone?: string,
  senderTitle?: string,
  senderCompany?: string,
  senderEmail?: string,
): string {
  const lines: string[] = [];
  if (senderName)    lines.push(senderName);
  if (senderTitle)   lines.push(senderTitle);
  if (senderCompany) lines.push(senderCompany);
  if (senderPhone)   lines.push(senderPhone);
  if (senderEmail)   lines.push(senderEmail);
  return lines.join('\n') || 'Alice Umubyeyi\nPryro';
}

// ── Extract problem + solution from original email body ───────────────────────
// Reads the actual email that was sent and pulls out:
//   1. The problem sentence (what we said their business deals with)
//   2. The Pryro solution sentence ("Pryro is an ERP that...")
// This ensures every follow-up references exactly what was told to this company.

function extractFromOriginalEmail(body: string): {
  problemLine: string | null;
  pryroLine: string | null;
} {
  if (!body || body.length < 30) return { problemLine: null, pryroLine: null };

  // Strip HTML tags if present
  const plain = body
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  const sentences = plain.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 20);

  // Find "Pryro is an ERP that..." sentence
  const pryroLine = sentences.find(s =>
    /pryro is an erp that/i.test(s) || /pryro connects/i.test(s) || /pryro links/i.test(s)
  ) ?? null;

  // Find the problem sentence — typically the second paragraph or a sentence
  // about what the company "deals with" or the specific pain
  const problemLine = sentences.find(s =>
    /many .* businesses|many .* teams|deal with|often deal|still (tracking|reconciling|managing|finding|running)|month-end|payroll|stock|billing|expiry|reconcili/i.test(s) &&
    !/pryro/i.test(s)
  ) ?? null;

  return { problemLine, pryroLine };
}

function buildSystemPrompt(style: FollowUpStyle, senderName: string, tone?: FollowUpTone): string {
  return `You write short follow-up emails for Pryro, an ERP platform that connects finance, inventory, HR, and operations.

CRITICAL RULES — no exceptions:
1. Greeting is ALWAYS time-aware: "Good morning [Company] team," or "Good afternoon [Company] team," — never a first name, never Sir/Madam, never Dear, never "Hi"
2. Subject MUST start with "Follow-up #[N]: Re: [original subject]" — so the prospect sees it is a follow-up
3. Every email MUST mention Pryro by name and describe one specific operational outcome it delivers
4. Never repeat the original email word for word — take a new angle
5. Never mention: commission, referral, percent, free trial, pryro.com, Sir/Madam, cutting-edge, revolutionary, streamline, leverage, empower, synergy, "I wanted to reach out", "I hope this finds you well", "Best regards"
6. Signature is ALWAYS the single-line format provided — copy it VERBATIM, never change it, never add "Best regards" before it
7. CTA must propose a SPECIFIC time slot, e.g. "I have 10 minutes free tomorrow afternoon — does that work?" — never an open-ended question

STAGE RULES:
- Stage 1 (Day 3): Reference previous email, remind them what Pryro does in one sentence, propose a specific time slot. Under 60 words.
- Stage 2 (Day 7): New angle, acknowledge busy inbox, share a specific Pryro outcome different from stage 1, propose a specific time slot. Under 65 words.
- Stage 3 (Day 14): Very short and warm, final follow-up, mention Pryro once, end with "Pryro is here when the time is right." Under 45 words.

OUTPUT FORMAT:
SUBJECT: Follow-up #[N]: Re: [original subject]
BODY:
[greeting]

[follow-up body]

[signature — one line, no "Best regards"]`;
}

function buildUserPrompt(ctx: FollowUpContext, style: FollowUpStyle): string {
  const senderName = ctx.senderName || ctx.yourCompany || "Sales Team";
  const sig        = buildSignature(
    senderName, ctx.senderPhone, ctx.senderTitle,
    ctx.senderCompany || 'Pryro', ctx.senderEmail,
  );
  const greeting   = resolveGreeting(null, ctx.companyName);
  const cleanName  = cleanCompanyNameForGreeting(ctx.companyName);
  const sector     = ctx.niche || 'business';
  const subject    = `Follow-up #${ctx.followupNumber}: Re: ${ctx.originalSubject}`;

  // Extract the exact problem and Pryro solution from the original email
  const { problemLine, pryroLine } = extractFromOriginalEmail(ctx.originalBody);
  const originalContext = [
    problemLine ? `Problem we mentioned: "${problemLine}"` : null,
    pryroLine   ? `Pryro solution we mentioned: "${pryroLine}"` : null,
    ctx.originalBody
      ? `Full original email (for context only — do NOT repeat it verbatim):\n---\n${ctx.originalBody.slice(0, 600)}\n---`
      : null,
  ].filter(Boolean).join('\n\n');

  const stagePrompts: Record<number, string> = {
    1: `Write a short follow-up email. (STAGE 1 — Day 3 after original send)

Company: ${ctx.companyName}
Sector: ${sector}
Original subject: ${ctx.originalSubject}

WHAT WE ALREADY TOLD THEM (use this to connect the dots — do NOT copy word for word):
${originalContext}

Rules:
- Greeting must be exactly: ${greeting}
- Subject must be exactly: ${subject}
- Open with: "Just following up on my email from a few days ago"
- In 1–2 sentences, remind them of the specific problem we mentioned and how Pryro solves it — rephrase, don't copy
- End with: "Would you be open to a quick 10-minute call?"
- Under 65 words total body (not counting greeting or signature)
- Never use Sir/Madam, never use first names

Signature to use (copy VERBATIM):
${sig}`,

    2: `Write a follow-up from a new angle. (STAGE 2 — Day 7 after original send)

Company: ${ctx.companyName}
Sector: ${sector}
Original subject: ${ctx.originalSubject}

WHAT WE ALREADY TOLD THEM (use this as context — do NOT repeat it):
${originalContext}

Rules:
- Greeting must be exactly: ${greeting}
- Subject must be exactly: ${subject}
- Open with: "I know inboxes get busy — one more try from my side."
- Give a NEW specific outcome from Pryro that is different from what was in the original email — a result this company would care about based on their sector
- Make it concrete and short: "Most [sector] teams say the biggest win from Pryro is [outcome]"
- End with: "Worth 10 minutes to see if it fits ${cleanName}?"
- Under 70 words total body (not counting greeting or signature)
- Never use Sir/Madam, never use first names

Signature to use (copy VERBATIM):
${sig}`,

    3: `Write a final follow-up. (STAGE 3 — Day 14 after original send)

Company: ${cleanName}
Sector: ${sector}
Original subject: ${ctx.originalSubject}

WHAT WE ALREADY TOLD THEM (use this as context — do NOT repeat it):
${originalContext}

Rules:
- Greeting must be exactly: ${greeting}
- Subject must be exactly: ${subject}
- Under 50 words total body (not counting greeting or signature)
- Say this is the last message from you, keep it warm not cold
- Reference ${cleanName} by name once
- Mention Pryro once with a one-line reminder of what it does for their sector
- End with: "Pryro is here when the time is right."
- Never use Sir/Madam, never use first names

Signature to use (copy VERBATIM):
${sig}`,
  };

  const stage = Math.min(ctx.followupNumber, 3);
  return stagePrompts[stage]!;
}

// ── Template-based follow-ups — 3 fixed stages, no AI needed ─────────────────

export function buildTemplateFollowUp(
  ctx: FollowUpContext,
  style: FollowUpStyle
): { subject: string; body: string } {
  const {
    companyName, followupNumber, originalSubject, originalBody,
    yourCompany, senderName, senderPhone, senderTitle, senderCompany, senderEmail, niche,
  } = ctx;
  const sender    = senderName || yourCompany || "Sales Team";
  const sig       = buildSignature(sender, senderPhone, senderTitle, senderCompany || 'Pryro', senderEmail);
  const greeting  = resolveGreeting(null, companyName);
  const cleanName = cleanCompanyNameForGreeting(companyName);
  const sector    = niche || 'business';
  const subject   = `Follow-up #${followupNumber}: Re: ${originalSubject}`;

  // Extract the exact problem and solution from the original email we sent
  const { problemLine, pryroLine } = extractFromOriginalEmail(originalBody);

  // Build the reminder from what was actually in the original email
  // If we can extract it, use the exact phrasing. Otherwise fall back to sector bank.
  const buildPryroReminder = (): string => {
    if (pryroLine) {
      // Use the actual sentence from the original email
      return pryroLine.endsWith('.') ? pryroLine : pryroLine + '.';
    }
    // Sector bank fallback
    const sectorOutcomes: Record<string, string> = {
      hospital:     `Pryro is an ERP that connects department budgets and HR payroll so your finance team sees live spend against approved limits — not last month's figures.`,
      healthcare:   `Pryro is an ERP that connects HR attendance and patient billing so your admin team reconciles both from one screen instead of two separate systems.`,
      pharmacy:     `Pryro is an ERP that connects drug stock, billing, and payroll so expiry losses and billing errors surface before month-end — not after.`,
      hotel:        `Pryro is an ERP that connects staff scheduling, vendor billing, and financial management so month-end reconciliation drops from five days to same-day.`,
      lodge:        `Pryro is an ERP that connects bookings, staff costs, and accounts so your real occupancy margin is visible before month-end instead of after.`,
      travel:       `Pryro is an ERP that connects bookings, commissions, and supplier invoicing so your margin on every deal is visible before the trip ends.`,
      restaurant:   `Pryro is an ERP that connects kitchen stock and daily sales so food cost is a live number your team sees every morning — not a month-end surprise.`,
      retail:       `Pryro is an ERP that connects inventory, reorder points, and live sales so a stockout triggers an alert — not an empty shelf in your store.`,
      ngo:          `Pryro is an ERP that connects grant budgets, field expenses, and payroll so donor compliance reports pull together in hours instead of a week.`,
      logistics:    `Pryro is an ERP that connects driver payroll, trip logs, and client billing so month-end reconciliation drops from days to hours.`,
      school:       `Pryro is an ERP that connects fee collection and staff payroll so your bursar's numbers balance automatically — no two-week reconciliation sprint.`,
      construction: `Pryro is an ERP that connects project budgets, contractor payroll, and procurement so cost overruns show up before they show up in the P&L.`,
      generic:      `Pryro is an ERP that connects financial management, HR payroll, and operations into one platform so your team stops moving data between tools every month.`,
    };
    const nicheKey = Object.keys(sectorOutcomes).find(k => (niche || '').toLowerCase().includes(k)) ?? 'generic';
    return sectorOutcomes[nicheKey]!;
  };

  const pryroReminder = buildPryroReminder();

  // Build problem context for FU #2 — what specific problem we told them about
  const buildProblemContext = (): string => {
    if (problemLine) return problemLine;
    const stage2Outcomes: Record<string, string> = {
      hospital:     `Most hospital finance teams say the biggest win from Pryro is getting payroll and department spend visible in one place — the manual month-end reconciliation stops entirely.`,
      healthcare:   `Most healthcare admin teams say the biggest win from Pryro is eliminating the back-and-forth between HR and billing at month-end — both come from one screen.`,
      pharmacy:     `Most pharmacy teams say the biggest win from Pryro is catching expiry and billing issues before month-end instead of finding write-offs in the count.`,
      hotel:        `Most hospitality ops teams say the biggest win from Pryro is month-end going from a five-day manual exercise to same-day because scheduling, billing, and finance finally connect.`,
      lodge:        `Most lodge operators say the biggest win from Pryro is knowing the real occupancy margin before month-end — not after the decisions are already made.`,
      travel:       `Most travel agency teams say the biggest win from Pryro is seeing booking margin before a trip ends instead of weeks after it's already closed.`,
      restaurant:   `Most restaurant operators say the biggest win from Pryro is food cost being a live daily number instead of a month-end surprise.`,
      retail:       `Most retail teams say the biggest win from Pryro is stockout alerts replacing the empty-shelf discovery — the system warns before the customer finds nothing.`,
      ngo:          `Most NGO finance teams say the biggest win from Pryro is cutting donor report preparation from a week to a single afternoon.`,
      logistics:    `Most logistics ops teams say the biggest win from Pryro is month-end driver payroll reconciliation going from days to hours.`,
      school:       `Most school bursars say the biggest win from Pryro is fee collection and staff payroll balancing automatically instead of needing two weeks of chasing.`,
      construction: `Most construction finance managers say the biggest win from Pryro is cost overruns showing up in the system before they show up in the P&L.`,
      generic:      `Most businesses say the biggest win from Pryro is the team stopping moving data between finance, HR, and operations tools — it flows automatically instead.`,
    };
    const nicheKey = Object.keys(stage2Outcomes).find(k => (niche || '').toLowerCase().includes(k)) ?? 'generic';
    return stage2Outcomes[nicheKey]!;
  };

  // FU #1 — Day 3 — Remind them of the problem + Pryro solution from the original email
  if (followupNumber === 1) {
    return {
      subject,
      body: `${greeting}

Just following up on my email from a few days ago — did it land at a bad time?

As a quick reminder: ${pryroReminder}

I have 10 minutes free tomorrow afternoon if that works — what do you think?

${sig}`,
    };
  }

  // FU #2 — Day 7 — New angle, different Pryro outcome
  if (followupNumber === 2) {
    return {
      subject,
      body: `${greeting}

I know inboxes get busy — one more try from my side.

${buildProblemContext()}

I am free for a quick call later today — does that work for you?

${sig}`,
    };
  }

  // FU #3 — Day 14 — Final, warm, references original email context
  return {
    subject,
    body: `${greeting}

Last follow-up from me — keeping it short.

${pryroReminder}

If this ever becomes a priority at ${cleanName}, Pryro is here when the time is right.

${sig}`,
  };
}

// ── AI generation via configured provider ─────────────────────────────────────

/** Call a single provider. Returns text or throws with the HTTP status. */
async function callSingleProvider(
  provider: any,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<{ text: string; model: string }> {
  let text = "";

  if (provider.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.api_key}` },
      body: JSON.stringify({
        model: provider.active_model || "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) throw Object.assign(new Error(`OpenAI ${res.status}`), { status: res.status });
    text = (await res.json()).choices[0].message.content;
    return { text, model: provider.active_model || "gpt-4o-mini" };

  } else if (provider.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": provider.api_key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: provider.active_model || "claude-3-5-haiku-20241022",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) throw Object.assign(new Error(`Anthropic ${res.status}`), { status: res.status });
    text = (await res.json()).content[0].text;
    return { text, model: provider.active_model || "claude-3-5-haiku-20241022" };

  } else if (provider.provider === "groq") {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.api_key}` },
      body: JSON.stringify({
        model: provider.active_model || "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) throw Object.assign(new Error(`Groq ${res.status}`), { status: res.status });
    text = (await res.json()).choices[0].message.content;
    return { text, model: provider.active_model || "llama-3.3-70b-versatile" };

  } else if (provider.provider === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${provider.active_model || "gemini-1.5-flash"}:generateContent?key=${provider.api_key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
        }),
      }
    );
    if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}`), { status: res.status });
    text = (await res.json()).candidates[0].content.parts[0].text;
    return { text, model: provider.active_model || "gemini-1.5-flash" };

  } else if (provider.provider === "mistral") {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.api_key}` },
      body: JSON.stringify({
        model: provider.active_model || "mistral-small",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) throw Object.assign(new Error(`Mistral ${res.status}`), { status: res.status });
    text = (await res.json()).choices[0].message.content;
    return { text, model: provider.active_model || "mistral-small" };
  }

  throw new Error(`Unknown provider: ${provider.provider}`);
}

/**
 * Try all configured AI providers in order.
 * If the active provider fails with 429 (rate limit) or 5xx (server error),
 * automatically fall through to the next available provider.
 * Non-rate-limit errors (401 bad key, 400 bad request) also fall through.
 */
async function callAIProvider(
  userId: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string; model: string } | null> {
  const service = createServiceClient();
  const maxTokens = 400;

  // 1. Load ALL active providers for this user, sorted: active one first
  const { data: allProviders } = await service
    .from("ai_providers")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  // 2. Also check legacy ai_settings table
  const { data: legacySettings } = await service
    .from("ai_settings")
    .select("*")
    .eq("user_id", userId)
    .limit(5);

  // Build ordered provider list: ai_providers first, then legacy ai_settings
  const providers: any[] = [
    ...(allProviders?.filter((p: any) => p.api_key) ?? []),
    ...(legacySettings?.filter((s: any) => s.api_key && !allProviders?.some((p: any) => p.provider === s.provider)) ?? []),
  ];

  if (providers.length === 0) {
    console.warn("[ai-followup-generator] No AI providers configured");
    return null;
  }

  // 3. Try each provider — auto-fallback on rate limit or errors
  for (const provider of providers) {
    try {
      const result = await callSingleProvider(provider, systemPrompt, userPrompt, maxTokens);
      // Success — return immediately
      if (providers.length > 1 && providers[0].provider !== provider.provider) {
        console.log(`[ai-followup-generator] Used fallback provider: ${provider.provider}`);
      }
      return result;
    } catch (err: any) {
      const status = err.status as number | undefined;
      const isRateLimit   = status === 429;
      const isServerError = status && status >= 500;
      const isAuthError   = status === 401 || status === 403;

      if (isAuthError) {
        // Bad API key — skip this provider but try others
        console.warn(`[ai-followup-generator] ${provider.provider} auth error (${status}) — skipping`);
        continue;
      }

      if (isRateLimit) {
        console.warn(`[ai-followup-generator] ${provider.provider} rate limited (429) — trying next provider`);
        continue;
      }

      if (isServerError) {
        console.warn(`[ai-followup-generator] ${provider.provider} server error (${status}) — trying next provider`);
        continue;
      }

      // Other error (bad request, parse error, network, etc.) — log and try next
      console.error(`[ai-followup-generator] ${provider.provider} error: ${err.message} — trying next provider`);
      continue;
    }
  }

  // All providers failed
  console.error(`[ai-followup-generator] All ${providers.length} provider(s) failed`);
  return null;
}

// ── Parse AI response ─────────────────────────────────────────────────────────

function parseAIFollowUp(text: string, fallbackSubject: string): { subject: string; body: string } {
  const subjectMatch = text.match(/^SUBJECT:\s*(.+?)(?:\n|$)/im);
  const bodyMatch = text.match(/^BODY:\s*([\s\S]+?)$/im);

  if (subjectMatch && bodyMatch) {
    return {
      subject: subjectMatch[1].trim().replace(/^["']|["']$/g, ""),
      body: bodyMatch[1].trim().replace(/^["']|["']$/g, ""),
    };
  }

  // Fallback: first line = subject, rest = body
  const lines = text.trim().split("\n");
  const subject = lines[0]?.replace(/^(SUBJECT:|Subject:)/i, "").trim() || fallbackSubject;
  const body = lines.slice(1).join("\n").replace(/^(BODY:|Body:)/i, "").trim() || text;

  return { subject, body };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate a follow-up email.
 * Tries AI generation first; falls back to templates if no provider configured.
 */
export async function generateFollowUp(
  userId: string,
  ctx: FollowUpContext
): Promise<GeneratedFollowUp> {
  // Determine style via smart decision engine (or use override)
  const { style: decidedStyle, reason } = ctx.style
    ? { style: ctx.style, reason: `Manual style override: ${ctx.style}` }
    : decideFollowUpStyle(ctx);

  const senderName = ctx.senderName ?? ctx.yourCompany;

  // Try AI generation
  const systemPrompt = buildSystemPrompt(decidedStyle, senderName, ctx.tone);
  const userPrompt = buildUserPrompt(ctx, decidedStyle);

  const aiResult = await callAIProvider(userId, systemPrompt, userPrompt);

  if (aiResult) {
    const fallbackSubject = `Re: ${ctx.originalSubject}`;
    const { subject, body } = parseAIFollowUp(aiResult.text, fallbackSubject);

    // Sanity check — body must be more than just a greeting line
    if (subject && body && body.length > 80) {
      return {
        subject,
        body,
        style: decidedStyle,
        decisionReason: reason,
        modelUsed: aiResult.model,
      };
    }
  }

  // Fallback to template
  const { subject, body } = buildTemplateFollowUp(ctx, decidedStyle);

  return {
    subject,
    body,
    style: decidedStyle,
    decisionReason: reason + " (template fallback — no AI provider configured)",
    modelUsed: "template",
  };
}

// ── AI Reply Classification ───────────────────────────────────────────────────

export type ReplyClassification =
  | "interested"
  | "not_interested"
  | "meeting_request"
  | "unsubscribe"
  | "auto_reply"
  | "neutral"
  | "positive"
  | "negative";

const AUTO_REPLY_PATTERNS = [
  /out of (office|the office)/i,
  /i('m| am) (away|on vacation|on holiday|traveling)/i,
  /auto(-| )?(reply|response|message|generated)/i,
  /this is an automated/i,
  /do not reply to this email/i,
  /noreply|no-reply/i,
  /will (be|return) (back|available)/i,
  /absence/i,
  /vacation responder/i,
];

const UNSUBSCRIBE_PATTERNS = [
  /unsubscribe/i,
  /remove (me|my email|my address)/i,
  /stop (emailing|sending|contacting)/i,
  /please (don'?t?|do not) (email|contact|reach)/i,
  /opt(( |-)?out)/i,
  /take me off/i,
  /don'?t? (contact|email) (me|us) (again|anymore)/i,
];

const MEETING_PATTERNS = [
  /schedul(e|ing)/i,
  /call (me|us|this week|next week)/i,
  /set up (a )?(call|meeting|demo)/i,
  /calendly/i,
  /book (a )?(time|slot|meeting)/i,
  /when (are you|can we)/i,
  /availability/i,
  /(let'?s|can we) (talk|chat|meet|connect)/i,
];

const INTERESTED_PATTERNS = [
  /interest(ed)?/i,
  /tell me more/i,
  /sounds good/i,
  /would (like|love) to/i,
  /yes(,| |\.)/i,
  /please (send|forward|share)/i,
  /more (information|info|details)/i,
  /how (much|does it work|do i)/i,
  /pricing/i,
  /demo/i,
];

const NEGATIVE_PATTERNS = [
  /not interested/i,
  /not (relevant|applicable|useful)/i,
  /already (have|using|use)/i,
  /not (right|a good) (fit|time|match)/i,
  /wrong person/i,
  /please (stop|remove)/i,
];

/**
 * Classify an email reply using keyword analysis.
 * Falls back gracefully — no AI required for basic classification.
 */
export function classifyReply(
  body: string,
  subject?: string
): {
  classification: ReplyClassification;
  isPositive: boolean;
  isAutoReply: boolean;
  isUnsubscribe: boolean;
  confidence: number;
} {
  const text = `${subject ?? ""} ${body}`.toLowerCase();

  // Auto-reply detection (highest priority)
  if (AUTO_REPLY_PATTERNS.some((p) => p.test(text))) {
    return {
      classification: "auto_reply",
      isPositive: false,
      isAutoReply: true,
      isUnsubscribe: false,
      confidence: 0.95,
    };
  }

  // Unsubscribe detection
  if (UNSUBSCRIBE_PATTERNS.some((p) => p.test(text))) {
    return {
      classification: "unsubscribe",
      isPositive: false,
      isAutoReply: false,
      isUnsubscribe: true,
      confidence: 0.9,
    };
  }

  // Meeting request (very positive signal)
  if (MEETING_PATTERNS.some((p) => p.test(text))) {
    return {
      classification: "meeting_request",
      isPositive: true,
      isAutoReply: false,
      isUnsubscribe: false,
      confidence: 0.85,
    };
  }

  // Interested
  const interestedScore = INTERESTED_PATTERNS.filter((p) => p.test(text)).length;
  if (interestedScore >= 2) {
    return {
      classification: "interested",
      isPositive: true,
      isAutoReply: false,
      isUnsubscribe: false,
      confidence: Math.min(0.5 + interestedScore * 0.1, 0.9),
    };
  }
  if (interestedScore === 1) {
    return {
      classification: "positive",
      isPositive: true,
      isAutoReply: false,
      isUnsubscribe: false,
      confidence: 0.6,
    };
  }

  // Negative
  if (NEGATIVE_PATTERNS.some((p) => p.test(text))) {
    return {
      classification: "not_interested",
      isPositive: false,
      isAutoReply: false,
      isUnsubscribe: false,
      confidence: 0.75,
    };
  }

  // Neutral
  return {
    classification: "neutral",
    isPositive: false,
    isAutoReply: false,
    isUnsubscribe: false,
    confidence: 0.4,
  };
}

/**
 * Enhanced AI classification using the configured AI provider.
 * Only called if AI provider is available and keyword analysis was neutral/uncertain.
 */
export async function classifyReplyWithAI(
  userId: string,
  body: string,
  subject: string
): Promise<{ classification: ReplyClassification; isPositive: boolean; confidence: number }> {
  // First try keyword classification
  const keywordResult = classifyReply(body, subject);
  if (keywordResult.confidence >= 0.75) {
    return keywordResult;
  }

  // Try AI enhancement for borderline cases
  const systemPrompt = `You classify cold email replies into exactly one of these categories:
- interested: Lead shows interest, asks questions, wants more info
- not_interested: Polite rejection, not a fit
- meeting_request: Wants to schedule a call or meeting
- unsubscribe: Wants to be removed from outreach
- auto_reply: Automated out-of-office response
- neutral: No clear intent

Reply with ONLY the category name, nothing else.`;

  const userPrompt = `Subject: ${subject}\n\nBody: ${body.slice(0, 500)}`;

  const result = await callAIProvider(userId, systemPrompt, userPrompt);

  if (result) {
    const raw = result.text.trim().toLowerCase().replace(/[^a-z_]/g, "");
    const validClasses: ReplyClassification[] = [
      "interested", "not_interested", "meeting_request",
      "unsubscribe", "auto_reply", "neutral", "positive", "negative"
    ];

    if (validClasses.includes(raw as ReplyClassification)) {
      const classification = raw as ReplyClassification;
      const isPositive = ["interested", "meeting_request", "positive"].includes(classification);
      return { classification, isPositive, confidence: 0.85 };
    }
  }

  // Fall back to keyword result
  return keywordResult;
}
