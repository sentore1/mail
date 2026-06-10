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
  senderPhone?: string;   // shown in signature
  contactName?: string;   // scraped owner/contact name or derived from email

  // Override
  style?: FollowUpStyle;
  tone?: FollowUpTone; // NEW: writing tone
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
// Strips legal suffixes and bracket content before use in follow-up greetings.
function cleanCompanyNameForGreeting(raw: string): string {
  let name = raw
    .replace(/\s*\([^)]*\)\s*/g, ' ')                                              // (NW), (Pvt), etc.
    .replace(/\b(Private Limited|Pvt\.?\s*Ltd\.?|Public Limited Company)\b\.?\s*/gi, '')
    .replace(/\b(Ltd|Limited|Inc|LLC|LLP|PLC|Corp|Corporation|NW|Pty|Pvt)\b\.?\s*/gi, ' ')
    .replace(/\s*[-–—|/]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name || raw.trim();
}

// ── Greeting — always company team, never first name ─────────────────────────
// Follow-ups go to scraped contacts who often have no real first name.
// Using "Hi [Company] team," is always safe, professional, and correct.
function resolveGreeting(contactName?: string | null, companyName?: string): string {
  const cleaned = cleanCompanyNameForGreeting(companyName || 'there');
  return `Hi ${cleaned} team,`;
}

// ── Signature builder — multi-line, pulled from sender profile ────────────────
function buildSignature(senderName: string, senderPhone?: string): string {
  const phone = senderPhone?.trim() || '';
  return phone
    ? `Best regards,\n\n${senderName}\nPryro\n${phone}`
    : `Best regards,\n\n${senderName}\nPryro`;
}

function buildSystemPrompt(style: FollowUpStyle, senderName: string, tone?: FollowUpTone): string {
  return `You write short follow-up emails for Pryro, an ERP platform.

CRITICAL RULES — no exceptions:
1. Greeting is ALWAYS "Hi [Company] team," — never a first name, never Sir/Madam, never Dear
2. Subject is ALWAYS "Re: [original subject]" so it threads in the inbox
3. Never repeat the original email body — take a completely different angle
4. Never mention: free trial, pryro.com, commission, referral, percent, Sir/Madam, cutting-edge, revolutionary, streamline, leverage, empower, synergy, "I wanted to reach out", "I hope this finds you well", "Teams like yours"
5. Signature is ALWAYS the multi-line block provided — never change it

STAGE RULES:
- Stage 1 (Day 3): Gentle bump — reference previous email, ask if timing was bad, one low-friction question. Under 50 words.
- Stage 2 (Day 7): New angle — acknowledge busy inbox, share ONE specific operational outcome for their sector (not features), ask for 10 minutes. Under 60 words.
- Stage 3 (Day 14): Final — very short and warm, leave door open, end with "Pryro is here when the time is right". Under 40 words.

OUTPUT FORMAT:
SUBJECT: Re: [original subject]
BODY:
[greeting]

[follow-up body]

[signature block]`;
}

