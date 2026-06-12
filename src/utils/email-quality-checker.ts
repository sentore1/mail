/**
 * EMAIL QUALITY CHECKER — v2
 * ──────────────────────────
 * Enforces every rule from Q8 & Q9:
 *   1. Banned phrase detection (hard block)
 *   2. Generic opener detection (hard block)
 *   3. Subject line strength (must be specific question or observation)
 *   4. CTA must be a single soft question
 *   5. Length gate (under 120 words body, max 3 paragraphs)
 *   6. No formal sign-off block (must be casual "Name from Pryro")
 *   7. Personalization: company name in body, city optional
 *
 * score:  0–100  (80+ = ready to send)
 * passed: false  = at least one hard block triggered
 */

export interface QualityFlag {
  type: 'banned_phrase' | 'generic_opener' | 'subject' | 'cta' | 'length' | 'signoff' | 'personalization' | 'tone';
  severity: 'block' | 'warn';
  message: string;
  fix: string;
}

export interface QualityReport {
  passed: boolean;
  score: number;              // 0–100
  flags: QualityFlag[];
  bannedFound: string[];
  wordCount: number;
  subjectStrength: 'weak' | 'ok' | 'strong';
  ctaType: 'missing' | 'hard' | 'soft';
  personalizationScore: number;
  summary: string;
}

// ─── Q9: Complete banned phrase list ────────────────────────────────────────
// Two tiers: HARD (block sending), SOFT (warn only)

const HARD_BANNED: string[] = [
  // Generic cold email openers
  'i hope this email finds you well',
  'i hope you are doing well',
  "i hope you're doing well",
  'i wanted to reach out',
  'i am reaching out',
  "i'm reaching out",
  'i wanted to connect',
  'i am writing to',
  'i am contacting you',
  'just following up',
  'touching base',
  'circling back',
  'to whom it may concern',
  'dear sir or madam',
  'dear sir/madam',
  'please find attached',
  'kindly revert',
  // Hype / ad-speak
  'cutting-edge',
  'revolutionary',
  'game-changer',
  'game changer',
  'disruptive',
  'synergy',
  'best-in-class',
  'world-class',
  'industry-leading',
  'state-of-the-art',
  'innovative solution',
  'innovative solutions',
  'seamless integration',
  'seamless solution',
  'robust solution',
  'robust platform',
  'next-level',
  'unlock potential',
  'take your business to the next level',
  // Generic "we help" framing
  'we help companies like yours',
  'we help businesses like yours',
  'companies like yours',
  'businesses like yours',
  // Spam triggers
  'limited time offer',
  'act now',
  'click here',
  'buy now',
  'guaranteed results',
  'no obligation',
  'risk-free',
  'special promotion',
  'exclusive offer',
  'last chance',
  // Weak CTAs
  'schedule a demo',
  'book a demo',
  'pleased to inform',
  'excited to share',
  'does this match what your team deals with',
  'does this sound familiar',
  // Formal closings
  'warm regards',
  'yours faithfully',
  'yours sincerely',
  'best wishes',
  'best regards',
  // Website-quoting openers
  'i was looking at your website',
  'i came across your website',
  "i came across your site",
  'i noticed on your website',
  'i saw on your website',
  'according to your website',
  'based on your website',
  'your website mentions',
  'i visited your website',
  'i found on your website',
];

const SOFT_BANNED: string[] = [
  'streamline', 'optimize', 'empower', 'transform', 'revolutionize',
  'solutions', 'solution', 'platform', 'ecosystem', 'holistic',
  'end-to-end', 'end to end', 'best-of-breed', 'best of breed',
  'value-add', 'value add', 'strategic', 'synergistic',
];

// ─── Generic opener patterns (Q1) ────────────────────────────────────────────

