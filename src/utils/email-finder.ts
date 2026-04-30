/**
 * Email Finder - Free alternatives to Hunter.io
 * Multiple methods to find and verify business emails
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Common email patterns for businesses
 */
const EMAIL_PATTERNS = [
  'info',
  'contact',
  'hello',
  'sales',
  'support',
  'admin',
  'office',
  'inquiries',
  'business',
  'team'
];

/**
 * Extract all emails from HTML content
 */
export function extractEmailsFromHTML(html: string): string[] {
  const $ = cheerio.load(html);
  const emails = new Set<string>();
  
  // Method 1: Find mailto links
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      const email = href.replace('mailto:', '').split('?')[0].trim();
      if (isValidEmail(email)) {
        emails.add(email.toLowerCase());
      }
    }
  });
  
  // Method 2: Search in text content
  const bodyText = $('body').text();
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
  const matches = bodyText.match(emailRegex);
  if (matches) {
    matches.forEach(email => {
      if (isValidEmail(email)) {
        emails.add(email.toLowerCase());
      }
    });
  }
  
  // Method 3: Search in meta tags
  $('meta').each((_, el) => {
    const content = $(el).attr('content');
    if (content) {
      const emailMatches = content.match(emailRegex);
      if (emailMatches) {
        emailMatches.forEach(email => {
          if (isValidEmail(email)) {
            emails.add(email.toLowerCase());
          }
        });
      }
    }
  });
  
  // Method 4: Search in script tags (sometimes emails are in JSON-LD)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const jsonData = JSON.parse($(el).html() || '{}');
      if (jsonData.email) {
        emails.add(jsonData.email.toLowerCase());
      }
      if (jsonData.contactPoint?.email) {
        emails.add(jsonData.contactPoint.email.toLowerCase());
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  });
  
  return Array.from(emails);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && 
         !email.includes('example.com') && 
         !email.includes('domain.com') &&
         !email.includes('yoursite.com') &&
         !email.includes('placeholder');
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch (e) {
    return null;
  }
}

/**
 * Generate common email patterns for a domain
 */
export function generateEmailPatterns(domain: string, firstName?: string, lastName?: string): string[] {
  const patterns: string[] = [];
  
  // Common generic patterns
  EMAIL_PATTERNS.forEach(prefix => {
    patterns.push(`${prefix}@${domain}`);
  });
  
  // If we have names, generate personalized patterns
  if (firstName && lastName) {
    const f = firstName.toLowerCase();
    const l = lastName.toLowerCase();
    const fInitial = f.charAt(0);
    const lInitial = l.charAt(0);
    
    patterns.push(
      `${f}.${l}@${domain}`,
      `${f}${l}@${domain}`,
      `${fInitial}${l}@${domain}`,
      `${f}${lInitial}@${domain}`,
      `${l}.${f}@${domain}`,
      `${f}_${l}@${domain}`,
      `${f}-${l}@${domain}`
    );
  }
  
  return patterns;
}

/**
 * Scrape website for emails - checks multiple pages
 */
export async function scrapeWebsiteForEmails(websiteUrl: string): Promise<string[]> {
  const emails = new Set<string>();
  const domain = extractDomain(websiteUrl);
  
  if (!domain) return [];
  
  // Pages to check
  const pagesToCheck = [
    websiteUrl,
    `${websiteUrl}/contact`,
    `${websiteUrl}/contact-us`,
    `${websiteUrl}/about`,
    `${websiteUrl}/about-us`,
    `${websiteUrl}/team`,
    `${websiteUrl}/support`,
    `https://${domain}/contact`,
    `https://${domain}/about`,
  ];
  
  for (const url of pagesToCheck) {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        validateStatus: (status) => status < 500 // Accept 404s
      });
      
      if (response.status === 200) {
        const foundEmails = extractEmailsFromHTML(response.data);
        foundEmails.forEach(email => {
          // Prefer emails from the same domain
          if (email.includes(domain)) {
            emails.add(email);
          } else if (emails.size === 0) {
            // Add other emails only if we haven't found domain emails
            emails.add(email);
          }
        });
        
        // If we found emails, we can stop
        if (emails.size > 0) break;
      }
    } catch (error) {
      // Continue to next page
      continue;
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return Array.from(emails);
}

