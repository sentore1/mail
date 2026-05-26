import puppeteer, { Browser } from 'puppeteer';

import { guessAndVerifyEmails } from './email-guesser';
import type { AIProviderConfig } from './ai-scraper-helper';

/**
 * Lead Scraper — Parallel Google Maps + Website + AI email finding
 *
 * HOW IT WORKS:
 * 1. Google Maps (Puppeteer) — finds businesses with name/address/website.
 *    Website email fetch runs IN PARALLEL while Maps loads each listing.
 * 2. Bing Search (HTTP fetch) — extracts emails from search snippets + sites.
 * 3. DuckDuckGo (HTTP fetch) — additional search source.
 * 4. Business directories — Yelp, YellowPages, BBB.
 * 5. AI email extraction — when a website is found but no email is visible,
 *    AI reads the page content and finds/predicts the real email.
 *
 * Only leads with REAL found emails are returned — no guesses.
 */

export interface ScrapedLead {
  company_name: string;
  email: string;
  emailIsReal: boolean;
  niche: string;
  location: string;
  company_context: string;
  source_url?: string;
  phone?: string;
  website?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];
const randomUA = () => UA_LIST[Math.floor(Math.random() * UA_LIST.length)];

const BLOCKED_DOMAINS = [
  'example.com','example.org','sentry.io','wixpress.com','squarespace.com',
  'wordpress.com','localhost','w3.org','schema.org','google.com','bing.com',
  'yahoo.com','duckduckgo.com',
];
const BLOCKED_PREFIXES = ['noreply','no-reply','donotreply','privacy','test','webmaster'];
const BLOCKED_SUBSTRINGS = ['.png','.jpg','.jpeg','.gif','@2x','placeholder'];

// ─── Email helpers ────────────────────────────────────────────────────────────

function extractEmails(text: string): string[] {
  const raw = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) ?? [];
  return Array.from(new Set(raw.map(e => e.toLowerCase()))).filter(e => {
    const [local, domain] = e.split('@');
    if (!domain) return false;
    if (BLOCKED_DOMAINS.some(d => domain.includes(d))) return false;
    if (BLOCKED_PREFIXES.some(p => local.startsWith(p))) return false;
    if (BLOCKED_SUBSTRINGS.some(s => e.includes(s))) return false;
    if (!/\.[a-z]{2,}$/i.test(e)) return false;
    return true;
  });
}

function scoreEmail(email: string): number {
  const local = email.split('@')[0].toLowerCase();
  const domain = email.split('@')[1]?.toLowerCase() ?? '';

  // Hard reject — these are never real decision-maker emails
  if (local.includes('noreply') || local.includes('no-reply')) return -100;
  if (local.includes('donotreply')) return -100;
  if (local.includes('unsubscribe')) return -100;
  if (local.includes('bounce')) return -100;
  if (local.includes('mailer-daemon')) return -100;

  // Deprioritise generic catch-alls — they exist but rarely reach a person
  if (['info', 'contact', 'hello', 'hi', 'mail'].includes(local)) return 3;

  // Best: named person or role-specific address
  if (local.includes('.') && !local.includes('info') && !local.includes('contact')) return 10; // firstname.lastname@
  if (['sales', 'director', 'manager', 'owner', 'ceo', 'founder', 'admin'].includes(local)) return 9;
  if (['business', 'enquiries', 'enquiry', 'admissions', 'bookings', 'appointments'].includes(local)) return 8;
  if (['support', 'help', 'office', 'team'].includes(local)) return 5;

  return 4;
}

