/**
 * Follow-Up Processor
 *
 * Core engine that processes scheduled follow-ups:
 * - Fetches due follow-ups from queue
 * - Generates AI content if needed
 * - Sends via SMTP with proper threading
 * - Updates all related records
 * - Schedules next follow-up
 *
 * Production-ready with:
 * - Rate limiting
 * - Retry logic
 * - Error handling
 * - Thread safety
 */

import { createServiceClient } from "../../supabase/service";
import { SMTPManager } from "./smtp-server";
import { generateFollowUp, type FollowUpContext, type FollowUpStyle } from "./ai-followup-generator";
import { v4 as uuidv4 } from "uuid";

export interface FollowUpProcessResult {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * Calculate next follow-up time based on sequence settings
 */
function calculateNextFollowupTime(
  delayDays: number,
  delayHours: number = 0,
  businessDaysOnly: boolean = true,
  sendWindowStart: string = "09:00",
  sendWindowEnd: string = "17:00",
  randomDelayMinutes: number = 30,
  timezone: string = "UTC"
): Date {
  let next = new Date();
  
  // Add base delay
  next.setDate(next.getDate() + delayDays);
  next.setHours(next.getHours() + delayHours);

  // Skip weekends if business days only
  if (businessDaysOnly) {
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
  }

  // Apply sending window
  const [startHour, startMin] = sendWindowStart.split(":").map(Number);
  const [endHour, endMin] = sendWindowEnd.split(":").map(Number);

  const hour = next.getHours();
  const minute = next.getMinutes();

  if (hour < startHour || (hour === startHour && minute < startMin)) {
    // Before window - move to window start
    next.setHours(startHour, startMin, 0, 0);
  } else if (hour > endHour || (hour === endHour && minute > endMin)) {
    // After window - move to next day window start
    next.setDate(next.getDate() + 1);
    next.setHours(startHour, startMin, 0, 0);
    
    if (businessDaysOnly) {
      while (next.getDay() === 0 || next.getDay() === 6) {
        next.setDate(next.getDate() + 1);
      }
    }
  }

  // Add random delay (anti-spam)
  if (randomDelayMinutes > 0) {
    const randomMinutes = Math.floor(Math.random() * randomDelayMinutes);
    next.setMinutes(next.getMinutes() + randomMinutes);
  }

  return next;
}

/**
 * Process a single follow-up from the queue
 */
async function processSingleFollowup(
  queueItem: any,
  smtpManager: SMTPManager
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();

  try {
    // Mark as processing
    await supabase
      .from("followup_queue")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", queueItem.queue_id);

    let subject = queueItem.subject;
    let body = queueItem.body;
    let style = queueItem.style || "professional";
    let modelUsed = "template";

    // Generate AI content if needed
    if (!subject || !body || queueItem.ai_generated === false) {
      const aiSettings = queueItem.ai_enabled !== false;

      if (aiSettings) {
        // Build context from available data
        const previousFollowups = await supabase
          .from("sent_emails")
          .select("subject, body, sent_at")
          .eq("email_thread_id", queueItem.thread_id)
          .eq("is_followup", true)
          .order("sent_at", { ascending: true })
          .limit(10);

        const context: FollowUpContext = {
          companyName: queueItem.company_name || "there",
          niche: queueItem.niche,
          location: queueItem.location,
          companyContext: queueItem.company_context,
          originalSubject: queueItem.original_subject,
          originalBody: queueItem.original_body || "",
          sentAt: queueItem.original_sent_at,
          followupNumber: queueItem.followup_number,
          previousFollowups: previousFollowups.data || [],
          openCount: queueItem.lead_opens || 0,
          clickCount: queueItem.lead_clicks || 0,
          hasReplied: false,
          yourCompany: queueItem.your_company || "our company",
          yourService: queueItem.your_service || "our service",
          style: style as FollowUpStyle,
        };

        const generated = await generateFollowUp(queueItem.user_id, context);

        subject = generated.subject;
        body = generated.body;
        style = generated.style;
        modelUsed = generated.modelUsed;

        // Log generation
        await supabase.from("ai_generations").insert({
          user_id: queueItem.user_id,
          lead_id: queueItem.lead_id,
          followup_queue_id: queueItem.queue_id,
          type: "followup",
          input_context: context,
          subject,
          body,
          style,
          model_used: modelUsed,
          decision_reason: generated.decisionReason,
          status: "generated",
        });
      } else {
        // Use template fallback
        subject = `Re: ${queueItem.original_subject}`;
        body = `Hi ${queueItem.company_name || "there"},\n\nJust following up on my previous email.\n\nWould you be interested in learning more?\n\nBest regards`;
      }
    }

    // Build threading headers
    const references = queueItem.original_references
      ? `${queueItem.original_references} ${queueItem.original_message_id}`
      : queueItem.original_message_id;

    // Send via SMTP
    const sendResult = await smtpManager.sendEmail(
      queueItem.lead_email,
      subject,
      body,
      body.replace(/\n/g, "<br>"),
      {
        inReplyTo: queueItem.original_message_id,
        references,
      }
    );

    if (!sendResult.success) {
      throw new Error(sendResult.error || "SMTP send failed");
    }

    // Record sent email
    const { data: sentEmail, error: insertError } = await supabase
      .from("sent_emails")
      .insert({
        user_id: queueItem.user_id,
        lead_id: queueItem.lead_id,
        campaign_id: queueItem.campaign_id,
        email_thread_id: queueItem.thread_id,
        to_email: queueItem.lead_email,
        from_email: sendResult.accountUsed,
        subject,
        body,
        message_id: sendResult.messageId,
        in_reply_to: queueItem.original_message_id,
        references_header: references,
        smtp_account_id: queueItem.smtp_account_id,
        sent_at: new Date().toISOString(),
        is_followup: true,
        followup_number: queueItem.followup_number,
        parent_email_id: queueItem.sent_email_id,
        ai_generated: modelUsed !== "template",
        style,
        status: "sent",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Mark queue item as sent
    await supabase
      .from("followup_queue")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        message_id: sendResult.messageId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", queueItem.queue_id);

    // Update lead
    await supabase
      .from("leads")
      .update({
        status: "Email Sent",
        followup_count: queueItem.followup_number,
        last_followup_at: new Date().toISOString(),
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", queueItem.lead_id);

    // Schedule next follow-up if within limit
    const maxFollowups = queueItem.max_followups || 5;
    const nextFollowupNumber = queueItem.followup_number + 1;

    if (nextFollowupNumber <= maxFollowups) {
      // Get sequence settings for next follow-up
      const { data: nextSequence } = await supabase
        .from("campaign_sequences")
        .select("*")
        .eq("campaign_id", queueItem.campaign_id)
        .eq("sequence_number", nextFollowupNumber)
        .eq("is_active", true)
        .single();

      if (nextSequence) {
        const nextScheduledAt = calculateNextFollowupTime(
          nextSequence.delay_days,
          nextSequence.delay_hours || 0,
          nextSequence.business_days_only,
          nextSequence.send_window_start,
          nextSequence.send_window_end,
          nextSequence.random_delay_minutes,
          nextSequence.timezone
        );

        await supabase.from("followup_queue").insert({
          user_id: queueItem.user_id,
          thread_id: queueItem.thread_id,
          sent_email_id: sentEmail.id,
          lead_id: queueItem.lead_id,
          campaign_id: queueItem.campaign_id,
          sequence_id: nextSequence.id,
          followup_number: nextFollowupNumber,
          scheduled_at: nextScheduledAt.toISOString(),
          status: "pending",
          subject: nextSequence.subject_template,
          body: nextSequence.body_template,
          ai_generated: false,
          style: nextSequence.style,
        });

        await supabase
          .from("leads")
          .update({ next_followup_at: nextScheduledAt.toISOString() })
          .eq("id", queueItem.lead_id);
      }
    }

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Update queue with error
    const retryCount = (queueItem.retry_count || 0) + 1;
    const maxRetries = 3;

    await supabase
      .from("followup_queue")
      .update({
        status: retryCount >= maxRetries ? "failed" : "pending",
        error_message: errorMsg,
        retry_count: retryCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", queueItem.queue_id);

    return { success: false, error: errorMsg };
  }
}

/**
 * Main processor — fetches and sends all due follow-ups
 */
export async function processFollowUps(
  userId: string,
  batchSize: number = 20
): Promise<FollowUpProcessResult> {
  const supabase = createServiceClient();
  const result: FollowUpProcessResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // Load SMTP accounts
  const smtpManager = new SMTPManager();
  await smtpManager.loadAccounts(userId);

  const capacity = smtpManager.getTotalCapacity();
  if (capacity.remaining === 0) {
    result.errors.push("All SMTP accounts at daily limit");
    return result;
  }

  // Fetch due follow-ups via view
  const { data: dueFollowups, error } = await supabase
    .from("followup_due")
    .select("*")
    .eq("user_id", userId)
    .limit(Math.min(batchSize, capacity.remaining));

  if (error) {
    result.errors.push(`Failed to fetch due follow-ups: ${error.message}`);
    return result;
  }

  if (!dueFollowups || dueFollowups.length === 0) {
    return result;
  }

  result.processed = dueFollowups.length;

  // Process each follow-up
  for (const item of dueFollowups) {
    // Check stop conditions
    if (item.followup_stopped || item.lead_status === "Replied" || item.thread_status !== "active") {
      result.skipped++;

      await supabase
        .from("followup_queue")
        .update({
          status: "skipped",
          skip_reason: "stop_condition_met",
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.queue_id);

      continue;
    }

    const { success, error: sendError } = await processSingleFollowup(item, smtpManager);

    if (success) {
      result.sent++;
    } else {
      result.failed++;
      if (sendError) result.errors.push(sendError);
    }

    // Rate limiting — small delay between sends
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1000));
  }

  return result;
}

/**
 * Schedule follow-ups for a newly sent initial email
 */
export async function scheduleFollowUps(
  userId: string,
  sentEmailId: string,
  threadId: string,
  leadId: string,
  campaignId: string,
  messageId: string
): Promise<number> {
  const supabase = createServiceClient();

  // Get campaign sequences
  const { data: sequences } = await supabase
    .from("campaign_sequences")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("is_active", true)
    .order("sequence_number", { ascending: true });

  if (!sequences || sequences.length === 0) return 0;

  // Get follow-up settings
  const { data: settings } = await supabase
    .from("campaign_followup_settings")
    .select("*")
    .eq("campaign_id", campaignId)
    .single();

  const maxFollowups = settings?.max_followups || sequences.length;

  let scheduledCount = 0;
  let cumulativeDays = 0;

  for (const seq of sequences.slice(0, maxFollowups)) {
    cumulativeDays += seq.delay_days;

    const scheduledAt = calculateNextFollowupTime(
      cumulativeDays,
      seq.delay_hours || 0,
      seq.business_days_only !== false,
      seq.send_window_start || "09:00",
      seq.send_window_end || "17:00",
      seq.random_delay_minutes || 30
    );

    await supabase.from("followup_queue").insert({
      user_id: userId,
      thread_id: threadId,
      sent_email_id: sentEmailId,
      lead_id: leadId,
      campaign_id: campaignId,
      sequence_id: seq.id,
      followup_number: seq.sequence_number,
      scheduled_at: scheduledAt.toISOString(),
      status: "pending",
      subject: seq.subject_template,
      body: seq.body_template,
      ai_generated: false,
      style: seq.style,
    });

    scheduledCount++;
  }

  // Update lead with next follow-up date
  if (scheduledCount > 0) {
    const { data: firstInQueue } = await supabase
      .from("followup_queue")
      .select("scheduled_at")
      .eq("thread_id", threadId)
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .single();

    if (firstInQueue) {
      await supabase
        .from("leads")
        .update({ next_followup_at: firstInQueue.scheduled_at })
        .eq("id", leadId);
    }
  }

  return scheduledCount;
}

/**
 * Pause all pending follow-ups for a lead
 */
export async function pauseFollowUps(
  userId: string,
  leadId: string
): Promise<number> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("followup_queue")
    .update({ status: "cancelled", skip_reason: "paused_by_user" })
    .eq("user_id", userId)
    .eq("lead_id", leadId)
    .eq("status", "pending")
    .select("id");

  return data?.length || 0;
}

/**
 * Stop all follow-ups and mark lead as complete
 */
export async function stopFollowUps(
  userId: string,
  leadId: string,
  reason: string = "manual_stop"
): Promise<void> {
  const supabase = createServiceClient();

  // Get thread for this lead
  const { data: thread } = await supabase
    .from("email_threads")
    .select("id")
    .eq("user_id", userId)
    .eq("lead_id", leadId)
    .limit(1)
    .single();

  if (thread) {
    await supabase.rpc("stop_followups_for_thread", {
      p_thread_id: thread.id,
      p_reason: reason,
    });
  }

  await supabase
    .from("leads")
    .update({
      followup_stopped: true,
      stop_reason: reason,
      status: "CLOSED_NO_REPLY",
    })
    .eq("id", leadId)
    .eq("user_id", userId);
}

/**
 * Get detailed status of follow-ups for a lead
 */
export async function getLeadFollowUpStatus(
  userId: string,
  leadId: string
): Promise<{
  thread: any;
  sentEmails: any[];
  pendingFollowups: any[];
  replies: any[];
}> {
  const supabase = createServiceClient();

  const [threadRes, emailsRes, queueRes, repliesRes] = await Promise.all([
    supabase
      .from("email_threads")
      .select("*")
      .eq("user_id", userId)
      .eq("lead_id", leadId)
      .single(),

    supabase
      .from("sent_emails")
      .select("*")
      .eq("user_id", userId)
      .eq("lead_id", leadId)
      .order("sent_at", { ascending: true }),

    supabase
      .from("followup_queue")
      .select("*")
      .eq("user_id", userId)
      .eq("lead_id", leadId)
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true }),

    supabase
      .from("email_replies")
      .select("*")
      .eq("user_id", userId)
      .eq("lead_id", leadId)
      .order("received_at", { ascending: true }),
  ]);

  return {
    thread: threadRes.data,
    sentEmails: emailsRes.data || [],
    pendingFollowups: queueRes.data || [],
    replies: repliesRes.data || [],
  };
}
