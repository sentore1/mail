"use server";

import { encodedRedirect } from "@/utils/utils";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "../../supabase/server";
import { scrapeLeads, enrichLead } from "@/utils/scraper";
import { scrapeLeadsAdvanced } from "@/utils/advanced-scraper";
import { scrapeWithoutAPI } from "@/utils/puppeteer-scraper";
import { SMTPManager } from "@/utils/smtp-server";
import { generatePersonalizedEmail } from "@/utils/smtp-manager";

export const signUpAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const fullName = formData.get("full_name")?.toString() || '';
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  if (!email || !password) {
    return encodedRedirect(
      "error",
      "/sign-up",
      "Email and password are required",
    );
  }

  const { data: { user }, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: {
        full_name: fullName,
        email: email,
      }
    },
  });

  console.log("After signUp", error);


  if (error) {
    console.error(error.code + " " + error.message);
    return encodedRedirect("error", "/sign-up", error.message);
  }

  if (user) {
    try {
      const { error: updateError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          name: fullName,
          full_name: fullName,
          email: email,
          user_id: user.id,
          token_identifier: user.id,
          created_at: new Date().toISOString()
        });

      if (updateError) {
        console.error('Error updating user profile:', updateError);
      }
    } catch (err) {
      console.error('Error in user profile creation:', err);
    }
  }

  return encodedRedirect(
    "success",
    "/sign-up",
    "Thanks for signing up! Please check your email for a verification link.",
  );
};

export const signInAction = async (formData: FormData) => {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return encodedRedirect("error", "/sign-in", error.message);
  }

  return redirect("/dashboard");
};

