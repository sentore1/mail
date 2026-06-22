"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  FileText, Download, RefreshCw, Loader2,
  Mail, Eye, MousePointer, MessageSquare, AlertCircle,
  EyeOff, Send, TrendingUp, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, Repeat, Calendar,
} from "lucide-react";
import { toast } from "sonner";

interface MonthlyReportModuleProps { userId: string; }

// ── Types ─────────────────────────────────────────────────────────────────────

interface Summary {
  total_sent: number; total_opened: number; open_rate: number;
  total_replied: number; reply_rate: number; total_clicked: number;
  click_rate: number; total_bounced: number; bounce_rate: number;
  total_followups: number; total_not_opened: number; initial_emails: number;
}
interface DayStat { day: number; label: string; sent: number; opened: number; replied: number; followups: number; }
interface CampaignRow { name: string; sent: number; opened: number; replied: number; bounced: number; }
interface NicheRow { niche: string; sent: number; opened: number; replied: number; }
interface FuRow { label: string; sent: number; replies: number; }
interface SubjectRow { subject: string; sent: number; opened: number; openRate: number; }
interface CompanyRow { company: string; email: string; sent: number; opened: boolean; clicked: boolean; replied: boolean; openCount: number; clickCount: number; score: number; }
interface NotOpenedRow { id: string; company: string; email: string; subject: string; sent_at: string; days_since: number; is_followup: boolean; followup_number: number; }
interface BouncedRow { id: string; company: string; email: string; subject: string; sent_at: string; reason: string; }
interface ReplyRow { id: string; company: string; email: string; received_at: string; classification: string; preview: string; subject: string; sent_email_id: string; lead_id: string; }
interface DonutSlice { name: string; value: number; color: string; }

