/**
 * /api/analytics
 * Returns analytics data for the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../supabase/server';
import { createServiceClient } from '../../../../supabase/service';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30');
  const campaignId = searchParams.get('campaignId');

  const service = createServiceClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // ── Overall stats — use count queries instead of fetching all rows ─────────
  // Fetching rows hits Supabase's 1000-row default limit; count queries don't.

  const buildBase = () => {
    let q = service
      .from('sent_emails')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('sent_at', since);
    if (campaignId) q = q.eq('campaign_id', campaignId);
    return q;
  };

  const [
    { count: totalSent },
    { count: totalOpened },
    { count: totalClicked },
    { count: totalReplied },
    { count: totalBounced },
    { count: totalFailed },
  ] = await Promise.all([
    buildBase(),
    buildBase().not('opened_at', 'is', null),
    buildBase().not('clicked_at', 'is', null),
    buildBase().not('replied_at', 'is', null),
    buildBase().eq('status', 'bounced'),
    buildBase().eq('status', 'failed'),
  ]);

  const ts = totalSent   ?? 0;
  const to = totalOpened  ?? 0;
  const tc = totalClicked ?? 0;
  const tr = totalReplied ?? 0;
  const tb = totalBounced ?? 0;
  const tf = totalFailed  ?? 0;

  const stats = {
    total_sent:    ts,
    total_opened:  to,
    total_clicked: tc,
    total_replied: tr,
    total_bounced: tb,
    total_failed:  tf,
    open_rate:   ts > 0 ? Math.round((to / ts) * 1000) / 10 : 0,
    click_rate:  ts > 0 ? Math.round((tc / ts) * 1000) / 10 : 0,
    reply_rate:  ts > 0 ? Math.round((tr / ts) * 1000) / 10 : 0,
    bounce_rate: ts > 0 ? Math.round((tb / ts) * 1000) / 10 : 0,
  };

  // ── Daily breakdown — use count to know real total, then paginate correctly ─
  const PAGE = 1000; // match PostgREST's actual page size
  const emailList: any[] = [];
  const totalForDailyBreakdown = ts; // already fetched above
  const totalDailyPages = Math.ceil(totalForDailyBreakdown / PAGE);

  for (let page = 0; page < totalDailyPages; page++) {
    const rangeFrom = page * PAGE;
    const rangeTo   = rangeFrom + PAGE - 1;
    let q = service
      .from('sent_emails')
      .select('sent_at, opened_at, replied_at, status, campaign_id')
      .eq('user_id', user.id)
      .gte('sent_at', since)
      .order('sent_at', { ascending: true })
      .range(rangeFrom, rangeTo);
    if (campaignId) q = q.eq('campaign_id', campaignId);
    const { data: pageData } = await q;
    if (pageData && pageData.length > 0) emailList.push(...pageData);
  }

  const dailyMap = new Map<string, { sent: number; opened: number; replied: number; bounced: number }>();

  for (const email of emailList) {
    const day = email.sent_at.split('T')[0];
    const existing = dailyMap.get(day) || { sent: 0, opened: 0, replied: 0, bounced: 0 };
    existing.sent++;
    if (email.opened_at) existing.opened++;
    if (email.replied_at) existing.replied++;
    if (email.status === 'bounced') existing.bounced++;
    dailyMap.set(day, existing);
  }

  const daily = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }));

  // ── Lead status breakdown ─────────────────────────────────────────────────
  const { data: leads } = await service
    .from('leads')
    .select('status')
    .eq('user_id', user.id);

  const leadStatusMap: Record<string, number> = {};
  for (const lead of leads || []) {
    leadStatusMap[lead.status] = (leadStatusMap[lead.status] || 0) + 1;
  }

  // ── SMTP account performance ──────────────────────────────────────────────
  const { data: smtpAccounts } = await service
    .from('smtp_accounts')
    .select('id, email, sent_today, daily_limit, status, health_score, total_sent, total_bounced')
    .eq('user_id', user.id);

  // ── Campaign performance ──────────────────────────────────────────────────
  const { data: campaigns } = await service
    .from('email_campaigns')
    .select('id, name, status, sent_count, opened_count, replied_count, bounced_count, total_recipients, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  // ── Recent replies ────────────────────────────────────────────────────────
  const { data: recentReplies } = await service
    .from('email_replies')
    .select('id, from_email, subject, sentiment, received_at, lead_id')
    .eq('user_id', user.id)
    .order('received_at', { ascending: false })
    .limit(5);

  return NextResponse.json({
    stats,
    daily,
    leadStatusBreakdown: leadStatusMap,
    smtpAccounts: smtpAccounts || [],
    campaigns: campaigns || [],
    recentReplies: recentReplies || [],
    period: { days, since },
  });
}
