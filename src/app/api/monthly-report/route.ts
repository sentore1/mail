/**
 * Monthly Report API
 * Returns a complete summary of all outreach activity for a given month.
 *
 * GET /api/monthly-report?year=2025&month=6
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../supabase/server";
import { createServiceClient } from "../../../../supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()), 10);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1), 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
  }

  const startOfMonth = new Date(year, month - 1, 1).toISOString();
  const endOfMonth   = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

  const service = createServiceClient();

  try {
    // ── Use RPC function — bypasses PostgREST's max-rows limit entirely ──────
    // The DB function runs as a SQL aggregate and returns one row with all counts.
    const { data: rpcStats, error: rpcErr } = await service
      .rpc("get_monthly_email_stats", {
        p_user_id: user.id,
        p_year:    year,
        p_month:   month,
      })
      .single();

    // Fall back to count queries if RPC not deployed yet
    let REAL_TOTAL = 0;
    let cOpened = 0, cClicked = 0, cReplied = 0, cBounced = 0, cFollowups = 0, cNotOpened = 0;

    if (!rpcErr && rpcStats) {
      REAL_TOTAL  = Number(rpcStats.total_sent)       || 0;
      cOpened     = Number(rpcStats.total_opened)     || 0;
      cClicked    = Number(rpcStats.total_clicked)    || 0;
      cReplied    = Number(rpcStats.total_replied)    || 0;
      cBounced    = Number(rpcStats.total_bounced)    || 0;
      cFollowups  = Number(rpcStats.total_followups)  || 0;
      cNotOpened  = Number(rpcStats.total_not_opened) || 0;
    } else {
      // RPC not available — fall back to count queries
      const baseQ = () => service
        .from("sent_emails")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("sent_at", startOfMonth)
        .lte("sent_at", endOfMonth);

      const [t, o, cl, r, b, fu, no] = await Promise.all([
        baseQ(),
        baseQ().not("opened_at", "is", null),
        baseQ().not("clicked_at", "is", null),
        baseQ().not("replied_at", "is", null),
        baseQ().eq("status", "bounced"),
        baseQ().eq("is_followup", true),
        baseQ().is("opened_at", null).not("status", "in", '("bounced","failed")'),
      ]);
      REAL_TOTAL = t.count ?? 0;
      cOpened    = o.count  ?? 0;
      cClicked   = cl.count ?? 0;
      cReplied   = r.count  ?? 0;
      cBounced   = b.count  ?? 0;
      cFollowups = fu.count ?? 0;
      cNotOpened = no.count ?? 0;
    }

    // ── 2. Fetch lead info for company names ─────────────────────────────────
    const leadIds = [...new Set(allEmails.map(e => e.lead_id).filter(Boolean))];
    const leadMap = new Map<string, { company_name: string; niche: string | null; email: string | null }>();

    if (leadIds.length > 0) {
      // Supabase .in() max 500 — chunk if needed
      const chunks: string[][] = [];
      for (let i = 0; i < leadIds.length; i += 500) chunks.push(leadIds.slice(i, i + 500));
      for (const chunk of chunks) {
        const { data: leads } = await service
          .from("leads")
          .select("id, company_name, niche, email")
          .in("id", chunk);
        for (const l of leads ?? []) leadMap.set(l.id, l);
      }
    }

    // ── 2. Fetch ALL rows with pagination (for list displays) ────────────────
    const allEmails: any[] = [];
    const PAGE_SIZE = 1000;
    const totalPages = Math.ceil(REAL_TOTAL / PAGE_SIZE);

    for (let page = 0; page < totalPages; page++) {
      const { data: rows } = await service
        .from("sent_emails")
        .select(`
          id, to_email, subject,
          sent_at, opened_at, clicked_at, replied_at,
          status, bounce_reason,
          is_followup, followup_number,
          open_count, click_count,
          campaign_id, lead_id
        `)
        .eq("user_id", user.id)
        .gte("sent_at", startOfMonth)
        .lte("sent_at", endOfMonth)
        .order("sent_at", { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (rows && rows.length > 0) allEmails.push(...rows);
    }

    // ── 3. Replies for the month ──────────────────────────────────────────────
    const { data: replies } = await service
      .from("email_replies")
      .select("id, sent_email_id, lead_id, from_email, subject, body, received_at, is_positive, sentiment")
      .eq("user_id", user.id)
      .gte("received_at", startOfMonth)
      .lte("received_at", endOfMonth)
      .order("received_at", { ascending: false });

    const allReplies = replies ?? [];

    // ── 4. Campaigns ─────────────────────────────────────────────────────────
    const campaignIds = [...new Set(allEmails.map(e => e.campaign_id).filter(Boolean))];
    const campaignMap = new Map<string, string>();
    if (campaignIds.length > 0) {
      const { data: campaigns } = await service
        .from("email_campaigns")
        .select("id, name")
        .in("id", campaignIds);
      for (const c of campaigns ?? []) campaignMap.set(c.id, c.name);
    }

    // ── Calculations — use DB count results for the summary numbers ──────────
    // allEmails has ALL rows from pagination; counts are from DB aggregate queries.

    const totalSent     = REAL_TOTAL;
    const totalOpened   = cOpened   ?? allEmails.filter(e => e.opened_at).length;
    const totalClicked  = cClicked  ?? allEmails.filter(e => e.clicked_at).length;
    const totalBounced  = cBounced  ?? allEmails.filter(e => e.status === "bounced").length;
    const totalFollowups = cFollowups ?? allEmails.filter(e => e.is_followup).length;
    const totalNotOpened = cNotOpened ?? allEmails.filter(e => !e.opened_at && e.status !== "bounced" && e.status !== "failed").length;

    // Keep filtered arrays for list building (these work on allEmails which has all rows)
    const opened      = allEmails.filter(e => e.opened_at);
    const clicked     = allEmails.filter(e => e.clicked_at);
    const bounced     = allEmails.filter(e => e.status === "bounced");
    const notOpened   = allEmails.filter(e => !e.opened_at && e.status !== "bounced" && e.status !== "failed");
    const followups   = allEmails.filter(e => e.is_followup);
    const initialEmails = allEmails.filter(e => !e.is_followup);

    const openRate  = totalSent > 0 ? Math.round((totalOpened  / totalSent) * 100) : 0;
    const replyRate = totalSent > 0 ? Math.round((allReplies.length / totalSent) * 100) : 0;

    // ── Emails sent per day ───────────────────────────────────────────────────
    const daysInMonth = new Date(year, month, 0).getDate();
    const byDay: { day: number; label: string; sent: number; opened: number; replied: number; followups: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dayEmails = allEmails.filter(e => new Date(e.sent_at).getDate() === d);
      const dayReplies = allReplies.filter(r => new Date(r.received_at).getDate() === d);
      byDay.push({
        day: d,
        label: `${d}`,
        sent: dayEmails.length,
        opened: dayEmails.filter(e => e.opened_at).length,
        replied: dayReplies.length,
        followups: dayEmails.filter(e => e.is_followup).length,
      });
    }

    // ── Follow-up breakdown ───────────────────────────────────────────────────
    const fuBreakdown: Record<number, { sent: number; replies: number; label: string }> = {};
    for (const e of followups) {
      const n = (e.followup_number as number) ?? 1;
      if (!fuBreakdown[n]) fuBreakdown[n] = { sent: 0, replies: 0, label: `FU${n}` };
      fuBreakdown[n].sent++;
      if (e.replied_at) fuBreakdown[n].replies++;
    }
    const fuBreakdownArray = Object.entries(fuBreakdown)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, v]) => v);

    // ── Campaign breakdown ────────────────────────────────────────────────────
    const campaignBreakdown: Record<string, { name: string; sent: number; opened: number; replied: number; bounced: number }> = {};
    for (const e of allEmails) {
      const key = e.campaign_id ?? "no_campaign";
      const name = campaignMap.get(e.campaign_id) ?? "Direct Send";
      if (!campaignBreakdown[key]) campaignBreakdown[key] = { name, sent: 0, opened: 0, replied: 0, bounced: 0 };
      campaignBreakdown[key].sent++;
      if (e.opened_at) campaignBreakdown[key].opened++;
      if (e.replied_at) campaignBreakdown[key].replied++;
      if (e.status === "bounced") campaignBreakdown[key].bounced++;
    }
    const campaignBreakdownArray = Object.values(campaignBreakdown).sort((a, b) => b.sent - a.sent);

    // ── Sector/niche breakdown ────────────────────────────────────────────────
    const nicheBreakdown: Record<string, { niche: string; sent: number; opened: number; replied: number }> = {};
    for (const e of allEmails) {
      const lead = e.lead_id ? leadMap.get(e.lead_id) : null;
      const niche = lead?.niche ?? "Unknown";
      if (!nicheBreakdown[niche]) nicheBreakdown[niche] = { niche, sent: 0, opened: 0, replied: 0 };
      nicheBreakdown[niche].sent++;
      if (e.opened_at) nicheBreakdown[niche].opened++;
      if (e.replied_at) nicheBreakdown[niche].replied++;
    }
    const nicheBreakdownArray = Object.values(nicheBreakdown).sort((a, b) => b.sent - a.sent);

    // ── Top subject lines by open rate ────────────────────────────────────────
    const subjectMap: Record<string, { subject: string; sent: number; opened: number; openRate: number }> = {};
    for (const e of allEmails) {
      const subj = (e.subject ?? "(no subject)").trim();
      if (!subjectMap[subj]) subjectMap[subj] = { subject: subj, sent: 0, opened: 0, openRate: 0 };
      subjectMap[subj].sent++;
      if (e.opened_at) subjectMap[subj].opened++;
    }
    const topSubjectLines = Object.values(subjectMap)
      .map(s => ({ ...s, openRate: s.sent > 0 ? Math.round((s.opened / s.sent) * 100) : 0 }))
      .filter(s => s.sent >= 2)
      .sort((a, b) => b.openRate - a.openRate)
      .slice(0, 10);

    // ── Top companies by engagement ───────────────────────────────────────────
    const companyEngagement: Record<string, {
      company: string; email: string;
      sent: number; opened: boolean; clicked: boolean; replied: boolean;
      openCount: number; clickCount: number; score: number;
    }> = {};
    for (const e of allEmails) {
      const lead = e.lead_id ? leadMap.get(e.lead_id) : null;
      const company = lead?.company_name ?? e.to_email ?? "Unknown";
      const emailAddr = lead?.email ?? e.to_email ?? "";
      const key = e.lead_id ?? emailAddr;
      if (!companyEngagement[key]) {
        companyEngagement[key] = { company, email: emailAddr, sent: 0, opened: false, clicked: false, replied: false, openCount: 0, clickCount: 0, score: 0 };
      }
      companyEngagement[key].sent++;
      if (e.opened_at) { companyEngagement[key].opened = true; companyEngagement[key].openCount += e.open_count ?? 1; }
      if (e.clicked_at) { companyEngagement[key].clicked = true; companyEngagement[key].clickCount += e.click_count ?? 1; }
      if (e.replied_at) companyEngagement[key].replied = true;
    }
    const topCompanies = Object.values(companyEngagement)
      .map(c => ({
        ...c,
        score: (c.replied ? 10 : 0) + (c.clicked ? 5 : 0) + (c.opened ? 3 : 0) + c.openCount + c.clickCount,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // ── Not opened list ───────────────────────────────────────────────────────
    const now = new Date();
    const notOpenedList = notOpened.map(e => {
      const lead = e.lead_id ? leadMap.get(e.lead_id) : null;
      const daysSince = Math.floor((now.getTime() - new Date(e.sent_at).getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: e.id,
        company: lead?.company_name ?? e.to_email ?? "Unknown",
        email: e.to_email ?? lead?.email ?? "",
        subject: e.subject ?? "(no subject)",
        sent_at: e.sent_at,
        days_since: daysSince,
        is_followup: e.is_followup,
        followup_number: e.followup_number,
      };
    }).sort((a, b) => b.days_since - a.days_since);

    // ── Bounced list ──────────────────────────────────────────────────────────
    const bouncedList = bounced.map(e => {
      const lead = e.lead_id ? leadMap.get(e.lead_id) : null;
      return {
        id: e.id,
        company: lead?.company_name ?? e.to_email ?? "Unknown",
        email: e.to_email ?? lead?.email ?? "",
        subject: e.subject ?? "(no subject)",
        sent_at: e.sent_at,
        reason: e.bounce_reason ?? "Unknown reason",
      };
    });

    // ── Reply list with classification ────────────────────────────────────────
    const replyList = allReplies.map(r => {
      const lead = r.lead_id ? leadMap.get(r.lead_id) : null;
      const preview = (r.body ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 120);
      const classification = classifyReply(r.sentiment, r.is_positive, r.body ?? "");
      return {
        id: r.id,
        company: lead?.company_name ?? r.from_email ?? "Unknown",
        email: r.from_email,
        received_at: r.received_at,
        classification,
        preview,
        subject: r.subject ?? "(no subject)",
        sent_email_id: r.sent_email_id,
        lead_id: r.lead_id,
      };
    });

    // ── Opened emails list ────────────────────────────────────────────────────
    const openedList = opened.map(e => {
      const lead = e.lead_id ? leadMap.get(e.lead_id) : null;
      return {
        id: e.id,
        company: lead?.company_name ?? e.to_email ?? "Unknown",
        email: e.to_email ?? "",
        subject: e.subject ?? "(no subject)",
        opened_at: e.opened_at,
        open_count: e.open_count ?? 1,
        clicked: !!e.clicked_at,
      };
    }).sort((a, b) => (b.open_count ?? 1) - (a.open_count ?? 1)).slice(0, 50);

    // ── Clicked list ──────────────────────────────────────────────────────────
    const clickedList = clicked.map(e => {
      const lead = e.lead_id ? leadMap.get(e.lead_id) : null;
      return {
        id: e.id,
        company: lead?.company_name ?? e.to_email ?? "Unknown",
        email: e.to_email ?? "",
        subject: e.subject ?? "(no subject)",
        clicked_at: e.clicked_at,
        click_count: e.click_count ?? 1,
      };
    });

    // ── Follow-up leads list ──────────────────────────────────────────────────
    const followupLeadSet = new Set<string>();
    const followupLeadsList: { company: string; email: string; followup_numbers: number[] }[] = [];
    for (const e of followups) {
      const lead = e.lead_id ? leadMap.get(e.lead_id) : null;
      const key = e.lead_id ?? e.to_email ?? "";
      if (!followupLeadSet.has(key)) {
        followupLeadSet.add(key);
        const fus = followups.filter(f => (f.lead_id ?? f.to_email) === key);
        followupLeadsList.push({
          company: lead?.company_name ?? e.to_email ?? "Unknown",
          email: e.to_email ?? lead?.email ?? "",
          followup_numbers: [...new Set(fus.map(f => f.followup_number ?? 1))].sort(),
        });
      }
    }

    // ── Donut chart data — use DB counts for accuracy ────────────────────────
    const donutData = [
      { name: "Not Opened", value: totalNotOpened, color: "#e5e7eb" },
      { name: "Opened",     value: Math.max(0, totalOpened - totalClicked - allReplies.length), color: "#fbbf24" },
      { name: "Clicked",    value: totalClicked, color: "#34d399" },
      { name: "Replied",    value: allReplies.length, color: "#a78bfa" },
      { name: "Bounced",    value: totalBounced, color: "#f87171" },
    ].filter(d => d.value > 0);

    return NextResponse.json({
      ok: true,
      year,
      month,
      summary: {
        total_sent:      totalSent,
        total_opened:    totalOpened,
        open_rate:       openRate,
        total_replied:   allReplies.length,
        reply_rate:      replyRate,
        total_clicked:   totalClicked,
        click_rate:      totalSent > 0 ? Math.round((totalClicked  / totalSent) * 100) : 0,
        total_bounced:   totalBounced,
        bounce_rate:     totalSent > 0 ? Math.round((totalBounced  / totalSent) * 100) : 0,
        total_followups: totalFollowups,
        total_not_opened: totalNotOpened,
        initial_emails:  totalSent - totalFollowups,
      },
      by_day: byDay,
      donut_data: donutData,
      campaign_breakdown: campaignBreakdownArray,
      niche_breakdown: nicheBreakdownArray,
      fu_breakdown: fuBreakdownArray,
      top_subject_lines: topSubjectLines,
      top_companies: topCompanies,
      not_opened_list: notOpenedList,
      bounced_list: bouncedList,
      reply_list: replyList,
      opened_list: openedList,
      clicked_list: clickedList,
      followup_leads: followupLeadsList,
    });

  } catch (err: any) {
    console.error("[monthly-report]", err);
    return NextResponse.json({ error: err.message ?? "Failed to generate report" }, { status: 500 });
  }
}

// ── Reply classification helper ───────────────────────────────────────────────
function classifyReply(
  sentiment: string | null,
  isPositive: boolean | null,
  body: string
): "interested" | "not_interested" | "auto_reply" | "meeting_request" | "neutral" {
  const b = body.toLowerCase();

  // Auto-reply patterns
  if (/out of (office|the office)|on (vacation|leave|holiday)|auto.?reply|automatic(ally)?|i am currently|i('m| am) away|be back|return(ing)? on/i.test(b)) {
    return "auto_reply";
  }
  // Meeting request patterns
  if (/schedule|book a (call|meeting|demo|time)|calendar|let'?s (meet|talk|connect|chat)|availability|calendly|pick a time|30 min/i.test(b)) {
    return "meeting_request";
  }
  // Not interested patterns
  if (/not interested|unsubscribe|remove me|do not contact|stop emailing|please remove|not looking|don'?t (contact|email|reach)/i.test(b)) {
    return "not_interested";
  }

  if (sentiment === "positive" || sentiment === "interested" || isPositive === true) return "interested";
  if (sentiment === "negative" || sentiment === "not_interested" || isPositive === false) return "not_interested";

  return "neutral";
}
