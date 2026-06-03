/**
 * Enhanced Email Sender with Follow-Up Scheduling
 *
 * Drop-in replacement for existing send functions.
 * Adds automatic thread creation and follow-up scheduling.
 */

import { createServiceClient } from "../../supabase/service";
import { SMTPManager } from "./smtp-server";
import { scheduleFollowUps } from "./followup-processor";

export interface SendEmailOptions {
  userId: string;
  leadId: string;
  campaignId?: string;
  toEmail: string;
  subject: string;
  body: string;
  htmlBody?: string;
  
  // Follow-up options
  scheduleFollowups?: boolean;
  fromName?: string;
}

export interface SendEmailResult {
  success: boolean;
  sentEmailId?: string;
  threadId?: string;
  messageId?: string;
  followupsScheduled?: number;
  error?: string;
  accountUsed?: string;
}

/**
 * Send email with automatic threading and follow-up scheduling
 */
export async function sendEmailWithFollowUps(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  const {
    userId,
    leadId,
    campaignId,
    toEmail,
    subject,
    body,
    htmlBody,
    scheduleFollowups = true,
    fromName,
  } = options;

  const supabase = createServiceClient();
  const smtpManager = new SMTPManager();

  try {
    // Load SMTP accounts
    await smtpManager.loadAccounts(userId);

    // Check capacity
    const capacity = smtpManager.getTotalCapacity();
    if (capacity.remaining === 0) {
      return {
        success: false,
        error: "All SMTP accounts at daily limit",
      };
    }

    // Send email via SMTP
    const sendResult = await smtpManager.sendEmail(
      toEmail,
      subject,
      htmlBody || body.replace(/\n/g, "<br>"),
      body
    );

    if (!sendResult.success) {
      return {
        success: false,
        error: sendResult.error,
      };
    }

    // Create or get email thread
    const { data: threadId, error: threadError } = await supabase.rpc(
      "get_or_create_thread",
      {
        p_user_id: userId,
        p_lead_id: leadId,
        p_campaign_id: campaignId || null,
        p_subject: subject,
        p_message_id: sendResult.messageId,
      }
    );

    if (threadError) {
      console.error("Thread creation error:", threadError);
      // Continue anyway - email was sent
    }

    // Save sent email record
    const { data: sentEmail, error: insertError } = await supabase
      .from("sent_emails")
      .insert({
        user_id: userId,
        lead_id: leadId,
        campaign_id: campaignId,
        email_thread_id: threadId,
        to_email: toEmail,
        from_email: sendResult.accountUsed,
        from_name: fromName,
        subject,
        body,
        message_id: sendResult.messageId,
        sent_at: new Date().toISOString(),
        is_followup: false,
        followup_number: 0,
        status: "sent",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to save sent email:", insertError);
      return {
        success: false,
        error: `Email sent but failed to save: ${insertError.message}`,
      };
    }

    // Update lead status
    await supabase
      .from("leads")
      .update({
        status: "Email Sent",
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    // Schedule follow-ups if enabled
    let followupsScheduled = 0;

    if (scheduleFollowups && threadId && campaignId) {
      try {
        followupsScheduled = await scheduleFollowUps(
          userId,
          sentEmail.id,
          threadId,
          leadId,
          campaignId,
          sendResult.messageId!
        );
      } catch (followupError) {
        console.error("Failed to schedule follow-ups:", followupError);
        // Don't fail the whole operation
      }
    }

    return {
      success: true,
      sentEmailId: sentEmail.id,
      threadId,
      messageId: sendResult.messageId,
      accountUsed: sendResult.accountUsed,
      followupsScheduled,
    };
  } catch (error) {
    console.error("Send email error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send bulk emails with follow-ups
 */
export async function sendBulkEmailsWithFollowUps(
  userId: string,
  leads: Array<{
    id: string;
    email: string;
    company_name?: string;
    [key: string]: any;
  }>,
  emailTemplate: {
    subject: string;
    body: string;
    htmlBody?: string;
  },
  campaignId?: string,
  options?: {
    scheduleFollowups?: boolean;
    fromName?: string;
    delayBetweenEmails?: number;
  }
): Promise<{
  total: number;
  sent: number;
  failed: number;
  results: SendEmailResult[];
}> {
  const results: SendEmailResult[] = [];
  let sent = 0;
  let failed = 0;

  for (const lead of leads) {
    // Personalize email
    let subject = emailTemplate.subject;
    let body = emailTemplate.body;
    let htmlBody = emailTemplate.htmlBody;

    Object.keys(lead).forEach((key) => {
      const value = lead[key] || "";
      subject = subject.replace(new RegExp(`{{${key}}}`, "g"), value);
      body = body.replace(new RegExp(`{{${key}}}`, "g"), value);
      if (htmlBody) {
        htmlBody = htmlBody.replace(new RegExp(`{{${key}}}`, "g"), value);
      }
    });

    const result = await sendEmailWithFollowUps({
      userId,
      leadId: lead.id,
      campaignId,
      toEmail: lead.email,
      subject,
      body,
      htmlBody,
      scheduleFollowups: options?.scheduleFollowups ?? true,
      fromName: options?.fromName,
    });

    results.push(result);

    if (result.success) {
      sent++;
    } else {
      failed++;
    }

    // Delay between sends (anti-spam)
    if (options?.delayBetweenEmails) {
      await new Promise((resolve) =>
        setTimeout(resolve, options.delayBetweenEmails)
      );
    } else {
      await new Promise((resolve) =>
        setTimeout(resolve, 2000 + Math.random() * 1000)
      );
    }
  }

  return {
    total: leads.length,
    sent,
    failed,
    results,
  };
}