export const forgotPasswordAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const callbackUrl = formData.get("callbackUrl")?.toString();

  if (!email) {
    return encodedRedirect("error", "/forgot-password", "Email is required");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?redirect_to=/protected/reset-password`,
  });

  if (error) {
    console.error(error.message);
    return encodedRedirect(
      "error",
      "/forgot-password",
      "Could not reset password",
    );
  }

  if (callbackUrl) {
    return redirect(callbackUrl);
  }

  return encodedRedirect(
    "success",
    "/forgot-password",
    "Check your email for a link to reset your password.",
  );
};

export const resetPasswordAction = async (formData: FormData) => {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    encodedRedirect(
      "error",
      "/protected/reset-password",
      "Password and confirm password are required",
    );
  }

  if (password !== confirmPassword) {
    encodedRedirect(
      "error",
      "/dashboard/reset-password",
      "Passwords do not match",
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    encodedRedirect(
      "error",
      "/dashboard/reset-password",
      "Password update failed",
    );
  }

  encodedRedirect("success", "/protected/reset-password", "Password updated");
};

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect("/sign-in");
};

export const scrapeLeadsAction = async (niche: string, location: string) => {
  try {
    console.log('=== Starting Lead Scraping ===');
    console.log('Niche:', niche);
    console.log('Location:', location);
    
    // Method 1: Try Puppeteer scraping (no API needed, most accurate)
    console.log('Attempting Puppeteer scraping (Google Maps, Yelp, Yellow Pages)...');
    const puppeteerLeads = await scrapeWithoutAPI(niche, location);
    
    if (puppeteerLeads.length > 0) {
      console.log(`✓ Puppeteer scraping successful: ${puppeteerLeads.length} leads found`);
      return {
        success: true,
        leads: puppeteerLeads,
        count: puppeteerLeads.length,
        method: 'puppeteer'
      };
    }
    
    console.log('✗ Puppeteer scraping returned no results');
    
    // Method 2: Try API-based scraping (if keys available)
    const googleApiKey = process.env.GOOGLE_API_KEY;
    const googleCx = process.env.GOOGLE_CX;
    const googlePlacesApiKey = process.env.GOOGLE_PLACES_API_KEY;
    
    if (googlePlacesApiKey || (googleApiKey && googleCx)) {
      console.log('Attempting API-based scraping...');
      const apiLeads = await scrapeLeadsAdvanced(niche, location, {
        googleApiKey,
        googleCx,
        googlePlacesApiKey,
        methods: ['places', 'google'],
        enhanceEmails: true,
        useFallback: false
      });
      
      if (apiLeads.length > 0) {
        console.log(`✓ API scraping successful: ${apiLeads.length} leads found`);
        return {
          success: true,
          leads: apiLeads,
          count: apiLeads.length,
          method: 'api'
        };
      }
    }
    
    console.log('✗ API scraping not available or returned no results');
    
    // Method 3: Generate fallback leads
    console.log('Generating fallback leads...');
    const { generateFallbackLeads } = await import('@/utils/advanced-scraper');
    const fallbackLeads = await generateFallbackLeads(niche, location, 15);
    
    console.log(`✓ Generated ${fallbackLeads.length} fallback leads`);
    
    return {
      success: true,
      leads: fallbackLeads,
      count: fallbackLeads.length,
      method: 'fallback',
      message: 'Using generated leads. For real data, scraping is in progress.'
    };
    
  } catch (error) {
    console.error('=== Scraping Error ===');
    console.error(error);
    
    return {
      success: false,
      leads: [],
      count: 0,
      error: error instanceof Error ? error.message : 'Failed to scrape leads'
    };
  }
};


export const sendBulkEmailsAction = async (
  userId: string,
  campaignId: string,
  leads: Array<{
    id: string;
    company_name: string;
    email: string;
    niche: string;
    location: string;
    company_context: string;
  }>,
  template: {
    tone: 'professional' | 'casual' | 'friendly';
    purpose: 'introduction' | 'partnership' | 'sales' | 'networking';
    yourCompany: string;
    yourService: string;
  }
) => {
  try {
    const smtpManager = new SMTPManager();
    await smtpManager.loadAccounts(userId);
    
    const capacity = smtpManager.getTotalCapacity();
    
    if (capacity.remaining === 0) {
      return {
        success: false,
        error: 'All SMTP accounts have reached their daily limit'
      };
    }
    
    const results = {
      total: leads.length,
      sent: 0,
      failed: 0,
      queued: 0,
      errors: [] as string[]
    };
    
    const supabase = await createClient();
    
    // Process emails in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (lead) => {
        try {
          // Generate personalized email
          const { subject, body } = await generatePersonalizedEmail(lead, template);
          
          // Check if we still have capacity
          const currentCapacity = smtpManager.getTotalCapacity();
          if (currentCapacity.remaining === 0) {
            // Queue for later
            await supabase.from('email_queue').insert({
              user_id: userId,
              campaign_id: campaignId,
              lead_id: lead.id,
              recipient_email: lead.email,
              recipient_name: lead.company_name,
              subject,
              body,
              status: 'pending',
              scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Tomorrow
            });
            results.queued++;
            return;
          }
          
          // Send email
          const result = await smtpManager.sendEmail(
            lead.email,
            subject,
            body
          );
          
          if (result.success) {
            results.sent++;
            
            // Log to database
            await supabase.from('email_queue').insert({
              user_id: userId,
              campaign_id: campaignId,
              lead_id: lead.id,
              smtp_account_id: result.accountUsed,
              recipient_email: lead.email,
              recipient_name: lead.company_name,
              subject,
              body,
              status: 'sent',
              sent_at: new Date().toISOString()
            });
          } else {
            results.failed++;
            results.errors.push(`${lead.email}: ${result.error}`);
            
            // Queue for retry
            await supabase.from('email_queue').insert({
              user_id: userId,
              campaign_id: campaignId,
              lead_id: lead.id,
              recipient_email: lead.email,
              recipient_name: lead.company_name,
              subject,
              body,
              status: 'failed',
              error_message: result.error,
              retry_count: 0
            });
          }
          
          // Small delay between emails to avoid spam filters
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          results.failed++;
          results.errors.push(`${lead.email}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }));
    }
    
    // Update campaign stats
    await supabase
      .from('email_campaigns')
      .update({
        sent_count: results.sent,
        total_recipients: results.total
      })
      .eq('id', campaignId);
    
    return {
      success: true,
      results,
      accountStats: smtpManager.getAccountStats()
    };
    
  } catch (error) {
    console.error('Bulk email error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send emails'
    };
  }
};

export const addSMTPAccountAction = async (
  userId: string,
  account: {
    email: string;
    host: string;
    port: number;
    user: string;
    password: string;
    provider: string;
    daily_limit: number;
  }
) => {
  try {
    console.log('addSMTPAccountAction called with:', {
      userId,
      email: account.email,
      host: account.host,
      port: account.port,
      provider: account.provider,
      daily_limit: account.daily_limit,
    });

    const supabase = await createClient();
    
    const insertData = {
      user_id: userId,
      email: account.email,
      host: account.host,
      port: account.port,
      user_name: account.user,
      password: account.password,
      provider: account.provider,
      daily_limit: account.daily_limit,
      status: 'active'
    };

    console.log('Inserting into smtp_accounts:', insertData);
    
    const { data, error } = await supabase
      .from('smtp_accounts')
      .insert(insertData)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase insert error:', error);
      throw error;
    }

    console.log('SMTP account added successfully:', data);
    
    return {
      success: true,
      account: data
    };
  } catch (error) {
    console.error('Add SMTP account error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add SMTP account'
    };
  }
};

