/**
 * POST /api/followup/mark-sent
 *
 * Called after a manual follow-up email is successfully sent.
 * Updates followup_queue, leads, and schedules the next stage.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { leadId, followupNumber, sentEmailId, threadId, subject, body, companyName, leadEmail } =
    await req.json() as {
      leadId: string;
      followupNumber: number;
      sentEmailId: string;
      threadId?: string;
      subject: string;
      body: string;
      companyName?: string;
      leadEmail?: string;
    };

  const service = createServiceClient();

  try {
    // 1. Mark the matching followup_queue row as sent
    await service
      .from("followup_queue")
      .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("lead_id", leadId)
      .eq("followup_number", followupNumber)
      .eq("status", "pending");

    // 2. Update lead
    await service
      .from("leads")
      .update({
        last_contacted_at:  new Date().toISOString(),
        followup_count:     followupNumber,
        status:             "Email Sent",
        next_followup_at:   new Date(Date.now() + 3 * 86_400_000).toISOString(),
        updated_at:         new Date().toISOString(),
      })
      .eq("id", leadId)
      .eq("user_id", user.id);

    // 3. Schedule next stage (followupNumber + 1) if within limit
    const { data: settings } = await service
      .from("followup_settings")
      .select("max_followups")
      .eq("user_id", user.id)
      .maybeSingle();

    const maxFollowups = settings?.max_followups ?? 3;
    const nextNumber = followupNumber + 1;

    if (nextNumber <= maxFollowups && threadId) {
      const nextScheduled = new Date(Date.now() + 3 * 86_400_000);
      // Skip weekends
      while (nextScheduled.getDay() === 0 || nextScheduled.getDay() === 6) {
        nextScheduled.setDate(nextScheduled.getDate() + 1);
      }

      // Only insert if no pending row already exists for this stage
      const { data: existing } = await service
        .from("followup_queue")
        .select("id")
        .eq("user_id", user.id)
        .eq("lead_id", leadId)
        .eq("followup_number", nextNumber)
        .eq("status", "pending")
        .maybeSingle();

      if (!existing) {
        await service.from("followup_queue").insert({
          user_id:          user.id,
          lead_id:          leadId,
          thread_id:        threadId,
          sent_email_id:    sentEmailId,
          followup_number:  nextNumber,
          scheduled_at:     nextScheduled.toISOString(),
          status:           "pending",
          ai_generated:     false,
        });
      }
    }

    // 4. Log in followup_activity_log (non-fatal — table may not exist yet)
    try {
      await service.from("followup_activity_log").insert({
        user_id:         user.id,
        lead_id:         leadId,
        company_name:    companyName ?? null,
        email:           leadEmail ?? null,
        followup_number: followupNumber,
        subject,
        body,
        status:          "sent",
        is_auto:         false,
        sent_at:         new Date().toISOString(),
      });
    } catch {
      // Non-fatal — activity log table may not exist yet
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[followup/mark-sent]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
