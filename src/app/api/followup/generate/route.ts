/**
 * API Route: Generate AI Follow-Up
 * POST /api/followup/generate
 *
 * Generates a follow-up email using AI based on context.
 * Supports regeneration with different styles.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";
import {
  generateFollowUp,
  decideFollowUpStyle,
  type FollowUpContext,
  type FollowUpStyle,
  type FollowUpTone,
} from "@/utils/ai-followup-generator";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      sentEmailId,
      leadId,
      followupNumber = 1,
      style,
      tone,
      overrideContext,
    } = body;

    const serviceClient = createServiceClient();

    // Fetch sent email + lead + thread data
    const { data: sentEmail } = await serviceClient
      .from("sent_emails")
      .select("*, leads(*), email_threads(*)")
      .eq("id", sentEmailId)
      .eq("user_id", user.id)
      .single();

    if (!sentEmail) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    // Fetch the original (first non-followup) email for this lead — this is what the AI must reference
    // If sentEmailId points to a follow-up, trace back to the original
    let originalEmail = sentEmail;
    if ((sentEmail as any).is_followup && (sentEmail as any).parent_email_id) {
      const { data: parentEmail } = await serviceClient
        .from("sent_emails")
        .select("*")
        .eq("id", (sentEmail as any).parent_email_id)
        .single();
      if (parentEmail) originalEmail = parentEmail;
    }
    // If still a follow-up (parent not found or parent is also a FU), find the oldest email to this lead
    if ((originalEmail as any).is_followup) {
      const { data: firstEmail } = await serviceClient
        .from("sent_emails")
        .select("*")
        .eq("user_id", user.id)
        .eq("lead_id", (sentEmail as any).lead_id || leadId)
        .eq("is_followup", false)
        .order("sent_at", { ascending: true })
        .limit(1)
        .single();
      if (firstEmail) originalEmail = firstEmail;
    }

    const lead = (sentEmail as any).leads as any;

    // Get ALL previous emails (original + all follow-ups) for full context
    const { data: prevFollowups } = await serviceClient
      .from("sent_emails")
      .select("subject, body, sent_at, is_followup, followup_number")
      .eq("user_id", user.id)
      .eq("lead_id", (sentEmail as any).lead_id || leadId)
      .eq("is_followup", true)
      .order("sent_at", { ascending: true })
      .limit(10);

    // Get user follow-up settings
    const { data: settings } = await serviceClient
      .from("followup_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    const context: FollowUpContext = {
      companyName: lead?.company_name || "there",
      niche: lead?.niche,
      location: lead?.location,
      companyContext: lead?.company_context,
      originalSubject: (originalEmail as any).subject || sentEmail.subject || "",
      originalBody: (originalEmail as any).body || sentEmail.body || "",
      sentAt: (originalEmail as any).sent_at || sentEmail.sent_at,
      followupNumber,
      previousFollowups: prevFollowups || [],
      openCount: lead?.open_count || 0,
      clickCount: lead?.click_count || 0,
      hasReplied: false,
      yourCompany: settings?.your_company || overrideContext?.yourCompany || "",
      yourService: settings?.your_service || overrideContext?.yourService || "",
      senderName: overrideContext?.senderName || settings?.your_company || "",
      contactName: lead?.contact_name || lead?.owner_name || undefined,
      style: style as FollowUpStyle | undefined,
      tone: tone as FollowUpTone | undefined,
      ...overrideContext,
      // Ensure leadEmail is always available for name derivation
      leadEmail: lead?.email || undefined,
    } as FollowUpContext & { leadEmail?: string };

    // Get decision engine recommendation
    const decision = decideFollowUpStyle(context);

    const generated = await generateFollowUp(user.id, context);

    // Save generation to log
    await serviceClient.from("ai_generations").insert({
      user_id: user.id,
      lead_id: leadId,
      sent_email_id: sentEmailId,
      type: "followup",
      input_context: context,
      subject: generated.subject,
      body: generated.body,
      style: generated.style,
      model_used: generated.modelUsed,
      decision_reason: generated.decisionReason,
      engagement_signals: {
        opens: lead?.open_count || 0,
        clicks: lead?.click_count || 0,
      },
      status: "generated",
    });

    return NextResponse.json({
      success: true,
      subject: generated.subject,
      body: generated.body,
      style: generated.style,
      modelUsed: generated.modelUsed,
      decisionReason: generated.decisionReason,
      aiDecision: {
        recommended: decision.style,
        reason: decision.reason,
        followupNumber,
      },
    });
  } catch (error) {
    console.error("[followup/generate] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate" },
      { status: 500 }
    );
  }
}
