/**
 * Streaming bulk email generation via Server-Sent Events.
 * Each email is sent to the client as soon as it's ready —
 * the user sees emails appear one by one instead of waiting for all.
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
}

// ─── Clinic / Hospital detection ─────────────────────────────────────────────
const CLINIC_KEYWORDS = [
  "clinic", "dental", "dentist", "hospital", "medical", "healthcare",
  "health care", "orthodontic", "orthodontist", "physician", "doctor",
  "surgery", "surgical", "pharmacy", "pharmacist", "optometry", "optometrist",
  "chiropractic", "chiropractor", "physiotherapy", "physiotherapist",
  "veterinary", "vet clinic", "urgent care", "primary care",
];

function isClinicNiche(niche: string | null): boolean {
  if (!niche) return false;
  const lower = niche.toLowerCase();
  return CLINIC_KEYWORDS.some((kw) => lower.includes(kw));
}

function buildClinicEmail(companyName: string, senderName: string) {
  return {
    subject: `Still managing schedules across 3+ tools?`,
    body: `Most dental practices we talk to are juggling patient scheduling, billing, and team communication across multiple disconnected systems. It creates bottlenecks, data errors, and eats up 8-12 admin hours per week.

We built Pryro to fix this — one unified platform that 127 dental clinics now use to cut admin time by 35-40%, eliminate double-booking, and get real-time visibility into practice performance.

Worth a quick 10-minute conversation to see if we can do the same for ${companyName}?

Best regards,
${senderName}
Executive Sales
Pryro`,
    model: "Template",
    isFallback: false,
  };
}

// ─── System message ───────────────────────────────────────────────────────────
function buildSystemMessage(senderName: string): string {
  return `You are a senior B2B sales executive writing cold outreach emails on behalf of Pryro.

EXACT FORMAT TO FOLLOW:

[One sentence — state something true and specific about their industry situation. No compliments. No "I noticed". Just a plain, confident observation that shows you know their world.]

[One or two sentences — what Pryro does, in plain language. Brief and humble. No feature lists. No "we help companies like yours".]

[One sentence — soft ask for a short call. Frame it as "only if it makes sense". Never pressure.]

Best regards,
${senderName}
Executive Sales
Pryro

BODY RULES:
- Maximum 80 words. Count them. Cut anything over 80.
- Write like a human. Use "I" not "we" where possible.
- ONE idea per paragraph. Three short paragraphs max.
- No bullet points. No bold. No markdown. Plain sentences only.
- Sound like it was written in 3 minutes by a real person.
- NEVER use: "manual workflows", "Excel-based", "fragmented tools", "unified platform", "operational efficiency", "workflow management", "scale effectively", "save time", "reduce manual work", "companies like yours", "help you achieve", "I believe", "game-changer", "cutting-edge", "revolutionary"

SUBJECT LINE RULES — this is critical for open rates:

The subject must feel like it came from someone who knows their business personally. It should create genuine curiosity — the reader wonders "what is this about?" without it feeling like a sales pitch.

HIGH OPEN-RATE SUBJECT FORMULAS — pick ONE and fill it in:

Formula A — Specific observation: "[niche] teams are switching away from [common pain]"
Formula B — Peer proof: "How [similar company type] cut their admin by 40%"
Formula C — Direct question: "How are you handling [specific niche challenge]?"
Formula D — Insider insight: "What's working for [niche] practices right now"
Formula E — Soft challenge: "Still running [niche] ops on disconnected tools?"
Formula F — Curiosity gap: "The [niche] admin problem nobody talks about"
Formula G — Peer comparison: "What top [niche] practices do differently"
Formula H — Specific result: "[niche] clinics saving 8+ hours a week — here's how"

SUBJECT RULES:
- 6 to 9 words max
- Use the niche OR company name — never both
- Replace [niche] with the actual niche (e.g. "dental", "retail", "logistics")
- Replace placeholders with real, specific words — never leave brackets in the output
- NEVER use: "Quick idea", "Had a thought", "Something that might help", "Worth a chat", "ERP", "partnership", "opportunity", "solution", "platform", "streamline", "leverage", "synergy", "exciting", "revolutionary"
- No exclamation marks, no ALL CAPS, no emojis
- Must feel like a colleague sent it, not a marketing department

BANNED WORDS (never use any of these):
"reach out", "I noticed", "I came across", "I hope this email finds you well",
"I wanted to", "touching base", "synergy", "leverage", "game-changer", "excited to",
"thrilled to", "I am writing to", "Streamline", "I'd love to", "would love to", "Unlock",
"Quick idea", "Had a thought", "Something that might help", "Worth a 10-minute chat"

SIGNATURE FORMAT — always on separate lines:
Best regards,
${senderName}
Executive Sales
Pryro

ANTI-SPAM: Plain text only. No markdown. No bullet points. Short paragraphs. One CTA only.

Respond ONLY in this exact format:
SUBJECT: [subject line, 6-9 words, no brackets]
BODY: [email body]`;
}

// ─── Clean junk company names from scraping ──────────────────────────────────

/**
 * Detect if a company name is a junk scrape result (search title, not a real business).
 * Returns true if the name should be skipped.
 */
