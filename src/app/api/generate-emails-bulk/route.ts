/**
 * Streaming bulk email generation via Server-Sent Events.
 *
 * APPROACH:
 * 1. For each lead, visit their website first and extract what they actually do.
 * 2. Feed that real context into the AI prompt.
 * 3. AI writes a cold email that references their specific business — not a generic template.
 *
 * EMAIL PHILOSOPHY:
 * - Subject: 8 words, honest curiosity, no hype
 * - Body: hardness (direct, confident, no fluff), humble (not pushy), specific to their business
 * - Goal: high open rate + high reply rate
 */

import { NextRequest } from "next/server";
import { createClient } from "../../../../supabase/server";
import { createServiceClient } from "../../../../supabase/service";

export const runtime = "nodejs";
export const maxDuration = 300;

interface LeadInput {
  id: string;
  company_name: string;
  niche: string | null;
  location: string | null;
  company_context: string | null;
  email: string | null;
  website?: string | null;
  source_url?: string | null;
}

// ─── Company website research ─────────────────────────────────────────────────

/**
 * Visit the company's website and extract what they actually do.
 * Returns a short plain-text summary (max 400 chars) or null if unreachable.
 */
async function researchCompany(lead: LeadInput): Promise<string | null> {
  const url = lead.website || lead.source_url;
  if (!url || !url.startsWith("http")) return null;

  try {
    // Try homepage first, then /about
    const pagesToTry = [url, `${new URL(url).origin}/about`];

    for (const page of pagesToTry) {
      try {
        const res = await fetch(page, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(6_000),
        });

        if (!res.ok) continue;

        const html = await res.text();

        // Strip scripts, styles, tags
        let text = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, " ")
          .trim();

        // Pull the most informative 600 chars — skip nav/cookie boilerplate
        // by looking for sentences that describe what the company does
        const sentences = text.split(/(?<=[.!?])\s+/);
        const useful = sentences
          .filter((s) => {
            const l = s.toLowerCase();
            return (
              s.length > 30 &&
              s.length < 300 &&
              !l.includes("cookie") &&
              !l.includes("privacy policy") &&
              !l.includes("terms of service") &&
              !l.includes("accept") &&
              !l.includes("subscribe") &&
              !l.includes("newsletter") &&
              !l.includes("javascript") &&
              (l.includes("we ") ||
                l.includes("our ") ||
                l.includes("help") ||
                l.includes("provide") ||
                l.includes("offer") ||
                l.includes("speciali") ||
                l.includes("service") ||
                l.includes("product") ||
                l.includes("solution") ||
                l.includes("deliver") ||
                l.includes("build") ||
                l.includes("create") ||
                l.includes("manage"))
            );
          })
          .slice(0, 5)
          .join(" ");

        if (useful.length > 80) {
          return useful.slice(0, 500);
        }

        // Fallback: just take the first 400 chars of clean text
        if (text.length > 80) {
          return text.slice(0, 400);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Unreachable — use existing context
  }

  return null;
}

// ─── Clean junk company names ─────────────────────────────────────────────────

function isJunkCompanyName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  const junkPatterns = [
    /^list of /i,
    /^top \d+/i,
    /^best \d+/i,
    /^\d+ (best|top|leading)/i,
    /^(all|the) (banks|schools|hospitals|clinics|restaurants|hotels) in/i,
    /businesses in .+ \| /i,
    / - wikipedia$/i,
    /\.com$/,
    /^https?:\/\//i,
    /\| .+(page|site|web)/i,
  ];
  return junkPatterns.some((p) => p.test(lower)) || lower.length > 60;
}

