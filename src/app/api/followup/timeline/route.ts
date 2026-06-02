/**
 * API Route: Get Lead Timeline
 * GET /api/followup/timeline?leadId=xxx
 *
 * Returns complete activity timeline for a lead.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "../../../../../supabase/server";
import { getLeadFollowUpStatus } from "@/utils/followup-processor";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const leadId = searchParams.get("leadId");

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    const status = await getLeadFollowUpStatus(user.id, leadId);

    // Build timeline events
    const timeline = [];

    // Sent emails
    for (const email of status.sentEmails) {
      timeline.push({
        type: email.is_followup ? "followup_sent" : "initial_email_sent",
        timestamp: email.sent_at,
        subject: email.subject,
        followupNumber: email.followup_number,
        opened: !!email.opened_at,
        clicked: !!email.clicked_at,
        replied: !!email.replied_at,
        aiGenerated: email.ai_generated,
        style: email.style,
        messageId: email.message_id,
      });

      if (email.opened_at) {
        timeline.push({
          type: "opened",
          timestamp: email.opened_at,
          emailSubject: email.subject,
        });
      }

      if (email.clicked_at) {
        timeline.push({
          type: "clicked",
          timestamp: email.clicked_at,
          emailSubject: email.subject,
        });
      }
    }

    // Replies
    for (const reply of status.replies) {
      timeline.push({
        type: "reply_received",
        timestamp: reply.received_at,
        from: reply.from_email,
        subject: reply.subject,
        body: reply.body.slice(0, 200),
        isAutoReply: reply.is_auto_reply,
        isBounce: reply.is_bounce,
        classification: reply.ai_classification,
        sentiment: reply.sentiment,
      });
    }

    // Pending followups
    for (const followup of status.pendingFollowups) {
      timeline.push({
        type: "followup_scheduled",
        timestamp: followup.scheduled_at,
        followupNumber: followup.followup_number,
        status: followup.status,
      });
    }

    // Sort by timestamp
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return NextResponse.json({
      success: true,
      thread: status.thread,
      timeline,
      summary: {
        totalSent: status.sentEmails.length,
        followupsSent: status.sentEmails.filter((e) => e.is_followup).length,
        totalReplies: status.replies.length,
        pendingFollowups: status.pendingFollowups.length,
        lastActivity: timeline[timeline.length - 1]?.timestamp,
      },
    });
  } catch (error) {
    console.error("[followup/timeline] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch timeline" },
      { status: 500 }
    );
  }
}