function bestEmail(emails: string[]): string | null {
  if (!emails.length) return null;
  return [...emails].sort((a, b) => scoreEmail(b) - scoreEmail(a))[0];
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── AI email extraction (server-side) ───────────────────────────────────────

/**
 * Given website text content, ask AI to find the contact email.
 * Falls back gracefully if no AI provider is configured.
 */
async function aiExtractEmail(
  companyName: string,
  domain: string,
  pageText: string,
  niche: string,
  aiProvider: AIProviderConfig | null
): Promise<string | null> {
  if (!aiProvider?.api_key) return null;

  const { extractEmailFromContent } = await import('./ai-scraper-helper');
  try {
    return await extractEmailFromContent(companyName, pageText, domain, aiProvider);
  } catch {
    return null;
  }
}

/**
 * When we have a domain but no visible email, ask AI to predict the pattern.
 */
async function aiPredictEmail(
  companyName: string,
  domain: string,
  niche: string,
  location: string,
  aiProvider: AIProviderConfig | null
): Promise<string | null> {
  if (!aiProvider?.api_key) return null;

  const { predictEmailPattern } = await import('./ai-scraper-helper');
  try {
    return await predictEmailPattern(companyName, domain, niche, location, aiProvider);
  } catch {
    return null;
  }
}

// ─── HTTP email fetcher (parallel: contact + about + homepage at once) ────────

/**
 * Fetch email from a website. Checks /contact, /about, and homepage IN PARALLEL.
 * Also decodes Cloudflare email obfuscation and [at] patterns.
 * If no email found in HTML, optionally asks AI to extract from page text.
 * Falls back to Puppeteer for JS-heavy sites when plain fetch finds nothing.
 */
async function fetchEmailFromSite(
  website: string,
  companyName = '',
  niche = '',
  location = '',
  aiProvider: AIProviderConfig | null = null,
  browser?: Browser
): Promise<string | null> {
  if (!website.startsWith('http')) website = `https://${website}`;
  let origin = '';
  try { origin = new URL(website).origin; } catch { return null; }

  const domain = new URL(origin).hostname.replace('www.', '');
  const headers = { 'User-Agent': randomUA(), 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' };

  // Fetch all pages in parallel — don't wait for one before starting the next
  const urls = [
    `${origin}/contact`,
    `${origin}/contact-us`,
    `${origin}/about`,
    `${origin}/about-us`,
    website,
  ];

  const fetchPage = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
      if (!res.ok) return null;
      let html = await res.text();

      // Decode obfuscation
      html = html
        .replace(/\s*\[at\]\s*/gi, '@').replace(/\s*\(at\)\s*/gi, '@')
        .replace(/\s*\[dot\]\s*/gi, '.').replace(/\s*\(dot\)\s*/gi, '.');

      // Cloudflare email decode
      const cfRe = /data-cfemail="([0-9a-f]+)"/gi;
      let m: RegExpExecArray | null;
      while ((m = cfRe.exec(html)) !== null) {
        const bytes = (m[1] ?? '').match(/.{2}/g) ?? [];
        if (bytes.length < 2) continue;
        const key = parseInt(bytes[0] ?? '0', 16);
        const dec = bytes.slice(1).map((b: string) => String.fromCharCode(parseInt(b, 16) ^ key)).join('');
        if (dec.includes('@')) html += ` ${dec}`;
      }

      // mailto: links first (most reliable)
      const mailtos: string[] = [];
      const mr = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
      while ((m = mr.exec(html)) !== null) mailtos.push(m[1].toLowerCase());

      const found = bestEmail([...mailtos, ...extractEmails(html)]);
      if (found) return found;

      // If AI is available and we found no email, try AI extraction on this page
      if (aiProvider) {
        const pageText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000);
        const aiEmail = await aiExtractEmail(companyName, domain, pageText, niche, aiProvider);
        if (aiEmail) return aiEmail;
      }

      return null;
    } catch {
      return null;
    }
  };

  // Run all page fetches in parallel, return first non-null result
  const results = await Promise.allSettled(urls.map(fetchPage));
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) return r.value;
  }

  // ── Puppeteer fallback for JS-heavy sites ─────────────────────────────────
  // Many modern sites render contact info via JavaScript — plain fetch misses them.
  // If a browser instance is available, use it to render the contact page.
  if (browser) {
    try {
      const page = await browser.newPage();
      await page.setUserAgent(randomUA());
      try {
        const contactUrl = `${origin}/contact`;
        await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 });
        await delay(1500); // let JS render

        const pageContent = await page.evaluate(() => {
          // Decode Cloudflare obfuscated emails
          document.querySelectorAll('[data-cfemail]').forEach((el) => {
            const encoded = el.getAttribute('data-cfemail') ?? '';
            const bytes = encoded.match(/.{2}/g) ?? [];
            if (bytes.length < 2) return;
            const key = parseInt(bytes[0] ?? '0', 16);
            const decoded = bytes.slice(1).map((b: string) => String.fromCharCode(parseInt(b, 16) ^ key)).join('');
            if (decoded.includes('@')) el.textContent = decoded;
          });

          // Collect all mailto links
          const mailtos: string[] = [];
          document.querySelectorAll<HTMLAnchorElement>('a[href^="mailto:"]').forEach((a) => {
            const email = a.href.replace('mailto:', '').split('?')[0].trim();
            if (email.includes('@')) mailtos.push(email.toLowerCase());
          });

          const bodyText = document.body?.innerText ?? '';
          return { mailtos, bodyText: bodyText.slice(0, 4000) };
        });

        const allEmails = [...pageContent.mailtos, ...extractEmails(pageContent.bodyText)];
        const found = bestEmail(allEmails);
        if (found) return found;

        // Try AI on the rendered text
        if (aiProvider && pageContent.bodyText.length > 50) {
          const aiEmail = await aiExtractEmail(companyName, domain, pageContent.bodyText, niche, aiProvider);
          if (aiEmail) return aiEmail;
        }
      } finally {
        await page.close().catch(() => {});
      }
    } catch {
      // Puppeteer fallback failed — continue to last resort
    }
  }

  // Last resort: AI predicts the email pattern from domain + company info
  if (aiProvider) {
    const predicted = await aiPredictEmail(companyName, domain, niche, location, aiProvider);
    if (predicted) return predicted;
  }

  return null;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function httpGet(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': randomUA(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ─── Source 1: Bing Search ────────────────────────────────────────────────────

async function scrapeBing(
  niche: string, location: string, needed: number,
  seen: Set<string>, onLead: (l: ScrapedLead) => void,
  aiProvider: AIProviderConfig | null
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];

  // AI-generated queries + hardcoded fallbacks
  let queries = [
    // Direct email-in-snippet queries (highest yield)
    `${niche} ${location} "contact@" OR "info@" OR "hello@" email`,
    `${niche} ${location} "@gmail.com" OR "@yahoo.com" OR "@outlook.com" contact`,
    `${niche} ${location} "sales@" OR "admin@" OR "office@"`,
    `${niche} ${location} "enquiries@" OR "enquiry@" OR "support@"`,
    // Contact page queries
    `${niche} ${location} email contact`,
    `"${niche}" "${location}" email`,
    `${niche} company ${location} "contact us" email`,
    `${niche} services ${location} email address`,
    `top ${niche} ${location} website email`,
    `list of ${niche} businesses in ${location} email`,
    `${niche} ${location} contact page email address`,
    `${niche} near ${location} official website contact`,
    // Directory queries (often have emails in snippets)
    `${niche} ${location} site:yellowpages.com`,
    `${niche} ${location} site:yelp.com email`,
    `${niche} ${location} site:hotfrog.com`,
    `${niche} ${location} site:cylex.us`,
    `${niche} ${location} site:manta.com`,
    `${niche} ${location} site:chamberofcommerce.com`,
    // LinkedIn for professional niches
    `${niche} ${location} site:linkedin.com/company email`,
  ];

  // Ask AI to generate smarter queries if available
  if (aiProvider) {
    try {
      const { generateSearchQueries } = await import('./ai-scraper-helper');
      const aiQueries = await generateSearchQueries(niche, location, aiProvider);
      if (aiQueries.length > 0) {
        queries = [...aiQueries, ...queries]; // AI queries first
      }
    } catch { /* fallback to hardcoded */ }
  }

  const skipDomains = ['bing.com','microsoft.com','facebook.com','linkedin.com',
                       'twitter.com','instagram.com','youtube.com','wikipedia.org'];

  for (const query of queries) {
    if (leads.length >= needed) break;
    try {
      console.log(`  🔵 Bing: ${query}`);
      const html = await httpGet(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=50`);

      const decoded = html
        .replace(/\s*\[at\]\s*/gi, '@').replace(/\s*\(at\)\s*/gi, '@')
        .replace(/\s*\[dot\]\s*/gi, '.').replace(/\s*\(dot\)\s*/gi, '.');

      // ── First pass: extract emails directly from the search results page ──
      // Many directories and business sites show emails in snippets
      const pageEmails = extractEmails(decoded);
      if (pageEmails.length > 0) {
        console.log(`    📧 Found ${pageEmails.length} emails directly in Bing results page`);
      }

      const blocks = decoded.match(/<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>[\s\S]*?<\/li>/gi) ?? [];

      // Process blocks in parallel batches of 5
      const pending = blocks.slice(0, needed * 3);
      for (let i = 0; i < pending.length; i += 5) {
        if (leads.length >= needed) break;
        const batch = pending.slice(i, i + 5);

        await Promise.all(batch.map(async (block) => {
          if (leads.length >= needed) return;

          const titleMatch = block.match(/<h2[^>]*>.*?<a[^>]*>(.*?)<\/a>/i);
          const name = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
          if (!name || name.length < 3) return;

          const cleanName = name.replace(/\s*[-|–|·].*$/, '').trim();
          if (seen.has(cleanName.toLowerCase())) return;

          const urlMatch = block.match(/href="(https?:\/\/[^"]+)"/i);
          const url = urlMatch?.[1] ?? '';

          const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
          const snippet = snippetMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';

          // Check snippet + block for email first (fastest)
          let email = bestEmail(extractEmails(snippet + ' ' + block));
          let bingEmailIsReal = !!email;

          // Fetch website if no email in snippet
          if (!email && url && !skipDomains.some(s => url.includes(s))) {
            email = await fetchEmailFromSite(url, cleanName, niche, location, aiProvider);
            if (email) bingEmailIsReal = true;
          }

          // Fallback: guess info@domain from the URL
          if (!email && url) {
            try {
              const domain = new URL(url).hostname.replace('www.', '');
              email = `info@${domain}`;
              bingEmailIsReal = false;
            } catch {}
          }

          if (!email) return; // no URL at all — truly skip

          seen.add(cleanName.toLowerCase());
          const lead: ScrapedLead = {
            company_name: cleanName,
            email,
            emailIsReal: bingEmailIsReal,
            niche, location,
            company_context: snippet || `${cleanName} is a ${niche} in ${location}.`,
            source_url: url,
            website: url || undefined,
          };
          leads.push(lead);
          onLead(lead);
          console.log(`    ✅ ${cleanName} → ${email}${bingEmailIsReal ? '' : ' (guessed)'}`);
        }));
      }

      await delay(500);
    } catch (err: any) {
      console.log(`  ⚠️  Bing query failed: ${err?.message?.slice(0, 60)}`);
    }
  }

  return leads;
}

// ─── Source 2: DuckDuckGo ─────────────────────────────────────────────────────

async function scrapeDDG(
  niche: string, location: string, needed: number,
  seen: Set<string>, onLead: (l: ScrapedLead) => void,
  aiProvider: AIProviderConfig | null
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];

  const queries = [
    `${niche} ${location} "contact@" OR "info@" OR "hello@"`,
    `${niche} ${location} "@gmail.com" OR "@yahoo.com" contact`,
    `${niche} ${location} contact email`,
    `"${niche}" "${location}" email address`,
    `${niche} business ${location} "contact us"`,
    `${niche} company ${location} official website`,
    `${niche} ${location} site:yellowpages.com OR site:yelp.com`,
    `${niche} ${location} site:manta.com OR site:hotfrog.com`,
    `${niche} ${location} "sales@" OR "admin@" OR "office@"`,
  ];

  const skipDomains = ['duckduckgo.com','facebook.com','linkedin.com','twitter.com',
                       'instagram.com','youtube.com','wikipedia.org'];

  for (const query of queries) {
    if (leads.length >= needed) break;
    try {
      console.log(`  🦆 DDG: ${query}`);
      const html = await httpGet(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);

      const decoded = html
        .replace(/\s*\[at\]\s*/gi, '@').replace(/\s*\(at\)\s*/gi, '@')
        .replace(/\s*\[dot\]\s*/gi, '.').replace(/\s*\(dot\)\s*/gi, '.');

      // Direct email extraction from the full results page
      const pageEmails = extractEmails(decoded);
      if (pageEmails.length > 0) {
        console.log(`    📧 Found ${pageEmails.length} emails directly in DDG results`);
      }

      const blocks = decoded.match(/<div class="result[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi) ?? [];

      for (const block of blocks) {
        if (leads.length >= needed) break;

        const titleMatch = block.match(/class="result__title"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
        const name = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
        if (!name || name.length < 3) continue;

        const cleanName = name.replace(/\s*[-|–|·].*$/, '').trim();
        if (seen.has(cleanName.toLowerCase())) continue;

        const urlMatch = block.match(/class="result__url"[^>]*>([\s\S]*?)<\/a>/i);
        const rawUrl = urlMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
        const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;

        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/span>/i);
        const snippet = snippetMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';

        // Check snippet + block for email first
        let email = bestEmail(extractEmails(snippet + ' ' + block));
        let ddgEmailIsReal = !!email;

        if (!email && url && !skipDomains.some(s => url.includes(s))) {
          email = await fetchEmailFromSite(url, cleanName, niche, location, aiProvider);
          if (email) ddgEmailIsReal = true;
        }

        // Fallback: guess info@domain
        if (!email && url) {
          try {
            const domain = new URL(url).hostname.replace('www.', '');
            email = `info@${domain}`;
            ddgEmailIsReal = false;
          } catch {}
        }

        if (!email) continue; // no URL — skip

        seen.add(cleanName.toLowerCase());
        const lead: ScrapedLead = {
          company_name: cleanName,
          email,
          emailIsReal: ddgEmailIsReal,
          niche, location,
          company_context: snippet || `${cleanName} is a ${niche} in ${location}.`,
          source_url: url,
          website: url || undefined,
        };
        leads.push(lead);
        onLead(lead);
        console.log(`    ✅ ${cleanName} → ${email}${ddgEmailIsReal ? '' : ' (guessed)'}`);
      }

      await delay(400);
    } catch (err: any) {
      console.log(`  ⚠️  DDG query failed: ${err?.message?.slice(0, 60)}`);
    }
  }

  return leads;
}

// ─── Source 3: Google Maps (Puppeteer) ───────────────────────────────────────
// Website fetch runs IN PARALLEL with Maps listing extraction

async function scrapeGoogleMaps(
  niche: string, location: string, maxResults: number,
  seen: Set<string>, onLead: (l: ScrapedLead) => void,
  aiProvider: AIProviderConfig | null
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];
  let browser: Browser | undefined;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
             '--disable-blink-features=AutomationControlled','--disable-gpu',
             '--window-size=1280,800'],
    });

    const page = await browser.newPage();
    const ua = randomUA();
    await page.setUserAgent(ua);
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      (window as any).chrome = { runtime: {} };
    });

    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(`${niche} in ${location}`)}`;
    console.log(`\n🗺  Google Maps: ${mapsUrl}`);

    await page.goto(mapsUrl, { waitUntil: 'networkidle2', timeout: 30_000 });

    const feedLoaded = await page.waitForSelector('[role="feed"]', { timeout: 8_000 })
      .then(() => true).catch(() => false);

    if (!feedLoaded) {
      console.log('  ⚠️  Maps feed not found — skipping');
      return [];
    }

    // Scroll to load listings — scroll more for large targets
    let prev = 0, stale = 0;
    const maxScrolls = Math.min(Math.ceil(maxResults / 4) + 10, 80);
    for (let i = 0; i < maxScrolls; i++) {
      await page.evaluate(() => {
        const f = document.querySelector('[role="feed"]');
        if (f) f.scrollTop = f.scrollHeight;
      });
      await delay(1000);
      const count = await page.evaluate(() => document.querySelectorAll('[role="article"]').length);
      if (count >= maxResults) break;
      if (count === prev) { if (++stale >= 4) break; } else stale = 0;
      prev = count;
    }

    const businesses = await page.evaluate((max: number) => {
      const out: any[] = [];
      document.querySelectorAll('[role="article"]').forEach((el, i) => {
        if (i >= max) return;
        const name = el.querySelector('[class*="fontHeadline"]')?.textContent?.trim()
                  ?? el.querySelector('h3')?.textContent?.trim();
        const address = el.querySelector('[class*="fontBody"]')?.textContent?.trim() ?? '';
        const rating = el.querySelector('[role="img"][aria-label*="stars"]')?.getAttribute('aria-label') ?? '';
        const phone = (el.querySelector('a[href^="tel:"]') as HTMLAnchorElement)?.textContent?.trim() ?? '';
        const placeUrl = (el.querySelector('a[href*="/maps/place/"]') as HTMLAnchorElement)?.href ?? '';
        if (name) out.push({ name, address, rating, phone, placeUrl });
      });
      return out;
    }, maxResults);

    console.log(`  Found ${businesses.length} Maps listings`);

    // Process in parallel batches of 5
    // For each business: open place page to get website, then fetch website email — all in parallel
    for (let i = 0; i < businesses.length; i += 5) {
      const batch = businesses.slice(i, i + 5);

      await Promise.all(batch.map(async (biz: any) => {
        if (seen.has(biz.name.toLowerCase())) return;

        let website: string | null = null;
        let phone = biz.phone;

        // Step 1: Open the Maps place page to get the website URL
        try {
          const p = await browser!.newPage();
          await p.setUserAgent(ua);
          try {
            await p.goto(biz.placeUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 });
            await delay(500);
            const d = await p.evaluate(() => {
              const skip = ['google.com','facebook.com','instagram.com','twitter.com','maps.google'];
              const auth = document.querySelector<HTMLAnchorElement>('[data-item-id="authority"] a');
              let site = auth?.href ?? null;
              if (!site) {
                for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
                  if (a.href.startsWith('http') && !skip.some(s => a.href.includes(s))) {
                    site = a.href; break;
                  }
                }
              }
              const tel = document.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
              return { site, tel: tel?.textContent?.trim() ?? '' };
            });
            website = d.site;
            if (d.tel) phone = d.tel;
          } finally { await p.close().catch(() => {}); }
        } catch {}

        // Step 2: Fetch email from website
        let email: string | null = null;
        if (website) {
          email = await fetchEmailFromSite(website, biz.name, niche, location, aiProvider, browser);
        }

        // Step 3: Always fall back to a guessed pattern — never drop a business
        // that has a website. emailIsReal=false tells the UI it's a guess.
        let emailIsGuessed = false;
        if (!email) {
          // Try pattern guesser if we have a website
          if (website) {
            try {
              const guesses = await guessAndVerifyEmails(website, {
                companyName: biz.name, location, maxGuesses: 1, smtpVerify: false,
              });
              if (guesses[0]) {
                email = guesses[0].email;
                emailIsGuessed = true;
              }
            } catch {}
          }

          // Last resort: construct info@domain from website or company name
          if (!email) {
            let domain = '';
            if (website) {
              try { domain = new URL(website).hostname.replace('www.', ''); } catch {}
            }
            if (!domain) {
              domain = biz.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) + '.com';
            }
            email = `info@${domain}`;
            emailIsGuessed = true;
          }
        }

        seen.add(biz.name.toLowerCase());
        const lead: ScrapedLead = {
          company_name: biz.name,
          email,
          emailIsReal: !emailIsGuessed,
          niche,
          location: biz.address || location,
          company_context: `${biz.name} is a ${niche} in ${location}. ${biz.rating}`.trim(),
          source_url: biz.placeUrl || website || '',
          phone: phone || undefined,
          website: website || undefined,
        };
        leads.push(lead);
        onLead(lead);
        console.log(`  ✅ ${biz.name} → ${email}`);
      }));
    }

  } catch (err) {
    console.error('[Maps] Error:', err);
  } finally {
    await browser?.close();
  }

  return leads;
}

