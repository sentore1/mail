/**
 * Puppeteer-based scraper - No API keys needed
 * Uses headless browser to scrape real business data
 */

import puppeteer from 'puppeteer';

export interface ScrapedLead {
  company_name: string;
  email: string;
  niche: string;
  location: string;
  company_context: string;
  source_url?: string;
  phone?: string;
  website?: string;
}

/**
 * Scrape Google Maps (no API needed)
 */
export async function scrapeGoogleMaps(
  niche: string,
  location: string,
  maxResults: number = 1000
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];
  let browser;
  
  try {
    console.log('Launching browser for Google Maps scraping...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Search Google Maps
    const searchQuery = `${niche} in ${location}`;
    const url = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;
    
    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for results to load
    await page.waitForSelector('[role="article"]', { timeout: 10000 }).catch(() => {});
    
    // Scroll to load more results with better detection
    console.log(`Scrolling to load up to ${maxResults} results...`);
    let previousCount = 0;
    let noNewResultsCount = 0;
    const maxScrollAttempts = Math.min(Math.ceil(maxResults / 10), 100); // Up to 100 scrolls
    
    for (let i = 0; i < maxScrollAttempts; i++) {
      // Scroll down
      await page.evaluate(() => {
        const scrollable = document.querySelector('[role="feed"]');
        if (scrollable) {
          scrollable.scrollTop = scrollable.scrollHeight;
        }
      });
      
      // Wait for new results to load
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Check current count
      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll('[role="article"]').length;
      });
      
      console.log(`Scroll ${i + 1}: ${currentCount} results loaded`);
      
      // Stop if we have enough results
      if (currentCount >= maxResults) {
        console.log(`Reached target of ${maxResults} results`);
        break;
      }
      
      // Stop if no new results after 3 attempts
      if (currentCount === previousCount) {
        noNewResultsCount++;
        if (noNewResultsCount >= 3) {
          console.log(`No new results after ${noNewResultsCount} scrolls, stopping`);
          break;
        }
      } else {
        noNewResultsCount = 0;
      }
      
      previousCount = currentCount;
    }
    
    // Extract business data
    const businesses = await page.evaluate((max) => {
      const results: any[] = [];
      const articles = document.querySelectorAll('[role="article"]');
      
      articles.forEach((article, index) => {
        if (index >= max) return; // Limit results to maxResults
        
        const nameEl = article.querySelector('[class*="fontHeadline"]');
        const addressEl = article.querySelector('[class*="fontBody"]');
        const ratingEl = article.querySelector('[role="img"][aria-label*="stars"]');
        
        const name = nameEl?.textContent?.trim();
        const address = addressEl?.textContent?.trim();
        const rating = ratingEl?.getAttribute('aria-label');
        
        if (name) {
          results.push({
            name,
            address,
            rating
          });
        }
      });
      
      return results;
    }, maxResults);
    
    console.log(`Found ${businesses.length} businesses on Google Maps`);
    
    // Process each business
    for (const business of businesses) {
      const domain = `${business.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
      const email = `info@${domain}`;
      
      leads.push({
        company_name: business.name,
        email: email,
        niche: niche,
        location: business.address || location,
        company_context: `${business.name} is a ${niche} business in ${location}. ${business.rating || ''}`,
        source_url: `https://www.google.com/maps/search/${encodeURIComponent(business.name + ' ' + location)}`,
        website: `https://${domain}`
      });
    }
    
  } catch (error) {
    console.error('Google Maps scraping error:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  return leads;
}

/**
 * Scrape Yelp (no API needed)
 */
export async function scrapeYelpWithPuppeteer(
  niche: string,
  location: string,
  maxResults: number = 1000
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];
  let browser;
  
  try {
    console.log('Launching browser for Yelp scraping...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    const searchQuery = niche.replace(/\s+/g, '+');
    const locationQuery = location.replace(/\s+/g, '+');
    const url = `https://www.yelp.com/search?find_desc=${searchQuery}&find_loc=${locationQuery}`;
    
    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for results
    await page.waitForSelector('[data-testid="serp-ia-card"]', { timeout: 10000 }).catch(() => {});
    
    // Extract business data
    const businesses = await page.evaluate((max) => {
      const results: any[] = [];
      const cards = document.querySelectorAll('[data-testid="serp-ia-card"]');
      
      cards.forEach((card, index) => {
        if (index >= max) return;
        
        const nameEl = card.querySelector('h3, [class*="businessName"]');
        const ratingEl = card.querySelector('[aria-label*="star rating"]');
        const addressEl = card.querySelector('[data-testid="address"]');
        const phoneEl = card.querySelector('[href^="tel:"]');
        
        const name = nameEl?.textContent?.trim();
        const rating = ratingEl?.getAttribute('aria-label');
        const address = addressEl?.textContent?.trim();
        const phone = phoneEl?.textContent?.trim();
        
        if (name) {
          results.push({
            name,
            rating,
            address,
            phone
          });
        }
      });
      
      return results;
    }, maxResults);
    
    console.log(`Found ${businesses.length} businesses on Yelp`);
    
    // Process each business
    for (const business of businesses) {
      const domain = `${business.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
      const email = `info@${domain}`;
      
      leads.push({
        company_name: business.name,
        email: email,
        niche: niche,
        location: business.address || location,
        company_context: `${business.name} is a ${niche} business in ${location}. ${business.rating || ''}`,
        source_url: `https://www.yelp.com/biz/${business.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        phone: business.phone,
        website: `https://${domain}`
      });
    }
    
  } catch (error) {
    console.error('Yelp scraping error:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  return leads;
}

/**
 * Scrape Yellow Pages (no API needed)
 */
export async function scrapeYellowPagesWithPuppeteer(
  niche: string,
  location: string,
  maxResults: number = 1000
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];
  let browser;
  
  try {
    console.log('Launching browser for Yellow Pages scraping...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    const searchQuery = encodeURIComponent(niche);
    const locationQuery = encodeURIComponent(location);
    const url = `https://www.yellowpages.com/search?search_terms=${searchQuery}&geo_location_terms=${locationQuery}`;
    
    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for results
    await page.waitForSelector('.result', { timeout: 10000 }).catch(() => {});
    
    // Extract business data
    const businesses = await page.evaluate((max) => {
      const results: any[] = [];
      const resultDivs = document.querySelectorAll('.result, .search-results .result');
      
      resultDivs.forEach((result, index) => {
        if (index >= max) return;
        
        const nameEl = result.querySelector('.business-name, [class*="business-name"]');
        const phoneEl = result.querySelector('.phones, [class*="phone"]');
        const addressEl = result.querySelector('.street-address, [class*="address"]');
        const websiteEl = result.querySelector('.track-visit-website, [href*="http"]');
        
        const name = nameEl?.textContent?.trim();
        const phone = phoneEl?.textContent?.trim();
        const address = addressEl?.textContent?.trim();
        const website = websiteEl?.getAttribute('href');
        
        if (name) {
          results.push({
            name,
            phone,
            address,
            website
          });
        }
      });
      
      return results;
    }, maxResults);
    
    console.log(`Found ${businesses.length} businesses on Yellow Pages`);
    
    // Process each business
    for (const business of businesses) {
      let email = '';
      let domain = '';
      
      if (business.website) {
        try {
          domain = new URL(business.website).hostname.replace('www.', '');
          email = `info@${domain}`;
        } catch (e) {
          domain = `${business.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
          email = `info@${domain}`;
        }
      } else {
        domain = `${business.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
        email = `info@${domain}`;
      }
      
      leads.push({
        company_name: business.name,
        email: email,
        niche: niche,
        location: business.address || location,
        company_context: `${business.name} is a ${niche} business in ${location}.${business.phone ? ` Phone: ${business.phone}` : ''}`,
        source_url: business.website || url,
        phone: business.phone,
        website: business.website || `https://${domain}`
      });
    }
    
  } catch (error) {
    console.error('Yellow Pages scraping error:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  return leads;
}

/**
 * Scrape LinkedIn company pages
 */
async function scrapeLinkedIn(
  niche: string,
  location: string,
  maxResults: number = 1000
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];
  let browser;
  
  try {
    console.log('Launching browser for LinkedIn scraping...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    const searchQuery = `${niche} companies in ${location}`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery + ' site:linkedin.com/company')}`;
    
    console.log(`Searching LinkedIn via Google: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Extract company links
    const companies = await page.evaluate((max) => {
      const results: any[] = [];
      const searchResults = document.querySelectorAll('div.g, div[data-sokoban-container]');
      
      searchResults.forEach((result, index) => {
        if (index >= max) return;
        
        const linkEl = result.querySelector('a[href*="linkedin.com/company"]');
        const titleEl = result.querySelector('h3');
        const snippetEl = result.querySelector('.VwiC3b, .yXK7lf');
        
        const url = linkEl?.getAttribute('href');
        const name = titleEl?.textContent?.trim();
        const snippet = snippetEl?.textContent?.trim();
        
        if (name && url) {
          results.push({ name, url, snippet });
        }
      });
      
      return results;
    }, Math.min(maxResults, 50));
    
    console.log(`Found ${companies.length} companies on LinkedIn`);
    
    // Process each company
    for (const company of companies) {
      const domain = `${company.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
      const email = `info@${domain}`;
      
      leads.push({
        company_name: company.name,
        email: email,
        niche: niche,
        location: location,
        company_context: company.snippet || `${company.name} is a ${niche} company in ${location}.`,
        source_url: company.url,
        website: `https://${domain}`
      });
    }
    
  } catch (error) {
    console.error('LinkedIn scraping error:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  return leads;
}

/**
 * Scrape Bing/DuckDuckGo for business listings
 */
async function scrapeBingSearch(
  niche: string,
  location: string,
  maxResults: number = 1000
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];
  let browser;
  
  try {
    console.log('Launching browser for Bing search scraping...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    const searchQuery = `${niche} businesses in ${location}`;
    const url = `https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}`;
    
    console.log(`Searching Bing: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Extract business results
    const businesses = await page.evaluate((max) => {
      const results: any[] = [];
      const searchResults = document.querySelectorAll('li.b_algo, .b_algo');
      
      searchResults.forEach((result, index) => {
        if (index >= max) return;
        
        const titleEl = result.querySelector('h2 a, a');
        const snippetEl = result.querySelector('.b_caption p, p');
        
        const name = titleEl?.textContent?.trim();
        const url = titleEl?.getAttribute('href');
        const snippet = snippetEl?.textContent?.trim();
        
        if (name && url && !url.includes('bing.com') && !url.includes('microsoft.com')) {
          results.push({ name, url, snippet });
        }
      });
      
      return results;
    }, Math.min(maxResults, 50));
    
    console.log(`Found ${businesses.length} businesses on Bing`);
    
    // Process each business
    for (const business of businesses) {
      let domain = '';
      try {
        domain = new URL(business.url).hostname.replace('www.', '');
      } catch (e) {
        domain = `${business.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
      }
      
      const email = `info@${domain}`;
      
      leads.push({
        company_name: business.name,
        email: email,
        niche: niche,
        location: location,
        company_context: business.snippet || `${business.name} is a ${niche} business in ${location}.`,
        source_url: business.url,
        website: business.url
      });
    }
    
  } catch (error) {
    console.error('Bing scraping error:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  return leads;
}

/**
 * Scrape Facebook business pages
 */
async function scrapeFacebookPages(
  niche: string,
  location: string,
  maxResults: number = 1000
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];
  let browser;
  
  try {
    console.log('Launching browser for Facebook Pages scraping...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    const searchQuery = `${niche} ${location} site:facebook.com`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    
    console.log(`Searching Facebook Pages via Google: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Extract Facebook pages
    const pages = await page.evaluate((max) => {
      const results: any[] = [];
      const searchResults = document.querySelectorAll('div.g, div[data-sokoban-container]');
      
      searchResults.forEach((result, index) => {
        if (index >= max) return;
        
        const linkEl = result.querySelector('a[href*="facebook.com"]');
        const titleEl = result.querySelector('h3');
        const snippetEl = result.querySelector('.VwiC3b, .yXK7lf');
        
        const url = linkEl?.getAttribute('href');
        const name = titleEl?.textContent?.trim();
        const snippet = snippetEl?.textContent?.trim();
        
        if (name && url && !url.includes('/posts/') && !url.includes('/photos/')) {
          results.push({ name, url, snippet });
        }
      });
      
      return results;
    }, Math.min(maxResults, 50));
    
    console.log(`Found ${pages.length} Facebook pages`);
    
    // Process each page
    for (const fbPage of pages) {
      const domain = `${fbPage.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
      const email = `info@${domain}`;
      
      leads.push({
        company_name: fbPage.name,
        email: email,
        niche: niche,
        location: location,
        company_context: fbPage.snippet || `${fbPage.name} is a ${niche} business in ${location}.`,
        source_url: fbPage.url,
        website: `https://${domain}`
      });
    }
    
  } catch (error) {
    console.error('Facebook scraping error:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  return leads;
}

/**
 * Main scraper - tries all methods without API keys
 */
export async function scrapeWithoutAPI(
  niche: string,
  location: string,
  maxLeads: number = 1000
): Promise<ScrapedLead[]> {
  let allLeads: ScrapedLead[] = [];
  
  console.log(`Starting API-free scraping for: ${niche} in ${location} (max: ${maxLeads})`);
  
  // Try Google Maps first (usually best results)
  try {
    const mapsLeads = await scrapeGoogleMaps(niche, location, maxLeads);
    allLeads = [...allLeads, ...mapsLeads];
    console.log(`Google Maps: ${mapsLeads.length} leads`);
  } catch (error) {
    console.error('Google Maps failed:', error);
  }
  
  // Try LinkedIn
  if (allLeads.length < maxLeads * 0.8) {
    try {
      const linkedInLeads = await scrapeLinkedIn(niche, location, maxLeads);
      allLeads = [...allLeads, ...linkedInLeads];
      console.log(`LinkedIn: ${linkedInLeads.length} leads`);
    } catch (error) {
      console.error('LinkedIn failed:', error);
    }
  }
  
  // Try Bing Search
  if (allLeads.length < maxLeads * 0.8) {
    try {
      const bingLeads = await scrapeBingSearch(niche, location, maxLeads);
      allLeads = [...allLeads, ...bingLeads];
      console.log(`Bing: ${bingLeads.length} leads`);
    } catch (error) {
      console.error('Bing failed:', error);
    }
  }
  
  // Try Facebook Pages
  if (allLeads.length < maxLeads * 0.8) {
    try {
      const fbLeads = await scrapeFacebookPages(niche, location, maxLeads);
      allLeads = [...allLeads, ...fbLeads];
      console.log(`Facebook: ${fbLeads.length} leads`);
    } catch (error) {
      console.error('Facebook failed:', error);
    }
  }
  
  // Try Yelp
  if (allLeads.length < maxLeads * 0.8) {
    try {
      const yelpLeads = await scrapeYelpWithPuppeteer(niche, location, maxLeads);
      allLeads = [...allLeads, ...yelpLeads];
      console.log(`Yelp: ${yelpLeads.length} leads`);
    } catch (error) {
      console.error('Yelp failed:', error);
    }
  }
  
  // Try Yellow Pages
  if (allLeads.length < maxLeads * 0.8) {
    try {
      const ypLeads = await scrapeYellowPagesWithPuppeteer(niche, location, maxLeads);
      allLeads = [...allLeads, ...ypLeads];
      console.log(`Yellow Pages: ${ypLeads.length} leads`);
    } catch (error) {
      console.error('Yellow Pages failed:', error);
    }
  }
  
  // Remove duplicates
  const uniqueLeads = allLeads.filter((lead, index, self) =>
    index === self.findIndex((l) => l.email === lead.email)
  );
  
  console.log(`Total unique leads: ${uniqueLeads.length}`);
  
  return uniqueLeads.slice(0, maxLeads);
}
