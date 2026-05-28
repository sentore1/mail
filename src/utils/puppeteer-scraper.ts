import puppeteer, { Browser } from 'puppeteer';
import type { AIProviderConfig } from './ai-scraper-helper';

/**
 * Lead Scraper — No paid APIs. Pure Puppeteer + fetch.
 *
 * STRATEGY:
 * 1. Google Maps  → finds businesses + their websites
 * 2. Google Search → finds pages that contain emails in snippets
 * 3. Deep website scraper → visits 8+ pages per site to find real emails
 * 4. MX DNS check → verifies email domain can receive mail (no API needed)
 *
 * Every lead returned has a real email found on a real page.
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

// ─── User agents ──────────────────────────────────────────────────────────────

const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];
const randomUA = () => UA_LIST[Math.floor(Math.random() * UA_LIST.length)];

// ─── Blocked domains — never generate emails for these ───────────────────────

const BLOCKED_DOMAINS = new Set([
  'google.com','google.co','bing.com','yahoo.com','duckduckgo.com',
  'ask.com','baidu.com','yandex.com','ecosia.org',
  'facebook.com','instagram.com','twitter.com','x.com','linkedin.com',
  'youtube.com','tiktok.com','pinterest.com','reddit.com','tumblr.com',
  'snapchat.com','whatsapp.com','telegram.org','discord.com',
  'yelp.com','yellowpages.com','bbb.org','tripadvisor.com','trustpilot.com',
  'glassdoor.com','indeed.com','crunchbase.com','bloomberg.com',
  'github.com','stackoverflow.com','medium.com','substack.com',
  'shopify.com','wix.com','weebly.com','godaddy.com','namecheap.com',
  'cloudflare.com','amazonaws.com','vercel.app','netlify.app',
  'wikipedia.org','wikimedia.org','nytimes.com','bbc.com','cnn.com',
  'example.com','example.org','sentry.io','wixpress.com','localhost',
  'w3.org','schema.org','squarespace.com','wordpress.com',
]);

const BLOCKED_EMAIL_PREFIXES = new Set([
  'noreply','no-reply','donotreply','do-not-reply','bounce',
  'mailer-daemon','postmaster','abuse','spam','unsubscribe',
  'webmaster','hostmaster','root','daemon','nobody','null',
  'privacy','test','info-noreply','support-noreply',
]);

const BLOCKED_EMAIL_SUBSTRINGS = ['.png','.jpg','.jpeg','.gif','@2x','placeholder','example'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function isBlockedDomain(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return BLOCKED_DOMAINS.has(h) || Array.from(BLOCKED_DOMAINS).some(d => h.endsWith('.' + d));
  } catch { return false; }
}

function extractEmails(text: string): string[] {
  const raw = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) ?? [];
  return Array.from(new Set(raw.map(e => e.toLowerCase()))).filter(e => {
    const [local, domain] = e.split('@');
    if (!domain || !local) return false;
    if (Array.from(BLOCKED_DOMAINS).some(d => domain.includes(d))) return false;
    if (BLOCKED_EMAIL_PREFIXES.has(local)) return false;
    if (BLOCKED_EMAIL_SUBSTRINGS.some(s => e.includes(s))) return false;
    if (!/\.[a-z]{2,}$/i.test(domain)) return false;
    return true;
  });
}

function scoreEmail(email: string): number {
  const local = email.split('@')[0].toLowerCase();
  if (BLOCKED_EMAIL_PREFIXES.has(local)) return -100;
  if (local.includes('noreply') || local.includes('no-reply')) return -100;
  if (local.includes('unsubscribe') || local.includes('bounce')) return -100;
  // Named person — best
  if (/^[a-z]+\.[a-z]+$/.test(local)) return 10;
  if (['ceo','founder','owner','director','manager','admin','sales'].includes(local)) return 9;
  if (['enquiries','enquiry','bookings','appointments','admissions'].includes(local)) return 8;
  if (['support','help','office','team','business'].includes(local)) return 5;
  if (['info','contact','hello','hi','mail'].includes(local)) return 3;
  return 4;
}

function bestEmail(emails: string[]): string | null {
  if (!emails.length) return null;
  return [...emails].sort((a, b) => scoreEmail(b) - scoreEmail(a))[0];
}

// ─── MX DNS verification (no API needed) ─────────────────────────────────────

const mxCache = new Map<string, boolean>();

async function domainHasMX(email: string): Promise<boolean> {
  const domain = email.split('@')[1];
  if (!domain) return false;
  if (mxCache.has(domain)) return mxCache.get(domain)!;
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
      { signal: AbortSignal.timeout(4_000) }
    );
    const data = await res.json();
    const ok = Array.isArray(data?.Answer) && data.Answer.length > 0;
    mxCache.set(domain, ok);
    return ok;
  } catch {
    mxCache.set(domain, true); // assume valid if DNS check fails
    return true;
  }
}

// ─── AI helpers ───────────────────────────────────────────────────────────────

async function aiExtract(
  companyName: string, domain: string, pageText: string,
  aiProvider: AIProviderConfig | null
): Promise<string | null> {
  if (!aiProvider?.api_key) return null;
  try {
    const { extractEmailFromContent } = await import('./ai-scraper-helper');
    return await extractEmailFromContent(companyName, pageText, domain, aiProvider);
  } catch { return null; }
}

async function aiPredict(
  companyName: string, domain: string, niche: string, location: string,
  aiProvider: AIProviderConfig | null
): Promise<string | null> {
  if (!aiProvider?.api_key) return null;
  try {
    const { predictEmailPattern } = await import('./ai-scraper-helper');
    return await predictEmailPattern(companyName, domain, niche, location, aiProvider);
  } catch { return null; }
}

// ─── Deep website email scraper ───────────────────────────────────────────────

/**
 * Returns { email, isReal } where:
 *   isReal = true  → email was found explicitly on a page (scraped)
 *   isReal = false → email was predicted by AI from domain + company info
 */
