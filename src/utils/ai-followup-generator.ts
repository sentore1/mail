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
  // ── Tone-level instructions (override style writing rules) ────────────────
  const toneInstructions: Record<NonNullable<FollowUpTone>, string> = {
    Direct: `WRITING RULES — DIRECT TONE:
- Hard direct. No politeness. No "I hope", no "reaching out", no fluff.
- Structure: Problem → Solution → CTA
- Start body immediately with the problem, no greeting
- 60-90 words max
- CTA must be a single direct question
- NEVER use: "I wanted to", "just following up", "hope this finds you"`,

    Aggressive: `WRITING RULES — AGGRESSIVE TONE:
- High urgency. Create FOMO. Push hard for action.
- Open with a cost/loss the lead is experiencing right now
- Quantify the pain (time wasted, revenue lost, competitors winning)
- Show the solution creates urgency: "others in ${"{niche}"} are already using this"
- CTA: binary choice — "Are you open to a 20-minute call this week — yes or no?"
- 100-140 words. No soft language.`,

    Surgical: `WRITING RULES — SURGICAL TONE:
- Hyper-personalized. Prove you did your homework on this specific company.
- Reference something real: their industry, location, company context, or what was in the original email
- Connect their specific situation to the exact problem you solve
- Sound like a consultant, not a salesperson
- CTA feels like a natural next step, not a pitch
- 120-160 words. Every sentence is specific to THEM.`,
  };

  const toneBlock = tone ? `\n\n${toneInstructions[tone]}` : "";

  const base = `You are ${senderName}, a professional sales rep writing a cold email follow-up.
Write ONLY the email body (no subject line in the body). Keep it under 120 words.
Sound completely human — no corporate buzzwords, no hollow phrases.
Do NOT start with "I hope this email finds you well" or similar.
NEVER use: leverage, synergy, innovative, game-changing, cutting-edge, reach out, circle back.
Format: plain text, short paragraphs, conversational.${toneBlock}`;

  const styleInstructions: Record<FollowUpStyle, string> = {
    professional: `${base}\nTone: Professional, confident, direct. Reference the previous email naturally.`,
    casual: `${base}\nTone: Conversational and relaxed. Like bumping into someone at a coffee shop. Short sentences.`,
    friendly: `${base}\nTone: Warm and approachable. Show genuine interest in their business.`,
    soft_reminder: `${base}\nTone: Very gentle bump. Acknowledge they're busy. No pressure at all.`,
    value_focused: `${base}\nTone: Lead with a specific value or benefit. One concrete result or metric if possible.`,
    direct: `${base}\nTone: Crisp and direct. Get straight to the point. Clear CTA for a call or demo.`,
    final_bump: `${base}\nTone: Low pressure final nudge. Make it easy to say yes OR no. No guilt.`,
    breakup: `${base}\nTone: Polite "breakup" email. Let them know this is your last email. This paradoxically gets the highest reply rates. Keep it short — 2-3 sentences max.`,
  };

  return styleInstructions[style] ?? styleInstructions.professional;
}

function buildUserPrompt(ctx: FollowUpContext, style: FollowUpStyle): string {
  const prevHistory = ctx.previousFollowups?.length
    ? ctx.previousFollowups
        .map((f, i) => `Follow-up #${i + 1} (${new Date(f.sentAt).toLocaleDateString()}):\nSubject: ${f.subject}\n${f.body.slice(0, 200)}...`)
        .join("\n\n")
    : "None";

  const engagementNotes = [
    ctx.openCount > 0 ? `Opened ${ctx.openCount} time(s)` : "Never opened",
    ctx.clickCount > 0 ? `Clicked ${ctx.clickCount} link(s)` : "No clicks",
  ].join(", ");

  return `COMPANY: ${ctx.companyName}
INDUSTRY: ${ctx.niche ?? "Unknown"}
LOCATION: ${ctx.location ?? "Unknown"}
ENGAGEMENT: ${engagementNotes}

ORIGINAL EMAIL (sent ${new Date(ctx.sentAt).toLocaleDateString()}):
Subject: ${ctx.originalSubject}
${ctx.originalBody.slice(0, 400)}

PREVIOUS FOLLOW-UPS:
${prevHistory}

YOUR COMPANY: ${ctx.yourCompany}
YOUR SERVICE: ${ctx.yourService}

Now write Follow-Up #${ctx.followupNumber} in "${style}" style.

Output EXACTLY this format (no extra text):
SUBJECT: [subject line here]
BODY:
[email body here]`;
}

// ── Template-based fallback (no AI required) ─────────────────────────────────

export function buildTemplateFollowUp(
  ctx: FollowUpContext,
  style: FollowUpStyle
): { subject: string; body: string } {
  const { companyName, followupNumber, originalSubject, yourCompany, yourService, senderName } = ctx;
  const sender = senderName ?? yourCompany;

  const templates: Record<FollowUpStyle, { subject: string; body: string }> = {
    professional: {
      subject: `Re: ${originalSubject}`,
      body: `Hi ${companyName} team,

Following up on my previous email about ${yourService}.

I genuinely think there's a fit here given what ${companyName} does. Would a 10-minute call this week make sense to explore?

Best,
${sender}`,
    },

    casual: {
      subject: `Re: ${originalSubject}`,
      body: `Hey,

Just bumping this up in case it got buried.

Still think ${yourService} could be useful for ${companyName} — happy to keep it to 10 minutes if you're curious.

${sender}`,
    },

    friendly: {
      subject: `Quick follow-up — ${companyName}`,
      body: `Hi there,

I wanted to check back after my last email. Running a business in ${ctx.niche ?? "your space"} comes with a lot of moving parts, and that's exactly what ${yourService} is built to simplify.

Would you be open to a quick chat to see if it's relevant?

${sender}`,
    },

    soft_reminder: {
      subject: `Re: ${originalSubject}`,
      body: `Hi ${companyName},

I know things get busy — just a gentle follow-up in case my earlier note slipped through.

No pressure at all. If the timing isn't right, totally understand.

${sender}`,
    },

    value_focused: {
      subject: `What ${companyName} could save with ${yourCompany}`,
      body: `Hi ${companyName} team,

Businesses in ${ctx.niche ?? "your sector"} typically save 8-12 hours per week after switching to ${yourService} — mostly from eliminating manual reconciliation and duplicate data entry.

Worth a 10-minute look to see if the numbers make sense for ${companyName}?

${sender}`,
    },

    direct: {
      subject: `${companyName} — quick question`,
      body: `Hi,

One question: is ${ctx.niche ?? "operational efficiency"} on your radar right now?

If yes, I'd love to show you exactly how ${yourService} works in 10 minutes. If not, no worries — just let me know.

${sender}`,
    },

    final_bump: {
      subject: `Last one — ${companyName}`,
      body: `Hi ${companyName},

One last note before I stop following up.

If ${yourService} isn't relevant right now, no problem at all. But if there's even a small chance it could help, I'd love a quick 10-minute call.

Either way — no hard feelings.

${sender}`,
    },

    breakup: {
      subject: `Closing the loop — ${companyName}`,
      body: `Hi,

I've sent a few emails and haven't heard back, so I'll assume the timing isn't right.

I'll stop reaching out — but if things change down the road, feel free to reply to this thread.

Wishing ${companyName} the best.

${sender}`,
    },
  };

  return templates[style] ?? templates.professional;
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

    // Basic sanity check
    if (subject && body && body.length > 20) {
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
