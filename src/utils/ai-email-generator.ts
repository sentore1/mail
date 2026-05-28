import { createClient } from "../../supabase/client";

interface EmailGenerationParams {
  lead: {
    company_name: string;
    niche: string | null;
    location: string | null;
    company_context: string | null;
  };
  yourCompany: string;
  yourService: string;
  tone: 'Direct' | 'Aggressive' | 'Surgical';
  customPainPoint?: string;
  userId: string;
  senderName?: string;
  senderEmail?: string;
  senderTitle?: string;
}

// ── System message ────────────────────────────────────────────────────────────
function buildSystemMessage(senderName: string, senderTitle: string): string {
  // Not used — we generate emails directly in code now
  return '';
}

// ── Tone additions ────────────────────────────────────────────────────────────
const TONE_ADDITIONS: Record<string, string> = {
  Direct:     '',
  Aggressive: '',
  Surgical:   '',
};

// ── Subject line patterns ─────────────────────────────────────────────────────
const SUBJECT_PATTERNS = [
  (company: string, _sector: string) => `${company} — quick question about your operations`,
  (_company: string, sector: string) => `A better way to run ${sector} operations in 2025`,
  (company: string, _sector: string) => `${company} — could this save your team 10 hours a week?`,
  (_company: string, sector: string) => `How ${sector} businesses are simplifying their back-office`,
  (company: string, _sector: string) => `${company} — worth a 10-minute conversation`,
  (_company: string, sector: string) => `Cutting admin time for ${sector} teams — is this relevant?`,
  (company: string, _sector: string) => `${company} — one system instead of many tools`,
  (_company: string, sector: string) => `${sector} businesses and the fragmented tools problem`,
];

// ── Direct email builder — no AI, no hallucination ───────────────────────────
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
${senderTitle}
Pryro`;

  return { subject, body };
}

// ── Clinic / Hospital niche detection ────────────────────────────────────────
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

function buildClinicEmail(
  companyName: string,
  senderName: string,
  senderTitle: string
): { subject: string; body: string } {
  const subject = `${companyName}, are you still managing schedules across 3 different tools?`;

  const body =
`Hi there,

Most pharmacy and clinic owners I talk to are juggling stock management in one system, billing in another, and staff schedules in a spreadsheet. By the end of the week, someone's always chasing a number that lives in the wrong place — and it costs about 12 admin hours every week.

Pryro pulls all of that into one place — stock, billing, staff scheduling, and financials. We work with 140+ pharmacies and clinics, and the average team gets back 10 hours a week in the first month. Stock expiry alerts alone save most of them $1,500+ monthly.

Would it be worth 10 minutes to see if it fits how ${companyName} operates? Here's my calendar: [Calendar link] — no pressure if the timing's off.

Best regards,
${senderName}
${senderTitle}
Pryro