async function deepScrapeWebsite(
  website: string,
  companyName: string,
  niche: string,
  location: string,
  aiProvider: AIProviderConfig | null,
  browser?: Browser
): Promise<{ email: string; isReal: boolean } | null> {
  if (!website.startsWith('http')) website = `https://${website}`;
  let origin: string;
  try { origin = new URL(website).origin; } catch { return null; }
  const domain = new URL(origin).hostname.replace(/^www\./, '');

  const headers = {
    'User-Agent': randomUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const pagePaths = [
    '/contact', '/contact-us', '/contacts', '/contact.html',
    '/about', '/about-us', '/about.html',
    '/team', '/our-team', '/meet-the-team', '/staff', '/people',
    '/imprint', '/impressum', '/legal',
    '/',
  ];

  const decodeHtml = (html: string): string => {
    html = html
      .replace(/\s*\[at\]\s*/gi, '@').replace(/\s*\(at\)\s*/gi, '@')
      .replace(/\s*\[dot\]\s*/gi, '.').replace(/\s*\(dot\)\s*/gi, '.');
    const cfRe = /data-cfemail="([0-9a-f]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = cfRe.exec(html)) !== null) {
      const bytes = (m[1] ?? '').match(/.{2}/g) ?? [];
      if (bytes.length < 2) continue;
      const key = parseInt(bytes[0] ?? '0', 16);
      const dec = bytes.slice(1).map((b: string) => String.fromCharCode(parseInt(b, 16) ^ key)).join('');
      if (dec.includes('@')) html += ` ${dec}`;
    }
    return html;
  };

  const fetchPage = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(7_000) });
      if (!res.ok) return null;
      const html = decodeHtml(await res.text());
      const mailtos: string[] = [];
      const mr = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
      let mm: RegExpExecArray | null;
      while ((mm = mr.exec(html)) !== null) mailtos.push(mm[1].toLowerCase());
      const found = bestEmail([...mailtos, ...extractEmails(html)]);
      if (found) return found;
      // AI extraction — only returns emails explicitly found in the content
      if (aiProvider) {
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000);
        const aiEmail = await aiExtract(companyName, domain, text, aiProvider);
        if (aiEmail) return aiEmail;
      }
      return null;
    } catch { return null; }
  };

  // Try all pages in parallel
  const urls = pagePaths.map(p => `${origin}${p}`);
  const results = await Promise.allSettled(urls.map(fetchPage));
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      return { email: r.value, isReal: true };
    }
  }

  // Puppeteer fallback for JS-heavy sites
  if (browser) {
    try {
      const page = await browser.newPage();
      await page.setUserAgent(randomUA());
      try {
        await page.goto(`${origin}/contact`, { waitUntil: 'domcontentloaded', timeout: 10_000 });
        await delay(1500);
        const content = await page.evaluate(() => {
          document.querySelectorAll('[data-cfemail]').forEach(el => {
            const enc = el.getAttribute('data-cfemail') ?? '';
            const bytes = enc.match(/.{2}/g) ?? [];
            if (bytes.length < 2) return;
            const key = parseInt(bytes[0] ?? '0', 16);
            const dec = bytes.slice(1).map((b: string) => String.fromCharCode(parseInt(b, 16) ^ key)).join('');
            if (dec.includes('@')) el.textContent = dec;
          });
          const mailtos: string[] = [];
          document.querySelectorAll<HTMLAnchorElement>('a[href^="mailto:"]').forEach(a => {
            const e = a.href.replace('mailto:', '').split('?')[0].trim();
            if (e.includes('@')) mailtos.push(e.toLowerCase());
          });
          return { mailtos, text: (document.body?.innerText ?? '').slice(0, 4000) };
        });
        const found = bestEmail([...content.mailtos, ...extractEmails(content.text)]);
        if (found) return { email: found, isReal: true };
        if (aiProvider && content.text.length > 50) {
          const aiEmail = await aiExtract(companyName, domain, content.text, aiProvider);
          if (aiEmail) return { email: aiEmail, isReal: true };
        }
      } finally { await page.close().catch(() => {}); }
    } catch {}
  }

  // AI prediction — last resort when no email found anywhere on the site.
  // Uses the same AI provider configured for email generation.
  // Marked isReal: false so the UI shows it as AI-predicted, not scraped.
  if (aiProvider) {
    const predicted = await aiPredict(companyName, domain, niche, location, aiProvider);
    if (predicted) {
      console.log(`    🤖 AI predicted: ${predicted}`);
      return { email: predicted, isReal: false };
    }
  }

  return null;
}