interface ReportData {
  year: number; month: number; summary: Summary;
  by_day: DayStat[]; donut_data: DonutSlice[];
  campaign_breakdown: CampaignRow[]; niche_breakdown: NicheRow[];
  fu_breakdown: FuRow[]; top_subject_lines: SubjectRow[];
  top_companies: CompanyRow[]; not_opened_list: NotOpenedRow[];
  bounced_list: BouncedRow[]; reply_list: ReplyRow[];
  opened_list: any[]; clicked_list: any[]; followup_leads: any[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const CLASSIFICATION_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  interested:       { label: "Interested",       color: "#16a34a", bg: "#dcfce7", icon: CheckCircle2 },
  meeting_request:  { label: "Meeting Request",  color: "#2563eb", bg: "#dbeafe", icon: Calendar },
  not_interested:   { label: "Not Interested",   color: "#dc2626", bg: "#fee2e2", icon: XCircle },
  auto_reply:       { label: "Auto Reply",       color: "#9ca3af", bg: "#f3f4f6", icon: Repeat },
  neutral:          { label: "Neutral",          color: "#d97706", bg: "#fef3c7", icon: MessageSquare },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, bg, icon: Icon }: {
  label: string; value: string; sub: string; color: string; bg: string; icon: any;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-3`}>
        <Icon size={15} className={color} />
      </div>
      <p className="text-xl font-black text-gray-900 leading-none">{value}</p>
      <p className="text-xs font-medium text-gray-600 mt-1">{label}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, icon: Icon, iconColor, children }: {
  title: string; icon: any; iconColor: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon size={15} className={iconColor} />
          <span className="text-sm font-bold text-gray-900">{title}</span>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(data: ReportData) {
  const rows: any[] = [];
  // Combine all emails into one flat table
  const allStatuses = [
    ...data.reply_list.map(r => ({
      Stage: "Reply Received",
      Company: r.company, Email: r.email,
      Subject: r.subject, Date: fmtDate(r.received_at),
      Classification: r.classification, Opened: "", Clicked: "", Bounced: "",
    })),
    ...data.bounced_list.map(b => ({
      Stage: "Bounced",
      Company: b.company, Email: b.email,
      Subject: b.subject, Date: fmtDate(b.sent_at),
      Classification: "", Opened: "", Clicked: b.reason, Bounced: "Yes",
    })),
    ...data.not_opened_list.map(n => ({
      Stage: n.is_followup ? `Follow-Up ${n.followup_number}` : "Initial Email",
      Company: n.company, Email: n.email,
      Subject: n.subject, Date: fmtDate(n.sent_at),
      Classification: "", Opened: "Not Opened", Clicked: "", Bounced: "",
    })),
    ...data.opened_list.map(o => ({
      Stage: "Opened",
      Company: o.company, Email: o.email,
      Subject: o.subject, Date: fmtDate(o.opened_at),
      Classification: "", Opened: `${o.open_count}x`, Clicked: o.clicked ? "Yes" : "", Bounced: "",
    })),
  ];

  if (rows.length === 0 && allStatuses.length === 0) { toast.info("No data to export"); return; }

  const headers = ["Stage","Company","Email","Subject","Date","Classification","Opened","Clicked","Bounced"];
  const csv = [
    headers.join(","),
    ...allStatuses.map(r => headers.map(h => `"${String((r as any)[h] ?? "").replace(/"/g, "'")}"` ).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `monthly-report-${data.year}-${String(data.month).padStart(2, "0")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("CSV downloaded");
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MonthlyReportModule({ userId }: MonthlyReportModuleProps) {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data,  setData]  = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/monthly-report?year=${year}&month=${month}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load report");
      setData(json);
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  // Year options: current year back to 2023
  const yearOptions: number[] = [];
  for (let y = now.getFullYear(); y >= 2023; y--) yearOptions.push(y);

  const s = data?.summary;

  return (
    <div className="p-6 space-y-5 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileText size={18} className="text-blue-600" /> Monthly Report
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Complete outreach summary for any selected month</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Month selector */}
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-blue-400"
          >
            {MONTH_NAMES.map((n, i) => (
              <option key={i + 1} value={i + 1}>{n}</option>
            ))}
          </select>

          {/* Year selector */}
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-blue-400"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? "animate-spin text-blue-500" : "text-gray-400"} />
          </button>

          {data && (
            <>
              <button
                onClick={() => exportCSV(data)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Download size={13} /> CSV
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100"
              >
                <Download size={13} /> PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={24} className="animate-spin text-blue-600" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && data && s && s.total_sent === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Mail size={36} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm font-medium">No emails sent in {MONTH_NAMES[month - 1]} {year}</p>
          <p className="text-xs mt-1">Try selecting a different month above</p>
        </div>
      )}

      {/* ── Report content ── */}
      {!loading && !error && data && s && s.total_sent > 0 && (
        <>
          {/* Summary banner */}
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3">
              {MONTH_NAMES[month - 1]} {year} — At a Glance
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Total Sent",    value: s.total_sent.toLocaleString(),    color: "text-blue-700" },
                { label: "Open Rate",     value: `${s.open_rate}%`,                color: "text-amber-700" },
                { label: "Reply Rate",    value: `${s.reply_rate}%`,               color: "text-purple-700" },
                { label: "Follow-Ups",    value: s.total_followups.toLocaleString(), color: "text-indigo-700" },
                { label: "Bounced",       value: s.total_bounced.toLocaleString(),  color: "text-red-600" },
                { label: "Not Opened",    value: s.total_not_opened.toLocaleString(), color: "text-gray-500" },
              ].map(item => (
                <div key={item.label} className="bg-white/70 rounded-lg p-3 text-center">
                  <p className={`text-xl font-black ${item.color}`}>{item.value}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Stat cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Emails Sent"   value={s.total_sent.toLocaleString()}      sub={`${s.initial_emails} initial · ${s.total_followups} follow-ups`} color="text-blue-600"   bg="bg-blue-50"   icon={Mail} />
            <StatCard label="Open Rate"     value={`${s.open_rate}%`}                  sub={`${s.total_opened.toLocaleString()} emails opened`}               color="text-amber-600"  bg="bg-amber-50"  icon={Eye} />
            <StatCard label="Reply Rate"    value={`${s.reply_rate}%`}                 sub={`${s.total_replied.toLocaleString()} replies received`}            color="text-purple-600" bg="bg-purple-50" icon={MessageSquare} />
            <StatCard label="Bounce Rate"   value={`${s.bounce_rate}%`}                sub={`${s.total_bounced.toLocaleString()} bounced`}                     color="text-red-600"    bg="bg-red-50"    icon={AlertCircle} />
          </div>

          {/* ── Charts row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Daily activity bar chart */}
            <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <TrendingUp size={14} className="text-blue-600" /> Emails Sent Per Day
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.by_day} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barSize={5} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                  <Bar dataKey="sent"      name="Sent"       fill="#60a5fa" radius={[2,2,0,0]} />
                  <Bar dataKey="opened"    name="Opened"     fill="#fbbf24" radius={[2,2,0,0]} />
                  <Bar dataKey="replied"   name="Replied"    fill="#a78bfa" radius={[2,2,0,0]} />
                  <Bar dataKey="followups" name="Follow-Ups" fill="#34d399" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Donut chart */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Send size={14} className="text-blue-600" /> Email Outcomes
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={data.donut_data} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {data.donut_data.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any, name: any) => [`${value}`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1">
                {data.donut_data.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                      <span className="text-gray-600">{d.name}</span>
                    </div>
                    <span className="font-semibold text-gray-800">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Section 1: Emails Sent breakdown ── */}
          <Section title={`Emails Sent — ${s.total_sent.toLocaleString()} total`} icon={Mail} iconColor="text-blue-600">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-2">
              {/* Campaign breakdown */}
              {data.campaign_breakdown.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">By Campaign</p>
                  <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>{["Campaign","Sent","Opened","Replied","Bounced"].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {data.campaign_breakdown.slice(0, 8).map((c, i) => (
                          <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-[120px]">{c.name}</td>
                            <td className="px-3 py-2 text-gray-600">{c.sent}</td>
                            <td className="px-3 py-2 text-amber-600">{c.opened}</td>
                            <td className="px-3 py-2 text-purple-600">{c.replied}</td>
                            <td className="px-3 py-2 text-red-500">{c.bounced}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sector/niche breakdown */}
              {data.niche_breakdown.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">By Sector / Niche</p>
                  <ResponsiveContainer width="100%" height={Math.min(data.niche_breakdown.slice(0,8).length * 38, 280)}>
                    <BarChart layout="vertical" data={data.niche_breakdown.slice(0, 8)} margin={{ top: 0, right: 40, left: 0, bottom: 0 }} barSize={8} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="niche" width={90} tick={{ fontSize: 10, fill: "#374151" }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="sent"    name="Sent"    fill="#60a5fa" radius={[0,2,2,0]} />
                      <Bar dataKey="opened"  name="Opened"  fill="#fbbf24" radius={[0,2,2,0]} />
                      <Bar dataKey="replied" name="Replied" fill="#a78bfa" radius={[0,2,2,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </Section>

          {/* ── Section 2: Follow-Ups ── */}
          <Section title={`Follow-Ups — ${s.total_followups} sent`} icon={Send} iconColor="text-indigo-600">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-2">
              {/* FU1/FU2/FU3 bar chart */}
              {data.fu_breakdown.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">FU1 vs FU2 vs FU3 Performance</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.fu_breakdown} barSize={16} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                      <Bar dataKey="sent"    name="Sent"    fill="#818cf8" radius={[3,3,0,0]} />
                      <Bar dataKey="replies" name="Replies" fill="#a78bfa" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Which leads received follow-ups */}
              {data.followup_leads.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Leads That Received Follow-Ups</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {data.followup_leads.slice(0, 20).map((fl: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100">
                        <div>
                          <p className="text-xs font-semibold text-indigo-900 truncate max-w-[160px]">{fl.company}</p>
                          <p className="text-[10px] text-indigo-600">{fl.email}</p>
                        </div>
                        <div className="flex gap-1">
                          {fl.followup_numbers.map((n: number) => (
                            <span key={n} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-200 text-indigo-800 font-bold">FU{n}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {data.followup_leads.length > 20 && (
                      <p className="text-[10px] text-gray-400 text-center">+{data.followup_leads.length - 20} more</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* ── Section 3: Replies Received ── */}
          <Section title={`Replies Received — ${s.total_replied} total (${s.reply_rate}% reply rate)`} icon={MessageSquare} iconColor="text-purple-600">
            {data.reply_list.length === 0 ? (
              <p className="text-xs text-gray-400 py-3">No replies received this month.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {/* Classification summary */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(
                    data.reply_list.reduce((acc: Record<string, number>, r) => {
                      acc[r.classification] = (acc[r.classification] ?? 0) + 1;
                      return acc;
                    }, {})
                  ).map(([cls, cnt]) => {
                    const cfg = CLASSIFICATION_CONFIG[cls] ?? CLASSIFICATION_CONFIG.neutral;
                    const Icon = cfg.icon;
                    return (
                      <div key={cls} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold"
                        style={{ borderColor: cfg.color + "40", background: cfg.bg, color: cfg.color }}>
                        <Icon size={11} />
                        {cfg.label}: {cnt as number}
                      </div>
                    );
                  })}
                </div>

                {/* Reply list */}
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {data.reply_list.map((r, i) => {
                    const cfg = CLASSIFICATION_CONFIG[r.classification] ?? CLASSIFICATION_CONFIG.neutral;
                    const Icon = cfg.icon;
                    return (
                      <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3 hover:bg-white transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-xs font-bold text-gray-900 truncate">{r.company}</p>
                              <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(r.received_at)}</span>
                            </div>
                            <p className="text-[10px] text-gray-500 mb-1.5">{r.email}</p>
                            <p className="text-xs text-gray-700 line-clamp-2">{r.preview || "(no content)"}</p>
                          </div>
                          <div className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold shrink-0"
                            style={{ background: cfg.bg, color: cfg.color }}>
                            <Icon size={10} />
                            {cfg.label}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Section>

          {/* ── Section 4: Email Opens ── */}
          <Section title={`Email Opens — ${s.total_opened} opened (${s.open_rate}% open rate)`} icon={Eye} iconColor="text-amber-600">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-2">

              {/* Top subject lines by open rate */}
              {data.top_subject_lines.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Top Subject Lines by Open Rate</p>
                  <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          {["Subject","Sent","Opened","Rate"].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.top_subject_lines.map((s, i) => (
                          <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-800 max-w-[180px]">
                              <p className="truncate font-medium">{s.subject}</p>
                            </td>
                            <td className="px-3 py-2 text-gray-500">{s.sent}</td>
                            <td className="px-3 py-2 text-amber-600 font-semibold">{s.opened}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[40px]">
                                  <div className="h-1.5 rounded-full bg-amber-400" style={{ width: `${s.openRate}%` }} />
                                </div>
                                <span className="text-amber-700 font-bold text-[10px]">{s.openRate}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Most opened emails */}
              {data.opened_list.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Most Opened (by open count)</p>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {data.opened_list.slice(0, 15).map((o: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-amber-900 truncate">{o.company}</p>
                          <p className="text-[10px] text-amber-600 truncate">{o.subject}</p>
                        </div>
                        <div className="flex items-center gap-1.5 ml-2 shrink-0">
                          {o.clicked && <MousePointer size={10} className="text-green-500" />}
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-200 px-1.5 py-0.5 rounded-full">
                            {o.open_count}× open
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* ── Section 5: Clicks ── */}
          <Section title={`Link Clicks — ${s.total_clicked} total (${s.click_rate}% click rate)`} icon={MousePointer} iconColor="text-green-600">
            {data.clicked_list.length === 0 ? (
              <p className="text-xs text-gray-400 py-3">No link clicks recorded this month.</p>
            ) : (
              <div className="mt-2 rounded-lg border border-gray-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Company","Email","Subject","Clicked At","Clicks"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.clicked_list.slice(0, 20).map((c: any, i: number) => (
                      <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-[120px]">{c.company}</td>
                        <td className="px-3 py-2 text-gray-500 truncate max-w-[140px]">{c.email}</td>
                        <td className="px-3 py-2 text-gray-600 truncate max-w-[160px]">{c.subject}</td>
                        <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{c.clicked_at ? fmtDate(c.clicked_at) : "—"}</td>
                        <td className="px-3 py-2">
                          <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                            {c.click_count ?? 1}×
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.clicked_list.length > 20 && (
                  <p className="text-[10px] text-gray-400 text-center py-2">+{data.clicked_list.length - 20} more</p>
                )}
              </div>
            )}
          </Section>

          {/* ── Section 6: Bounced ── */}
          <Section title={`Bounced — ${s.total_bounced} total (${s.bounce_rate}% bounce rate)`} icon={AlertCircle} iconColor="text-red-500">
            {data.bounced_list.length === 0 ? (
              <p className="text-xs text-gray-400 py-3">No bounces this month. Great sender reputation!</p>
            ) : (
              <div className="mt-2 rounded-lg border border-gray-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Company","Email","Subject","Sent","Reason"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.bounced_list.map((b, i) => (
                      <tr key={i} className="border-t border-gray-100 hover:bg-red-50/40">
                        <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-[100px]">{b.company}</td>
                        <td className="px-3 py-2 text-gray-500 truncate max-w-[140px]">{b.email}</td>
                        <td className="px-3 py-2 text-gray-600 truncate max-w-[140px]">{b.subject}</td>
                        <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDate(b.sent_at)}</td>
                        <td className="px-3 py-2 text-red-600 truncate max-w-[140px]">{b.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── Section 7: Not Opened ── */}
          <Section title={`Not Opened — ${s.total_not_opened} emails never opened`} icon={EyeOff} iconColor="text-gray-400">
            {data.not_opened_list.length === 0 ? (
              <p className="text-xs text-gray-400 py-3">Everyone opened your emails this month!</p>
            ) : (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-3">
                  These leads received an email but never opened it. Consider sending a follow-up or removing them from your list.
                </p>
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Company","Email","Subject","Sent","Days Ago","Stage"].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.not_opened_list.slice(0, 50).map((n, i) => (
                        <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-[110px]">{n.company}</td>
                          <td className="px-3 py-2 text-gray-500 truncate max-w-[140px]">{n.email}</td>
                          <td className="px-3 py-2 text-gray-600 truncate max-w-[150px]">{n.subject}</td>
                          <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDate(n.sent_at)}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              n.days_since > 14 ? "bg-red-100 text-red-600" :
                              n.days_since > 7  ? "bg-amber-100 text-amber-600" :
                              "bg-gray-100 text-gray-500"
                            }`}>
                              {n.days_since}d ago
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              n.is_followup ? "bg-indigo-100 text-indigo-700" : "bg-blue-100 text-blue-700"
                            }`}>
                              {n.is_followup ? `FU${n.followup_number}` : "Initial"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.not_opened_list.length > 50 && (
                    <p className="text-[10px] text-gray-400 text-center py-2">
                      Showing 50 of {data.not_opened_list.length} — download CSV to see all
                    </p>
                  )}
                </div>
              </div>
            )}
          </Section>

          {/* ── Top companies by engagement ── */}
          <Section title="Top 10 Companies by Engagement" icon={TrendingUp} iconColor="text-blue-600">
            {data.top_companies.length === 0 ? (
              <p className="text-xs text-gray-400 py-3">No engagement data yet.</p>
            ) : (
              <div className="mt-2 rounded-lg border border-gray-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {["#","Company","Email","Sent","Opened","Clicked","Replied"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_companies.map((c, i) => (
                      <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400 font-bold">{i + 1}</td>
                        <td className="px-3 py-2 font-semibold text-gray-800 truncate max-w-[110px]">{c.company}</td>
                        <td className="px-3 py-2 text-gray-500 truncate max-w-[140px]">{c.email}</td>
                        <td className="px-3 py-2 text-gray-600">{c.sent}</td>
                        <td className="px-3 py-2">
                          {c.opened ? (
                            <span className="flex items-center gap-1 text-amber-600 font-semibold">
                              <Eye size={10} /> {c.openCount}×
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {c.clicked ? (
                            <span className="flex items-center gap-1 text-green-600 font-semibold">
                              <MousePointer size={10} /> {c.clickCount}×
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {c.replied ? (
                            <span className="flex items-center gap-1 text-purple-600 font-semibold">
                              <MessageSquare size={10} /> Yes
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── Daily timeline ── */}
          <Section title="Daily Activity Timeline" icon={Clock} iconColor="text-gray-500">
            <div className="mt-2 space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {data.by_day.filter(d => d.sent > 0 || d.replied > 0).map((d, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-xs font-bold text-gray-700">{MONTH_NAMES[month - 1].slice(0, 3)} {d.day}</p>
                  </div>
                  <div className="flex-1 flex flex-wrap gap-2">
                    {d.sent > 0 && (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                        <Mail size={9} /> {d.sent} sent
                      </span>
                    )}
                    {d.opened > 0 && (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                        <Eye size={9} /> {d.opened} opened
                      </span>
                    )}
                    {d.replied > 0 && (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">
                        <MessageSquare size={9} /> {d.replied} replied
                      </span>
                    )}
                    {d.followups > 0 && (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                        <Send size={9} /> {d.followups} follow-ups
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {data.by_day.every(d => d.sent === 0 && d.replied === 0) && (
                <p className="text-xs text-gray-400 text-center py-4">No activity recorded</p>
              )}
            </div>
          </Section>

          {/* ── Export footer ── */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-200">
            <p className="text-xs text-gray-500">
              Report for <strong>{MONTH_NAMES[month - 1]} {year}</strong> — {s.total_sent} emails sent
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportCSV(data)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-white transition-colors"
              >
                <Download size={12} /> Download CSV
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                <Download size={12} /> Download PDF
              </button>
            </div>
          </div>

        </>
      )}
    </div>
  );
}
