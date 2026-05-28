/**
 * Scrape + AI Email Generation — combined SSE pipeline.
 *
 * Phase 1: Scrape leads (Google Maps + Bing + DDG + Directories)
 * Phase 2: Generate personalised AI emails for every scraped lead
 *
 * Events streamed:
 *   start           — job started, phases announced
 *   lead            — a lead was scraped (phase 1)
 *   scrape_done     — phase 1 complete, phase 2 starting
 *   email           — an AI email was generated (phase 2)
 *   progress        — overall progress update
 *   done            — everything complete
 *   error           — fatal error
 */

import { NextRequest } from "next/server";
import { createClient } from "../../../../supabase/server";
import { createServiceClient } from "../../../../supabase/service";
import { scrapeWithoutAPI } from "@/utils/puppeteer-scraper";

export const runtime = "nodejs";
export const maxDuration = 300;

// ─── AI helpers ───────────────────────────────────────────────────────────────

function buildSystemMessage(senderName: string): string {
  return `You write cold outreach emails for Pryro — an ERP platform. You follow a FIXED template exactly. Do not be creative. Do not add extra paragraphs. Do not change the structure. Fill in the blanks only.

FIXED EMAIL TEMPLATE — follow this word for word, only replace the variables:

---
Dear Sir/Madam,

[COMPANY_NAME] and other [SECTOR] businesses often deal with manual workflows and fragmented tools that slow teams down.

Pryro is an ERP that replaces those inefficiencies with one unified system — covering finance, inventory, HR, payroll, project management, and CRM.

We also offer a 20–30% commission for every successfully referred client.

Would you be open to a 10-minute call to see if it's relevant?

Best regards,
${senderName}
Executive Sales
Pryro
---

VARIABLES TO FILL IN:
- [COMPANY_NAME] = the exact company name provided
- [SECTOR] = the industry/niche of the company (e.g. "pharmacy", "construction", "logistics", "retail", "hospitality")

RULES — non-negotiable:
- Start with "Dear Sir/Madam," — always
- Use the exact company name in the first sentence
- Name their sector naturally (e.g. "pharmacy businesses", "construction firms", "logistics companies")
- Do NOT change any other wording
- Do NOT add bullet points, extra paragraphs, or new ideas
- Do NOT use: "I noticed", "reach out", "leverage", "streamline", "game-changer", "excited to"
- The signature must be on separate lines exactly as shown

SUBJECT LINE RULES:
Write ONE subject line that is honest, direct, and humble. It must make the recipient curious enough to open without sounding like a sales pitch.

Use ONE of these patterns — fill in the actual company name or sector:
- "[Company name] — a quick question about your back-office setup"
- "How [sector] businesses are cutting admin time in half this year"
- "[Company name], are you still running [sector] ops on separate tools?"
- "Something worth 10 minutes for [company name]"
- "A simple fix for [sector] teams losing hours to admin every week"
- "[Company name] — this might be relevant to your team"

Subject rules:
- 8 to 14 words
- Use the actual company name OR actual sector — not both
- Honest, humble, direct — not clickbait, not salesy
- No exclamation marks, no ALL CAPS
- Never use: "ERP", "Partnership", "Opportunity", "Synergy", "Streamline", "Leverage", "Quick question", "Following up"

Respond ONLY in this exact format:
SUBJECT: [subject line]
BODY: [email body]`;
}

