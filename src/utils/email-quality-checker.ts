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
  // Generic cold email openers — Q9
  'i hope this email finds you well',
  'i hope you are doing well',
  "i hope you're doing well",
  'i wanted to reach out',
  'i am reaching out',
  "i'm reaching out",
  'i wanted to connect',
  'i am writing to',
  'i am contacting you',
  'i am getting in touch',
  'just following up',
  'touching base',
  'circling back',
  'checking in',
  'as per my last email',
  'per my last email',
  'to whom it may concern',
  'dear sir or madam',
  'dear sir/madam',
  'please find attached',
  'kindly revert',
  'kindly get back',
  'do the needful',
  // Hype / ad-speak
  'cutting-edge',
  'revolutionary',
  'game-changer',
  'game changer',
  'disruptive',
  'synergy',
  'leverage',        // verb usage in sales copy
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
  'drive growth',
  'scale your business',
  'take your business to the next level',
  // Generic "we help" framing
  'we help companies like yours',
  'we help businesses like yours',
  'companies like yours',
  'businesses like yours',
  'organizations like yours',
  // Spam triggers
  'limited time offer',
  'act now',
  'click here',
  'buy now',
  'free trial',
  'guaranteed results',
  'no obligation',
  'risk-free',
  'special promotion',
  'exclusive offer',
  'last chance',
  'only a few spots',
  // Formal closings that make it read like a newsletter
  'warm regards',
  'yours faithfully',
  'yours sincerely',
  'best wishes',
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
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

function ctaType(body: string): 'missing' | 'hard' | 'soft' {
  const last300 = body.split('\n').filter(l => l.trim()).slice(-5).join(' ').toLowerCase();
  const softPatterns = [
    /would (it|a|this) (be|make) (worth|sense)/i,
    /is this something/i,
    /would you be open/i,
    /are you open/i,
    /worth a (call|chat|10 min)/i,
    /would it make sense/i,
    /is .{3,40} something your/i,
  ];
  if (softPatterns.some(p => p.test(last300))) return 'soft';
  const hardPatterns = [/schedule a/i, /book a/i, /let's set up/i, /let me know if/i];
  if (hardPatterns.some(p => p.test(last300))) return 'hard';
  if (last300.includes('?')) return 'soft'; // any question at end = acceptable
  return 'missing';
}

function personalizationScore(subject: string, body: string, companyName: string): number {
  let score = 0;
  const full = (subject + ' ' + body).toLowerCase();
  const cn   = companyName.toLowerCase();

  if (full.includes(cn))                                score += 30; // company name present
  if (/\b(clinic|hotel|pharmacy|travel|school|logistics|retail|restaurant|lodge)\b/i.test(full)) score += 15;
  if (/\b(billing|stock|expiry|payroll|booking|commission|margin|inventory)\b/i.test(full)) score += 20;
  if (/\b(kampala|nairobi|lagos|accra|kigali|dar es salaam|africa|asia|india|ghana|nigeria|kenya|uganda)\b/i.test(full)) score += 10;
  if ((full.match(/\?/g) || []).length >= 1)             score += 10;
  if (!/dear sir|dear madam|to whom/i.test(full))        score += 15;
  return Math.min(score, 100);
}

function signOffType(body: string): 'professional' | 'casual' | 'missing' {
  // NEW professional footer starts with "Best regards," followed by name on next line
  if (/best regards,\s*\n\s*\n?\s*\S+/i.test(body)) return 'professional';
  // Old casual style
  if (/from pryro|— pryro|\npryro/i.test(body)) return 'professional';
  // Bad formal closings that have no name (just a closing phrase alone)
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

  // The greeting line ("Hi there," / "Hi John,") is always first — skip it to find the real opener
  const nonEmptyLines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const firstLine = nonEmptyLines[0] ?? '';
  // If firstLine is a greeting, take the next non-empty line as the observation opener
  const isGreetingLine = /^hi (there|[a-z]+),?$/i.test(firstLine) || /^hello (there|[a-z]+),?$/i.test(firstLine);
  const observationLine = isGreetingLine ? (nonEmptyLines[1] ?? '') : firstLine;

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
  const isStrongSubject = /\?$/.test(subject) || /\b(you|your)\b/i.test(subject) || /quick question|worth \d+ min/i.test(subject);
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
      fix: `End with one soft question: "Would a 10-minute call be worth it to see if this fits how you run [Company]?"`,
    });
  }
  if (cta === 'hard') {
    flags.push({
      type: 'cta',
      severity: 'warn',
      message: 'CTA is a booking request, not a soft question.',
      fix: `Replace with a question: "Would it make sense to have a quick call?" rather than "Let's schedule a call."`,
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
      message: 'Email has no recognisable sign-off.',
      fix: `End with the professional footer:\nBest regards,\n\n[Full Name]\n[Job Title]\n[Company]\n[Phone]`,
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