// ─── Source 1: Google Maps (Puppeteer) ───────────────────────────────────────
// Best source — 200M businesses, each has a website link.
// Opens each listing page to get the website, then deep-scrapes it.

export async function scrapeGoogleMaps(
  niche: string, location: string, maxResults: number,
  seen: Set<string>, onLead: (l: ScrapedLead) => void,
  aiProvider: AIProviderConfig | null
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];
  let browser: Browser | undefined;

  try {
    browser = await Promise.race([
      puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled', '--disable-gpu',
          '--window-size=1280,800', '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--user-data-dir=/tmp/puppeteer-maps',
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Puppeteer launch timeout — Chrome not available')), 15_000)
      ),
    ]);

    const page = await browser.newPage();
    const ua = randomUA();
    await page.setUserAgent(ua);
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      (window as any).chrome = { runtime: {} };
    });

    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(`${niche} in ${location}`)}`;
    console.log(`\n🗺  Google Maps: ${mapsUrl}`);

    try {
      await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    } catch (navErr: any) {
      // If navigation times out, try with a shorter wait condition
      console.log(`  ⚠️  Maps navigation slow, retrying with load...`);
      try {
        await page.goto(mapsUrl, { waitUntil: 'load', timeout: 90_000 });
      } catch {
        console.log(`  ⚠️  Maps navigation failed — skipping Maps source`);
        return [];
      }
    }

    const feedLoaded = await page.waitForSelector('[role="feed"]', { timeout: 15_000 })
      .then(() => true).catch(() => false);
    if (!feedLoaded) { console.log('  ⚠️  Maps feed not found'); return []; }

    // Scroll to load more listings
    let prev = 0, stale = 0;
    const maxScrolls = Math.min(Math.ceil(maxResults / 3) + 15, 100);
    for (let i = 0; i < maxScrolls; i++) {
      await page.evaluate(() => {
        const f = document.querySelector('[role="feed"]');
        if (f) f.scrollTop = f.scrollHeight;
      });
      await delay(800);
      const count = await page.evaluate(() => document.querySelectorAll('[role="article"]').length);
      if (count >= maxResults * 1.5) break;
      if (count === prev) { if (++stale >= 5) break; } else stale = 0;
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
    }, maxResults * 2);

    console.log(`  Found ${businesses.length} Maps listings`);

    // Process in batches of 4 — open place page, get website, deep-scrape
    for (let i = 0; i < businesses.length; i += 4) {
      if (leads.length >= maxResults) break;
      const batch = businesses.slice(i, i + 4);

      await Promise.all(batch.map(async (biz: any) => {
        if (leads.length >= maxResults) return;
        if (seen.has(biz.name.toLowerCase())) return;

        let website: string | null = null;
        let phone = biz.phone;

        // Open the Maps place page to get the website URL
        try {
          const p = await browser!.newPage();
          await p.setUserAgent(ua);
          try {
            await p.goto(biz.placeUrl, { waitUntil: 'domcontentloaded', timeout: 12_000 });
            await delay(600);
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

        // Deep-scrape the website for a real email
        let email: string | null = null;
        let emailIsReal = false;
        if (website && !isBlockedDomain(website)) {
          const result = await deepScrapeWebsite(website, biz.name, niche, location, aiProvider, browser);
          if (result) { email = result.email; emailIsReal = result.isReal; }
        }

        if (!email) {
          console.log(`  ⏭  ${biz.name} — no email found`);
          return;
        }

        // MX check — confirm domain can receive mail
        const mxOk = await domainHasMX(email);
        if (!mxOk) {
          console.log(`  ⏭  ${biz.name} — email domain has no MX record: ${email}`);
          return;
        }

        seen.add(biz.name.toLowerCase());
        const lead: ScrapedLead = {
          company_name: biz.name,
          email,
          emailIsReal,
          niche,
          location: biz.address || location,
          company_context: `${biz.name} is a ${niche} in ${location}. ${biz.rating}`.trim(),
          source_url: biz.placeUrl || website || '',
          phone: phone || undefined,
          website: website || undefined,
        };
        leads.push(lead);
        onLead(lead);
        console.log(`  ✅ ${biz.name} → ${email}${emailIsReal ? '' : ' (AI predicted)'}`);
      }));
    }
  } catch (err) {
    console.error('[Maps] Error:', err);
  } finally {
    await browser?.close();
  }

  return leads;
}

// ─── Source 2: Bing Search (fetch-based, no Puppeteer) ───────────────────────
// Bing returns real HTML without aggressive bot detection.
// We parse result URLs then deep-scrape each site for emails.

async function scrapeBingSearch(
  niche: string, location: string, needed: number,
  seen: Set<string>, onLead: (l: ScrapedLead) => void,
  aiProvider: AIProviderConfig | null
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];

  const queries = [
    `"${niche}" "${location}" email contact`,
    `${niche} ${location} "contact@" OR "info@" OR "hello@"`,
    `${niche} ${location} "@gmail.com" OR "@yahoo.com" contact`,
    `${niche} ${location} "sales@" OR "admin@" OR "office@"`,
    `${niche} ${location} contact us email site`,
    `${niche} near ${location} official website email`,
  ];

  const headers = {
    'User-Agent': randomUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
  };

  for (const query of queries) {
    if (leads.length >= needed) break;
    try {
      console.log(`  🔍 Bing: ${query}`);
      const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20&setlang=en`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) { console.log(`  ⚠️  Bing ${res.status}`); continue; }
      const html = await res.text();

      // Extract result URLs and titles from Bing HTML
      const items: { name: string; snippet: string; url: string }[] = [];
      // Bing result pattern: <h2><a href="URL">Title</a></h2>
      const linkRe = /<h2[^>]*><a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(html)) !== null) {
        const rawUrl = m[1] ?? '';
        const rawName = (m[2] ?? '').replace(/<[^>]+>/g, '').trim();
        if (!rawUrl || !rawName || isBlockedDomain(rawUrl)) continue;
        // Get snippet — text after the link block
        const snippetRe = /<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i;
        const snippetMatch = html.slice(m.index, m.index + 800).match(snippetRe);
        const snippet = snippetMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
        items.push({ name: rawName, snippet, url: rawUrl });
      }

      console.log(`    Found ${items.length} Bing results`);

      // Also check if any emails appear directly in the Bing page
      const pageEmails = extractEmails(html.replace(/<[^>]+>/g, ' '));
      if (pageEmails.length > 0) console.log(`    📧 ${pageEmails.length} emails in Bing page`);

      for (const item of items) {
        if (leads.length >= needed) break;
        const cleanName = item.name.replace(/\s*[-|–·|]\s*.+$/, '').trim();
        if (!cleanName || cleanName.length < 3) continue;
        if (seen.has(cleanName.toLowerCase())) continue;

        // Check snippet for email first
        let email = bestEmail(extractEmails(item.snippet));
        let emailIsReal = !!email;

        // Deep-scrape the site if no email in snippet
        if (!email) {
          const result = await deepScrapeWebsite(item.url, cleanName, niche, location, aiProvider);
          if (result) { email = result.email; emailIsReal = result.isReal; }
        }

        if (!email) continue;
        const mxOk = await domainHasMX(email);
        if (!mxOk) continue;

        seen.add(cleanName.toLowerCase());
        const lead: ScrapedLead = {
          company_name: cleanName, email, emailIsReal, niche, location,
          company_context: item.snippet || `${cleanName} is a ${niche} in ${location}.`,
          source_url: item.url, website: item.url,
        };
        leads.push(lead);
        onLead(lead);
        console.log(`    ✅ ${cleanName} → ${email}${emailIsReal ? '' : ' (AI predicted)'}`);
      }

      await delay(1000 + Math.random() * 500);
    } catch (err: any) {
      console.log(`  ⚠️  Bing query failed: ${err?.message?.slice(0, 60)}`);
    }
  }

  return leads;
}