// ── Niche to readable sector label ───────────────────────────────────────────
function getSectorLabel(niche: string | null): string {
  if (!niche) return 'business';
  const n = niche.toLowerCase();
  if (/pharmacy|chemist|drug store|dispensary/.test(n)) return 'healthcare';
  if (/clinic|dental|dentist|hospital|medical|doctor|physician|surgery|optom|chiro|physio|vet|nursing|rehab|radiol|pediatr|dermat/.test(n)) return 'healthcare';
  if (/restaurant|hotel|lodge|hospitality|catering|bakery|coffee|bar |nightclub|fast food/.test(n)) return 'hospitality';
  if (/retail|shop|store|supermarket|e-commerce|ecommerce|clothing|electronics|furniture|hardware|jewelry|shoe|sporting/.test(n)) return 'retail';
  if (/construction|engineering|contractor|architecture|surveying|interior design/.test(n)) return 'construction';
  if (/logistics|transport|trucking|freight|shipping|courier|fleet|warehouse|moving/.test(n)) return 'logistics';
  if (/school|college|university|education|training|coaching|driving school|language|nursery|vocational/.test(n)) return 'education';
  if (/ngo|non-profit|nonprofit|foundation|charity|church|mosque|temple|religious/.test(n)) return 'non-profit';
  if (/manufacturing|factory|production|textile|packaging|chemical|food processing/.test(n)) return 'manufacturing';
  if (/agency|consulting|marketing|advertising|pr |media|digital|seo|web design|app dev|software|it service|tech/.test(n)) return 'professional services';
  if (/bank|finance|insurance|investment|microfinance|forex|mortgage|credit|savings|stock/.test(n)) return 'financial services';
  if (/farm|agriculture|agri/.test(n)) return 'agriculture';
  if (/real estate|property|estate agent/.test(n)) return 'real estate';
  return niche.replace(/\b(services?|solutions?|management|systems?|group|company|ltd|inc)\b/gi, '').replace(/\s+/g, ' ').trim().toLowerCase() || 'business';
}

// ── Subject patterns (rotated per lead so bulk emails vary) ──────────────────
const SUBJECT_PATTERNS_BULK = [
  (company: string, _s: string) => `${company}, is this relevant to you?`,
  (_c: string, sector: string) => `For ${sector} businesses — worth reading`,
  (company: string, _s: string) => `${company}, could we have 10 minutes?`,
  (_c: string, sector: string) => `Something that may help ${sector} teams`,
  (company: string, _s: string) => `${company}, honest question`,
  (_c: string, sector: string) => `${sector} businesses and a tool worth knowing`,
  (company: string, _s: string) => `${company}, would this be useful to you?`,
  (_c: string, sector: string) => `For ${sector} teams dealing with too many tools`,
];