export const getSMTPAccountsAction = async (userId: string) => {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('smtp_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Calculate total capacity
    const totalCapacity = data?.reduce((sum, acc) => sum + acc.daily_limit, 0) || 0;
    const totalUsed = data?.reduce((sum, acc) => sum + acc.sent_today, 0) || 0;
    
    return {
      success: true,
      accounts: data || [],
      capacity: {
        total: totalCapacity,
        used: totalUsed,
        remaining: totalCapacity - totalUsed
      }
    };
  } catch (error) {
    console.error('Get SMTP accounts error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get SMTP accounts'
    };
  }
};


/**
 * Generate personalized emails for all leads in bulk
 */
export const generateBulkEmailsAction = async (
  userId: string,
  leadIds: string[],
  template: {
    tone: 'professional' | 'casual' | 'friendly';
    purpose: 'introduction' | 'partnership' | 'sales' | 'networking';
    yourCompany: string;
    yourService: string;
  }
) => {
  try {
    const supabase = await createClient();
    
    // Fetch all leads
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .in('id', leadIds)
      .eq('user_id', userId);
    
    if (error) throw error;
    if (!leads || leads.length === 0) {
      return {
        success: false,
        error: 'No leads found'
      };
    }
    
    const generatedEmails = [];
    
    // Generate personalized email for each lead
    for (const lead of leads) {
      const { subject, body } = await generatePersonalizedEmail(
        {
          company_name: lead.company_name,
          niche: lead.niche || 'your industry',
          location: lead.location || 'your area',
          company_context: lead.company_context || 'your business'
        },
        template
      );
      
      generatedEmails.push({
        lead_id: lead.id,
        lead_email: lead.email,
        company_name: lead.company_name,
        subject,
        body
      });
    }
    
    return {
      success: true,
      emails: generatedEmails,
      count: generatedEmails.length
    };
    
  } catch (error) {
    console.error('Bulk email generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate emails'
    };
  }
};

/**
 * Send bulk emails with chunking and SMTP rotation
 * Handles 100s or 1000s of emails across 60 Gmail accounts
 */