function buildUserPrompt(ctx: FollowUpContext, style: FollowUpStyle): string {
  const senderName = ctx.senderName || ctx.yourCompany || "Sales Team";
  const sig        = buildSignature(senderName, ctx.senderPhone);
  const greeting   = resolveGreeting(null, ctx.companyName); // always company team
  const cleanName  = cleanCompanyNameForGreeting(ctx.companyName);
  const sector     = ctx.niche || 'business';

  const stagePrompts: Record<number, string> = {
    1: `Write a short gentle follow-up email. (STAGE 1 — Day 3)

Company: ${ctx.companyName}
Sector: ${sector}
Original subject: ${ctx.originalSubject}

Rules:
- Greeting must be exactly: ${greeting}
- Open with reference to previous email: "Just following up on my email from a few days ago"
- Ask if it landed at a bad time
- End with one low-friction question like "Still open to a quick look?"
- Under 50 words total body (not counting signature)
- Subject: Re: ${ctx.originalSubject}
- Never use Sir/Madam or first names
- Never repeat original email content

Signature to use (copy VERBATIM):
${sig}`,

    2: `Write a follow-up from a completely new angle. (STAGE 2 — Day 7)

Company: ${ctx.companyName}
Sector: ${sector}
Original subject: ${ctx.originalSubject}

Rules:
- Greeting must be exactly: ${greeting}
- Acknowledge inbox is busy: "I know inboxes get busy — wanted to try once more"
- Share ONE new specific operational outcome Pryro delivers for ${sector} businesses — NOT in the first email, NOT a feature list
- Example for hospitals: "Most hospital finance teams say getting payroll and department spend visible in one place stops the manual month-end reconciliation entirely"
- End with exactly: "Worth 10 minutes to see if it fits?"
- Under 60 words total body (not counting signature)
- Subject: Re: ${ctx.originalSubject}
- Never use Sir/Madam or first names

Signature to use (copy VERBATIM):
${sig}`,

    3: `Write a final short break-up follow-up. (STAGE 3 — Day 14)

Company: ${cleanName}
Sector: ${sector}
Original subject: ${ctx.originalSubject}

Rules:
- Greeting must be exactly: ${greeting}
- Keep it very short and warm (under 40 words body)
- Say this is the last follow-up without being cold or rude
- Leave the door open genuinely
- Mention ${cleanName} by name in the body
- End with exactly: "Pryro is here when the time is right"
- Subject: Re: ${ctx.originalSubject}
- Never use Sir/Madam or first names

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
  const { companyName, followupNumber, originalSubject, yourCompany, senderName, senderPhone, niche } = ctx;
  const sender   = senderName || yourCompany || "Sales Team";
  const sig      = buildSignature(sender, senderPhone);
  const greeting = resolveGreeting(null, companyName); // always company team
  const cleanName = cleanCompanyNameForGreeting(companyName);
  const sector   = niche || 'business';
  const subject  = `Re: ${originalSubject}`;

  // ── FU #1 — Day 3 — Gentle bump ──────────────────────────────────────────
  if (followupNumber === 1) {
    return {
      subject,
      body: `${greeting}

Just following up on my email from a few days ago — did it land at a bad time?

Still open to a quick look?

${sig}`,
    };
  }

  // ── FU #2 — Day 7 — New angle ─────────────────────────────────────────────
  if (followupNumber === 2) {
    const sectorOutcomes: Record<string, string> = {
      hospital:     'Most hospital finance teams say the biggest win from Pryro is getting payroll and department spend visible in one place instead of reconciling manually every month.',
      healthcare:   'Most healthcare admin teams say the biggest win from Pryro is eliminating the manual reconciliation between staff payroll and patient billing at month-end.',
      pharmacy:     'Most pharmacy teams say the biggest win from Pryro is catching drug expiry issues automatically before they become write-offs.',
      hotel:        'Most hospitality ops teams say the biggest win from Pryro is getting staff scheduling, vendor billing, and financials into one view instead of three.',
      travel:       'Most travel agency teams say the biggest win from Pryro is seeing booking margin before a trip ends instead of weeks after.',
      restaurant:   'Most restaurant operators say the biggest win from Pryro is having food cost as a live daily number instead of a month-end surprise.',
      retail:       'Most retail teams say the biggest win from Pryro is stockout alerts replacing the empty-shelf discovery.',
      ngo:          'Most NGO finance teams say the biggest win from Pryro is cutting donor report preparation from a week to a single afternoon.',
      logistics:    'Most logistics ops teams say the biggest win from Pryro is month-end driver payroll reconciliation going from days to hours.',
      school:       'Most school bursars say the biggest win from Pryro is fee collection and staff payroll balancing automatically instead of needing two weeks of chasing.',
      construction: 'Most construction finance managers say the biggest win from Pryro is cost overruns showing up in the system before they show up in the P&L.',
    };
    const nicheKey = Object.keys(sectorOutcomes).find(k => (niche || '').toLowerCase().includes(k)) || 'generic';
    const outcome = sectorOutcomes[nicheKey] ||
      `Most ${sector} teams say the biggest win from Pryro is getting HR, finance, and operations into one live view instead of reconciling manually every month.`;

    return {
      subject,
      body: `${greeting}

I know inboxes get busy — wanted to try once more.

${outcome}

Worth 10 minutes to see if it fits?

${sig}`,
    };
  }

  // ── FU #3 — Day 14 — Final ────────────────────────────────────────────────
  return {
    subject,
    body: `${greeting}

Last follow-up from me — keeping it short.

If consolidating HR, finance, and operations ever becomes a priority at ${cleanName}, Pryro is here when the time is right.

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
