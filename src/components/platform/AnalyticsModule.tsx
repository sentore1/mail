"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "../../../supabase/client";
import {
  Loader2, TrendingUp, Mail, MousePointer, MessageSquare,
  AlertCircle, RefreshCw, BarChart2, Clock, Layers,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line, Cell,
} from "recharts";

interface AnalyticsModuleProps { userId: string; }

interface DayStat {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
}

interface Summary {
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
}

const RANGES = [
  { label: "7 days",  days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

function StatCard({ label, value, sub, color, bg, icon: Icon, trend }: {
  label: string; value: string; sub: string;
  color: string; bg: string; icon: any; trend?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon size={16} className={color} />
        </div>
        {trend && (
          <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            {trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-black text-gray-900 leading-none">{value}</p>
      <p className="text-xs font-medium text-gray-500 mt-1">{label}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold text-gray-800">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function AnalyticsModule({ userId }: AnalyticsModuleProps) {
  const [range, setRange] = useState(30);
  const [stats, setStats] = useState<DayStat[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [topNiches, setTopNiches] = useState<{ niche: string; sent: number; openRate: number; replyRate: number }[]>([]);
  const [fuStages, setFuStages] = useState<{ stage: number; sent: number; openRate: number; replyRate: number }[]>([]);
  const [sendTimes, setSendTimes] = useState<{ hour: number; opens: number; label: string }[]>([]);

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString();

      // Step 1: get the real total count — bypasses row cap entirely
      const { count: realTotal } = await supabase
        .from("sent_emails")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("sent_at", since)
        .not("status", "in", '("failed","invalid_email")');

      // Step 2: paginate using known total (PostgREST caps at 1000/page)
      const PAGE = 1000;
      const totalPages = Math.ceil((realTotal ?? 0) / PAGE);
      const allEmails: any[] = [];

      for (let page = 0; page < totalPages; page++) {
        const { data: pageData } = await supabase
          .from("sent_emails")
          .select("sent_at, opened_at, clicked_at, status, lead_id")
          .eq("user_id", userId)
          .gte("sent_at", since)
          .not("status", "in", '("failed","invalid_email")')
          .order("sent_at", { ascending: true })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (pageData && pageData.length > 0) allEmails.push(...pageData);
      }
      const emails = allEmails;

      const { data: replies } = await supabase
        .from("email_replies")
        .select("received_at, lead_id")
        .eq("user_id", userId)
        .gte("received_at", since);

      const byDay = new Map<string, DayStat>();
      const initDay = (d: string): DayStat => ({ date: d, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 });

      for (const e of emails ?? []) {
        const day = e.sent_at.slice(0, 10);
        if (!byDay.has(day)) byDay.set(day, initDay(day));
        const s = byDay.get(day)!;
        s.sent++;
        if (e.opened_at) s.opened++;
        if (e.clicked_at) s.clicked++;
        if (e.status === "bounced") s.bounced++;
      }
      for (const r of replies ?? []) {
        const day = r.received_at.slice(0, 10);
        if (!byDay.has(day)) byDay.set(day, initDay(day));
        byDay.get(day)!.replied++;
      }

      const sorted = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
      // Format date labels for chart
      const formatted = sorted.map(d => ({
        ...d,
        dateLabel: new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      }));
      setStats(formatted as any);

      const totSent    = sorted.reduce((s, d) => s + d.sent, 0);
      const totOpened  = sorted.reduce((s, d) => s + d.opened, 0);
      const totClicked = sorted.reduce((s, d) => s + d.clicked, 0);
      const totReplied = sorted.reduce((s, d) => s + d.replied, 0);
      const totBounced = sorted.reduce((s, d) => s + d.bounced, 0);

      setSummary({
        sent: totSent, opened: totOpened, clicked: totClicked,
        replied: totReplied, bounced: totBounced,
        openRate:   totSent > 0 ? Math.round((totOpened  / totSent) * 100) : 0,
        clickRate:  totSent > 0 ? Math.round((totClicked / totSent) * 100) : 0,
        replyRate:  totSent > 0 ? Math.round((totReplied / totSent) * 100) : 0,
        bounceRate: totSent > 0 ? Math.round((totBounced / totSent) * 100) : 0,
      });

      // Top niches with reply rate too
      const leadIds = [...new Set((emails ?? []).map(e => e.lead_id).filter(Boolean))];
      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from("leads").select("id, niche").in("id", leadIds.slice(0, 500));

        const nicheMap = new Map<string, { sent: number; opened: number; replied: number }>();
        for (const e of emails ?? []) {
          const lead = leads?.find(l => l.id === e.lead_id);
          const niche = lead?.niche || "Unknown";
          if (!nicheMap.has(niche)) nicheMap.set(niche, { sent: 0, opened: 0, replied: 0 });
          const n = nicheMap.get(niche)!;
          n.sent++;
          if (e.opened_at) n.opened++;
        }
        for (const r of replies ?? []) {
          const lead = leads?.find(l => l.id === r.lead_id);
          const niche = lead?.niche || "Unknown";
          if (nicheMap.has(niche)) nicheMap.get(niche)!.replied++;
        }
        const niches = Array.from(nicheMap.entries())
          .map(([niche, v]) => ({
            niche,
            sent: v.sent,
            openRate:  v.sent > 0 ? Math.round((v.opened  / v.sent) * 100) : 0,
            replyRate: v.sent > 0 ? Math.round((v.replied / v.sent) * 100) : 0,
          }))
          .sort((a, b) => b.sent - a.sent)
          .slice(0, 10);
        setTopNiches(niches);
      }

      // Follow-up stage performance — paginate using count-first approach
      const { count: fuTotal } = await supabase
        .from("sent_emails")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("sent_at", since)
        .not("followup_number", "is", null);

      const fuPages: any[] = [];
      const fuTotalPages = Math.ceil((fuTotal ?? 0) / 1000);
      for (let p = 0; p < fuTotalPages; p++) {
        const { data: fuPage } = await supabase
          .from("sent_emails")
          .select("followup_number, opened_at, replied_at")
          .eq("user_id", userId)
          .gte("sent_at", since)
          .not("followup_number", "is", null)
          .range(p * 1000, p * 1000 + 999);
        if (fuPage && fuPage.length > 0) fuPages.push(...fuPage);
      }
      const fuEmails = fuPages;

      if (fuEmails && fuEmails.length > 0) {
        const stageMap = new Map<number, { sent: number; opened: number; replied: number }>();
        for (const e of fuEmails) {
          const stage = (e as any).followup_number as number;
          if (!stageMap.has(stage)) stageMap.set(stage, { sent: 0, opened: 0, replied: 0 });
          const s = stageMap.get(stage)!;
          s.sent++;
          if (e.opened_at) s.opened++;
          if (e.replied_at) s.replied++;
        }
        setFuStages(Array.from(stageMap.entries())
          .sort(([a], [b]) => a - b).slice(0, 5)
          .map(([stage, v]) => ({
            stage,
            sent: v.sent,
            openRate:  v.sent > 0 ? Math.round((v.opened  / v.sent) * 100) : 0,
            replyRate: v.sent > 0 ? Math.round((v.replied / v.sent) * 100) : 0,
          })));
      }

      // Best sending time — paginate to avoid 1000-row cap
      const openedPages: any[] = [];
      let opFrom = 0;
      while (true) {
        const { data: opPage } = await supabase
          .from("sent_emails").select("sent_at")
          .eq("user_id", userId).gte("sent_at", since)
          .not("opened_at", "is", null)
          .range(opFrom, opFrom + 4999);
        if (!opPage || opPage.length === 0) break;
        openedPages.push(...opPage);
        if (opPage.length < 5000) break;
        opFrom += 5000;
      }
      const openedEmails = openedPages;

      if (openedEmails && openedEmails.length > 0) {
        const hourMap = new Map<number, number>();
        for (let h = 0; h < 24; h++) hourMap.set(h, 0);
        for (const e of openedEmails) {
          const hour = new Date(e.sent_at).getHours();
          hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
        }
        setSendTimes(Array.from(hourMap.entries()).map(([hour, opens]) => ({
          hour, opens,
          label: hour === 0 ? "12am" : hour < 12 ? `${hour}am` : hour === 12 ? "12pm" : `${hour - 12}pm`,
        })));
      }
    } finally { setLoading(false); }
  }, [userId, range]);

  useEffect(() => { load(); }, [load]);

  const chartStats = stats as any[];
  const bestHour = sendTimes.length > 0 ? sendTimes.reduce((a, b) => a.opens > b.opens ? a : b) : null;

  return (
    <div className="p-6 space-y-5 max-w-6xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 size={18} className="text-blue-600" /> Analytics
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Real-time campaign performance and insights</p>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map(r => (
            <button key={r.days} onClick={() => setRange(r.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${range === r.days ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
              {r.label}
            </button>
          ))}
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? "animate-spin text-blue-500" : "text-gray-400"} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={24} className="animate-spin text-blue-600" />
        </div>
      ) : !summary ? null : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Emails Sent"   value={summary.sent.toLocaleString()}   sub={`last ${range} days`}                      color="text-blue-600"   bg="bg-blue-50"   icon={Mail} />
            <StatCard label="Open Rate"     value={`${summary.openRate}%`}          sub={`${summary.opened.toLocaleString()} opens`}    color="text-amber-600"  bg="bg-amber-50"  icon={TrendingUp} />
            <StatCard label="Click Rate"    value={`${summary.clickRate}%`}         sub={`${summary.clicked.toLocaleString()} clicks`}   color="text-green-600"  bg="bg-green-50"  icon={MousePointer} />
            <StatCard label="Reply Rate"    value={`${summary.replyRate}%`}         sub={`${summary.replied.toLocaleString()} replies`}  color="text-purple-600" bg="bg-purple-50" icon={MessageSquare} />
          </div>

          {/* Daily Volume — Recharts bar chart */}
          {chartStats.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-gray-800 mb-4">Daily Volume</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartStats} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barSize={6} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
                  <Bar dataKey="sent"    name="Sent"    fill="#60a5fa" radius={[2,2,0,0]} />
                  <Bar dataKey="opened"  name="Opened"  fill="#fbbf24" radius={[2,2,0,0]} />
                  <Bar dataKey="replied" name="Replied" fill="#a78bfa" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Performance by Niche — horizontal bars */}
          {topNiches.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-gray-800 mb-4">Performance by Niche</p>
              <ResponsiveContainer width="100%" height={Math.max(topNiches.length * 40, 160)}>
                <BarChart
                  layout="vertical"
                  data={topNiches}
                  margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                  barSize={10}
                  barCategoryGap="25%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="niche" width={110} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
                  <Bar dataKey="openRate"  name="Open Rate %"  fill="#60a5fa" radius={[0,2,2,0]} />
                  <Bar dataKey="replyRate" name="Reply Rate %"  fill="#a78bfa" radius={[0,2,2,0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 pt-2 border-t border-gray-100">
                {topNiches.map(n => (
                  <span key={n.niche} className="inline-flex items-center gap-1 mr-3 mb-1 text-[10px] text-gray-400">
                    <span className="font-medium text-gray-600">{n.niche}</span>
                    <span>{n.sent} sent</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Two column: Follow-up stages + Best send time */}
          {(fuStages.length > 0 || sendTimes.some(t => t.opens > 0)) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Follow-up stage performance */}
              {fuStages.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Layers size={14} className="text-blue-600" />
                    <p className="text-sm font-bold text-gray-800">Follow-Up Stages</p>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-4">Open and reply rate per follow-up sent</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={fuStages.map(s => ({ ...s, name: `FU #${s.stage}` }))} barSize={14} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                      <Bar dataKey="openRate"  name="Open %"  fill="#fbbf24" radius={[3,3,0,0]} />
                      <Bar dataKey="replyRate" name="Reply %" fill="#a78bfa" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Best send time */}
              {sendTimes.some(t => t.opens > 0) && (
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock size={14} className="text-blue-600" />
                    <p className="text-sm font-bold text-gray-800">Best Sending Time</p>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-4">Hour of day that gets the most opens</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={sendTimes} barSize={10} barCategoryGap="15%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval={2} />
                      <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="opens" name="Opens" radius={[2,2,0,0]}>
                        {sendTimes.map((t, i) => (
                          <Cell key={i} fill={bestHour && t.hour === bestHour.hour ? "#2563eb" : "#bfdbfe"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {bestHour && bestHour.opens > 0 && (
                    <p className="text-xs text-blue-700 font-semibold mt-2">
                      Best: {bestHour.label} — {bestHour.opens} opens
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Bounce warning */}
          {summary.bounceRate > 5 && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-800">High bounce rate: {summary.bounceRate}%</p>
                <p className="text-xs text-red-700 mt-0.5">
                  A bounce rate above 5% damages sender reputation. Review your leads and remove invalid addresses from the CRM.
                </p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {summary.sent === 0 && (
            <div className="text-center py-16 text-gray-400">
              <BarChart2 size={36} className="mx-auto mb-4 opacity-30" />
              <p className="text-sm font-medium">No emails sent in the last {range} days</p>
              <p className="text-xs mt-1">Start sending from the Email Writer to see your analytics here</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
