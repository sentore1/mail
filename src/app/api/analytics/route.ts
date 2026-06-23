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

  // ── Overall stats — use RPC to bypass PostgREST max-rows entirely ──────────
  // RPC functions run as SQL aggregates on the DB — return one row, no cap.

  const rpcResult = await service
    .rpc('get_sent_email_stats', {
      p_user_id:  user.id,
      p_since:    since,
      p_until:    null,
      p_campaign: campaignId ?? null,
    })
    .single()
    .catch(() => ({ data: null, error: 'rpc_unavailable' }));

  let ts = 0, to = 0, tc = 0, tr = 0, tb = 0, tf = 0;

  if (rpcResult.data) {
    // RPC deployed — use real counts
    ts = Number(rpcResult.data.total_sent)    || 0;
    to = Number(rpcResult.data.total_opened)  || 0;
    tc = Number(rpcResult.data.total_clicked) || 0;
    tr = Number(rpcResult.data.total_replied) || 0;
    tb = Number(rpcResult.data.total_bounced) || 0;
    tf = Number(rpcResult.data.total_failed)  || 0;
  } else {
    // Fallback: parallel count queries (bypasses row limit, no rows fetched)
    const buildBase = () => {
      let q = service
        .from('sent_emails')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('sent_at', since);
      if (campaignId) q = q.eq('campaign_id', campaignId);
      return q;
    };
    const [c1, c2, c3, c4, c5, c6] = await Promise.all([
      buildBase(),
      buildBase().not('opened_at', 'is', null),
      buildBase().not('clicked_at', 'is', null),
      buildBase().not('replied_at', 'is', null),
      buildBase().eq('status', 'bounced'),
      buildBase().eq('status', 'failed'),
    ]);
    ts = c1.count ?? 0;
    to = c2.count ?? 0;
    tc = c3.count ?? 0;
    tr = c4.count ?? 0;
    tb = c5.count ?? 0;
    tf = c6.count ?? 0;
  }

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

  // ── Daily breakdown — use RPC if available, else paginate ────────────────
  let daily: any[] = [];

  const rpcDaily = await service
    .rpc('get_daily_email_stats', { p_user_id: user.id, p_since: since })
    .catch(() => ({ data: null }));

  if (rpcDaily.data && Array.isArray(rpcDaily.data) && rpcDaily.data.length > 0) {
    daily = (rpcDaily.data as any[]).map(r => ({
      date:    r.day,
      sent:    Number(r.sent)    || 0,
      opened:  Number(r.opened)  || 0,
      replied: Number(r.replied) || 0,
      bounced: Number(r.bounced) || 0,
    }));
  } else {
    // Fallback: paginate through all rows
    const emailList: any[] = [];
    const PAGE = 1000;
    const totalPages = Math.ceil(ts / PAGE);
    for (let page = 0; page < totalPages; page++) {
      let q = service
        .from('sent_emails')
        .select('sent_at, opened_at, replied_at, status, campaign_id')
        .eq('user_id', user.id)
        .gte('sent_at', since)
        .order('sent_at', { ascending: true })
        .range(page * PAGE, (page + 1) * PAGE - 1);
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
    daily = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));
  }

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