function isJunkCompanyName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  // Search result titles masquerading as company names
  const junkPatterns = [
    /^list of /i,
    /^top \d+/i,
    /^best \d+/i,
    /^\d+ (best|top|leading)/i,
    /^(all|the) (banks|schools|hospitals|clinics|restaurants|hotels) in/i,
    /businesses in .+ \| /i,
    / - wikipedia$/i,
    /\.com$/, // raw domain names
    /^https?:\/\//i,
    /\| .+(page|site|web)/i,
  ];
  return junkPatterns.some(p => p.test(lower)) || lower.length > 60;
}

/**
 * Clean up a company name — remove trailing location/descriptor noise.
 */
function cleanCompanyName(name: string): string {
  return name
    .replace(/\s*[-|–·]\s*.+$/, '')   // strip "Company - Location" suffix
    .replace(/\s*,\s*.+$/, '')          // strip "Company, City" suffix
    .replace(/\s+/g, ' ')
    .trim();
}

const TONE_ADDITIONS: Record<string, string> = {
  Direct:     `Tone: Direct and concise. Open with business context in one sentence. State value clearly. End with simple meeting request. No filler. Max 120 words.`,
  Aggressive: `Tone: Confident and opportunity-focused. Open with a specific industry challenge. Make the value impossible to ignore. CTA: ask for a 10-minute call this week. Max 140 words.`,
  Surgical:   `Tone: Hyper-personalized and consultative. Reference their specific industry and context. Sound like a trusted advisor, not a vendor. Max 150 words.`,
};

function buildPrompt(lead: LeadInput, yourCompany: string, yourService: string, tone: string, customPainPoint?: string, subjectIndex = 0): string {
  const name = cleanCompanyName(lead.company_name);
  const context = lead.company_context?.slice(0, 300) ?? "";
  const toneInstruction = TONE_ADDITIONS[tone] ?? TONE_ADDITIONS["Direct"];
  // Rotate formula hint so AI doesn't repeat the same subject pattern
  const formulaHints = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const formulaHint = formulaHints[subjectIndex % formulaHints.length];
  return `Write a Pryro outreach email.
Sender: ${yourCompany} — ${yourService}
Recipient: ${name} | ${lead.niche ?? "Business"} | ${lead.location ?? ""}${context ? `\nContext: ${context}` : ""}${customPainPoint ? `\nPain point: ${customPainPoint}` : ""}
Use subject Formula ${formulaHint} from the rules above.
${toneInstruction}`;
}