function cleanCompanyName(name: string): string {
  return name
    .replace(/\s*[-|–·]\s*.+$/, "")
    .replace(/\s*,\s*.+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemMessage(senderName: string): string {
  return `You are writing cold outreach emails. Your goal is maximum open rate and reply rate.

THE PHILOSOPHY:
- Hardness: Be direct and confident. No softening language. No "I hope", no "just wanted to".
- Humble: Don't oversell. Don't claim to be the best. Let the result speak.
- Specific: Reference what THIS company actually does. Generic emails get deleted.
- Human: Sound like a real person who did 5 minutes of research, not a marketing bot.

SUBJECT LINE — EXACTLY 8 WORDS:
- Must be exactly 8 words. Count them.
- Honest curiosity — make them wonder "what is this about?"
- Reference their specific business or industry, not a generic category
- No hype words: no "amazing", "incredible", "game-changer", "opportunity", "exciting"
- No questions that sound like ads: "Want to grow your business?"
- No ALL CAPS, no exclamation marks, no emojis
- Examples of good 8-word subjects:
  "How Lagos restaurants are cutting food waste by half"
  "Most accounting firms still track clients in spreadsheets"
  "What changed for dental clinics that dropped manual scheduling"
  "Three things slowing down mid-size logistics companies right now"

EMAIL BODY RULES:
- 3 short paragraphs. Max 90 words total. Count them.
- Paragraph 1 (1-2 sentences): One specific, true observation about their business or industry. Show you know their world. No compliments. No "I noticed your website". Just state the reality.
- Paragraph 2 (1-2 sentences): What you do, in plain language. One concrete result or number if you have it. No feature lists. No "we help companies like yours".
- Paragraph 3 (1 sentence): Soft ask. "Worth a 15-minute call?" or "Open to a quick chat?" — short, no pressure, no "I'd love to".
- Signature: Best regards, [name] on separate lines.

BANNED WORDS — never use any of these:
"reach out", "I noticed", "I came across", "I hope this email finds you well",
"I wanted to", "touching base", "synergy", "leverage", "game-changer", "excited to",
"thrilled to", "I am writing to", "streamline", "I'd love to", "would love to",
"unlock", "revolutionize", "cutting-edge", "innovative", "solution", "platform",
"empower", "transform", "scale", "optimize", "seamlessly", "robust", "holistic",
"best-in-class", "world-class", "industry-leading", "state-of-the-art"

SIGNATURE FORMAT (always exactly like this, on separate lines):
Best regards,
${senderName}
${senderName.split(" ")[0]} | Pryro

OUTPUT FORMAT — respond ONLY in this exact format, nothing else:
SUBJECT: [exactly 8 words]
BODY: [email body, plain text, no markdown]`;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(
  lead: LeadInput,
  yourCompany: string,
  yourService: string,
  tone: string,
  websiteResearch: string | null,
  customPainPoint?: string
): string {
  const name = cleanCompanyName(lead.company_name);

  // Build the richest possible context about this company
  const contextParts: string[] = [];

  if (websiteResearch) {
    contextParts.push(`WHAT THEY DO (from their website): ${websiteResearch}`);
  } else if (lead.company_context) {
    contextParts.push(`KNOWN CONTEXT: ${lead.company_context.slice(0, 300)}`);
  }

  if (lead.niche) contextParts.push(`INDUSTRY: ${lead.niche}`);
  if (lead.location) contextParts.push(`LOCATION: ${lead.location}`);
  if (customPainPoint) contextParts.push(`SPECIFIC PAIN POINT: ${customPainPoint}`);

  const toneNote =
    tone === "Aggressive"
      ? "Be more direct and confident. Open with a bold industry observation."
      : tone === "Surgical"
      ? "Be hyper-specific to their business. Reference something concrete from their website."
      : "Be direct and human. Confident but not pushy.";

  return `Write a cold outreach email for this company.

SENDER: ${yourCompany} — ${yourService}
RECIPIENT: ${name}
${contextParts.join("\n")}

TONE NOTE: ${toneNote}

Remember: subject must be EXACTLY 8 words. Body max 90 words. Reference what THIS company specifically does — not a generic industry observation.`;
}

// ─── AI caller with provider fallback ────────────────────────────────────────

async function callAI(
  providers: { provider: string; api_key: string; active_model: string | null }[],
  prompt: string,
  systemMessage: string,
  attempt = 0
): Promise<string> {
  const MAX_ATTEMPTS = 3;

  for (let pi = 0; pi < providers.length; pi++) {
    const provider = providers[pi];
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let url = "";
    let body: object;

    if (provider.provider === "openai") {
      url = "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${provider.api_key}`;
      body = {
        model: provider.active_model ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 450,
      };
    } else if (provider.provider === "anthropic") {
      url = "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = provider.api_key;
      headers["anthropic-version"] = "2023-06-01";
      body = {
        model: provider.active_model ?? "claude-3-5-haiku-20241022",
        max_tokens: 450,
        system: systemMessage,
        messages: [{ role: "user", content: prompt }],
      };
    } else if (provider.provider === "gemini") {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${
        provider.active_model ?? "gemini-1.5-flash"
      }:generateContent?key=${provider.api_key}`;
      body = {
        contents: [{ parts: [{ text: systemMessage + "\n\n" + prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 450 },
      };
    } else if (provider.provider === "mistral") {
      url = "https://api.mistral.ai/v1/chat/completions";
      headers["Authorization"] = `Bearer ${provider.api_key}`;
      body = {
        model: provider.active_model ?? "mistral-small",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 450,
      };
    } else {
      // groq / openai-compatible default
      url = "https://api.groq.com/openai/v1/chat/completions";
      headers["Authorization"] = `Bearer ${provider.api_key}`;
      body = {
        model: provider.active_model ?? "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 450,
      };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        console.warn(`[AI] ${provider.provider} rate limited — trying next`);
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        console.warn(`[AI] ${provider.provider} auth error ${res.status} — trying next`);
        continue;
      }
      if (!res.ok) {
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          return callAI(providers, prompt, systemMessage, attempt + 1);
        }
        console.warn(`[AI] ${provider.provider} error ${res.status} — trying next`);
        continue;
      }

      const data = await res.json();
      if (provider.provider === "anthropic") return data.content[0].text as string;
      if (provider.provider === "gemini")
        return data.candidates[0].content.parts[0].text as string;
      return data.choices[0].message.content as string;
    } catch (err: any) {
      console.warn(`[AI] ${provider.provider} threw: ${err?.message} — trying next`);
      continue;
    }
  }

  throw new Error("rate_limit_exhausted");
}

// ─── Response parser ──────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/`(.+?)`/g, "$1")
    .replace(/_{1,2}(.+?)_{1,2}/g, "$1")
    .trim();
}

function parseResponse(raw: string): { subject: string; body: string } {
  const subjectMatch = raw.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
  const bodyMatch = raw.match(/BODY:\s*([\s\S]+?)$/i);
  if (subjectMatch && bodyMatch) {
    return {
      subject: stripMarkdown(subjectMatch[1].replace(/^["']|["']$/g, "").trim()),
      body: stripMarkdown(bodyMatch[1].replace(/^["']|["']$/g, "").trim()),
    };
  }
  const lines = raw.trim().split("\n");
  if (lines.length >= 2) {
    return {
      subject: stripMarkdown(
        lines[0].replace(/^(SUBJECT:|Subject:)/i, "").trim()
      ),
      body: stripMarkdown(
        lines
          .slice(1)
          .join("\n")
          .replace(/^(BODY:|Body:)/i, "")
          .trim()
      ),
    };
  }
  throw new Error("Could not parse AI response");
}

// ─── Fallback email (when AI fails) ──────────────────────────────────────────

function makeFallback(
  lead: LeadInput,
  senderName: string
): object {
  const name = cleanCompanyName(lead.company_name);
  const niche = (lead.niche ?? "business").toLowerCase();

  // Hardness-style fallback subjects — exactly 8 words each
  const fallbackSubjects = [
    `Most ${niche} teams still handle this the hard way`,
    `What changed for ${niche} businesses that dropped manual tracking`,
    `Three things slowing down ${niche} operations right now`,
    `How ${niche} companies are cutting admin time in half`,
    `The ${niche} workflow problem most owners don't talk about`,
  ];
  const idx =
    Math.abs(name.charCodeAt(0) + name.charCodeAt(name.length - 1)) %
    fallbackSubjects.length;

  return {
    lead_id: lead.id,
    lead_email: lead.email,
    company_name: name,
    subject: fallbackSubjects[idx],
    body: `${niche.charAt(0).toUpperCase() + niche.slice(1)} teams spend a lot of time on tasks that should be automatic — scheduling, follow-ups, reporting. It adds up.

Pryro handles that layer. Teams using it typically cut 8-10 admin hours a week without changing how they work.

Worth a 15-minute call to see if it fits ${name}?

Best regards,
${senderName}
${senderName.split(" ")[0]} | Pryro`,
    model: "Fallback",
    isFallback: true,
  };
}

// ─── SSE streaming POST handler ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const { leads, yourCompany, yourService, tone, customPainPoint } =
    (await request.json()) as {
      leads: LeadInput[];
      yourCompany: string;
      yourService: string;
      tone: string;
      customPainPoint?: string;
    };

  if (!leads?.length) {
    return new Response(JSON.stringify({ error: "No leads provided" }), {
      status: 400,
    });
  }

  // Load all configured AI providers — active first for fallback rotation
  const serviceSupabase = createServiceClient();
  const { data: allAiProviders } = await serviceSupabase
    .from("ai_settings")
    .select("provider, api_key, active_model, is_active")
    .eq("user_id", user.id)
    .not("api_key", "is", null);

  if (!allAiProviders || allAiProviders.length === 0) {
    return new Response(
      JSON.stringify({ error: "No AI provider configured." }),
      { status: 400 }
    );
  }

  const providers = [
    ...allAiProviders.filter((p: any) => p.is_active),
    ...allAiProviders.filter((p: any) => !p.is_active),
  ];

  // Sender name from SMTP account
  let senderName = "Sales Team";
  try {
    const { data: smtpAccount } = await serviceSupabase
      .from("smtp_accounts")
      .select("email, sender_name")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("sent_today", { ascending: true })
      .limit(1)
      .single();
    if (smtpAccount) {
      senderName =
        smtpAccount.sender_name ||
        smtpAccount.email
          .split("@")[0]
          .replace(/[._\-]/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
  } catch {
    /* use default */
  }

  const SYSTEM_MESSAGE = buildSystemMessage(senderName);

  // Rate limits per provider
  const providerLimits: Record<string, { concurrency: number; delayMs: number }> = {
    groq:      { concurrency: 5,  delayMs: 800 },
    openai:    { concurrency: 10, delayMs: 200 },
    anthropic: { concurrency: 10, delayMs: 200 },
    gemini:    { concurrency: 8,  delayMs: 300 },
    mistral:   { concurrency: 8,  delayMs: 300 },
  };
  const activeProvider = providers[0];
  const limits =
    providerLimits[activeProvider.provider] ?? { concurrency: 5, delayMs: 800 };
  const CONCURRENCY = limits.concurrency;
  const BATCH_DELAY = limits.delayMs;

  // ── SSE stream ────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      const send = (event: string, data: object) => {
        try {
          controller.enqueue(
            enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // client disconnected
        }
      };

      send("start", { total: leads.length });

      let done = 0;
      let fallbacks = 0;

      const processLead = async (lead: LeadInput, idx: number) => {
        // Skip junk scrape results
        if (isJunkCompanyName(lead.company_name)) {
          console.warn(`⏭  Skipping junk: "${lead.company_name}"`);
          done++;
          send("skipped", {
            company_name: lead.company_name,
            done,
            total: leads.length,
          });
          return null;
        }

        const cleanedName = cleanCompanyName(lead.company_name);
        const cleanedLead = { ...lead, company_name: cleanedName };

        // ── Step 1: Visit their website and learn what they do ────────────
        let websiteResearch: string | null = null;
        try {
          websiteResearch = await researchCompany(cleanedLead);
          if (websiteResearch) {
            console.log(
              `🔍 Researched ${cleanedName}: ${websiteResearch.slice(0, 80)}…`
            );
          }
        } catch {
          // Research failed — use existing context
        }

        // ── Step 2: Generate email with real company context ──────────────
        try {
          const prompt = buildPrompt(
            cleanedLead,
            yourCompany,
            yourService,
            tone,
            websiteResearch,
            customPainPoint
          );
          const raw = await callAI(providers, prompt, SYSTEM_MESSAGE);
          let { subject, body } = parseResponse(raw);

          // Clean up any leftover placeholders
          body = body
            .replace(/\[Sender Name\]/gi, senderName)
            .replace(/\[Your Name\]/gi, senderName)
            .replace(/\[Name\]/gi, senderName);
          subject = subject
            .replace(/List of [^,\n]+/gi, cleanedName)
            .replace(/\[Company Name\]/gi, cleanedName);

          const email = {
            lead_id: lead.id,
            lead_email: lead.email,
            company_name: cleanedName,
            subject,
            body,
            model: activeProvider.active_model ?? activeProvider.provider,
            isFallback: false,
            researched: !!websiteResearch,
          };
          done++;
          send("email", { email, done, total: leads.length });
          return email;
        } catch (err: any) {
          console.error(
            `AI failed for "${cleanedName}":`,
            err?.message ?? err
          );
          const email = makeFallback(cleanedLead, senderName);
          done++;
          fallbacks++;
          send("email", { email, done, total: leads.length });
          return email;
        }
      };

      // Process in parallel batches
      for (let i = 0; i < leads.length; i += CONCURRENCY) {
        const batch = leads.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map((lead, batchIdx) => processLead(lead, i + batchIdx))
        );
        if (i + CONCURRENCY < leads.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY));
        }
      }

      send("done", {
        total: leads.length,
        ai: leads.length - fallbacks,
        fallback: fallbacks,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
