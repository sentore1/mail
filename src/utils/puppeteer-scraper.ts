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
  maxResults: number = 20
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
    
    // Scroll to load more results
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const scrollable = document.querySelector('[role="feed"]');
        if (scrollable) {
          scrollable.scrollTop = scrollable.scrollHeight;
        }
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Extract business data
    const businesses = await page.evaluate(() => {
      const results: any[] = [];
      const articles = document.querySelectorAll('[role="article"]');
      
      articles.forEach((article, index) => {
        if (index >= 20) return; // Limit results
        
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
    });
    
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
  maxResults: number = 20
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
    const businesses = await page.evaluate(() => {
      const results: any[] = [];
      const cards = document.querySelectorAll('[data-testid="serp-ia-card"]');
      
      cards.forEach((card, index) => {
        if (index >= 20) return;
        
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
    });
    
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
  maxResults: number = 20
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
    const businesses = await page.evaluate(() => {
      const results: any[] = [];
      const resultDivs = document.querySelectorAll('.result, .search-results .result');
      
      resultDivs.forEach((result, index) => {
        if (index >= 20) return;
        
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
    });
    
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
 * Main scraper - tries all methods without API keys
 */
export async function scrapeWithoutAPI(
  niche: string,
  location: string
): Promise<ScrapedLead[]> {
  let allLeads: ScrapedLead[] = [];
  
  console.log(`Starting API-free scraping for: ${niche} in ${location}`);
  
  // Try Google Maps first (usually best results)
  try {
    const mapsLeads = await scrapeGoogleMaps(niche, location, 20);
    allLeads = [...allLeads, ...mapsLeads];
    console.log(`Google Maps: ${mapsLeads.length} leads`);
  } catch (error) {
    console.error('Google Maps failed:', error);
  }
  
  // If we need more results, try Yelp
  if (allLeads.length < 15) {
    try {
      const yelpLeads = await scrapeYelpWithPuppeteer(niche, location, 20);
      allLeads = [...allLeads, ...yelpLeads];
      console.log(`Yelp: ${yelpLeads.length} leads`);
    } catch (error) {
      console.error('Yelp failed:', error);
    }
  }
  
  // If we still need more, try Yellow Pages
  if (allLeads.length < 15) {
    try {
      const ypLeads = await scrapeYellowPagesWithPuppeteer(niche, location, 20);
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
  
  return uniqueLeads;
}
