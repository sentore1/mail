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
  senderPhone?: string;
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

// ── Niche-specific email content ──────────────────────────────────────────────
// Returns { sectorName, painPoint, pryroValue } tailored to the niche.
// sectorName: natural name used in the email (e.g. "pharmacies", "schools")
// painPoint: what they struggle with
// pryroValue: what Pryro specifically does for them

interface NicheContent {
  sectorName: string;   // e.g. "pharmacies", "construction firms"
  painPoint: string;    // e.g. "managing stock, billing, and staff schedules across separate systems"
  pryroValue: string;   // e.g. "automates stock tracking, billing, payroll, and reporting in one place"
}

function getNicheContent(niche: string | null): NicheContent {
  if (!niche) return {
    sectorName: 'businesses',
    painPoint: 'managing operations across multiple disconnected tools',
    pryroValue: 'consolidates finance, inventory, HR, payroll, and CRM into one system',
  };
  const n = niche.toLowerCase();

  if (/pharmacy|chemist|drug store|dispensary/.test(n)) return {
    sectorName: 'pharmacies',
    painPoint: 'managing stock levels, billing, and staff schedules across separate systems',
    pryroValue: 'automates stock tracking, expiry alerts, billing, and staff payroll in one place',
  };
  if (/clinic|dental|dentist|hospital|medical|doctor|physician|surgery|optom|chiro|physio|vet|nursing|rehab|radiol|pediatr|dermat/.test(n)) return {
    sectorName: 'medical clinics and healthcare providers',
    painPoint: 'coordinating patient scheduling, billing, inventory, and staff payroll across different tools',
    pryroValue: 'connects patient management, billing, inventory, and HR into one unified system',
  };
  if (/restaurant|catering|bakery|coffee|fast food/.test(n)) return {
    sectorName: 'restaurants and food businesses',
    painPoint: 'tracking inventory, managing staff schedules, and reconciling daily sales across multiple systems',
    pryroValue: 'handles inventory, staff scheduling, payroll, and financial reporting in one place',
  };
  if (/hotel|lodge|hospitality/.test(n)) return {
    sectorName: 'hotels and hospitality businesses',
    painPoint: 'managing reservations, housekeeping schedules, vendor billing, and multi-location reporting separately',
    pryroValue: 'unifies reservations, staff management, vendor billing, and financial reporting',
  };
  if (/retail|shop|store|supermarket|e-commerce|ecommerce|clothing|electronics|furniture|hardware|jewelry|shoe|sporting/.test(n)) return {
    sectorName: 'retail businesses',
    painPoint: 'keeping inventory in sync across locations, managing suppliers, and tracking cash flow manually',
    pryroValue: 'automates inventory management, supplier orders, sales reporting, and payroll',
  };
  if (/construction|engineering|contractor|architecture|surveying|interior design/.test(n)) return {
    sectorName: 'construction and engineering firms',
    painPoint: 'reconciling project budgets, contractor billing, and field time tracking across separate tools',
    pryroValue: 'connects project management, contractor billing, payroll, and financial reporting',
  };
  if (/logistics|transport|trucking|freight|shipping|courier|fleet|warehouse|moving/.test(n)) return {
    sectorName: 'logistics and transport companies',
    painPoint: 'matching driver payroll to route logs, tracking fleet maintenance, and managing warehouse stock manually',
    pryroValue: 'automates fleet tracking, driver payroll, warehouse inventory, and dispatch reporting',
  };
  if (/school|college|university|education|training|coaching|driving school|language|nursery|vocational/.test(n)) return {
    sectorName: 'schools and educational institutions',
    painPoint: 'managing student records, staff payroll, fee collection, and reporting across disconnected systems',
    pryroValue: 'handles student management, fee tracking, staff payroll, and financial reporting in one system',
  };
  if (/ngo|non-profit|nonprofit|foundation|charity|church|mosque|temple|religious/.test(n)) return {
    sectorName: 'NGOs and non-profit organizations',
    painPoint: 'tracking grant budgets, managing donor records, and compiling field expense reports manually',
    pryroValue: 'automates grant tracking, donor management, field expense reporting, and financial compliance',
  };
  if (/manufacturing|factory|production|textile|packaging|chemical|food processing/.test(n)) return {
    sectorName: 'manufacturing businesses',
    painPoint: 'tracking production schedules, managing raw material inventory, and reconciling output reports manually',
    pryroValue: 'connects production planning, inventory control, quality tracking, and payroll',
  };
  if (/agency|consulting|marketing|advertising|pr |media|digital|seo|web design|app dev|software|it service|tech/.test(n)) return {
    sectorName: 'agencies and consulting firms',
    painPoint: 'tracking billable hours, managing project budgets, and chasing invoices across multiple tools',
    pryroValue: 'automates time tracking, project billing, invoicing, and client reporting',
  };
  if (/bank|finance|insurance|investment|microfinance|forex|mortgage|credit|savings|stock/.test(n)) return {
    sectorName: 'financial services businesses',
    painPoint: 'managing client portfolios, compliance reporting, and staff operations across separate systems',
    pryroValue: 'consolidates client management, compliance tracking, payroll, and financial reporting',
  };
  if (/farm|agriculture|agri/.test(n)) return {
    sectorName: 'agricultural businesses',
    painPoint: 'tracking crop inventory, managing seasonal staff payroll, and reconciling supplier costs manually',
    pryroValue: 'automates inventory tracking, seasonal payroll, supplier management, and financial reporting',
  };
  if (/real estate|property|estate agent/.test(n)) return {
    sectorName: 'real estate businesses',
    painPoint: 'managing property listings, client follow-ups, commission tracking, and financial reporting separately',
    pryroValue: 'connects property management, CRM, commission tracking, and financial reporting',
  };

  // Fallback — use the raw niche name cleaned up
  const cleanNiche = niche
    .replace(/\b(services?|solutions?|management|systems?|group|company|ltd|inc)\b/gi, '')
    .replace(/\s+/g, ' ').trim().toLowerCase() || 'businesses';
  return {
    sectorName: `${cleanNiche} businesses`,
    painPoint: 'managing operations across multiple disconnected tools',
    pryroValue: 'consolidates finance, inventory, HR, payroll, and CRM into one system',
  };
}