// ── Direct email builder — no AI, exact template every time ──────────────────
function buildDirectEmail(
  companyName: string,
  niche: string | null,
  senderName: string,
  idx: number
): { subject: string; body: string } {
  const sector = getSectorLabel(niche);
  const patternFn = SUBJECT_PATTERNS_BULK[idx % SUBJECT_PATTERNS_BULK.length]!;
  const subject = patternFn(companyName, sector);

  const body =
`Dear Sir/Madam,

${companyName} and many ${sector} businesses often deal with manual workflows and fragmented tools that slow teams down.

Pryro is an ERP that replaces those inefficiencies with one unified system and we offer a 20-30% commission for every successfully referred client.

Would you be open to a 10-minute call to see if it is relevant?

Best regards,
${senderName}
Executive Sales
Pryro`;

  return { subject, body };
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
    body = { model: provider.active_model ?? "gpt-4o-mini", messages: [{ role: "system", content: systemMessage }, { role: "user", content: prompt }], temperature: 0.5, max_tokens: 600 };
  } else if (provider.provider === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers["x-api-key"] = provider.api_key;
    headers["anthropic-version"] = "2023-06-01";
    body = { model: provider.active_model ?? "claude-3-5-haiku-20241022", max_tokens: 600, system: systemMessage, messages: [{ role: "user", content: prompt }] };
  } else if (provider.provider === "gemini") {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.active_model ?? "gemini-1.5-flash"}:generateContent?key=${provider.api_key}`;
    headers["Authorization"] = "";
    body = { contents: [{ parts: [{ text: systemMessage + "\n\n" + prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 600 } };
  } else if (provider.provider === "mistral") {
    url = "https://api.mistral.ai/v1/chat/completions";
    headers["Authorization"] = `Bearer ${provider.api_key}`;
    body = { model: provider.active_model ?? "mistral-small", messages: [{ role: "system", content: systemMessage }, { role: "user", content: prompt }], temperature: 0.5, max_tokens: 600 };
  } else {
    // groq (default)
    url = "https://api.groq.com/openai/v1/chat/completions";
    headers["Authorization"] = `Bearer ${provider.api_key}`;
    body = { model: provider.active_model ?? "llama-3.3-70b-versatile", messages: [{ role: "system", content: systemMessage }, { role: "user", content: prompt }], temperature: 0.5, max_tokens: 600 };
  }

  // Remove empty Authorization header for Gemini
  if (!headers["Authorization"]) delete headers["Authorization"];

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
  if (provider.provider === "gemini") return data.candidates[0].content.parts[0].text as string;
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

function parseAIResponse(raw: string): { subject: string; body: string } {
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

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

  const {
    niche, location, maxResults,
    yourCompany, yourService, tone, customPainPoint,
  } = await request.json() as {
    niche: string;
    location: string;
    maxResults: number;
    yourCompany: string;
    yourService: string;
    tone: string;
    customPainPoint?: string;
  };

  if (!niche?.trim() || !location?.trim()) {
    return new Response(JSON.stringify({ error: "Niche and location are required" }), { status: 400 });
  }

  const service = createServiceClient();

  // Load AI provider
  let aiProvider: { provider: string; api_key: string; active_model: string | null } | null = null;
  try {
    const { data } = await service
      .from("ai_settings")
      .select("provider, api_key, active_model")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (data?.api_key) aiProvider = data;
    if (!aiProvider) {
      const { data: any2 } = await service
        .from("ai_settings")
        .select("provider, api_key, active_model")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (any2?.api_key) aiProvider = any2;
    }
  } catch { /* AI optional for scraping */ }

  // Load sender name from SMTP
  let senderName = "Sales Team";
  try {
    const { data: smtp } = await service
      .from("smtp_accounts")
      .select("email, sender_name")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("sent_today", { ascending: true })
      .limit(1)
      .single();
    if (smtp) {
      senderName = smtp.sender_name ||
        smtp.email.split("@")[0]
          .replace(/[._\-]/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
  } catch { /* use default */ }

  const SYSTEM_MESSAGE = buildSystemMessage(senderName);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: object) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* client disconnected */ }
      };

      send("start", {
        niche, location, maxResults,
        hasAI: !!aiProvider,
        phases: ["scraping", "generating"],
      });

      // ── PHASE 1: Scrape ───────────────────────────────────────────────
      const scrapedLeads: any[] = [];
      let scrapeCount = 0;

      try {
        await scrapeWithoutAPI(
          niche.trim(),
          location.trim(),
          maxResults,
          (lead) => {
            scrapeCount++;
            scrapedLeads.push(lead);
            send("lead", { lead, count: scrapeCount, total: maxResults });
          },
          aiProvider
        );
      } catch (err: any) {
        send("error", { message: `Scraping failed: ${err?.message ?? "Unknown error"}` });
        controller.close();
        return;
      }

      send("scrape_done", {
        total: scrapedLeads.length,
        message: `Scraped ${scrapedLeads.length} leads. Generating emails now…`,
      });

      // ── PHASE 2: Generate emails (direct template — no AI) ───────────
      let emailCount = 0;

      for (let idx = 0; idx < scrapedLeads.length; idx++) {
        const lead = scrapedLeads[idx];
        const { subject, body } = buildDirectEmail(
          lead.company_name,
          lead.niche,
          senderName,
          idx
        );

        emailCount++;
        send("email", {
          email: {
            lead_id: lead.id ?? null,
            lead_email: lead.email,
            company_name: lead.company_name,
            subject,
            body,
            model: "template",
            isFallback: false,
          },
          count: emailCount,
          total: scrapedLeads.length,
        });

        if (emailCount % 5 === 0) {
          send("progress", {
            phase: "generating",
            emailCount,
            failCount: 0,
            total: scrapedLeads.length,
            percentComplete: Math.round((emailCount / scrapedLeads.length) * 100),
          });
        }
      }

      send("done", {
        scraped: scrapedLeads.length,
        emails: emailCount,
        fallbacks: 0,
        message: `Done! ${scrapedLeads.length} leads scraped, ${emailCount} emails generated.`,
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
  } catch (err: any) {
    console.error("[scrape-and-generate] Unhandled error:", err);
    return new Response(JSON.stringify({ error: err?.message ?? "Internal server error" }), { status: 500 });
  }
}
