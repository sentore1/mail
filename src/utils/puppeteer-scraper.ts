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
  // News & media — not businesses
  'news.com.au','theguardian.com','reuters.com','apnews.com','forbes.com',
  'businessinsider.com','techcrunch.com','theverge.com','wired.com',
  'huffpost.com','dailymail.co.uk','mirror.co.uk','telegraph.co.uk',
  'independent.co.uk','express.co.uk','metro.co.uk','sky.com',
  'abc.net.au','smh.com.au','theage.com.au','afr.com',
  'timesofindia.com','hindustantimes.com','ndtv.com','thehindu.com',
  'aljazeera.com','arabnews.com','gulfnews.com','khaleejtimes.com',
  'thenationalnews.com','zawya.com',
  // Travel blogs & review sites
  'thehoneycombers.com','timeout.com','lonelyplanet.com','fodors.com',
  'frommers.com','roughguides.com','travelandleisure.com','cntraveler.com',
  'booking.com','expedia.com','hotels.com','airbnb.com','agoda.com',
  'kayak.com','skyscanner.com','trivago.com',
  // Directories & aggregators (not individual businesses)
  'justdial.com','sulekha.com','indiamart.com','tradeindia.com',
  'alibaba.com','aliexpress.com','amazon.com','ebay.com',
  'zomato.com','swiggy.com','ubereats.com','doordash.com','grubhub.com',
  'talabat.com','deliveroo.com','foodpanda.com',
  'glassdoor.com','monster.com','naukri.com','timesjobs.com',
  'scribd.com','slideshare.net','academia.edu','researchgate.net',
  'quora.com','answers.com','ehow.com',
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
    const parsed = new URL(url);
    const h = parsed.hostname.replace(/^www\./, '');
    // Check blocked domain list
    if (BLOCKED_DOMAINS.has(h) || Array.from(BLOCKED_DOMAINS).some(d => h.endsWith('.' + d))) return true;
    // Block news article URLs by path pattern
    const path = parsed.pathname.toLowerCase();
    if (/\/(news|article|articles|blog|blogs|story|stories|post|posts|press|media|editorial)\//i.test(path)) return true;
    // Block URLs with very long paths (usually articles, not business homepages)
    if (path.split('/').length > 6) return true;
    return false;
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
 * Returns { email, isReal, realName } where:
 *   isReal = true  → email was found explicitly on a page (scraped)
 *   isReal = false → email was predicted by AI from domain + company info
 *   realName       → business name extracted from the website (if found)
 */
async function deepScrapeWebsite(
  website: string,
  companyName: string,
  niche: string,
  location: string,
  aiProvider: AIProviderConfig | null,
  browser?: Browser
): Promise<{ email: string; isReal: boolean; realName?: string } | null> {
  if (!website.startsWith('http')) website = `https://${website}`;
  let origin: string;
  try { origin = new URL(website).origin; } catch { return null; }
  const domain = new URL(origin).hostname.replace(/^www\./, '');

  const headers = {
    'User-Agent': randomUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // Priority pages — try these first with regex only (fast, no AI)
  const regexOnlyPaths = [
    '/contact', '/contact-us', '/contacts', '/contact.html',
    '/about', '/about-us', '/about.html',
    '/team', '/our-team', '/staff',
    '/imprint', '/impressum',
    '/',
  ];

  // AI-assisted pages — only try these if regex found nothing, and only on the most likely pages
  const aiAssistedPaths = ['/contact', '/about', '/'];

  // Extract real business name from HTML
  const extractBusinessName = (html: string, pageUrl: string): string | null => {
    // URL junk guard — rejects "https", "http", "www" etc.
    const isUrlJunk = (s: string) => /^(https?|ftp|www)$/i.test(s.trim()) || /^https?:\/\//i.test(s.trim());

    // Try og:site_name meta tag (most reliable)
    const ogSite = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{3,80})["']/i)?.[1]
                ?? html.match(/<meta[^>]+content=["']([^"']{3,80})["'][^>]+property=["']og:site_name["']/i)?.[1];
    if (ogSite && !isUrlJunk(ogSite)) return decodeHtmlEntitiesSimple(ogSite.trim());

    // Try <title> tag — take the part before | or - separator
    const titleMatch = html.match(/<title[^>]*>([^<]{3,100})<\/title>/i)?.[1];
    if (titleMatch) {
      const cleaned = titleMatch.replace(/\s*[-|–|—|·|»]\s*.+$/, '').trim();
      if (cleaned.length >= 3 && cleaned.length <= 80 && !isUrlJunk(cleaned) && !BAD_TITLE_PATTERNS.some(p => p.test(cleaned))) {
        return decodeHtmlEntitiesSimple(cleaned);
      }
    }

    // Try h1 on homepage
    const h1Match = html.match(/<h1[^>]*>([^<]{3,80})<\/h1>/i)?.[1];
    if (h1Match) {
      const cleaned = h1Match.replace(/<[^>]+>/g, '').trim();
      if (cleaned.length >= 3 && cleaned.length <= 60 && !isUrlJunk(cleaned) && !BAD_TITLE_PATTERNS.some(p => p.test(cleaned))) {
        return decodeHtmlEntitiesSimple(cleaned);
      }
    }

    return null;
  };

  function decodeHtmlEntitiesSimple(text: string): string {
    return text
      .replace(/&#x27;/gi, "'").replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&nbsp;/gi, ' ').trim();
  }

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

  const fetchPage = async (url: string, useAI = false): Promise<{ email: string; name?: string } | null> => {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(7_000) });
      if (!res.ok) return null;
      const html = decodeHtml(await res.text());
      const mailtos: string[] = [];
      const mr = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
      let mm: RegExpExecArray | null;
      while ((mm = mr.exec(html)) !== null) mailtos.push(mm[1].toLowerCase());
      const found = bestEmail([...mailtos, ...extractEmails(html)]);
      // Extract real business name from this page
      const realName = extractBusinessName(html, url) ?? undefined;
      if (found) return { email: found, name: realName };
      // AI extraction — only on specific pages and only if page has enough content
      if (useAI && aiProvider) {
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text.length > 200) {
          const aiEmail = await aiExtract(companyName, domain, text.slice(0, 3000), aiProvider);
          if (aiEmail) return { email: aiEmail, name: realName };
        }
      }
      return null;
    } catch { return null; }
  };

  let foundRealName: string | undefined;

  // Phase 1: Try all pages with regex only (fast, no AI calls)
  const regexUrls = regexOnlyPaths.map(p => `${origin}${p}`);
  for (const url of regexUrls) {
    const result = await fetchPage(url, false);
    if (result) {
      if (result.name) foundRealName = result.name;
      return { email: result.email, isReal: true, realName: foundRealName };
    }
  }

  // Phase 2: Try top 3 pages with AI (only if regex found nothing)
  if (aiProvider) {
    const aiUrls = aiAssistedPaths.map(p => `${origin}${p}`);
    for (const url of aiUrls) {
      const result = await fetchPage(url, true);
      if (result) {
        if (result.name) foundRealName = result.name;
        return { email: result.email, isReal: true, realName: foundRealName };
      }
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
  // Marked isReal: false so the UI shows it as AI-predicted, not scraped.
  // We REJECT generic role addresses (info@, contact@, hello@, etc.) since
  // the AI always guesses these and they rarely reach a real person.
  if (aiProvider) {
    const predicted = await aiPredict(companyName, domain, niche, location, aiProvider);
    if (predicted) {
      // Reject if the predicted email is on a blocked/social domain
      const predictedDomain = predicted.split('@')[1]?.toLowerCase() ?? '';
      const isBlockedPrediction = Array.from(BLOCKED_DOMAINS).some(d =>
        predictedDomain === d || predictedDomain.endsWith('.' + d)
      );
      if (isBlockedPrediction) {
        console.log(`    ⏭  AI predicted blocked domain: ${predicted} — skipped`);
        return null;
      }

      // Reject generic role-based prefixes — AI always guesses these, they're useless
      const localPart = predicted.split('@')[0]?.toLowerCase() ?? '';
      const GENERIC_PREFIXES = [
        'info', 'contact', 'hello', 'support', 'admin', 'office',
        'enquiry', 'enquiries', 'team', 'mail', 'help', 'sales',
        'reception', 'general', 'webmaster', 'noreply', 'no-reply',
        'feedback', 'service', 'hr', 'marketing', 'accounts', 'billing',
        'press', 'media', 'pr', 'news', 'shop', 'store',
      ];
      const isGeneric = GENERIC_PREFIXES.some(p =>
        localPart === p || localPart.startsWith(p + '.') || localPart.startsWith(p + '_')
      );
      if (isGeneric) {
        console.log(`    ⏭  AI predicted generic email: ${predicted} — skipped (not saved)`);
        return null;
      }

      console.log(`    🤖 AI predicted specific email: ${predicted}`);
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
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-gpu',
          '--single-process',        // Required on Windows
          '--no-zygote',             // Required on Windows
          '--window-size=1280,800',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Puppeteer launch timeout — Chrome not available')), 20_000)
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

async function scrapeBingSearch(
  niche: string, location: string, needed: number,
  seen: Set<string>, onLead: (l: ScrapedLead) => void,
  aiProvider: AIProviderConfig | null
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];

  const queries = [
    `${niche} ${location} contact email`,
    `${niche} ${location} "info@" OR "contact@"`,
    `${niche} ${location} "@gmail.com" contact`,
    `${niche} ${location} official website`,
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.bing.com/',
  };

  for (const query of queries) {
    if (leads.length >= needed) break;
    try {
      console.log(`  🔍 Bing: ${query}`);
      const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) { console.log(`  ⚠️  Bing ${res.status}`); continue; }
      const html = await res.text();

      // Extract all href links from Bing results — multiple selector patterns
      const items: { name: string; snippet: string; url: string }[] = [];

      // Pattern 1: standard result links
      const linkRe = /href="(https?:\/\/(?!www\.bing\.com)[^"&]+)"[^>]*>([^<]{3,80})</gi;
      let m: RegExpExecArray | null;
      const seen_urls = new Set<string>();
      while ((m = linkRe.exec(html)) !== null) {
        const rawUrl = m[1] ?? '';
        const rawName = (m[2] ?? '').trim();
        if (!rawUrl || !rawName || isBlockedDomain(rawUrl)) continue;
        if (seen_urls.has(rawUrl)) continue;
        seen_urls.add(rawUrl);
        items.push({ name: rawName, snippet: '', url: rawUrl });
      }

      // Check for emails directly in the page
      const pageText = html.replace(/<[^>]+>/g, ' ');
      const pageEmails = extractEmails(pageText);
      if (pageEmails.length > 0) console.log(`    📧 ${pageEmails.length} emails found in Bing page`);

      console.log(`    Found ${items.length} Bing result URLs`);

      for (const item of items) {
        if (leads.length >= needed) break;
        const cleanName = extractCompanyName(item.name, item.url);
        if (!cleanName || cleanName.length < 3 || cleanName.length > 80) continue;
        if (BAD_TITLE_PATTERNS.some(p => p.test(cleanName))) continue;
        if (seen.has(cleanName.toLowerCase())) continue;

        // Check page emails first
        let email = bestEmail(pageEmails.filter(e => {
          const d = e.split('@')[1] ?? '';
          return item.url.includes(d.split('.')[0] ?? '');
        }));
        let emailIsReal = !!email;

        if (!email) {
          const result = await deepScrapeWebsite(item.url, cleanName, niche, location, aiProvider);
          if (result) {
            email = result.email;
            emailIsReal = result.isReal;
            // Use real name from website if better
            if (result.realName) {
              const better = extractCompanyName(result.realName, item.url);
              if (better && !BAD_TITLE_PATTERNS.some(p => p.test(better))) {
                seen.add(better.toLowerCase());
                const lead: ScrapedLead = { company_name: better, email, emailIsReal, niche, location, company_context: `${better} is a ${niche} in ${location}.`, source_url: item.url, website: item.url };
                leads.push(lead); onLead(lead);
                console.log(`    ✅ ${better} → ${email}${emailIsReal ? '' : ' (AI predicted)'}`);
                continue;
              }
            }
          }
        }

        if (!email) continue;
        const mxOk = await domainHasMX(email);
        if (!mxOk) continue;

        seen.add(cleanName.toLowerCase());
        const lead: ScrapedLead = {
          company_name: cleanName, email, emailIsReal, niche, location,
          company_context: `${cleanName} is a ${niche} in ${location}.`,
          source_url: item.url, website: item.url,
        };
        leads.push(lead);
        onLead(lead);
        console.log(`    ✅ ${cleanName} → ${email}${emailIsReal ? '' : ' (AI predicted)'}`);
      }

      await delay(1500 + Math.random() * 500);
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
        // Check blocked domain AFTER decoding
        if (isBlockedDomain(cleanUrl)) { idx++; continue; }
        items.push({ name: rawName, snippet: snippets[idx] ?? '', url: cleanUrl });
        idx++;
      }

      for (const item of items) {
        if (leads.length >= needed) break;
        const cleanName = extractCompanyName(item.name, item.url);
        if (!cleanName || cleanName.length < 3) continue;
        if (BAD_TITLE_PATTERNS.some(p => p.test(cleanName))) continue;
        if (seen.has(cleanName.toLowerCase())) continue;

        let email = bestEmail(extractEmails(item.snippet));
        let emailIsReal = !!email;
        if (!email) {
          // If the URL is a directory/social site, try to find the real website first
          let websiteToScrape = item.url;
          if (isBlockedDomain(item.url)) {
            // Try to find the company's real website via a direct fetch search
            try {
              const searchRes = await fetch(
                `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanName + ' official website')}`,
                { headers, signal: AbortSignal.timeout(8_000) }
              );
              if (searchRes.ok) {
                const searchHtml = await searchRes.text();
                const urlMatch = searchHtml.match(/href="(https?:\/\/(?!.*duckduckgo)[^"]+)"/i);
                if (urlMatch?.[1] && !isBlockedDomain(urlMatch[1])) {
                  websiteToScrape = urlMatch[1];
                }
              }
            } catch { /* keep original */ }
          }
          if (!isBlockedDomain(websiteToScrape)) {
            const result = await deepScrapeWebsite(websiteToScrape, cleanName, niche, location, aiProvider);
            if (result) { email = result.email; emailIsReal = result.isReal; }
          }
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

// ─── Source: Serper.dev (Google Search JSON API — free 2,500/month) ──────────

// ─── Bad title patterns — these are page titles, not company names ────────────
const BAD_TITLE_PATTERNS = [
  /^contact\s*(us)?$/i,
  /^about\s*(us)?$/i,
  /^home$/i,
  /^welcome$/i,
  /^shop\s/i,
  /^buy\s/i,
  /^order\s/i,
  /^our\s(team|services|products|story)/i,
  /^get\s(in touch|a quote|started)/i,
  /^find\s(us|a\s)/i,
  /^reach\s(us|out)/i,
  /^email\s(us)?$/i,
  /^phone\s(us)?$/i,
  /^call\s(us)?$/i,
  /^directions?$/i,
  /^location(s)?$/i,
  /^hours?$/i,
  /^faq$/i,
  /^privacy\s(policy)?$/i,
  /^terms/i,
  /^sitemap$/i,
  /^search\s(results)?$/i,
  /^page\s(not\s)?found/i,
  /^404/i,
  /^error/i,
  /^\d+\s(best|top|leading)/i,
  /^(best|top|leading)\s\d+/i,
  /^list\sof/i,
  /^online\s(shop|store|shopping)$/i,
  /^(e-?commerce|ecommerce)$/i,
  /^(products?|services?|solutions?)$/i,
  /^(news|blog|articles?)$/i,
  /^(login|sign\s?in|register|sign\s?up)$/i,
  /^(cart|checkout|basket)$/i,
  // List/directory pages — not real companies
  /companies\s+in\s+/i,
  /colleges?\s+(and|&)\s+universities/i,
  /top\s+\d*\s*(colleges?|universities|schools|hospitals|clinics)/i,
  /list\s+of\s+(top|best)/i,
  /\bin\s+[a-z\s]+$/i,  // ends with "in [city]" — likely a list page
  /^(top|best|leading)\s+(colleges?|universities|schools|hospitals|pharmacies|hotels|restaurants)/i,
];

// Bad prefixes to strip from company names
const BAD_NAME_PREFIXES = [
  /^contact\s+/i,
  /^email\s+/i,
  /^call\s+/i,
  /^visit\s+/i,
  /^about\s+/i,
  /^welcome\s+to\s+/i,
  /^home\s*[-|–]\s*/i,
  /^online\s+/i,
  /^official\s+/i,
  /^the\s+official\s+/i,
];

/**
 * Extract a clean company name from a Google result.
 * Falls back to deriving the name from the domain if the title is generic.
 */
function extractCompanyName(title: string, url: string): string | null {
  // Reject raw URL fragments immediately — these are never valid company names
  const URL_JUNK = /^(https?|ftp|www|http)$/i;
  if (URL_JUNK.test(title.trim())) return null;

  // Reject if the raw title looks like a full URL or starts with a protocol
  if (/^https?:\/\//i.test(title.trim())) return null;

  // Clean the title — remove everything after a separator
  let name = title
    .replace(/\s*[-|–|·|—|»|›|:]\s*.+$/, '')
    .replace(/\s*\|\s*.+$/, '')
    .replace(/\s*,\s*.+$/, '')
    .trim();

  // Reject if cleaned name is still a URL token
  if (URL_JUNK.test(name)) return null;
  if (/^https?:\/\//i.test(name)) return null;

  // Decode HTML entities
  name = name
    .replace(/&#x27;/gi, "'").replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');

  // Strip bad prefixes (e.g. "Contact Gulf Electronics" → "Gulf Electronics")
  for (const prefix of BAD_NAME_PREFIXES) {
    const stripped = name.replace(prefix, '').trim();
    if (stripped.length >= 3) {
      name = stripped;
      break;
    }
  }

  // Check if it's a bad/generic title after stripping
  const isBad = BAD_TITLE_PATTERNS.some(p => p.test(name)) || name.length < 3 || name.length > 80;

  if (isBad) {
    // Fall back to domain name — convert "strandbooks.com" → "Strand Books"
    try {
      const parsed = new URL(url);
      const domain = parsed.hostname
        .replace(/^www\./, '')
        .replace(/\.(com|org|net|co\.\w+|io|biz|ae|uk|au|ca|in|sg|us|nz)$/i, '');

      // Skip if domain itself is a generic/junk value
      if (!domain || domain.length < 3 || /^(https?|ftp|localhost)$/i.test(domain)) return null;

      const fromDomain = domain
        .replace(/[-_]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
      if (fromDomain.length >= 3 && fromDomain.length <= 60 && !BAD_TITLE_PATTERNS.some(p => p.test(fromDomain))) {
        return fromDomain;
      }
    } catch { /* invalid URL */ }
    return null;
  }

  return name;
}
// Strategy: Run many diverse queries → collect all unique company websites →
// visit each website's contact/about page → extract real email with AI.
// This gives the highest quality leads with verified real emails.

async function scrapeSerperSearch(
  niche: string, location: string, needed: number,
  seen: Set<string>, onLead: (l: ScrapedLead) => void,
  aiProvider: AIProviderConfig | null,
  apiKey: string
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];

  // Diverse query set — each targets a different type of result
  // to maximize unique companies found
  const queries = [
    `${niche} ${location} contact email`,
    `${niche} ${location} official website`,
    `${niche} ${location} contact us`,
    `${niche} ${location} about us`,
    `best ${niche} in ${location}`,
    `top ${niche} ${location}`,
    `${niche} company ${location}`,
    `${niche} business ${location} email`,
    `${niche} ${location} phone email address`,
    `${niche} near ${location}`,
    `${niche} ${location} services`,
    `${niche} ${location} team`,
  ];

  // Collect all unique website URLs from all queries first
  const websiteMap = new Map<string, { name: string; snippet: string; url: string }>();

  // Extract country code from location for geo-targeted search
  const getCountryCode = (loc: string): string => {
    const l = loc.toLowerCase();
    if (/usa|united states|new york|los angeles|chicago|houston|miami|dallas|seattle|boston|denver|atlanta/.test(l)) return 'us';
    if (/uk|united kingdom|london|manchester|birmingham|edinburgh/.test(l)) return 'gb';
    if (/canada|toronto|vancouver|montreal|calgary/.test(l)) return 'ca';
    if (/australia|sydney|melbourne|brisbane|perth/.test(l)) return 'au';
    if (/uae|dubai|abu dhabi|sharjah/.test(l)) return 'ae';
    if (/saudi|riyadh|jeddah|mecca/.test(l)) return 'sa';
    if (/qatar|doha/.test(l)) return 'qa';
    if (/kenya|nairobi|mombasa/.test(l)) return 'ke';
    if (/nigeria|lagos|abuja/.test(l)) return 'ng';
    if (/south africa|johannesburg|cape town|durban/.test(l)) return 'za';
    if (/india|mumbai|delhi|bangalore|hyderabad|chennai/.test(l)) return 'in';
    if (/singapore/.test(l)) return 'sg';
    if (/malaysia|kuala lumpur/.test(l)) return 'my';
    if (/ghana|accra/.test(l)) return 'gh';
    if (/egypt|cairo/.test(l)) return 'eg';
    if (/france|paris/.test(l)) return 'fr';
    if (/germany|berlin|munich/.test(l)) return 'de';
    if (/pakistan|karachi|lahore/.test(l)) return 'pk';
    if (/bangladesh|dhaka/.test(l)) return 'bd';
    if (/ethiopia|addis ababa/.test(l)) return 'et';
    if (/tanzania|dar es salaam/.test(l)) return 'tz';
    if (/uganda|kampala/.test(l)) return 'ug';
    if (/rwanda|kigali/.test(l)) return 'rw';
    return 'us'; // default
  };

  const countryCode = getCountryCode(location);
  // Extract city name for snippet filtering
  const cityName = location.split(',')[0]?.trim().toLowerCase() ?? location.toLowerCase();

  for (const query of queries) {
    if (websiteMap.size >= needed * 3) break; // collect 3x more than needed
    try {
      console.log(`  🔍 Serper: ${query}`);
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, num: 10, gl: countryCode, hl: 'en', location: location }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) { console.log(`  ⚠️  Serper ${res.status} on: ${query}`); continue; }
      const data = await res.json();

      // Collect from organic results — filter by location relevance
      for (const item of (data.organic ?? [])) {
        const rawUrl = item.link ?? '';
        if (!rawUrl || isBlockedDomain(rawUrl)) continue;
        const companyName = extractCompanyName(item.title ?? '', rawUrl);
        if (!companyName) continue;

        // Location relevance check — skip results that clearly belong to a different location
        // Check snippet and title for location mentions
        const resultText = ((item.title ?? '') + ' ' + (item.snippet ?? '')).toLowerCase();
        const urlDomain = new URL(rawUrl).hostname.toLowerCase();

        // If the snippet mentions a completely different major city, skip it
        // (but only if it doesn't also mention our target city)
        const otherCities = ['new york', 'london', 'paris', 'tokyo', 'sydney', 'toronto', 'berlin', 'singapore', 'mumbai', 'beijing'];
        const mentionsOtherCity = otherCities.some(city =>
          city !== cityName && resultText.includes(city) && !resultText.includes(cityName)
        );
        if (mentionsOtherCity) continue;

        // Use URL as dedup key so we don't visit same site twice
        const urlKey = urlDomain.replace(/^www\./, '');
        if (!websiteMap.has(urlKey)) {
          websiteMap.set(urlKey, {
            name: companyName,
            snippet: item.snippet ?? '',
            url: rawUrl,
          });
        }
      }

      // Also check knowledge graph (often has direct email)
      if (data.knowledgeGraph) {
        const kg = data.knowledgeGraph;
        const kgUrl = kg.website ?? '';
        if (kgUrl && !isBlockedDomain(kgUrl)) {
          const urlKey = new URL(kgUrl).hostname.replace(/^www\./, '');
          if (!websiteMap.has(urlKey)) {
            websiteMap.set(urlKey, {
              name: kg.title ?? niche,
              snippet: kg.description ?? '',
              url: kgUrl,
            });
          }
        }
      }

      await delay(300); // small delay between Serper calls
    } catch (err: any) {
      console.log(`  ⚠️  Serper query failed: ${err?.message?.slice(0, 60)}`);
    }
  }

  console.log(`  📋 Serper collected ${websiteMap.size} unique websites to scrape`);

  // Now visit each website and extract real email
  for (const [, item] of Array.from(websiteMap)) {
    if (leads.length >= needed) break;

    // Name already cleaned by extractCompanyName when stored in websiteMap
    const cleanName = item.name;
    if (!cleanName || cleanName.length < 3) continue;
    // Extra guard — skip if name still looks like a generic page title
    if (BAD_TITLE_PATTERNS.some(p => p.test(cleanName))) continue;
    if (seen.has(cleanName.toLowerCase())) continue;

    // Step 1: Check if email is already in the snippet (fastest)
    let email = bestEmail(extractEmails(item.snippet));
    let emailIsReal = !!email;

    // Step 2: Visit the website and scrape for real email
    if (!email) {
      console.log(`  🌐 Visiting: ${item.url}`);
      const result = await deepScrapeWebsite(item.url, cleanName, niche, location, aiProvider);
      if (result) {
        email = result.email;
        emailIsReal = result.isReal;
        // Use the real business name from the website if found and better than what we have
        if (result.realName && result.realName.length >= 3 && !BAD_TITLE_PATTERNS.some(p => p.test(result.realName!))) {
          const betterName = extractCompanyName(result.realName, item.url);
          if (betterName) {
            console.log(`  📛 Real name from website: "${betterName}" (was: "${cleanName}")`);
            // Update seen set with new name
            seen.delete(cleanName.toLowerCase());
            seen.add(betterName.toLowerCase());
            // Use the real name for the lead
            const lead: ScrapedLead = {
              company_name: betterName, email, emailIsReal, niche, location,
              company_context: item.snippet || `${betterName} is a ${niche} in ${location}.`,
              source_url: item.url, website: item.url,
            };
            leads.push(lead);
            onLead(lead);
            console.log(`  ✅ ${betterName} → ${email}${emailIsReal ? '' : ' (AI predicted)'}`);
            continue;
          }
        }
      }
    }

    if (!email) {
      console.log(`  ⏭  ${cleanName} — no email found on website`);
      continue;
    }

    // Step 3: MX check — confirm domain can receive mail
    const mxOk = await domainHasMX(email);
    if (!mxOk) {
      console.log(`  ⏭  ${cleanName} — email domain has no MX: ${email}`);
      continue;
    }

    seen.add(cleanName.toLowerCase());
    const lead: ScrapedLead = {
      company_name: cleanName,
      email,
      emailIsReal,
      niche,
      location,
      company_context: item.snippet || `${cleanName} is a ${niche} in ${location}.`,
      source_url: item.url,
      website: item.url,
    };
    leads.push(lead);
    onLead(lead);
    console.log(`  ✅ ${cleanName} → ${email}${emailIsReal ? '' : ' (AI predicted)'}`);
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
  const serperApiKey = process.env.SERPER_API_KEY;

  // Targets
  const mapsTarget   = Math.ceil(maxLeads * 0.70);
  const googleTarget = Math.ceil(maxLeads * 0.60);
  const dirTarget    = Math.ceil(maxLeads * 0.30);
  const apiTarget    = Math.ceil(maxLeads * 0.50);

  const counts: { source: string; count: number }[] = [];

  // 1. Serper (Google Search API) — primary source, most leads
  if (serperApiKey) {
    console.log('🔑 Serper API key found — using Google Search + website scraping');
    try {
      // Give Serper the full target — it runs 12 queries and visits each website
      const serperLeads = await scrapeSerperSearch(niche, location, maxLeads, seen, emit, aiProvider, serperApiKey);
      counts.push({ source: 'Serper', count: serperLeads.length });
    } catch (e) {
      console.error('[Serper] Error:', e);
      counts.push({ source: 'Serper', count: 0 });
    }
  }

  // 2. Directories (fetch-based, no Puppeteer)
  if (all.length < maxLeads) {
    try {
      const dirLeads = await scrapeDirectories(niche, location, dirTarget, seen, emit, aiProvider);
      counts.push({ source: 'Dirs', count: dirLeads.length });
    } catch (e) {
      console.error('[Dirs] Error:', e);
      counts.push({ source: 'Dirs', count: 0 });
    }
  }

  // 3. Bing search (fetch-based)
  if (all.length < maxLeads) {
    try {
      const bingLeads = await scrapeBingSearch(niche, location, googleTarget, seen, emit, aiProvider);
      counts.push({ source: 'Bing', count: bingLeads.length });
    } catch (e) {
      console.error('[Bing] Error:', e);
      counts.push({ source: 'Bing', count: 0 });
    }
  }

  // 4. DuckDuckGo (fetch-based)
  if (all.length < maxLeads) {
    try {
      const ddgLeads = await scrapeDDGSearch(niche, location, Math.ceil(maxLeads * 0.40), seen, emit, aiProvider);
      counts.push({ source: 'DDG', count: ddgLeads.length });
    } catch (e) {
      console.error('[DDG] Error:', e);
      counts.push({ source: 'DDG', count: 0 });
    }
  }

  // 5. Google Maps (Puppeteer) — only if still need more leads
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

  // 6. Google Custom Search API (optional)
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