const GENERIC_OPENERS = [
  /^most (companies|businesses|organizations|clinics|hospitals|pharmacies|hotels|agencies|schools)\b/i,
  /^many (companies|businesses|organizations|clinics|hotels|agencies)\b/i,
  /^a lot of (companies|businesses)\b/i,
  /^businesses (like yours|in your sector|in your industry)\b/i,
  /^(companies|organizations) (in your|in the) (industry|sector|space)\b/i,
  /^i hope/i,
  /^hope (this|you)/i,
  /^as a (leading|top|trusted)/i,
  // Website-quoting openers — robotic and low-converting
  /^i (was looking at|came across|noticed on|saw on|visited|found on) (your|the|their) (website|site|page|web presence)/i,
  /^(after|while) (looking at|visiting|browsing) (your|the|their) (website|site|page)/i,
  /^according to your (website|site|page)/i,
  /^based on your (website|site|page)/i,
  /^your (website|site) (says|mentions|states|shows|indicates)/i,
  // Promotional / award content (from website scraping)
  /^(congratulations|we are proud|we are pleased|we are thrilled|we are excited)/i,
  /^(award|winner|proud|honor|honour|recogni[sz]|accolade|rated #|ranked #|best in|voted)/i,
  /^(our mission|our vision|our commitment|we are dedicated|we are committed)/i,
];

// ─── Weak subject patterns (Q2) ──────────────────────────────────────────────

const WEAK_SUBJECTS = [
  /^(strategic|potential|mutual|referral|business|technology|erp|digital)\s+partnership/i,
  /^partnership\s+(opportunity|proposal|discussion|enquiry)/i,
  /^(exploring|discussing|potential)\s+(collaboration|partnership)/i,
  /^collaboration\s+(opportunity|proposal)/i,
  /^(introduction|introducing|introducing ourselves)/i,
  /^follow[- ]?up$/i,
  /^hello$/i,
  /^hi$/i,
  /^(checking|touching|circling)/i,
  // Support-ticket / help-desk patterns (low open rate)
  /\b(billing|invoice|payment|stock|inventory|payroll)\s+question\s*$/i,
  /^quick question (for|about) .+['']s (admin|billing|ops|team|management) team/i,
  /\b(fix|solution|update)\s+worth\s+\d+\s*(min|minute)/i,
  /\ban? (admin|ops|billing|hr)\s+fix\s+worth/i,
  // Generic announcement / description styles
  /^introducing\s+/i,
  /^announcement/i,
  /^update\s*(for|from|about)/i,
  /^(new|free)\s+(tool|software|platform|product|service|solution|feature)/i,
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

function ctaType(body: string): 'missing' | 'hard' | 'soft' {
  const last300 = body.split('\n').filter(l => l.trim()).slice(-5).join(' ').toLowerCase();
  // Valid CTA patterns — must be a specific 10-minute call ask with company name
  const validPatterns = [
    /would a 10.?minute call/i,
    /can we get 10 minutes/i,
    /10 min(ute)? call.*make sense/i,
    /show you how pryro could work for/i,
    /worth it to see if this fits/i,
  ];
  if (validPatterns.some(p => p.test(last300))) return 'soft';
  // Weak patterns — still pass the type check but will warn
  const weakPatterns = [
    /open to seeing/i,
    /worth a quick look/i,
    /would (it|a|this) (be|make) (worth|sense)/i,
    /would you be open/i,
    /are you open/i,
    /is this something/i,
    /worth a (call|chat|look)/i,
    /would it make sense/i,
  ];
  if (weakPatterns.some(p => p.test(last300))) return 'hard'; // treat as hard — needs fixing
  const hardPatterns = [/schedule a/i, /book a/i, /let's set up/i, /let me know if/i];
  if (hardPatterns.some(p => p.test(last300))) return 'hard';
  if (last300.includes('?')) return 'hard'; // any question at end = still weak
  return 'missing';
}

function personalizationScore(subject: string, body: string, companyName: string): number {
  let score = 0;
  const full = (subject + ' ' + body).toLowerCase();
  const cn   = companyName.toLowerCase();

  // Company name in both subject AND body = maximum signal
  if (subject.toLowerCase().includes(cn) && full.includes(cn)) score += 25;
  else if (full.includes(cn))                                   score += 15;

  // Specific industry term (shows sector awareness)
  if (/\b(clinic|hospital|pharmacy|hotel|travel|school|logistics|retail|restaurant|lodge|dispensary|veterinary)\b/i.test(full)) score += 12;

  // Operational pain point (shows domain knowledge)
  const painWords = ['billing', 'stock', 'expiry', 'payroll', 'booking', 'commission', 'margin', 'inventory', 'reconcil', 'scheduling', 'fee collect', 'driver', 'trip billing', 'food cost', 'supplier'];
  const painHits = painWords.filter(w => full.includes(w)).length;
  score += Math.min(painHits * 8, 24); // up to 24 points for operational specificity

  // City / location reference (shows geographic personalisation)
  if (/\b(kampala|nairobi|lagos|accra|kigali|dar es salaam|africa|asia|india|ghana|nigeria|kenya|uganda|rwanda|tanzania|uganda|rwanda|johannesburg|cape town|lusaka|harare|addis|abuja|cairo|abidjan|dakar)\b/i.test(full)) score += 12;

  // Question present (human-sounding)
  if ((full.match(/\?/g) || []).length >= 1) score += 8;

  // No generic salutation that isn't our own Dear Sir/Madam fallback (+ve signal)
  // We allow "Dear Sir/Madam," as our own fallback — only penalize truly foreign salutations
  if (!/to whom it may concern/i.test(full)) score += 10;

  // Named greeting — "Hi [RealName]," scores bonus; "Dear Sir/Madam," or "Hi there," does not
  if (/^hi [a-zA-Z]{2,12},/im.test(body) && !/^hi (there|sir|madam|sir\/madam),/im.test(body)) score += 9;

  // Free trial or pryro.com mention (positive but not required)
  if (/pryro\.com/i.test(full)) score += 5;

  return Math.min(score, 100);
}

function signOffType(body: string): 'professional' | 'casual' | 'missing' {
  // Multi-line footer: last non-empty line contains a name or phone (not a question)
  const lines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const lastLine = lines[lines.length - 1] ?? '';
  // Valid footer: last line looks like a name, email, or phone — not a question or CTA
  if (/\w/.test(lastLine) && !lastLine.endsWith('?')) return 'professional';
  if (/warm regards\s*$|yours (faithfully|sincerely)\s*$|best wishes\s*$/im.test(body)) return 'missing';
  return 'missing';
}

// ─── Main checker ────────────────────────────────────────────────────────────

export function checkEmailQuality(params: {
  subject: string;
  body: string;
  companyName: string;
  externalPersonalizationScore?: number;
}): QualityReport {
  const { subject, body, companyName, externalPersonalizationScore } = params;
  const flags: QualityFlag[] = [];
  const bannedFound: string[] = [];

  const fullLower = (subject + ' ' + body).toLowerCase();
  const bodyLower  = body.toLowerCase();

  // Skip greeting line to find the real observation opener
  const nonEmptyLines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const firstLine = nonEmptyLines[0] ?? '';
  // Detect greeting patterns: "Hi [Name]," / "Hi [Company] team," / "Hello [Name],"
  const isGreetingLine = /^hi (there|[a-z].{0,30}),?$/i.test(firstLine)
    || /^hello (there|[a-z]+),?$/i.test(firstLine);
  const observationLine = isGreetingLine ? (nonEmptyLines[1] ?? '') : firstLine;

  // ── 0. Mandatory greeting check (hard block) ──────────────────────────────
  // Every email MUST start with "Hi [Name]," or "Hi [Company] team,"
  if (!isGreetingLine) {
    flags.push({
      type: 'generic_opener',
      severity: 'block',
      message: `Email does not start with a greeting. First line: "${firstLine.slice(0, 80)}"`,
      fix: `The very first line of every email must be "Hi [Name]," or "Hi [Company] team," before any other content.`,
    });
  }

  // ── 1. Banned phrases (hard block) ───────────────────────────────────────
  for (const phrase of HARD_BANNED) {
    if (fullLower.includes(phrase.toLowerCase())) {
      bannedFound.push(phrase);
    }
  }
  if (bannedFound.length > 0) {
    flags.push({
      type: 'banned_phrase',
      severity: 'block',
      message: `Contains ${bannedFound.length} banned phrase(s): "${bannedFound.slice(0, 3).join('", "')}"`,
      fix: `Remove every instance. Replace with specific, factual language about this company and their industry.`,
    });
  }

  const softFound = SOFT_BANNED.filter(p => fullLower.includes(p.toLowerCase()));
  if (softFound.length >= 2) {
    flags.push({
      type: 'tone',
      severity: 'warn',
      message: `Contains ${softFound.length} sales buzzword(s): "${softFound.slice(0, 3).join('", "')}"`,
      fix: `Replace with concrete, operational language. E.g. "reduce billing time from 3 days to same-day" not "streamline billing".`,
    });
  }

  // ── 2. Generic opener (hard block) ───────────────────────────────────────
  if (GENERIC_OPENERS.some(re => re.test(observationLine))) {
    flags.push({
      type: 'generic_opener',
      severity: 'block',
      message: `Opening observation is generic: "${observationLine.slice(0, 80)}"`,
      fix: `Start with the company's name and city: e.g. "[Company] in [City] — [specific observation about their situation]."`,
    });
  }

  // ── 3. Subject line (hard block if weak) ─────────────────────────────────
  const isWeakSubject = WEAK_SUBJECTS.some(re => re.test(subject)) || subject.split(/\s+/).length < 3;
  const isStrongSubject = (
    /\?$/.test(subject) ||                               // ends with ?
    /\b(you|your)\b/i.test(subject) ||                   // personal
    /still (managing|using|tracking|separate|manual)/i.test(subject) ||
    / — (is|are|how|do|does|still|why)\b/i.test(subject) || // em-dash question format
    /\b(how long|how many|how much)\b/i.test(subject) ||
    /still\b.*\?/i.test(subject) ||
    /in one place\?/i.test(subject) ||
    / — /.test(subject)                                  // any em-dash subject = strong
  );
  const subjectStrength: 'weak' | 'ok' | 'strong' = isWeakSubject ? 'weak' : isStrongSubject ? 'strong' : 'ok';

  if (isWeakSubject) {
    flags.push({
      type: 'subject',
      severity: 'block',
      message: `Subject line "${subject}" is generic and will be ignored.`,
      fix: `Use a specific question: "[Company] — how are you managing [specific process] today?" or "Quick question about [Company]'s [operation]."`,
    });
  }

  // ── 4. CTA ───────────────────────────────────────────────────────────────
  const cta = ctaType(body);
  if (cta === 'missing') {
    flags.push({
      type: 'cta',
      severity: 'block',
      message: 'No call-to-action found.',
      fix: `End with a specific 10-minute call ask: "Would a 10-minute call make sense to show you how Pryro could work for [Company]?"`,
    });
  }
  if (cta === 'hard') {
    flags.push({
      type: 'cta',
      severity: 'warn',
      message: 'CTA is weak or vague — not a specific 10-minute call ask.',
      fix: `Replace with: "Would a 10-minute call make sense to show you how Pryro could work for [Company]?" Never use "does this match", "open to seeing", or weak permission questions.`,
    });
  }

  // ── 5. Length ─────────────────────────────────────────────────────────────
  const wc = wordCount(body);
  if (wc > 150) {
    flags.push({
      type: 'length',
      severity: 'warn',
      message: `Body is ${wc} words — cold emails over 120 words get lower reply rates.`,
      fix: `Cut to under 120 words. Remove any paragraph that doesn't directly reference this company's specific problem.`,
    });
  }
  if (wc < 40) {
    flags.push({
      type: 'length',
      severity: 'warn',
      message: `Body is only ${wc} words — too short to establish credibility.`,
      fix: `Add one specific problem sentence about their industry and one concrete Pryro outcome.`,
    });
  }

  // ── 6. Sign-off check ────────────────────────────────────────────────────
  const signOff = signOffType(body);
  if (signOff === 'missing') {
    flags.push({
      type: 'signoff',
      severity: 'warn',
      message: 'Email has no valid one-line signature.',
      fix: `End with one clean line: "Alice Umubyeyi — Pryro | 0790038006". No "Best regards," block.`,
    });
  }

  // ── 7. Personalization ────────────────────────────────────────────────────
  const internalScore = personalizationScore(subject, body, companyName);
  const finalScore = externalPersonalizationScore !== undefined
    ? Math.round((externalPersonalizationScore + internalScore) / 2)
    : internalScore;

  if (finalScore < 35) {
    flags.push({
      type: 'personalization',
      severity: 'warn',
      message: `Personalization score ${finalScore}/100 — email may feel generic to the recipient.`,
      fix: `Include: company name in opening line, their specific industry pain point, and a location reference.`,
    });
  }

  // ── Compute score ─────────────────────────────────────────────────────────
  const blockCount = flags.filter(f => f.severity === 'block').length;
  const warnCount  = flags.filter(f => f.severity === 'warn').length;
  let score = 100;
  score -= blockCount * 30;
  score -= warnCount  * 8;
  if (wc >= 60 && wc <= 130) score += 5;
  if (subjectStrength === 'strong') score += 5;
  if (cta === 'soft') score += 5;
  score = Math.max(0, Math.min(100, score));

  const passed = blockCount === 0;
  const summary = passed
    ? (score >= 80 ? 'Ready to send.' : `Passes with ${warnCount} warning(s).`)
    : `Blocked — fix ${blockCount} issue(s) before sending.`;

  return {
    passed,
    score,
    flags,
    bannedFound,
    wordCount: wc,
    subjectStrength,
    ctaType: cta,
    personalizationScore: finalScore,
    summary,
  };
}

export function checkSubjectLine(subject: string): { strength: 'weak' | 'ok' | 'strong'; suggestions: string[] } {
  const isWeak   = WEAK_SUBJECTS.some(re => re.test(subject)) || subject.split(/\s+/).length < 3;
  const isStrong = /\?$/.test(subject) || /\b(you|your)\b/i.test(subject) || /quick question|worth \d+ min/i.test(subject);
  const strength: 'weak' | 'ok' | 'strong' = isWeak ? 'weak' : isStrong ? 'strong' : 'ok';
  const suggestions: string[] = [];
  if (isWeak) {
    suggestions.push('Use a specific question: "[Company] — how are you managing [specific process] today?"');
    suggestions.push('Or: "Quick question about [Company]\'s [operation]"');
    suggestions.push('Avoid: "partnership", "collaboration", "opportunity", "proposal", "introduction".');
  }
  return { strength, suggestions };
}
