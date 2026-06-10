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

function buildSystemMessage(): string {
  return `You write ONE sentence for a cold B2B email. Just one sentence — nothing else.

The sentence is a genuine question about a real daily operational challenge this type of business faces.

Rules:
- Under 20 words
- Ends with a question mark
- Mentions the company name
- Sounds like a colleague, not a salesperson
- About a real operational problem: payroll, billing, stock, scheduling, reconciliation
- NO greeting, NO introduction, NO sign-off
- NEVER start with: "Are you still", "I was", "I hope", "I noticed"
- NEVER use: streamline, leverage, empower, cutting-edge, revolutionary, seamlessly, innovative

Output: The single sentence question only. No labels. No quotes. No extra text.`;
}

// ── Niche-specific content ────────────────────────────────────────────────────
interface NicheContent { sectorName: string; painPoint: string; pryroValue: string; }

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x27;/gi, "'").replace(/&#39;/gi, "'").replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#x22;/gi, '"')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/gi, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim();
}

function getNicheContent(niche: string | null): NicheContent {
  if (!niche) return { sectorName: 'businesses', painPoint: 'managing operations across multiple disconnected tools', pryroValue: 'consolidates finance, inventory, HR, payroll, and CRM into one system' };
  const n = niche.toLowerCase();
  if (/pharmacy|chemist|drug store|dispensary/.test(n)) return { sectorName: 'pharmacies', painPoint: 'managing stock levels, billing, and staff schedules across separate systems', pryroValue: 'automates stock tracking, expiry alerts, billing, and staff payroll in one place' };
  if (/clinic|dental|dentist|hospital|medical|doctor|physician|surgery|optom|chiro|physio|vet|nursing|rehab|radiol|pediatr|dermat/.test(n)) return { sectorName: 'medical clinics and healthcare providers', painPoint: 'coordinating patient scheduling, billing, inventory, and staff payroll across different tools', pryroValue: 'connects patient management, billing, inventory, and HR into one unified system' };
  if (/restaurant|catering|bakery|coffee|fast food/.test(n)) return { sectorName: 'restaurants and food businesses', painPoint: 'tracking inventory, managing staff schedules, and reconciling daily sales across multiple systems', pryroValue: 'handles inventory, staff scheduling, payroll, and financial reporting in one place' };
  if (/hotel|lodge|hospitality/.test(n)) return { sectorName: 'hotels and hospitality businesses', painPoint: 'managing reservations, housekeeping schedules, vendor billing, and multi-location reporting separately', pryroValue: 'unifies reservations, staff management, vendor billing, and financial reporting' };
  if (/retail|shop|store|supermarket|e-commerce|ecommerce|clothing|electronics|furniture|hardware|jewelry|shoe|sporting/.test(n)) return { sectorName: 'retail businesses', painPoint: 'keeping inventory in sync across locations, managing suppliers, and tracking cash flow manually', pryroValue: 'automates inventory management, supplier orders, sales reporting, and payroll' };
  if (/construction|engineering|contractor|architecture|surveying|interior design/.test(n)) return { sectorName: 'construction and engineering firms', painPoint: 'reconciling project budgets, contractor billing, and field time tracking across separate tools', pryroValue: 'connects project management, contractor billing, payroll, and financial reporting' };
  if (/logistics|transport|trucking|freight|shipping|courier|fleet|warehouse|moving/.test(n)) return { sectorName: 'logistics and transport companies', painPoint: 'matching driver payroll to route logs, tracking fleet maintenance, and managing warehouse stock manually', pryroValue: 'automates fleet tracking, driver payroll, warehouse inventory, and dispatch reporting' };
  if (/school|college|university|education|training|coaching|driving school|language|nursery|vocational/.test(n)) return { sectorName: 'schools and educational institutions', painPoint: 'managing student records, staff payroll, fee collection, and reporting across disconnected systems', pryroValue: 'handles student management, fee tracking, staff payroll, and financial reporting in one system' };
  if (/ngo|non-profit|nonprofit|foundation|charity|church|mosque|temple|religious/.test(n)) return { sectorName: 'NGOs and non-profit organizations', painPoint: 'tracking grant budgets, managing donor records, and compiling field expense reports manually', pryroValue: 'automates grant tracking, donor management, field expense reporting, and financial compliance' };
  if (/manufacturing|factory|production|textile|packaging|chemical|food processing/.test(n)) return { sectorName: 'manufacturing businesses', painPoint: 'tracking production schedules, managing raw material inventory, and reconciling output reports manually', pryroValue: 'connects production planning, inventory control, quality tracking, and payroll' };
  if (/agency|consulting|marketing|advertising|pr |media|digital|seo|web design|app dev|software|it service|tech/.test(n)) return { sectorName: 'agencies and consulting firms', painPoint: 'tracking billable hours, managing project budgets, and chasing invoices across multiple tools', pryroValue: 'automates time tracking, project billing, invoicing, and client reporting' };
  if (/bank|finance|insurance|investment|microfinance|forex|mortgage|credit|savings|stock/.test(n)) return { sectorName: 'financial services businesses', painPoint: 'managing client portfolios, compliance reporting, and staff operations across separate systems', pryroValue: 'consolidates client management, compliance tracking, payroll, and financial reporting' };
  if (/farm|agriculture|agri/.test(n)) return { sectorName: 'agricultural businesses', painPoint: 'tracking crop inventory, managing seasonal staff payroll, and reconciling supplier costs manually', pryroValue: 'automates inventory tracking, seasonal payroll, supplier management, and financial reporting' };
  if (/real estate|property|estate agent/.test(n)) return { sectorName: 'real estate businesses', painPoint: 'managing property listings, client follow-ups, commission tracking, and financial reporting separately', pryroValue: 'connects property management, CRM, commission tracking, and financial reporting' };
  const cleanNiche = niche.replace(/\b(services?|solutions?|management|systems?|group|company|ltd|inc)\b/gi, '').replace(/\s+/g, ' ').trim().toLowerCase() || 'businesses';
  return { sectorName: `${cleanNiche} businesses`, painPoint: 'managing operations across multiple disconnected tools', pryroValue: 'consolidates finance, inventory, HR, payroll, and CRM into one system' };
}