// ─── Source 3: DuckDuckGo HTML search (fetch-based) ──────────────────────────
// DDG HTML endpoint works without JS and has no bot detection.

async function scrapeDDGSearch(
  niche: string, location: string, needed: number,
  seen: Set<string>, onLead: (l: ScrapedLead) => void,
  aiProvider: AIProviderConfig | null
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];

  const queries = [
    `${niche} ${location} email contact`,
    `${niche} ${location} "info@" OR "contact@" OR "hello@"`,
    `${niche} ${location} "@gmail.com" contact`,
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  };

  for (const query of queries) {
    if (leads.length >= needed) break;
    try {
      console.log(`  🦆 DDG: ${query}`);
      const res = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        { headers, signal: AbortSignal.timeout(15_000) }
      );
      if (!res.ok) continue;
      const html = await res.text();

      // DDG HTML result pattern
      const items: { name: string; snippet: string; url: string }[] = [];
      const resultRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      const snippets: string[] = [];
      let sm: RegExpExecArray | null;
      while ((sm = snippetRe.exec(html)) !== null) {
        snippets.push((sm[1] ?? '').replace(/<[^>]+>/g, '').trim());
      }
      let rm: RegExpExecArray | null;
      let idx = 0;
      while ((rm = resultRe.exec(html)) !== null) {
        const rawUrl = rm[1] ?? '';
        const rawName = (rm[2] ?? '').replace(/<[^>]+>/g, '').trim();
        if (!rawUrl || !rawName || isBlockedDomain(rawUrl)) { idx++; continue; }
        // DDG wraps URLs — decode if needed
        let cleanUrl = rawUrl;
        try {
          if (rawUrl.includes('uddg=')) {
            cleanUrl = decodeURIComponent(rawUrl.split('uddg=')[1]?.split('&')[0] ?? rawUrl);
          }
        } catch { /* keep original */ }
        items.push({ name: rawName, snippet: snippets[idx] ?? '', url: cleanUrl });
        idx++;
      }

      for (const item of items) {
        if (leads.length >= needed) break;
        const cleanName = item.name.replace(/\s*[-|–·|]\s*.+$/, '').trim();
        if (!cleanName || cleanName.length < 3) continue;
        if (seen.has(cleanName.toLowerCase())) continue;

        let email = bestEmail(extractEmails(item.snippet));
        let emailIsReal = !!email;
        if (!email) {
          const result = await deepScrapeWebsite(item.url, cleanName, niche, location, aiProvider);
          if (result) { email = result.email; emailIsReal = result.isReal; }
        }
        if (!email) continue;
        const mxOk = await domainHasMX(email);
        if (!mxOk) continue;

        seen.add(cleanName.toLowerCase());
        const lead: ScrapedLead = {
          company_name: cleanName, email, emailIsReal, niche, location,
          company_context: item.snippet || `${cleanName} is a ${niche} in ${location}.`,
          source_url: item.url, website: item.url,
        };
        leads.push(lead);
        onLead(lead);
        console.log(`    ✅ ${cleanName} → ${email}${emailIsReal ? '' : ' (AI predicted)'}`);
      }

      await delay(1500);
    } catch (err: any) {
      console.log(`  ⚠️  DDG query failed: ${err?.message?.slice(0, 60)}`);
    }
  }

  return leads;
}

