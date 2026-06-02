/**
 * GET /api/followup/analytics
 *
 * Returns comprehensive follow-up analytics:
 * - Overall stats (sent, opened, clicked, replied, bounced)
 * - Follow-up performance (how many FU emails sent, reply rates per FU number)
 * - Per-campaign stats
 * - Daily trends (last 30 days)
 * - AI generation stats
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = Math.min(parseInt(searchParams.get("days") ?? "30"), 90);
    const campaignId = searchParams.get("campaignId");

    const service = createServiceClient();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // ── Parallel queries ───────────────────────────────────────────────────────
    const [sentRes, repliesRes, queueRes, aiGenRes, followupSettingsRes] = await Promise.all([
      service
        .from("sent_emails")
        .select("id, status, opened_at, clicked_at, replied_at, followup_count, is_followup, campaign_id, sent_at, ai_generated, followup_stopped")
        .eq("user_id", user.id)
        .gte("sent_at", since)
        .then((r) => {
          let q = service
            .from("sent_emails")
            .select("id, status, opened_at, clicked_at, replied_at, followup_count, is_followup, campaign_id, sent_at, ai_generated, followup_stopped")
            .eq("user_id", user.id)
            .gte("sent_at", since);
          if (campaignId) q = q.eq("campaign_id", campaignId);
          return q;
        }),

      service
        .from("email_replies")
        .select("id, is_positive, sentiment, classification, received_at")
        .eq("user_id", user.id)
        .gte("received_at", since),

      service
        .from("followup_queue")
        .select("id, status, followup_number, created_at")
        .eq("user_id", user.id)
        .gte("created_at", since),

      service
        .from("ai_followup_generations")
        .select("id, style, model_used, status, created_at")
        .eq("user_id", user.id)
        .gte("created_at", since),

      service
        .from("followup_settings")
        .select("max_followups, default_delay_days, auto_followup_enabled, use_ai_generation")
        .eq("user_id", user.id)
        .single(),
    ]);

    // Re-run sent_emails with campaign filter if needed
    const sentQuery = service
      .from("sent_emails")
      .select("id, status, opened_at, clicked_at, replied_at, followup_count, is_followup, campaign_id, sent_at, ai_generated, followup_stopped")
      .eq("user_id", user.id)
      .gte("sent_at", since);

    const { data: sentEmails } = campaignId
      ? await sentQuery.eq("campaign_id", campaignId)
      : await sentQuery;

    const { data: replies } = repliesRes;
    const { data: queueItems } = queueRes;
    const { data: aiGens } = aiGenRes;

    const emails = sentEmails ?? [];

    // ── Overall stats ──────────────────────────────────────────────────────────
    const initialEmails = emails.filter((e) => !e.is_followup);
    const followupEmails = emails.filter((e) => e.is_followup);

    const totalSent = emails.length;
    const totalOpened = emails.filter((e) => e.opened_at).length;
    const totalClicked = emails.filter((e) => e.clicked_at).length;
    const totalReplied = emails.filter((e) => e.replied_at || e.status === "replied").length;
    const totalBounced = emails.filter((e) => e.status === "bounced").length;
    const totalFailed = emails.filter((e) => e.status === "failed").length;
    const totalFollowupsSent = followupEmails.length;
    const followupsStopped = emails.filter((e) => e.followup_stopped).length;
    const aiGeneratedCount = emails.filter((e) => e.ai_generated).length;

    const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
    const clickRate = totalSent > 0 ? (totalClicked / totalSent) * 100 : 0;
    const replyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0;
    const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;

    // ── Reply classification breakdown ────────────────────────────────────────
    const replyClassifications = (replies ?? []).reduce(
      (acc: Record<string, number>, r) => {
        const key = r.classification ?? (r.is_positive ? "positive" : "neutral");
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {}
    );

    // ── Follow-up sequence performance ───────────────────────────────────────
    // Group by followup_count (0 = initial, 1 = first FU, etc.)
    const byFollowupNumber: Record<number, { sent: number; opened: number; replied: number }> = {};
    for (const email of emails) {
      const num = email.followup_count ?? 0;
      if (!byFollowupNumber[num]) {
        byFollowupNumber[num] = { sent: 0, opened: 0, replied: 0 };
      }
      byFollowupNumber[num].sent++;
      if (email.opened_at) byFollowupNumber[num].opened++;
      if (email.replied_at || email.status === "replied") byFollowupNumber[num].replied++;
    }

    const sequencePerformance = Object.entries(byFollowupNumber).map(([num, stats]) => ({
      followupNumber: parseInt(num),
      label: parseInt(num) === 0 ? "Initial Email" : `Follow-up #${num}`,
      sent: stats.sent,
      opened: stats.opened,
      replied: stats.replied,
      openRate: stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100 * 10) / 10 : 0,
      replyRate: stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100 * 10) / 10 : 0,
    }));

    // ── Daily trend (group by day) ────────────────────────────────────────────
    const dailyMap: Record<string, { sent: number; opened: number; replied: number; followups: number }> = {};

    for (const email of emails) {
      const day = email.sent_at.slice(0, 10); // YYYY-MM-DD
      if (!dailyMap[day]) dailyMap[day] = { sent: 0, opened: 0, replied: 0, followups: 0 };
      dailyMap[day].sent++;
      if (email.opened_at) dailyMap[day].opened++;
      if (email.replied_at || email.status === "replied") dailyMap[day].replied++;
      if (email.is_followup) dailyMap[day].followups++;
    }

    const dailyTrend = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({ date, ...stats }));

    // ── Queue stats ───────────────────────────────────────────────────────────
    const queueStats = (queueItems ?? []).reduce(
      (acc: Record<string, number>, q) => {
        acc[q.status] = (acc[q.status] ?? 0) + 1;
        return acc;
      },
      {}
    );

    // ── AI generation stats ───────────────────────────────────────────────────
    const aiStats = {
      total: aiGens?.length ?? 0,
      byStyle: (aiGens ?? []).reduce((acc: Record<string, number>, g) => {
        acc[g.style] = (acc[g.style] ?? 0) + 1;
        return acc;
      }, {}),
      byModel: (aiGens ?? []).reduce((acc: Record<string, number>, g) => {
        acc[g.model_used ?? "template"] = (acc[g.model_used ?? "template"] ?? 0) + 1;
        return acc;
      }, {}),
      used: aiGens?.filter((g) => g.status === "used" || g.status === "sent").length ?? 0,
    };

    return NextResponse.json({
      success: true,
      period: { days, since },
      overview: {
        totalSent,
        totalOpened,
        totalClicked,
        totalReplied,
        totalBounced,
        totalFailed,
        totalFollowupsSent,
        initialEmails: initialEmails.length,
        followupsStopped,
        aiGeneratedCount,
        openRate: Math.round(openRate * 10) / 10,
        clickRate: Math.round(clickRate * 10) / 10,
        replyRate: Math.round(replyRate * 10) / 10,
        bounceRate: Math.round(bounceRate * 10) / 10,
      },
      replies: {
        total: replies?.length ?? 0,
        positive: replies?.filter((r) => r.is_positive).length ?? 0,
        classifications: replyClassifications,
      },
      sequencePerformance: sequencePerformance.sort((a, b) => a.followupNumber - b.followupNumber),
      dailyTrend,
      queue: queueStats,
      aiStats,
      settings: followupSettingsRes.data ?? null,
    });
  } catch (err) {
    console.error("[GET /api/followup/analytics]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