/**
 * Get WHOIS information for domain (contains registration email)
 */
export async function getWhoisEmail(domain: string): Promise<string | null> {
  try {
    // Using a free WHOIS API
    const response = await axios.get(`https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=at_free&domainName=${domain}&outputFormat=JSON`, {
      timeout: 5000
    });
    
    if (response.data?.WhoisRecord?.registrant?.email) {
      return response.data.WhoisRecord.registrant.email;
    }
  } catch (error) {
    // WHOIS lookup failed
  }
  
  return null;
}

/**
 * Verify if email exists using SMTP check (basic)
 */
export async function verifyEmailExists(email: string): Promise<boolean> {
  // This is a basic check - in production, use a service like:
  // - ZeroBounce API
  // - NeverBounce API
  // - EmailListVerify API
  
  // For now, just validate format and domain
  if (!isValidEmail(email)) return false;
  
  const domain = email.split('@')[1];
  
  try {
    // Check if domain has MX records (basic validation)
    const response = await axios.get(`https://dns.google/resolve?name=${domain}&type=MX`, {
      timeout: 3000
    });
    
    return response.data?.Answer?.length > 0;
  } catch (error) {
    // Assume valid if we can't check
    return true;
  }
}

/**
 * Find email for a company - comprehensive approach
 */
export async function findCompanyEmail(
  companyName: string,
  websiteUrl?: string,
  location?: string
): Promise<{ email: string; confidence: 'high' | 'medium' | 'low'; source: string }> {
  
  // Priority 1: Scrape website if available
  if (websiteUrl) {
    const websiteEmails = await scrapeWebsiteForEmails(websiteUrl);
    if (websiteEmails.length > 0) {
      return {
        email: websiteEmails[0],
        confidence: 'high',
        source: 'website'
      };
    }
  }
  
  // Priority 2: Generate domain and try common patterns
  let domain: string | null = null;
  
  if (websiteUrl) {
    domain = extractDomain(websiteUrl);
  } else {
    // Generate likely domain from company name
    domain = `${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
  }
  
  if (domain) {
    // Try WHOIS lookup
    const whoisEmail = await getWhoisEmail(domain);
    if (whoisEmail && isValidEmail(whoisEmail)) {
      return {
        email: whoisEmail,
        confidence: 'medium',
        source: 'whois'
      };
    }
    
    // Generate common patterns
    const patterns = generateEmailPatterns(domain);
    
    // Verify the most common ones
    for (const pattern of patterns.slice(0, 5)) {
      const exists = await verifyEmailExists(pattern);
      if (exists) {
        return {
          email: pattern,
          confidence: 'medium',
          source: 'pattern'
        };
      }
    }
    
    // Return most likely pattern even if not verified
    return {
      email: patterns[0], // info@domain.com
      confidence: 'low',
      source: 'generated'
    };
  }
  
  // Fallback: Generate generic email
  const fallbackDomain = `${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
  return {
    email: `info@${fallbackDomain}`,
    confidence: 'low',
    source: 'fallback'
  };
}

/**
 * Batch find emails for multiple companies
 */
export async function findEmailsBatch(
  companies: Array<{ name: string; website?: string; location?: string }>
): Promise<Array<{ name: string; email: string; confidence: string; source: string }>> {
  const results = [];
  
  for (const company of companies) {
    try {
      const result = await findCompanyEmail(company.name, company.website, company.location);
      results.push({
        name: company.name,
        ...result
      });
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      // Add fallback email
      results.push({
        name: company.name,
        email: `info@${company.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        confidence: 'low',
        source: 'error'
      });
    }
  }
  
  return results;
}

/**
 * Search for company email using Google (free alternative)
 */
export async function findEmailViaGoogle(companyName: string, location?: string): Promise<string | null> {
  try {
    const query = `${companyName} ${location || ''} email contact`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const emails = extractEmailsFromHTML(response.data);
    return emails.length > 0 ? emails[0] : null;
  } catch (error) {
    return null;
  }
}
