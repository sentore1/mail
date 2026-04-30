/**
 * Email Verification Utilities
 * Free methods to verify email addresses
 */

import axios from 'axios';

export interface EmailVerificationResult {
  email: string;
  isValid: boolean;
  isDeliverable: boolean;
  isCatchAll: boolean;
  isDisposable: boolean;
  score: number; // 0-100, higher is better
  reason?: string;
}

/**
 * Disposable email domains to filter out
 */
const DISPOSABLE_DOMAINS = [
  'tempmail.com', 'guerrillamail.com', '10minutemail.com', 'mailinator.com',
  'throwaway.email', 'temp-mail.org', 'fakeinbox.com', 'trashmail.com'
];

/**
 * Check if email format is valid
 */
export function isValidEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check if domain is disposable
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return DISPOSABLE_DOMAINS.some(d => domain?.includes(d));
}

/**
 * Verify email using DNS MX record check (free)
 */
export async function verifyEmailDNS(email: string): Promise<boolean> {
  if (!isValidEmailFormat(email)) return false;
  
  const domain = email.split('@')[1];
  
  try {
    // Use Google DNS API to check MX records
    const response = await axios.get(
      `https://dns.google/resolve?name=${domain}&type=MX`,
      { timeout: 5000 }
    );
    
    return response.data?.Answer?.length > 0;
  } catch (error) {
    console.error('DNS verification error:', error);
    return false;
  }
}

/**
 * Verify email using multiple free APIs
 */
export async function verifyEmailWithAPI(email: string): Promise<EmailVerificationResult> {
  const result: EmailVerificationResult = {
    email,
    isValid: false,
    isDeliverable: false,
    isCatchAll: false,
    isDisposable: false,
    score: 0
  };
  
  // Step 1: Format validation
  if (!isValidEmailFormat(email)) {
    result.reason = 'Invalid email format';
    return result;
  }
  result.isValid = true;
  result.score += 20;
  
  // Step 2: Disposable check
  if (isDisposableEmail(email)) {
    result.isDisposable = true;
    result.reason = 'Disposable email address';
    result.score = 0;
    return result;
  }
  result.score += 20;
  
  // Step 3: DNS MX record check
  const hasMX = await verifyEmailDNS(email);
  if (!hasMX) {
    result.reason = 'No MX records found';
    return result;
  }
  result.isDeliverable = true;
  result.score += 30;
  
  // Step 4: Try free verification APIs
  try {
    // Method 1: EmailListVerify (free tier available)
    const apiKey = process.env.EMAIL_VERIFY_API_KEY;
    if (apiKey) {
      const response = await axios.get(
        `https://apps.emaillistverify.com/api/verifyEmail?secret=${apiKey}&email=${email}`,
        { timeout: 5000 }
      );
      
      if (response.data) {
        if (response.data.status === 'ok') {
          result.score = 100;
        } else if (response.data.status === 'catch_all') {
          result.isCatchAll = true;
          result.score = 70;
        }
      }
    }
  } catch (error) {
    // API failed, use DNS result
  }
  
  // Step 5: Pattern analysis
  const localPart = email.split('@')[0];
  
  // Common valid patterns
  if (localPart.match(/^(info|contact|hello|sales|support|admin)$/)) {
    result.score = Math.max(result.score, 80);
  }
  
  // Suspicious patterns
  if (localPart.match(/^(test|fake|spam|noreply|no-reply)$/)) {
    result.score = Math.min(result.score, 30);
    result.reason = 'Suspicious email pattern';
  }
  
  return result;
}

/**
 * Batch verify emails
 */
export async function verifyEmailsBatch(
  emails: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<EmailVerificationResult[]> {
  const results: EmailVerificationResult[] = [];
  const batchSize = 10;
  
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(email => verifyEmailWithAPI(email))
    );
    
    results.push(...batchResults);
    
    if (onProgress) {
      onProgress(Math.min(i + batchSize, emails.length), emails.length);
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
}

/**
 * Filter leads by email quality
 */
export function filterLeadsByEmailQuality(
  leads: Array<{ email: string; [key: string]: any }>,
  verificationResults: EmailVerificationResult[],
  minScore: number = 50
): Array<{ email: string; [key: string]: any }> {
  const emailScoreMap = new Map(
    verificationResults.map(r => [r.email, r.score])
  );
  
  return leads.filter(lead => {
    const score = emailScoreMap.get(lead.email) || 0;
    return score >= minScore;
  });
}

/**
 * Quick email validation (synchronous, no API calls)
 */
export function quickValidateEmail(email: string): {
  isValid: boolean;
  score: number;
  reason?: string;
} {
  let score = 0;
  
  // Format check
  if (!isValidEmailFormat(email)) {
    return { isValid: false, score: 0, reason: 'Invalid format' };
  }
  score += 30;
  
  // Disposable check
  if (isDisposableEmail(email)) {
    return { isValid: false, score: 0, reason: 'Disposable email' };
  }
  score += 20;
  
  const [localPart, domain] = email.split('@');
  
  // Domain checks
  if (domain.includes('.')) {
    score += 20;
  }
  
  // Common business patterns
  if (localPart.match(/^(info|contact|hello|sales|support|admin|office)$/)) {
    score += 30;
  } else if (localPart.includes('.') || localPart.includes('_')) {
    score += 20; // Likely personal email
  }
  
  // Suspicious patterns
  if (localPart.match(/^(test|fake|spam|noreply|no-reply|donotreply)$/)) {
    return { isValid: false, score: 10, reason: 'Suspicious pattern' };
  }
  
  return { isValid: true, score };
}