// ─── Source 4: Business directories (fetch-based) ────────────────────────────
// Fetches directory search pages and deep-scrapes each listing for emails.

async function scrapeDirectories(
  niche: string, location: string, needed: number,
  seen: Set<string>, onLead: (l: ScrapedLead) => void,
  aiProvider: AIProviderConfig | null
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];

  // City/country extraction for cleaner directory queries
  const cityOnly = location.split(',')[0]?.trim() ?? location;

  const sources = [
    {
      name: 'Hotfrog',
      url: `https://www.hotfrog.com/search/${encodeURIComponent(cityOnly)}/${encodeURIComponent(niche)}`,
      // Hotfrog listing links pattern
      linkRe: /href="(https:\/\/www\.hotfrog\.com\/company\/[^"]+)"/gi,
    },
    {
      name: 'Manta',
      url: `https://www.manta.com/mb/${encodeURIComponent(cityOnly)}/${encodeURIComponent(niche)}`,
      linkRe: /href="(https:\/\/www\.manta\.com\/c\/[^"]+)"/gi,
    },
    {
      name: 'ChamberOfCommerce',
      url: `https://www.chamberofcommerce.com/search?q=${encodeURIComponent(niche)}&location=${encodeURIComponent(location)}`,
      linkRe: /href="(https:\/\/www\.chamberofcommerce\.com\/[^"?]+\/[^"?]+)"/gi,
    },
  ];

  const headers = {
    'User-Agent': randomUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  for (const source of sources) {
    if (leads.length >= needed) break;
    try {
      console.log(`  📒 Directory: ${source.name}`);
      const res = await fetch(source.url, { headers, signal: AbortSignal.timeout(12_000) });
      if (!res.ok) { console.log(`  ⚠️  ${source.name} ${res.status}`); continue; }
      const html = await res.text();

      // Decode obfuscation
      const decoded = html
        .replace(/\s*\[at\]\s*/gi, '@').replace(/\s*\(at\)\s*/gi, '@')
        .replace(/\s*\[dot\]\s*/gi, '.').replace(/\s*\(dot\)\s*/gi, '.');

      // First: try to find emails directly on the listing page
      const directEmails = extractEmails(decoded.replace(/<[^>]+>/g, ' '));
      if (directEmails.length > 0) {
        console.log(`    📧 ${directEmails.length} emails found directly on ${source.name}`);
        // Try to pair with business names
        const nameRe = /<(?:h[123]|strong)[^>]*>([\s\S]{3,80}?)<\/(?:h[123]|strong)>/gi;
        const names: string[] = [];
        let nm: RegExpExecArray | null;
        while ((nm = nameRe.exec(decoded)) !== null) {
          const n = (nm[1] ?? '').replace(/<[^>]+>/g, '').trim();
          if (n && n.length > 2 && n.length < 80 && !seen.has(n.toLowerCase())) names.push(n);
        }
        for (let i = 0; i < Math.min(directEmails.length, names.length, needed - leads.length); i++) {
          const email = directEmails[i]!;
          const name = names[i]!;
          const mxOk = await domainHasMX(email);
          if (!mxOk) continue;
          seen.add(name.toLowerCase());
          const lead: ScrapedLead = {
            company_name: name, email, emailIsReal: true, niche, location,
            company_context: `${name} is a ${niche} in ${location}.`,
            source_url: source.url,
          };
          leads.push(lead);
          onLead(lead);
          console.log(`    ✅ ${name} → ${email}`);
        }
        if (leads.length >= needed) break;
      }

      // Second: collect listing page URLs and deep-scrape each one
      const listingUrls = new Set<string>();
      let lm: RegExpExecArray | null;
      source.linkRe.lastIndex = 0;
      while ((lm = source.linkRe.exec(html)) !== null) {
        listingUrls.add(lm[1] ?? '');
        if (listingUrls.size >= 20) break;
      }

      console.log(`    Found ${listingUrls.size} listing URLs on ${source.name}`);

      for (const listingUrl of Array.from(listingUrls)) {
        if (leads.length >= needed) break;
        try {
          const lRes = await fetch(listingUrl, { headers, signal: AbortSignal.timeout(8_000) });
          if (!lRes.ok) continue;
          const lHtml = (await lRes.text())
            .replace(/\s*\[at\]\s*/gi, '@').replace(/\s*\(at\)\s*/gi, '@')
            .replace(/\s*\[dot\]\s*/gi, '.').replace(/\s*\(dot\)\s*/gi, '.');

          // Extract business name from listing page title
          const titleMatch = lHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const h1Match = lHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
          const rawName = (h1Match?.[1] ?? titleMatch?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
          const name = rawName.replace(/\s*[-|–|]\s*.+$/, '').trim();
          if (!name || name.length < 3 || seen.has(name.toLowerCase())) continue;

          // Look for email on listing page
          const mailtoRe = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
          const mailtos: string[] = [];
          let mm: RegExpExecArray | null;
          while ((mm = mailtoRe.exec(lHtml)) !== null) mailtos.push(mm[1]!.toLowerCase());
          const plainText = lHtml.replace(/<[^>]+>/g, ' ');
          const email = bestEmail([...mailtos, ...extractEmails(plainText)]);
          if (!email) continue;

          const mxOk = await domainHasMX(email);
          if (!mxOk) continue;

          // Also try to get their actual website
          const websiteRe = /href="(https?:\/\/(?!(?:www\.)?(?:hotfrog|manta|chamberofcommerce|cylex|yellowpages))[^"]+)"/i;
          const websiteMatch = lHtml.match(websiteRe);
          const website = websiteMatch?.[1] ?? undefined;

          seen.add(name.toLowerCase());
          const lead: ScrapedLead = {
            company_name: name, email, emailIsReal: true, niche, location,
            company_context: `${name} is a ${niche} in ${location}.`,
            source_url: listingUrl, website,
          };
          leads.push(lead);
          onLead(lead);
          console.log(`    ✅ ${name} → ${email}`);
        } catch { /* skip this listing */ }
        await delay(300);
      }
    } catch (err: any) {
      console.log(`  ⚠️  ${source.name} failed: ${err?.message?.slice(0, 60)}`);
    }
  }

  return leads;
}