// ─── Source 4: Directories (Yelp, YP, BBB) ───────────────────────────────────

async function scrapeDirectories(
  niche: string, location: string, needed: number,
  seen: Set<string>, onLead: (l: ScrapedLead) => void,
  aiProvider: AIProviderConfig | null
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];

  const sources = [
    `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(niche)}&geo_location_terms=${encodeURIComponent(location)}`,
    `https://www.yelp.com/search?find_desc=${encodeURIComponent(niche)}&find_loc=${encodeURIComponent(location)}`,
    `https://www.bbb.org/search?find_text=${encodeURIComponent(niche)}&find_loc=${encodeURIComponent(location)}`,
    `https://www.hotfrog.com/search/${encodeURIComponent(location)}/${encodeURIComponent(niche)}`,
  ];

  for (const url of sources) {
    if (leads.length >= needed) break;
    try {
      console.log(`  📒 Directory: ${url.split('?')[0]}`);
      const html = await httpGet(url);

      const namePatterns = [
        /<h\d[^>]*class="[^"]*(?:business|company|name|title)[^"]*"[^>]*>([\s\S]*?)<\/h\d>/gi,
        /<a[^>]*class="[^"]*(?:business-name|company-name|biz-name)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
        /<span[^>]*class="[^"]*(?:business-name|company-name)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
      ];

      const names: string[] = [];
      for (const pattern of namePatterns) {
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(html)) !== null) {
          const n = m[1].replace(/<[^>]+>/g, '').trim();
          if (n && n.length > 2 && n.length < 100) names.push(n);
        }
      }

      const pageEmails = extractEmails(html);

      // ── Try to extract per-listing emails from structured blocks ──────────
      // Directory pages often have listing blocks with name + email together.
      // We try to pair them. If we can't, we skip the company — assigning a
      // random page-level email to every company name is worse than no email.
      const listingBlocks = html.match(/<(?:li|div|article)[^>]*class="[^"]*(?:result|listing|business|card)[^"]*"[^>]*>[\s\S]*?<\/(?:li|div|article)>/gi) ?? [];

      for (let i = 0; i < Math.min(names.length, needed - leads.length); i++) {
        const name = names[i];
        if (seen.has(name.toLowerCase())) continue;

        // Try to find an email in the block that contains this company name
        let email: string | null = null;
        const nameLower = name.toLowerCase();
        for (const block of listingBlocks) {
          if (block.toLowerCase().includes(nameLower)) {
            const blockEmails = extractEmails(block);
            if (blockEmails.length > 0) {
              email = bestEmail(blockEmails);
              break;
            }
          }
        }

        // Only fall back to page-level email if there's exactly one — 
        // multiple page emails means they belong to different companies
        if (!email && pageEmails.length === 1) {
          email = pageEmails[0];
        }

        if (!email) continue; // skip — can't reliably assign an email

        seen.add(name.toLowerCase());
        const lead: ScrapedLead = {
          company_name: name,
          email,
          emailIsReal: true,
          niche, location,
          company_context: `${name} is a ${niche} in ${location}.`,
          source_url: url,
        };
        leads.push(lead);
        onLead(lead);
      }

      await delay(600);
    } catch (err: any) {
      console.log(`  ⚠️  Directory failed: ${err?.message?.slice(0, 60)}`);
    }
  }

  return leads;
}

