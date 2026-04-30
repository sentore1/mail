/**
 * Lead Scraping Utilities
 * Provides multiple methods for scraping business leads based on niche and location
 */

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
 * Extract email addresses from text using regex
 */
export function extractEmails(text: string): string[] {
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
  const matches = text.match(emailRegex);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Scrape leads using Google Custom Search API
 */
export async function scrapeWithGoogleSearch(
  niche: string,
  location: string,
  apiKey: string,
  cx: string
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];
  
  try {
    // Build search query for better results
    const searchQueries = [
      `${niche} ${location} email contact`,
      `${niche} companies in ${location}`,
      `${niche} businesses ${location} contact information`
    ];
    
    for (const query of searchQueries) {
      const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=10`;
      
      const response = await fetch(searchUrl);
      const data = await response.json();
      
      if (data.items) {
        for (const item of data.items) {
          const emails = extractEmails(item.snippet || '');
          
          if (emails.length > 0) {
            leads.push({
              company_name: item.title?.split('-')[0]?.split('|')[0]?.trim() || 'Unknown Company',
              email: emails[0],
              niche: niche,
              location: location,
              company_context: item.snippet || 'No description available',
              source_url: item.link,
              website: item.link
            });
          }
        }
      }
      
      // Avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.error('Google Search scraping error:', error);
  }
  
  return leads;
}

/**
 * Scrape leads using Google Places API
 */
export async function scrapeWithGooglePlaces(
  niche: string,
  location: string,
  apiKey: string
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];
  
  try {
    // Search for places
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(niche + ' in ' + location)}&key=${apiKey}`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    
    if (searchData.results && searchData.results.length > 0) {
      // Get details for each place
      for (const place of searchData.results.slice(0, 15)) {
        try {
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,website,formatted_phone_number,business_status,rating,user_ratings_total&key=${apiKey}`;
          const detailsResponse = await fetch(detailsUrl);
          const detailsData = await detailsResponse.json();
          
          if (detailsData.result && detailsData.result.business_status === 'OPERATIONAL') {
            const result = detailsData.result;
            let email = null;
            
            // Try to extract email from website
            if (result.website) {
              try {
                const websiteResponse = await fetch(result.website, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                  }
                });
                const websiteHtml = await websiteResponse.text();
                const emails = extractEmails(websiteHtml);
                email = emails[0] || null;
              } catch (e) {
                // Website fetch failed, continue without email
              }
            }
            
            // Generate a likely email if we couldn't find one
            if (!email && result.name) {
              const domain = result.website 
                ? new URL(result.website).hostname.replace('www.', '')
                : `${result.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
              email = `info@${domain}`;
            }
            
            leads.push({
              company_name: result.name,
              email: email || `contact@${result.name.toLowerCase().replace(/\s+/g, '')}.com`,
              niche: niche,
              location: result.formatted_address || location,
              company_context: `${result.name} is a ${niche} business located at ${result.formatted_address || location}. ${result.rating ? `Rating: ${result.rating}/5 (${result.user_ratings_total} reviews)` : ''}`,
              source_url: result.website || null,
              phone: result.formatted_phone_number || undefined,
              website: result.website || undefined
            });
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.error('Error fetching place details:', error);
        }
      }
    }
  } catch (error) {
    console.error('Google Places scraping error:', error);
  }
  
  return leads;
}

/**
 * Scrape leads from LinkedIn (requires LinkedIn API access)
 */
export async function scrapeWithLinkedIn(
  niche: string,
  location: string,
  accessToken: string
): Promise<ScrapedLead[]> {
  // This would require LinkedIn API credentials and proper OAuth flow
  // Placeholder for future implementation
  return [];
}

/**
 * Main scraping function that tries multiple sources
 */
export async function scrapeLeads(
  niche: string,
  location: string,
  options: {
    googleApiKey?: string;
    googleCx?: string;
    googlePlacesApiKey?: string;
    linkedInToken?: string;
  }
): Promise<ScrapedLead[]> {
  let allLeads: ScrapedLead[] = [];
  
  // Try Google Places first (usually best for local businesses)
  if (options.googlePlacesApiKey) {
    const placesLeads = await scrapeWithGooglePlaces(niche, location, options.googlePlacesApiKey);
    allLeads = [...allLeads, ...placesLeads];
  }
  
  // Try Google Custom Search if we need more results
  if (allLeads.length < 10 && options.googleApiKey && options.googleCx) {
    const searchLeads = await scrapeWithGoogleSearch(niche, location, options.googleApiKey, options.googleCx);
    allLeads = [...allLeads, ...searchLeads];
  }
  
  // Remove duplicates based on email
  const uniqueLeads = allLeads.filter((lead, index, self) =>
    index === self.findIndex((l) => l.email === lead.email)
  );
  
  return uniqueLeads;
}

/**
 * Validate and enrich lead data
 */
export function enrichLead(lead: ScrapedLead): ScrapedLead {
  // Clean up company name
  lead.company_name = lead.company_name
    .replace(/\s*-\s*.*$/, '') // Remove everything after dash
    .replace(/\s*\|.*$/, '')   // Remove everything after pipe
    .trim();
  
  // Validate email format
  const emailRegex = /^[\w.-]+@[\w.-]+\.\w+$/;
  if (!emailRegex.test(lead.email)) {
    lead.email = `info@${lead.company_name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
  }
  
  return lead;
}