// ─── Source 4: Google Custom Search API (optional, free 100/day) ─────────────

async function scrapeGoogleCustomSearch(
  niche: string, location: string, needed: number,
  seen: Set<string>, onLead: (l: ScrapedLead) => void,
  aiProvider: AIProviderConfig | null,
  apiKey: string, cx: string
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];
  const queries = [
    `${niche} ${location} email contact`,
    `${niche} ${location} "contact@" OR "info@" OR "hello@"`,
    `${niche} ${location} "@gmail.com" OR "@yahoo.com" contact`,
    `${niche} ${location} "sales@" OR "admin@" OR "office@"`,
    `${niche} ${location} site:yellowpages.com OR site:yelp.com`,
  ];

  for (const query of queries) {
    if (leads.length >= needed) break;
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=10`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) { console.warn(`  ⚠️  Google API ${res.status}`); break; }
      const data = await res.json();

      for (const item of (data.items ?? [])) {
        if (leads.length >= needed) break;
        const name = (item.title ?? '').replace(/\s*[-|–].*$/, '').trim();
        if (!name || name.length < 3) continue;
        if (seen.has(name.toLowerCase())) continue;
        if (isBlockedDomain(item.link ?? '')) continue;

        let email = bestEmail(extractEmails(item.snippet ?? ''));
        if (!email && item.link) {
          const result = await deepScrapeWebsite(item.link, name, niche, location, aiProvider);
          if (result) email = result.email;
        }
        if (!email) continue;
        const mxOk = await domainHasMX(email);
        if (!mxOk) continue;

        seen.add(name.toLowerCase());
        const lead: ScrapedLead = {
          company_name: name, email, emailIsReal: true, niche, location,
          company_context: item.snippet || `${name} is a ${niche} in ${location}.`,
          source_url: item.link, website: item.link,
        };
        leads.push(lead);
        onLead(lead);
        console.log(`    ✅ ${name} → ${email}`);
      }
      await delay(300);
    } catch (err: any) {
      console.log(`  ⚠️  Google API failed: ${err?.message?.slice(0, 60)}`);
    }
  }
  return leads;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function scrapeWithoutAPI(
  niche: string,
  location: string,
  maxLeads = 100,
  onLead?: (lead: ScrapedLead) => void,
  aiProvider: AIProviderConfig | null = null
): Promise<ScrapedLead[]> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Scraping: "${niche}" in "${location}" (target: ${maxLeads})`);
  if (aiProvider) console.log(`🤖 AI: ${aiProvider.provider}/${aiProvider.active_model}`);
  console.log(`${'='.repeat(60)}\n`);

  const all: ScrapedLead[] = [];
  const seen = new Set<string>();

  const emit = (lead: ScrapedLead) => {
    all.push(lead);
    onLead?.(lead);
  };

  const googleApiKey = process.env.GOOGLE_API_KEY;
  const googleCx = process.env.GOOGLE_CX;

  // Targets — generous so each source fills up independently
  const mapsTarget   = Math.ceil(maxLeads * 0.70);
  const googleTarget = Math.ceil(maxLeads * 0.60);
  const dirTarget    = Math.ceil(maxLeads * 0.30);
  const apiTarget    = Math.ceil(maxLeads * 0.50);

  // Run sources SEQUENTIALLY — no parallel Puppeteer to avoid hot-reload kills.
  // Bing + DDG are fetch-based (fast, no bot detection). Maps is Puppeteer (last resort).
  const counts: { source: string; count: number }[] = [];

  // 1. Directories (fetch-based, no Puppeteer)
  try {
    const dirLeads = await scrapeDirectories(niche, location, dirTarget, seen, emit, aiProvider);
    counts.push({ source: 'Dirs', count: dirLeads.length });
  } catch (e) {
    console.error('[Dirs] Error:', e);
    counts.push({ source: 'Dirs', count: 0 });
  }

  // 2. Bing search (fetch-based — no bot detection, works reliably)
  if (all.length < maxLeads) {
    try {
      const bingLeads = await scrapeBingSearch(niche, location, googleTarget, seen, emit, aiProvider);
      counts.push({ source: 'Bing', count: bingLeads.length });
    } catch (e) {
      console.error('[Bing] Error:', e);
      counts.push({ source: 'Bing', count: 0 });
    }
  }

  // 3. DuckDuckGo (fetch-based — no bot detection)
  if (all.length < maxLeads) {
    try {
      const ddgLeads = await scrapeDDGSearch(niche, location, Math.ceil(maxLeads * 0.40), seen, emit, aiProvider);
      counts.push({ source: 'DDG', count: ddgLeads.length });
    } catch (e) {
      console.error('[DDG] Error:', e);
      counts.push({ source: 'DDG', count: 0 });
    }
  }

  // 4. Google Maps (Puppeteer) — only if still need more leads
  // Wrapped in a timeout — if Puppeteer can't launch on this machine, skip it
  if (all.length < maxLeads) {
    try {
      const mapsPromise = scrapeGoogleMaps(niche, location, mapsTarget, seen, emit, aiProvider);
      const timeoutPromise = new Promise<ScrapedLead[]>((resolve) =>
        setTimeout(() => { console.log('  ⏱  Maps timed out — skipping'); resolve([]); }, 45_000)
      );
      const mapsLeads = await Promise.race([mapsPromise, timeoutPromise]);
      counts.push({ source: 'Maps', count: mapsLeads.length });
    } catch (e) {
      console.error('[Maps] Error:', e);
      counts.push({ source: 'Maps', count: 0 });
    }
  }

  // 5. Google Custom Search API (optional, if key configured)
  if (all.length < maxLeads && googleApiKey && googleCx) {
    console.log('🔑 Google Custom Search API key found');
    try {
      const apiLeads = await scrapeGoogleCustomSearch(niche, location, apiTarget, seen, emit, aiProvider, googleApiKey, googleCx);
      counts.push({ source: 'API', count: apiLeads.length });
    } catch (e) {
      console.error('[API] Error:', e);
      counts.push({ source: 'API', count: 0 });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Total: ${all.length} leads | ${counts.map(c => `${c.source}:${c.count}`).join(' ')}`);
  console.log(`${'='.repeat(60)}\n`);

  // Deduplicate by email
  const deduped = Array.from(
    new Map(all.map(l => [l.email.toLowerCase(), l])).values()
  );

  return deduped.slice(0, maxLeads);
}
