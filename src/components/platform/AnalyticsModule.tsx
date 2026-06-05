"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "../../../supabase/client";
import { Loader2, TrendingUp, Mail, MousePointer, MessageSquare, AlertCircle, RefreshCw } from "lucide-react";

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

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub: string; color: string; icon: any;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={color} />
        <span className="text-xs font-semibold text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

export default function AnalyticsModule({ userId }: AnalyticsModuleProps) {
  const [range, setRange] = useState(30);
  const [stats, setStats] = useState<DayStat[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [topNiches, setTopNiches] = useState<{ niche: string; sent: number; openRate: number }[]>([]);

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString();

      const { data: emails } = await supabase
        .from("sent_emails")
        .select("sent_at, opened_at, clicked_at, status, lead_id")
        .eq("user_id", userId)
        .gte("sent_at", since)
        .not("status", "in", '("failed","invalid_email")')
        .order("sent_at", { ascending: true });

      const { data: replies } = await supabase
        .from("email_replies")
        .select("received_at, lead_id")
        .eq("user_id", userId)
        .gte("received_at", since);

      // Build per-day stats
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
      setStats(sorted);

      // Summary totals
      const totSent    = sorted.reduce((s, d) => s + d.sent, 0);
      const totOpened  = sorted.reduce((s, d) => s + d.opened, 0);
      const totClicked = sorted.reduce((s, d) => s + d.clicked, 0);
      const totReplied = sorted.reduce((s, d) => s + d.replied, 0);
      const totBounced = sorted.reduce((s, d) => s + d.bounced, 0);

      setSummary({
        sent: totSent,
        opened: totOpened,
        clicked: totClicked,
        replied: totReplied,
        bounced: totBounced,
        openRate:   totSent > 0 ? Math.round((totOpened  / totSent) * 100) : 0,
        clickRate:  totSent > 0 ? Math.round((totClicked / totSent) * 100) : 0,
        replyRate:  totSent > 0 ? Math.round((totReplied / totSent) * 100) : 0,
        bounceRate: totSent > 0 ? Math.round((totBounced / totSent) * 100) : 0,
      });

      // Top niches
      const leadIds = [...new Set((emails ?? []).map(e => e.lead_id).filter(Boolean))];
      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from("leads")
          .select("id, niche")
          .in("id", leadIds.slice(0, 500));

        const nicheMap = new Map<string, { sent: number; opened: number }>();
        for (const e of emails ?? []) {
          const lead = leads?.find(l => l.id === e.lead_id);
          const niche = lead?.niche || "Unknown";
          if (!nicheMap.has(niche)) nicheMap.set(niche, { sent: 0, opened: 0 });
          const n = nicheMap.get(niche)!;
          n.sent++;
          if (e.opened_at) n.opened++;
        }
        const niches = Array.from(nicheMap.entries())
          .map(([niche, v]) => ({ niche, sent: v.sent, openRate: v.sent > 0 ? Math.round((v.opened / v.sent) * 100) : 0 }))
          .sort((a, b) => b.sent - a.sent)
          .slice(0, 8);
        setTopNiches(niches);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, range]);

  useEffect(() => { load(); }, [load]);

  const maxSent = Math.max(...stats.map(d => d.sent), 1);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Analytics</h2>
          <p className="text-xs text-gray-500 mt-0.5">Email performance overview</p>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map(r => (
            <button key={r.days} onClick={() => setRange(r.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${range === r.days ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
              {r.label}
            </button>
          ))}
          <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? "animate-spin text-blue-500" : "text-gray-400"} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={20} className="animate-spin text-blue-600" />
        </div>
      ) : !summary ? null : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Emails Sent"    value={summary.sent.toLocaleString()}    sub={`last ${range} days`}    color="text-blue-500"   icon={Mail} />
            <StatCard label="Open Rate"      value={`${summary.openRate}%`}           sub={`${summary.opened.toLocaleString()} opens`}    color="text-amber-500"  icon={TrendingUp} />
            <StatCard label="Click Rate"     value={`${summary.clickRate}%`}          sub={`${summary.clicked.toLocaleString()} clicks`}   color="text-green-500"  icon={MousePointer} />
            <StatCard label="Reply Rate"     value={`${summary.replyRate}%`}          sub={`${summary.replied.toLocaleString()} replies`}  color="text-purple-500" icon={MessageSquare} />
          </div>

          {/* Daily chart */}
          {stats.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-sm font-bold text-gray-800 mb-4">Daily Volume</p>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {stats.map(d => {
                  const label = new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
                  return (
                    <div key={d.date} className="flex items-center gap-3 text-xs">
                      <span className="w-12 text-gray-400 shrink-0 text-right">{label}</span>
                      <div className="flex-1 grid grid-cols-3 gap-1">
                        <div title={`Sent: ${d.sent}`}>
                          <Bar value={d.sent} max={maxSent} color="bg-blue-400" />
                        </div>
                        <div title={`Opened: ${d.opened}`}>
                          <Bar value={d.opened} max={maxSent} color="bg-amber-400" />
                        </div>
                        <div title={`Replied: ${d.replied}`}>
                          <Bar value={d.replied} max={maxSent} color="bg-purple-400" />
                        </div>
                      </div>
                      <span className="w-8 text-gray-500 shrink-0">{d.sent}</span>
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                {[["bg-blue-400","Sent"],["bg-amber-400","Opened"],["bg-purple-400","Replied"]].map(([c,l]) => (
                  <div key={l} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${c}`}/>
                    <span className="text-[10px] text-gray-500">{l}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top niches */}
          {topNiches.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-sm font-bold text-gray-800 mb-4">Performance by Niche</p>
              <div className="space-y-3">
                {topNiches.map(n => (
                  <div key={n.niche} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-700 w-36 truncate shrink-0">{n.niche}</span>
                    <div className="flex-1">
                      <Bar value={n.openRate} max={100} color="bg-blue-400" />
                    </div>
                    <span className="text-xs text-gray-500 w-16 text-right shrink-0">{n.openRate}% open · {n.sent} sent</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bounce warning */}
          {summary.bounceRate > 5 && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-800">High bounce rate: {summary.bounceRate}%</p>
                <p className="text-[11px] text-red-700 mt-0.5">A bounce rate above 5% can damage your sender reputation. Review your email list and remove invalid addresses from the CRM.</p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {summary.sent === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Mail size={28} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No emails sent in the last {range} days</p>
              <p className="text-xs mt-1">Start sending from the Email Writer to see analytics here</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