async function callAI(
  provider: { provider: string; api_key: string; active_model: string | null },
  prompt: string,
  systemMessage: string,
  attempt = 0
): Promise<string> {
  const MAX_ATTEMPTS = 5;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let url = "";
  let body: object;

  if (provider.provider === "openai") {
    url = "https://api.openai.com/v1/chat/completions";
    headers["Authorization"] = `Bearer ${provider.api_key}`;
    body = { model: provider.active_model ?? "gpt-4o-mini", messages: [{ role: "system", content: systemMessage }, { role: "user", content: prompt }], temperature: 0.4, max_tokens: 400 };
  } else if (provider.provider === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers["x-api-key"] = provider.api_key;
    headers["anthropic-version"] = "2023-06-01";
    body = { model: provider.active_model ?? "claude-3-5-haiku-20241022", max_tokens: 400, system: systemMessage, messages: [{ role: "user", content: prompt }] };
  } else {
    url = "https://api.groq.com/openai/v1/chat/completions";
    headers["Authorization"] = `Bearer ${provider.api_key}`;
    body = { model: provider.active_model ?? "llama-3.1-8b-instant", messages: [{ role: "system", content: systemMessage }, { role: "user", content: prompt }], temperature: 0.4, max_tokens: 400 };
  }

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });

  if (res.status === 429) {
    if (attempt >= MAX_ATTEMPTS) throw new Error("rate_limit_exhausted");
    const retryAfter = res.headers.get("retry-after");
    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 + 500 : Math.min(5000 * 2 ** attempt, 60000);
    await new Promise((r) => setTimeout(r, waitMs));
    return callAI(provider, prompt, systemMessage, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`AI API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (provider.provider === "anthropic") return data.content[0].text as string;
  return data.choices[0].message.content as string;
}

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
      subject: stripMarkdown(lines[0].replace(/^(SUBJECT:|Subject:)/i, "").trim()),
      body: stripMarkdown(lines.slice(1).join("\n").replace(/^(BODY:|Body:)/i, "").trim()),
    };
  }
  throw new Error("Could not parse AI response");
}

// ─── SSE streaming POST handler ───────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // Auth
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { leads, yourCompany, yourService, tone, customPainPoint } = await request.json() as {
    leads: LeadInput[];
    yourCompany: string;
    yourService: string;
    tone: string;
    customPainPoint?: string;
  };

  if (!leads?.length) {
    return new Response(JSON.stringify({ error: "No leads provided" }), { status: 400 });
  }

  // Fetch AI provider
  const serviceSupabase = createServiceClient();
  let { data: aiProvider } = await serviceSupabase
    .from("ai_settings").select("provider, api_key, active_model")
    .eq("user_id", user.id).eq("is_active", true).maybeSingle();

  if (!aiProvider?.api_key) {
    const { data: any } = await serviceSupabase
      .from("ai_settings").select("provider, api_key, active_model")
      .eq("user_id", user.id).limit(1).maybeSingle();
    aiProvider = any;
  }

  if (!aiProvider?.api_key) {
    return new Response(JSON.stringify({ error: "No AI provider configured." }), { status: 400 });
  }

  // Fetch sender name from SMTP account
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
      senderName = smtpAccount.sender_name ||
        smtpAccount.email.split("@")[0]
          .replace(/[._\-]/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
  } catch { /* use default */ }

  const SYSTEM_MESSAGE = buildSystemMessage(senderName);
  const provider = aiProvider;

  // ── Provider-aware rate limiting ──────────────────────────────────────────
  // Groq free tier: ~30 req/min → concurrency 5, 800ms delay
  // Groq paid tier / OpenAI / Anthropic / Gemini / Mistral: much higher limits
  const providerLimits: Record<string, { concurrency: number; delayMs: number }> = {
    groq:      { concurrency: 5,  delayMs: 800  },
    openai:    { concurrency: 10, delayMs: 200  },
    anthropic: { concurrency: 10, delayMs: 200  },
    gemini:    { concurrency: 8,  delayMs: 300  },
    mistral:   { concurrency: 8,  delayMs: 300  },
  };
  const limits = providerLimits[provider.provider] ?? { concurrency: 5, delayMs: 800 };
  const CONCURRENCY = limits.concurrency;
  const BATCH_DELAY = limits.delayMs;

  const makeFallback = (lead: LeadInput) => {
    const name = cleanCompanyName(lead.company_name);
    const niche = lead.niche ?? "businesses";
    // Rotate fallback subjects so they don't all look the same
    const fallbackSubjects = [
      `How are you handling ${niche} admin right now?`,
      `${niche} teams are switching away from disconnected tools`,
      `What top ${niche} practices do differently`,
      `The ${niche} admin problem nobody talks about`,
      `Still running ${niche} ops on disconnected tools?`,
    ];
    const subjectIdx = Math.abs(name.charCodeAt(0) + name.charCodeAt(name.length - 1)) % fallbackSubjects.length;
    return {
      lead_id: lead.id,
      lead_email: lead.email,
      company_name: name,
      subject: fallbackSubjects[subjectIdx],
      body: `${niche.charAt(0).toUpperCase() + niche.slice(1)} teams often deal with scheduling, billing, and communication spread across tools that don't talk to each other — it quietly eats 8-12 admin hours a week.\n\nPryro brings it into one place. 127 practices are already using it to cut that overhead significantly.\n\nWould a 10-minute call make sense to see if it fits ${name}?\n\nBest regards,\n${senderName}\nExecutive Sales\nPryro`,
      model: "Fallback",
      isFallback: true,
    };
  };

  // ── SSE stream ────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      const send = (event: string, data: object) => {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Send total count so client can show progress
      send("start", { total: leads.length });

      let done = 0;
      let fallbacks = 0;

      const processLead = async (lead: LeadInput, idx: number) => {
        // Skip junk scrape results — search titles, not real companies
        if (isJunkCompanyName(lead.company_name)) {
          console.warn(`⏭  Skipping junk lead: "${lead.company_name}"`);
          done++;
          send("skipped", { company_name: lead.company_name, done, total: leads.length });
          return null;
        }

        const cleanedName = cleanCompanyName(lead.company_name);
        const cleanedLead = { ...lead, company_name: cleanedName };

        // ── Clinic / Hospital: use fixed high-converting template ──────────
        if (isClinicNiche(lead.niche)) {
          const clinicEmail = buildClinicEmail(cleanedName, senderName);
          const email = {
            lead_id: lead.id,
            lead_email: lead.email,
            company_name: cleanedName,
            ...clinicEmail,
          };
          done++;
          send("email", { email, done, total: leads.length });
          return email;
        }

        try {
          const prompt = buildPrompt(cleanedLead, yourCompany, yourService, tone, customPainPoint, idx);
          const raw = await callAI(provider, prompt, SYSTEM_MESSAGE);
          let { subject, body } = parseResponse(raw);
          // Replace any leftover placeholders
          body = body
            .replace(/\[Sender Name\]/gi, senderName)
            .replace(/\[Your Name\]/gi, senderName)
            .replace(/\[Name\]/gi, senderName);
          // Ensure subject doesn't contain junk company name artifacts
          subject = subject
            .replace(/List of [^,\n]+/gi, cleanedName)
            .replace(/\[Company Name\]/gi, cleanedName);
          const email = {
            lead_id: lead.id,
            lead_email: lead.email,
            company_name: cleanedName,
            subject,
            body,
            model: provider.active_model ?? provider.provider,
            isFallback: false,
          };
          done++;
          send("email", { email, done, total: leads.length });
          return email;
        } catch (err: any) {
          // Log the actual error so we know why AI failed
          console.error(`AI failed for "${cleanedName}":`, err?.message ?? err);
          const email = makeFallback(cleanedLead);
          done++;
          fallbacks++;
          send("email", { email, done, total: leads.length });
          return email;
        }
      };

      // Process in parallel batches, stream each result immediately
      for (let i = 0; i < leads.length; i += CONCURRENCY) {
        const batch = leads.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map((lead, batchIdx) => processLead(lead, i + batchIdx)));
        if (i + CONCURRENCY < leads.length) {
          // Pause between batches — duration depends on provider rate limits
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
      "Connection": "keep-alive",
    },
  });
}