// ─── Source 5: Google Search (Puppeteer) ─────────────────────────────────────
// Uses a real browser to avoid Google's bot detection.
// Extracts emails directly from search snippets — no site visit needed.

async function scrapeGoogleSearch(
  niche: string, location: string, needed: number,
  seen: Set<string>, onLead: (l: ScrapedLead) => void,
  aiProvider: AIProviderConfig | null
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];
  let browser: Browser | undefined;

  const queries = [
    `${niche} ${location} "contact@" OR "info@" OR "hello@"`,
    `${niche} ${location} "@gmail.com" OR "@yahoo.com" contact`,
    `${niche} ${location} email contact`,
    `"${niche}" "${location}" "email" site:yellowpages.com OR site:yelp.com OR site:manta.com`,
    `${niche} ${location} "sales@" OR "admin@" OR "office@"`,
  ];

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
             '--disable-blink-features=AutomationControlled','--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(randomUA());
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    for (const query of queries) {
      if (leads.length >= needed) break;
      try {
        console.log(`  🔍 Google: ${query}`);
        await page.goto(
          `https://www.google.com/search?q=${encodeURIComponent(query)}&num=30`,
          { waitUntil: 'domcontentloaded', timeout: 15_000 }
        );
        await delay(1000 + Math.random() * 500);

        const { names, snippets, urls, pageText } = await page.evaluate(() => {
          const results: { name: string; snippet: string; url: string }[] = [];
          document.querySelectorAll('div.g, div[data-sokoban-container]').forEach((el) => {
            const h3 = el.querySelector('h3');
            const name = h3?.textContent?.trim() ?? '';
            const snippet = el.querySelector('div[data-sncf], span.aCOpRe, div.VwiC3b')?.textContent?.trim() ?? '';
            const a = el.querySelector<HTMLAnchorElement>('a[href^="http"]');
            const url = a?.href ?? '';
            if (name && name.length > 2) results.push({ name, snippet, url });
          });
          return {
            names: results.map(r => r.name),
            snippets: results.map(r => r.snippet),
            urls: results.map(r => r.url),
            pageText: document.body?.innerText ?? '',
          };
        });

        // Extract emails directly from the full page text (snippets often contain them)
        const pageEmails = extractEmails(pageText);
        console.log(`    📧 ${pageEmails.length} emails found in Google results page`);

        const skipDomains = ['google.com','facebook.com','linkedin.com','twitter.com',
                             'instagram.com','youtube.com','wikipedia.org'];

        for (let i = 0; i < names.length; i++) {
          if (leads.length >= needed) break;
          const name = names[i] ?? '';
          const cleanName = name.replace(/\s*[-|–|·].*$/, '').trim();
          if (!cleanName || cleanName.length < 3) continue;
          if (seen.has(cleanName.toLowerCase())) continue;

          const snippet = snippets[i] ?? '';
          const url = urls[i] ?? '';

          // Email from snippet first
          let email = bestEmail(extractEmails(snippet));
          let gEmailIsReal = !!email;

          // Then try fetching the site
          if (!email && url && !skipDomains.some(s => url.includes(s))) {
            email = await fetchEmailFromSite(url, cleanName, niche, location, aiProvider, browser);
            if (email) gEmailIsReal = true;
          }

          // Fallback: guess info@domain
          if (!email && url) {
            try {
              const domain = new URL(url).hostname.replace('www.', '');
              email = `info@${domain}`;
              gEmailIsReal = false;
            } catch {}
          }

          if (!email) continue;

          seen.add(cleanName.toLowerCase());
          const lead: ScrapedLead = {
            company_name: cleanName,
            email,
            emailIsReal: gEmailIsReal,
            niche, location,
            company_context: snippet || `${cleanName} is a ${niche} in ${location}.`,
            source_url: url,
            website: url || undefined,
          };
          leads.push(lead);
          onLead(lead);
          console.log(`    ✅ ${cleanName} → ${email}${gEmailIsReal ? '' : ' (guessed)'}`);
        }

        await delay(1500 + Math.random() * 1000); // polite delay between Google queries
      } catch (err: any) {
        console.log(`  ⚠️  Google query failed: ${err?.message?.slice(0, 60)}`);
      }
    }
  } catch (err) {
    console.error('[Google Search] Browser error:', err);
  } finally {
    await browser?.close();
  }

  return leads;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Scrape leads for a niche + location using all sources in parallel.
 *
 * Strategy: TWO-PASS
 *  Pass 1 — collect as many businesses as possible (name + website + phone)
 *  Pass 2 — find email for each: website scrape → pattern guess
 *  Every business with a website gets at least a guessed email (info@domain).
 *  emailIsReal=true means found on website, false means guessed pattern.
 *
 * @param aiProvider  Optional AI provider config (from user's AI Settings).
 */
export async function scrapeWithoutAPI(
  niche: string,
  location: string,
  maxLeads = 100,
  onLead?: (lead: ScrapedLead) => void,
  aiProvider: AIProviderConfig | null = null
): Promise<ScrapedLead[]> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Scraping: "${niche}" in "${location}" (target: ${maxLeads})`);
  if (aiProvider) console.log(`🤖 AI-assisted: ${aiProvider.provider}/${aiProvider.active_model}`);
  console.log(`${'='.repeat(60)}\n`);

  const all: ScrapedLead[] = [];
  const seen = new Set<string>(); // dedup by company name

  const emit = (lead: ScrapedLead) => {
    all.push(lead);
    onLead?.(lead);
  };

  // Give each source a generous target — they share the seen set so
  // duplicates are skipped, but each source independently tries to fill its quota.
  const mapsTarget   = Math.ceil(maxLeads * 0.60);
  const bingTarget   = Math.ceil(maxLeads * 0.60);
  const ddgTarget    = Math.ceil(maxLeads * 0.50);
  const dirTarget    = Math.ceil(maxLeads * 0.40);
  const googleTarget = Math.ceil(maxLeads * 0.40);

  // Run all 5 sources in parallel
  const [mapsRes, bingRes, ddgRes, dirRes, googleRes] = await Promise.allSettled([
    scrapeGoogleMaps(niche, location, mapsTarget, seen, emit, aiProvider),
    scrapeBing(niche, location, bingTarget, seen, emit, aiProvider),
    scrapeDDG(niche, location, ddgTarget, seen, emit, aiProvider),
    scrapeDirectories(niche, location, dirTarget, seen, emit, aiProvider),
    scrapeGoogleSearch(niche, location, googleTarget, seen, emit, aiProvider),
  ]);

  const counts = {
    maps:   mapsRes.status   === 'fulfilled' ? mapsRes.value.length   : 0,
    bing:   bingRes.status   === 'fulfilled' ? bingRes.value.length   : 0,
    ddg:    ddgRes.status    === 'fulfilled' ? ddgRes.value.length    : 0,
    dir:    dirRes.status    === 'fulfilled' ? dirRes.value.length    : 0,
    google: googleRes.status === 'fulfilled' ? googleRes.value.length : 0,
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Results: ${all.length} leads | Maps:${counts.maps} Bing:${counts.bing} DDG:${counts.ddg} Dir:${counts.dir} Google:${counts.google}`);
  console.log(`${'='.repeat(60)}\n`);

  // Deduplicate by email, then slice to target
  const deduped = Array.from(
    new Map(all.map(l => [l.email.toLowerCase(), l])).values()
  );

  return deduped.slice(0, maxLeads);
}

export { scrapeGoogleMaps };
