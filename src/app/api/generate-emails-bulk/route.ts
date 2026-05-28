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

// ─── Subject patterns ─────────────────────────────────────────────────────────

const SUBJECT_PATTERNS = [
  (company: string, _s: string) => `${company} — quick question about your operations`,
  (_c: string, sector: string) => `A better way to run ${sector} operations in 2025`,
  (company: string, _s: string) => `${company} — could this save your team 10 hours a week?`,
  (_c: string, sector: string) => `How ${sector} businesses are simplifying their back-office`,
  (company: string, _s: string) => `${company} — worth a 10-minute conversation`,
  (_c: string, sector: string) => `Cutting admin time for ${sector} teams — is this relevant?`,
  (company: string, _s: string) => `${company} — one system instead of many tools`,
  (_c: string, sector: string) => `${sector} businesses and the fragmented tools problem`,
];

// ─── Direct email builder — no AI, exact template every time ─────────────────

function buildDirectEmail(
  companyName: string,
  niche: string | null,
  senderName: string,
  senderTitle: string,
  idx: number
): { subject: string; body: string } {
  const sector = (niche || 'business').toLowerCase().trim();
  const patternFn = SUBJECT_PATTERNS[idx % SUBJECT_PATTERNS.length]!;
  const subject = patternFn(companyName, sector);

  const body =
`Dear Sir/Madam,

${companyName} — like many businesses in the ${sector} industry — often deals with manual workflows and fragmented tools that slow teams down.

Pryro is an ERP that replaces those inefficiencies with one unified system — covering finance, inventory, HR, payroll, project management, and CRM.

We also offer a 20–30% commission for every successfully referred client.

Would you be open to a 10-minute call to see if it's relevant?

Best regards,
${senderName}
Executive Sales
Pryro`;

  return { subject, body };
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

  const { leads, yourCompany, yourService, tone, customPainPoint, senderName: bodySenderName, senderTitle: bodySenderTitle } =
    (await request.json()) as {
      leads: LeadInput[];
      yourCompany: string;
      yourService: string;
      tone: string;
      customPainPoint?: string;
      senderName?: string;
      senderTitle?: string;
    };

  if (!leads?.length) {
    return new Response(JSON.stringify({ error: "No leads provided" }), {
      status: 400,
    });
  }

  // No AI needed — emails are generated from a fixed template
  const serviceSupabase = createServiceClient();

  // Load sender name — use provided name first, fall back to SMTP account
  let senderName = bodySenderName || "Sales Team";
  const senderTitle = bodySenderTitle || "Executive Sales";
  if (!bodySenderName) {
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
    } catch { /* use default */ }
  }

  // ── SSE stream ────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      const send = (event: string, data: object) => {
        try {
          controller.enqueue(
            enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch { /* client disconnected */ }
      };

      send("start", { total: leads.length });

      let done = 0;

      for (let idx = 0; idx < leads.length; idx++) {
        const lead = leads[idx]!;

        // Skip junk scrape results
        if (isJunkCompanyName(lead.company_name)) {
          console.warn(`⏭  Skipping junk: "${lead.company_name}"`);
          done++;
          send("skipped", { company_name: lead.company_name, done, total: leads.length });
          continue;
        }

        const cleanedName = cleanCompanyName(lead.company_name);
        const { subject, body } = buildDirectEmail(cleanedName, lead.niche, senderName, senderTitle, idx);

        done++;
        send("email", {
          email: {
            lead_id: lead.id,
            lead_email: lead.email,
            company_name: cleanedName,
            subject,
            body,
            model: "template",
            isFallback: false,
          },
          done,
          total: leads.length,
        });
      }

      send("done", { total: leads.length, ai: leads.length, fallback: 0 });
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