function getSectorLabel(niche: string | null): string { return getNicheContent(niche).sectorName; }

// ── Subject patterns (rotated per lead so bulk emails vary) ──────────────────
const SUBJECT_PATTERNS_BULK = [
  (company: string, sector: string) => `Still managing ${sector} manually? ${company}`,
  (company: string, _sector: string) => `Too many tools slowing your team? ${company}`,
  (company: string, sector: string) => `Is ${sector} admin costing you hours? ${company}`,
  (company: string, _sector: string) => `Fragmented tools slowing growth? ${company}`,
  (company: string, sector: string) => `${sector} teams losing hours to this, ${company}`,
  (company: string, _sector: string) => `What if one system replaced them all? ${company}`,
  (company: string, sector: string) => `The ${sector} back-office problem, ${company}`,
  (company: string, _sector: string) => `Could your team save 10 hours a week? ${company}`,
];

// ── Direct email builder — no AI, exact template every time ──────────────────
const PRYRO_LINE = `Pryro is an ERP that brings HR, payroll, finance, inventory, and CRM into one platform.`;

function buildDirectEmail(
  companyName: string,
  niche: string | null,
  senderName: string,
  idx: number,
  contactName?: string | null,
  email?: string | null,
): { subject: string; body: string } {
  const company = decodeHtmlEntities(companyName);
  const { sectorName, painPoint } = getNicheContent(niche);
  const patternFn = SUBJECT_PATTERNS_BULK[idx % SUBJECT_PATTERNS_BULK.length]!;
  const subject = patternFn(company, sectorName);

  // Resolve greeting
  let greeting: string;
  const firstName = resolveFirstName(contactName, email);
  if (firstName) {
    greeting = `Hi ${firstName},`;
  } else {
    greeting = 'Dear Sir/Madam,';
  }

  const cta = `Would a 10 minute call make sense to show you how Pryro could work for ${company}?`;

  const body =
`${greeting}

Is ${company} still managing ${sectorName} operations across separate tools?

That kind of fragmentation costs hours every week and makes it hard to see how the business is really running. ${PRYRO_LINE}

We also offer a 20-30% commission for every successfully referred client.

${cta}

Best regards,
${senderName}
Executive Sales
Pryro`;

  return { subject, body };
}

// ── Resolve first name for greeting ──────────────────────────────────────────
const GENERIC_PREFIXES = new Set([
  'info','contact','hello','hi','mail','support','help','admin','office',
  'team','sales','reception','general','enquiry','enquiries','bookings',
  'booking','hr','marketing','accounts','billing','feedback','service',
  'media','press','shop','store','news','noreply','no-reply',
]);

function resolveFirstName(contactName?: string | null, email?: string | null): string | null {
  // Try contact_name field first
  if (contactName) {
    const parts = contactName.trim().split(/[\s,./]+/);
    for (const part of parts) {
      const p = part.replace(/^(dr|prof|mr|mrs|ms|miss|rev|eng)\.*\s*/i, '').trim();
      if (p.length >= 2 && p.length <= 12 && /^[a-zA-Z]+$/.test(p)) {
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      }
    }
  }
  // Try email prefix
  if (email) {
    const local = email.split('@')[0]?.toLowerCase() ?? '';
    if (GENERIC_PREFIXES.has(local)) return null;
    if (/[._\-]/.test(local)) {
      const first = local.split(/[._\-]/)[0] ?? '';
      if (first.length >= 2 && first.length <= 12 && /^[a-z]+$/.test(first)) {
        return first.charAt(0).toUpperCase() + first.slice(1);
      }
    }
    if (/^[a-z]+$/.test(local) && local.length >= 2 && local.length <= 12) {
      return local.charAt(0).toUpperCase() + local.slice(1);
    }
  }
  return null;
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

  const SYSTEM_MESSAGE = buildSystemMessage();

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
          idx,
          lead.contact_name ?? null,
          lead.email ?? null,
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