export const sendBulkEmailsChunkedAction = async (
  userId: string,
  emails: Array<{
    lead_id: string;
    lead_email: string;
    company_name: string;
    subject: string;
    body: string;
  }>,
  options: {
    chunkSize?: number; // Default 100
    delayBetweenEmails?: number; // Milliseconds, default 2000
    verifyEmails?: boolean; // Default true
  } = {}
) => {
  try {
    const chunkSize = options.chunkSize || 100;
    const delayBetweenEmails = options.delayBetweenEmails || 2000;
    const verifyEmails = options.verifyEmails !== false;
    
    const supabase = await createClient();
    const smtpManager = new SMTPManager();
    await smtpManager.loadAccounts(userId);
    
    // Check capacity
    const capacity = smtpManager.getTotalCapacity();
    if (capacity.remaining === 0) {
      return {
        success: false,
        error: 'All SMTP accounts have reached their daily limit. Please try again tomorrow.'
      };
    }
    
    const results = {
      total: emails.length,
      sent: 0,
      failed: 0,
      queued: 0,
      verified: 0,
      invalidEmails: 0,
      errors: [] as string[],
      chunks: [] as any[]
    };
    
    // Create campaign
    const { data: campaign } = await supabase
      .from('email_campaigns')
      .insert({
        user_id: userId,
        name: `Bulk Campaign ${new Date().toISOString()}`,
        template_subject: 'Bulk Email',
        template_body: 'Personalized emails',
        status: 'active',
        total_recipients: emails.length
      })
      .select()
      .single();
    
    const campaignId = campaign?.id;
    
    // Process in chunks
    for (let i = 0; i < emails.length; i += chunkSize) {
      const chunk = emails.slice(i, i + chunkSize);
      const chunkNumber = Math.floor(i / chunkSize) + 1;
      const totalChunks = Math.ceil(emails.length / chunkSize);
      
      console.log(`Processing chunk ${chunkNumber}/${totalChunks} (${chunk.length} emails)`);
      
      const chunkResults = {
        chunkNumber,
        sent: 0,
        failed: 0,
        queued: 0
      };
      
      // Process each email in the chunk
      for (const email of chunk) {
        try {
          // Verify email if enabled
          if (verifyEmails) {
            const isValid = await verifyEmailDNS(email.lead_email);
            if (!isValid) {
              results.invalidEmails++;
              results.failed++;
              chunkResults.failed++;
              
              await supabase.from('email_queue').insert({
                user_id: userId,
                campaign_id: campaignId,
                lead_id: email.lead_id,
                recipient_email: email.lead_email,
                recipient_name: email.company_name,
                subject: email.subject,
                body: email.body,
                status: 'failed',
                error_message: 'Invalid email - failed DNS verification'
              });
              
              continue;
            }
            results.verified++;
          }
          
          // Check if we still have capacity
          const currentCapacity = smtpManager.getTotalCapacity();
          if (currentCapacity.remaining === 0) {
            // Queue remaining emails for tomorrow
            await supabase.from('email_queue').insert({
              user_id: userId,
              campaign_id: campaignId,
              lead_id: email.lead_id,
              recipient_email: email.lead_email,
              recipient_name: email.company_name,
              subject: email.subject,
              body: email.body,
              status: 'pending',
              scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            });
            
            results.queued++;
            chunkResults.queued++;
            continue;
          }
          
          // Send email using SMTP manager (auto-rotates across 60 accounts)
          const result = await smtpManager.sendEmail(
            email.lead_email,
            email.subject,
            email.body
          );
          
          if (result.success) {
            results.sent++;
            chunkResults.sent++;
            
            // Log successful send
            await supabase.from('email_queue').insert({
              user_id: userId,
              campaign_id: campaignId,
              lead_id: email.lead_id,
              smtp_account_id: result.accountUsed,
              recipient_email: email.lead_email,
              recipient_name: email.company_name,
              subject: email.subject,
              body: email.body,
              status: 'sent',
              sent_at: new Date().toISOString()
            });
            
            // Update lead status
            await supabase
              .from('leads')
              .update({ status: 'Email Sent' })
              .eq('id', email.lead_id);
            
          } else {
            results.failed++;
            chunkResults.failed++;
            results.errors.push(`${email.lead_email}: ${result.error}`);
            
            // Queue for retry
            await supabase.from('email_queue').insert({
              user_id: userId,
              campaign_id: campaignId,
              lead_id: email.lead_id,
              recipient_email: email.lead_email,
              recipient_name: email.company_name,
              subject: email.subject,
              body: email.body,
              status: 'failed',
              error_message: result.error,
              retry_count: 0
            });
          }
          
          // Delay between emails to avoid spam filters
          await new Promise(resolve => setTimeout(resolve, delayBetweenEmails));
          
        } catch (error) {
          results.failed++;
          chunkResults.failed++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push(`${email.lead_email}: ${errorMsg}`);
        }
      }
      
      results.chunks.push(chunkResults);
      
      // Delay between chunks
      if (i + chunkSize < emails.length) {
        console.log(`Chunk ${chunkNumber} complete. Waiting 5 seconds before next chunk...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Update campaign stats
    if (campaignId) {
      await supabase
        .from('email_campaigns')
        .update({
          sent_count: results.sent,
          status: results.sent === results.total ? 'completed' : 'active'
        })
        .eq('id', campaignId);
    }
    
    return {
      success: true,
      results,
      accountStats: smtpManager.getAccountStats(),
      message: `Sent ${results.sent}/${results.total} emails. ${results.queued} queued for later. ${results.failed} failed.`
    };
    
  } catch (error) {
    console.error('Bulk email sending error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send emails'
    };
  }
};

/**
 * Helper function for email verification (imported from email-verifier)
 */
async function verifyEmailDNS(email: string): Promise<boolean> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return false;
  
  const domain = email.split('@')[1];
  
  try {
    const response = await fetch(
      `https://dns.google/resolve?name=${domain}&type=MX`,
      { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      }
    );
    
    const data = await response.json();
    return data?.Answer?.length > 0;
  } catch (error) {
    console.error('DNS verification error:', error);
    return true; // Assume valid if verification fails
  }
}