// Keep getSectorLabel for subject line use
function getSectorLabel(niche: string | null): string {
  return getNicheContent(niche).sectorName;
}

// ── HTML entity decoder ───────────────────────────────────────────────────────
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/gi, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

// ── Subject line patterns ─────────────────────────────────────────────────────
const SUBJECT_PATTERNS = [
  (_company: string, _sector: string) => `Strategic Partnership Opportunity`,
  (_company: string, _sector: string) => `Exploring Strategic Collaboration`,
  (_company: string, _sector: string) => `Potential Partnership Discussion`,
  (_company: string, _sector: string) => `Business Collaboration Opportunity`,
  (_company: string, _sector: string) => `Referral Partnership Opportunity`,
  (_company: string, _sector: string) => `Pryro Partnership Proposal`,
  (_company: string, _sector: string) => `ERP Partnership Opportunity`,
  (_company: string, _sector: string) => `Mutual Growth Opportunity`,
  (_company: string, _sector: string) => `Joint Business Opportunity`,
  (_company: string, _sector: string) => `Technology Partnership Opportunity`,
];

// ── Direct email builder — no AI, no hallucination ───────────────────────────
function buildDirectEmail(
  companyName: string,
  niche: string | null,
  senderName: string,
  senderTitle: string,
  idx: number
): { subject: string; body: string } {
  // Clean HTML entities from company name (e.g. &#x27; → ')
  const company = decodeHtmlEntities(companyName);
  const { sectorName, painPoint, pryroValue } = getNicheContent(niche);
  const sector = sectorName;

  const patternFn = SUBJECT_PATTERNS[idx % SUBJECT_PATTERNS.length]!;
  const subject = patternFn(company, sector);

  const body =
`Dear Sir/Madam,

${company} is in the ${sectorName} sector, where ${painPoint} is a common challenge.

Pryro is an ERP that replaces those inefficiencies with one unified system. It ${pryroValue} and we offer a 20-30% commission for every successfully referred client.

Would you be open to a 10-minute call to see if it is relevant?

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
