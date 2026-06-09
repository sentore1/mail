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

function buildSystemPrompt(style: FollowUpStyle, senderName: string, tone?: FollowUpTone): string {
  return `You are ${senderName} writing a short follow-up email on behalf of Pryro.

This is a follow-up on a cold email thread. The prospect has not replied yet.

YOUR GOAL: Write one short, human follow-up that approaches the same pain point from a different angle than the previous email. Never repeat the same sentences.

MANDATORY STRUCTURE:
Line 1: Greeting (provided — copy verbatim)
Blank line
Paragraph 1 (1–2 sentences, each under 20 words): A new angle on their operational pain — time cost, risk, or what peers in their sector are doing.
Blank line
Paragraph 2 (1 sentence): A soft CTA question that is easy to answer in 5 seconds.
Blank line
Footer (provided — copy verbatim, no changes)

TONE: One professional to another. Short sentences. Natural language. No jargon.

BANNED WORDS: streamline, leverage, empower, optimize, cutting-edge, revolutionary, game-changing, seamlessly, robust, scalable, innovative, transform, synergy, excited to share, pleased to inform, i hope this email finds you well, just checking in, circling back, touching base, per my last email, as discussed, kindly revert, best-in-class.

NEVER: repeat the opening email word-for-word, pitch the product again, ask for a meeting, use "let me know if you're interested".

MAX LENGTH: 50 words in the body (not counting footer). Scannable on mobile in under 15 seconds.

OUTPUT FORMAT:
SUBJECT: Re: [original subject]
BODY:
[email body]`;
}

// ── Greeting — updated to match new standard ─────────────────────────────────
function resolveGreeting(contactName?: string | null): string {
  if (contactName) {
    const first = contactName.trim().split(/[\s,]+/)[0]?.trim() ?? '';
    if (first.length >= 2 && first.length <= 15 && /^[a-zA-Z]+$/.test(first)) {
      return `Hi ${first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()},`;
    }
  }
  return 'Hi Sir/Madam,';
}

function buildUserPrompt(ctx: FollowUpContext, style: FollowUpStyle): string {
  const senderName = ctx.senderName || ctx.yourCompany || "Sales Team";
  const phoneLine  = ctx.senderPhone ? `\n${ctx.senderPhone}` : "";
  const signatureBlock = `Best regards,\n\n${senderName}\nPryro${phoneLine}`;
  const greeting = resolveGreeting(ctx.contactName);

  // Each follow-up approaches the pain point from a different angle
  const angles: Record<number, string> = {
    1: `Approach from the TIME COST angle: how many hours per month does this cost their team when these systems are separate?`,
    2: `Approach from the RISK angle: what quietly goes wrong (errors, missed data, compliance gaps) when systems don't connect?`,
    3: `Approach from the PEER angle: others in the ${ctx.niche || 'same sector'} have solved this — offer to share a brief example.`,
  };
  const angle = angles[Math.min(ctx.followupNumber, 3)] ?? angles[3];

  const dayCopy: Record<number, string> = { 1: "day 3", 2: "day 7", 3: "day 14" };
  const dayLabel = dayCopy[Math.min(ctx.followupNumber, 3)] ?? "day 14";

  return `FOLLOW-UP #${ctx.followupNumber} (${dayLabel} — same thread as original email)

Company: ${ctx.companyName}
Sector: ${ctx.niche || 'business'}
City: ${ctx.location?.split(',')[0]?.trim() || 'their city'}
Original subject: ${ctx.originalSubject}
Original sent: ${new Date(ctx.sentAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}

Angle for this follow-up: ${angle}

Greeting (copy verbatim): ${greeting}

CTA style for this follow-up:
${ctx.followupNumber === 1 ? '"Would it be worth a quick 10-minute look?" or "Open to seeing how it works for ' + ctx.companyName + '?"' : ''}
${ctx.followupNumber === 2 ? '"Want me to show you how it works for a ' + (ctx.niche || 'business') + ' your size?" — slightly more direct but still low commitment' : ''}
${ctx.followupNumber >= 3 ? '"Happy to share a quick example if useful?" — most direct so far, never pushy' : ''}

Footer (copy VERBATIM, no changes):
${signatureBlock}

Write the follow-up now. Max 50 words in the body. Different sentences from the original email. Follow the mandatory structure.`;
}

// ── Template-based fallback (no AI required) ─────────────────────────────────

export function buildTemplateFollowUp(
  ctx: FollowUpContext,
  style: FollowUpStyle
): { subject: string; body: string } {
  const { companyName, followupNumber, originalSubject, yourCompany, senderName, senderPhone, niche, contactName } = ctx;
  const sender    = senderName || yourCompany || "Sales Team";
  const phoneLine = senderPhone ? `\n${senderPhone}` : "";
  const sig       = `Best regards,\n\n${sender}\nPryro${phoneLine}`;
  const greeting  = resolveGreeting(contactName);
  const sector    = niche || 'business';

  // FU #1 — day 3 — time cost angle
  if (followupNumber === 1) {
    return {
      subject: `Re: ${originalSubject}`,
      body: `${greeting}

Running a ${sector} means a lot of time spent moving data between systems that should talk to each other. Teams like yours typically get hours back each week once that's fixed.

Worth a quick 10-minute look at how Pryro handles it — free trial at pryro.com.

${sig}`,
    };
  }

  // FU #2 — day 7 — risk angle
  if (followupNumber === 2) {
    return {
      subject: `Re: ${originalSubject}`,
      body: `${greeting}

When billing, payroll, and operations run in separate tools, small errors compound quietly — usually only visible at month-end.

Want me to show you how it works for a ${sector} your size?

${sig}`,
    };
  }

  // FU #3 — day 14 — peer angle
  if (followupNumber === 3) {
    return {
      subject: `Re: ${originalSubject}`,
      body: `${greeting}

Other ${sector} teams in the region have started running everything from one place — cuts the month-end scramble significantly.

Happy to share a quick example if useful?

${sig}`,
    };
  }

  // FU #4 — final bump
  if (followupNumber === 4) {
    return {
      subject: `Re: ${originalSubject}`,
      body: `${greeting}

Last one from me — if the timing isn't right, completely understood.

If priorities shift, pryro.com is always there for a free look.

${sig}`,
    };
  }

  // FU #5+ — closing the loop
  return {
    subject: `Closing the loop — ${companyName}`,
    body: `${greeting}

Closing the loop on my previous emails. If the timing ever becomes right, you can start a free trial anytime at pryro.com.

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