P.S. We have a pharmacy-specific setup that takes about 2 weeks to go live — happy to walk you through it.`;

  return { subject, body };
}

// ── Strip markdown from AI output ────────────────────────────────────────────
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

export async function generateAIEmail(params: EmailGenerationParams): Promise<{ subject: string; body: string }> {
  const {
    lead, userId,
    senderName: paramSenderName,
    senderTitle: paramSenderTitle,
  } = params;

  let senderName = paramSenderName || '';
  const senderTitle = paramSenderTitle || 'Executive Sales';

  if (!senderName) {
    try {
      const supabase = createClient();
      const { data: smtpAccounts } = await supabase
        .from('smtp_accounts')
        .select('email, sender_name')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('sent_today', { ascending: true })
        .limit(1);

      if (smtpAccounts && smtpAccounts.length > 0) {
        const account = smtpAccounts[0];
        senderName = account.sender_name ||
          account.email.split('@')[0]
            .replace(/[._\-]/g, ' ')
            .replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
    } catch { /* fallback below */ }
  }

  if (!senderName) senderName = 'Sales Team';

  // Generate directly in code — no AI, no hallucination, exact template every time
  return buildDirectEmail(lead.company_name, lead.niche, senderName, senderTitle, 0);
}

// ── Call a single provider ────────────────────────────────────────────────────
async function callSingleProvider(
  aiProvider: any,
  systemMessage: string,
  userPrompt: string
): Promise<string> {
  // Increase max_tokens to allow longer, higher-quality emails
  const maxTokens = 600;

  if (aiProvider.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiProvider.api_key}` },
      body: JSON.stringify({
        model: aiProvider.active_model || "gpt-4o-mini",
        messages: [{ role: "system", content: systemMessage }, { role: "user", content: userPrompt }],
        temperature: 0.5,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) { const e = await res.text().catch(() => res.statusText); throw new Error(`OpenAI ${res.status}: ${e.slice(0, 200)}`); }
    return (await res.json()).choices[0].message.content;

  } else if (aiProvider.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": aiProvider.api_key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: aiProvider.active_model || "claude-3-5-haiku-20241022",
        max_tokens: maxTokens,
        system: systemMessage,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) { const e = await res.text().catch(() => res.statusText); throw new Error(`Anthropic ${res.status}: ${e.slice(0, 200)}`); }
    return (await res.json()).content[0].text;

  } else if (aiProvider.provider === "groq") {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiProvider.api_key}` },
      body: JSON.stringify({
        model: aiProvider.active_model || "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemMessage }, { role: "user", content: userPrompt }],
        temperature: 0.5,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) {
      let errText = ""; try { errText = await res.text(); } catch {}
      let errJson: any = null; try { errJson = JSON.parse(errText); } catch {}
      throw new Error(`Groq ${res.status}: ${errJson?.error?.message || errText.slice(0, 200) || res.statusText}`);
    }
    return (await res.json()).choices[0].message.content;

  } else if (aiProvider.provider === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${aiProvider.active_model || "gemini-1.5-flash"}:generateContent?key=${aiProvider.api_key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemMessage + "\n\n" + userPrompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: maxTokens },
        }),
      }
    );
    if (!res.ok) { const e = await res.text().catch(() => res.statusText); throw new Error(`Gemini ${res.status}: ${e.slice(0, 200)}`); }
    return (await res.json()).candidates[0].content.parts[0].text;

  } else if (aiProvider.provider === "mistral") {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiProvider.api_key}` },
      body: JSON.stringify({
        model: aiProvider.active_model || "mistral-small",
        messages: [{ role: "system", content: systemMessage }, { role: "user", content: userPrompt }],
        temperature: 0.5,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) { const e = await res.text().catch(() => res.statusText); throw new Error(`Mistral ${res.status}: ${e.slice(0, 200)}`); }
    return (await res.json()).choices[0].message.content;

  } else {
    throw new Error(`Unsupported AI provider: ${aiProvider.provider}`);
  }
}

// ── Parse and clean AI response ───────────────────────────────────────────────
function parseAIResponse(
  aiResponse: string,
  senderName: string,
  senderTitle: string
): { subject: string; body: string } {
  let subject = "";
  let body = "";

  const subjectMatch = aiResponse.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
  const bodyMatch = aiResponse.match(/BODY:\s*([\s\S]+?)$/i);

  if (subjectMatch && bodyMatch) {
    subject = subjectMatch[1].trim();
    body = bodyMatch[1].trim();
  } else {
    const lines = aiResponse.trim().split("\n");
    if (lines.length >= 2) {
      subject = lines[0].replace(/^(SUBJECT:|Subject:)/i, "").trim();
      body = lines.slice(1).join("\n").replace(/^(BODY:|Body:)/i, "").trim();
    } else {
      throw new Error("AI response format invalid. Expected 'SUBJECT: ...' and 'BODY: ...' format.");
    }
  }

  subject = stripMarkdown(subject.replace(/^["']|["']$/g, "").trim());
  body = stripMarkdown(body.replace(/^["']|["']$/g, "").trim());

  // Replace any remaining placeholders
  body = body
    .replace(/\[Sender Name\]/gi, senderName)
    .replace(/\[Your Name\]/gi, senderName)
    .replace(/\[Name\]/gi, senderName)
    .replace(/\[Title\]/gi, senderTitle)
    .replace(/\[Your Title\]/gi, senderTitle)
    .replace(/\[Company\]/gi, 'Pryro')
    .replace(/\[Your Company\]/gi, 'Pryro');

  if (!subject || !body) {
    throw new Error("AI generated an empty subject or body. Try again.");
  }

  return { subject, body };
}
