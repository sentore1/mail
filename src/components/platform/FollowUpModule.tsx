"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Lead, EmailReply, SentEmail } from "@/types/platform";
import {
  Send, Loader2, X, ChevronRight, ChevronLeft,
  Sparkles, RefreshCw, Eye, MousePointer,
  Edit3, Search, Clock, Calendar, RotateCcw,
  Activity, AlertCircle, Bot, User, AtSign,
} from "lucide-react";
import { createClient } from "../../../supabase/client";
import { toast } from "sonner";

interface FollowUpModuleProps { userId: string; }
interface FUDraft { subject: string; body: string; decisionReason: string; modelUsed: string; }
interface LeadThread {
  leadId: string; leadEmail: string; companyName: string; niche: string | null;
  emails: SentEmail[]; replies: EmailReply[];
  hasReply: boolean; latestStatus: string; followupCount: number;
  priority: number; isDueToday: boolean;
}
interface ActivityLogEntry {
  id: string; lead_id: string | null; company_name: string | null;
  email: string | null; followup_number: number; subject: string | null;
  status: string; error_message: string | null; is_auto: boolean;
  needs_manual_review: boolean; sent_at: string;
}

function daysSince(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000); }
function fdate(d: string) { return d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""; }
function fdatetime(d: string) { return d ? new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; }

export default function FollowUpModule({ userId }: FollowUpModuleProps) {
  const sb = createClient();

  const [activeTab, setActiveTab] = useState<"manual" | "activity">("manual");
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [replies, setReplies] = useState<EmailReply[]>([]);
  const [leads, setLeads] = useState<Map<string, Lead>>(new Map());
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [catchingUp, setCatchingUp] = useState(false);
  const [dueLeadIds, setDueLeadIds] = useState<Set<string>>(new Set());

  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityTableMissing, setActivityTableMissing] = useState(false);

  const [search, setSearch] = useState("");
  const [nicheFilter, setNicheFilter] = useState("all");
  const [fuFilter, setFuFilter] = useState<number | "all">("all");
  const [dueOnlyFilter, setDueOnlyFilter] = useState(false);
  const [daysFilter, setDaysFilter] = useState(0);
  const [sortBy, setSortBy] = useState<"priority" | "days" | "name">("priority");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const [drawerThread, setDrawerThread] = useState<LeadThread | null>(null);
  const [drawerGenerating, setDrawerGenerating] = useState(false);
  const [drawerDraft, setDrawerDraft] = useState<FUDraft | null>(null);
  const [drawerSubj, setDrawerSubj] = useState("");
  const [drawerBody, setDrawerBody] = useState("");
  const [drawerSending, setDrawerSending] = useState(false);
  const [drawerSchedule, setDrawerSchedule] = useState("");

  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [bulkPreviews, setBulkPreviews] = useState<Array<{
    leadId: string; companyName: string; leadEmail: string;
    subject: string; body: string; latestEmailId: string;
    skipped: boolean; skipReason?: string;
  }>>([]);
  const [bulkStep, setBulkStep] = useState<"list" | "review" | "sending">("list");
  const [bulkReviewIndex, setBulkReviewIndex] = useState(-1);
  const [bulkTone, setBulkTone] = useState("Direct");

  const STORAGE_KEY = `pryro_fu_sender_${userId}`;
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const saveSender = (n: string, p: string) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: n, phone: p })); } catch {} };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: contactedLeads } = await sb.from("leads").select("*")
        .eq("user_id", userId)
        .in("status", ["contacted", "Email Sent", "opened", "clicked", "Replied", "replied", "Interested"])
        .order("last_contacted_at", { ascending: false }).limit(1000);
      const [s, r, q] = await Promise.all([
        sb.from("sent_emails").select("*").eq("user_id", userId)
          .not("lead_id", "is", null)
          .not("status", "in", '("failed","bounced","invalid_email")')
          .order("sent_at", { ascending: false }).limit(1000),
        sb.from("email_replies").select("*").eq("user_id", userId).order("received_at", { ascending: false }),
        sb.from("followup_queue").select("lead_id").eq("user_id", userId)
          .eq("status", "pending").lte("scheduled_at", new Date().toISOString()),
      ]);
      if (s.data) setSentEmails(s.data as SentEmail[]);
      if (r.data) setReplies(r.data as EmailReply[]);
      if (q.data) setDueLeadIds(new Set(q.data.map((x: any) => x.lead_id as string)));
      const m = new Map<string, Lead>();
      contactedLeads?.forEach((l: Lead) => m.set(l.id, l));
      const missing = new Set<string>();
      s.data?.forEach((e: any) => { if (e.lead_id && !m.has(e.lead_id)) missing.add(e.lead_id); });
      if (missing.size > 0) {
        const { data: extra } = await sb.from("leads").select("*").in("id", Array.from(missing));
        extra?.forEach((l: Lead) => m.set(l.id, l));
      }
      setLeads(m);
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  }, [userId, sb]);

  const loadActivityLog = useCallback(async () => {
    setActivityLoading(true);
    try {
      const { data, error } = await sb.from("followup_activity_log").select("*")
        .eq("user_id", userId).not("status", "eq", "daily_summary")
        .order("sent_at", { ascending: false }).limit(200);
      if (error) { if (error.code === "42P01") setActivityTableMissing(true); else toast.error("Could not load activity log"); return; }
      setActivityLog((data ?? []) as ActivityLogEntry[]);
    } catch { setActivityTableMissing(true); }
    finally { setActivityLoading(false); }
  }, [userId, sb]);

  useEffect(() => {
    load();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) { const { name, phone } = JSON.parse(stored); if (name) setSenderName(name); if (phone) setSenderPhone(phone); return; }
    } catch {}
    sb.from("smtp_accounts").select("sender_name,email").eq("user_id", userId).eq("status", "active")
      .order("sent_today", { ascending: true }).limit(1).single()
      .then(({ data }) => { if (data) setSenderName(data.sender_name || data.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())); });
    const c1 = sb.channel("fu_r2").on("postgres_changes", { event: "*", schema: "public", table: "email_replies" }, load).subscribe();
    const c2 = sb.channel("fu_s2").on("postgres_changes", { event: "UPDATE", schema: "public", table: "sent_emails" }, load).subscribe();
    return () => { c1.unsubscribe(); c2.unsubscribe(); };
  }, [load]);

  const allThreads: LeadThread[] = useMemo(() => {
    const map = new Map<string, LeadThread>();
    const sorted = [...sentEmails].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
    for (const e of sorted) {
      if (!e.lead_id) continue;
      const lead = leads.get(e.lead_id);
      if (!lead?.email) continue;
      if (!map.has(e.lead_id)) map.set(e.lead_id, { leadId: e.lead_id, leadEmail: lead.email, companyName: lead.company_name || lead.email, niche: lead.niche || null, emails: [], replies: [], hasReply: false, latestStatus: e.status || "sent", followupCount: 0, priority: 0, isDueToday: dueLeadIds.has(e.lead_id) });
      const t = map.get(e.lead_id)!;
      t.emails.push(e);
      if (!["failed","bounced"].includes(e.status || "")) t.latestStatus = e.status || "sent";
    }
    for (const r of replies) {
      const key = r.lead_id || "";
      if (map.has(key)) { map.get(key)!.replies.push(r); map.get(key)!.hasReply = true; map.get(key)!.latestStatus = "replied"; }
    }
    const all = Array.from(map.values());
    for (const t of all) {
      t.followupCount = t.emails.filter((e: any) => e.is_followup).length;
      const latest = t.emails.filter(e => !["failed","bounced"].includes(e.status || "")).slice(-1)[0];
      t.priority = latest?.clicked_at ? 2 : latest?.opened_at ? 1 : 0;
      t.isDueToday = dueLeadIds.has(t.leadId);
    }
    return all.filter(t => t.emails.some(e => !["failed","bounced"].includes(e.status || "")));
  }, [sentEmails, replies, leads, dueLeadIds]);

  const eligible = useMemo(() => allThreads.filter(t => !t.hasReply && !["bounced","failed"].includes(t.latestStatus)), [allThreads]);
  const niches = useMemo(() => Array.from(new Set(eligible.map(t => t.niche || "").filter(Boolean))).sort(), [eligible]);
  const fuCounts = useMemo(() => Array.from(new Set(eligible.map(t => t.followupCount))).sort((a,b) => a-b), [eligible]);
  const stageCounts = useMemo(() => { const m: Record<number,number> = {}; eligible.forEach(t => { m[t.followupCount] = (m[t.followupCount]||0)+1; }); return m; }, [eligible]);
  const getLatest = (t: LeadThread) => t.emails.filter(e => !["failed","bounced"].includes(e.status||"")).slice(-1)[0];

  const filtered = useMemo(() => {
    let list = eligible;
    if (search) { const q = search.toLowerCase(); list = list.filter(t => t.companyName.toLowerCase().includes(q) || t.leadEmail.toLowerCase().includes(q)); }
    if (nicheFilter !== "all") list = list.filter(t => (t.niche||"") === nicheFilter);
    if (fuFilter !== "all") list = list.filter(t => t.followupCount === fuFilter);
    if (dueOnlyFilter) list = list.filter(t => t.isDueToday);
    if (daysFilter > 0) list = list.filter(t => { const l = getLatest(t); return l ? daysSince(l.sent_at) >= daysFilter : false; });
    return [...list].sort((a,b) => {
      if (sortBy === "priority") {
        if (a.isDueToday !== b.isDueToday) return a.isDueToday ? -1 : 1;
        if (b.priority !== a.priority) return b.priority - a.priority;
        return daysSince(getLatest(b)?.sent_at||"") - daysSince(getLatest(a)?.sent_at||"");
      }
      if (sortBy === "days") return daysSince(getLatest(b)?.sent_at||"") - daysSince(getLatest(a)?.sent_at||"");
      if (sortBy === "name") return a.companyName.localeCompare(b.companyName);
      return 0;
    });
  }, [eligible, search, nicheFilter, fuFilter, dueOnlyFilter, daysFilter, sortBy]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page+1) * PAGE_SIZE);
  const overdueCount = eligible.filter(t => { const l = getLatest(t); return l ? daysSince(l.sent_at) >= 3 : false; }).length;

  const openDrawer = (t: LeadThread) => { setDrawerThread(t); setDrawerDraft(null); setDrawerSubj(""); setDrawerBody(""); setDrawerSchedule(""); };
  const closeDrawer = () => { setDrawerThread(null); setDrawerDraft(null); };

  const generateForDrawer = async () => {
    if (!drawerThread) return;
    setDrawerGenerating(true); setDrawerDraft(null);
    try {
      const latest = getLatest(drawerThread);
      if (!latest) throw new Error("No valid sent email");
      const r = await fetch("/api/followup/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sentEmailId: latest.id, leadId: drawerThread.leadId, followupNumber: drawerThread.followupCount + 1, tone: "Direct", overrideContext: { senderName: senderName || undefined, senderPhone: senderPhone || undefined } }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setDrawerDraft({ subject: d.subject, body: d.body, decisionReason: d.decisionReason, modelUsed: d.modelUsed });
      setDrawerSubj(d.subject); setDrawerBody(d.body);
    } catch (e: any) { toast.error(e.message || "Failed to generate"); }
    finally { setDrawerGenerating(false); }
  };

  const sendFromDrawer = async () => {
    if (!drawerThread || !drawerBody.trim()) return;
    setDrawerSending(true);
    try {
      const dupeRes = await fetch("/api/followup/check-duplicate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: drawerThread.leadId, followupNumber: drawerThread.followupCount + 1 }) });
      const dupeData = await dupeRes.json();
      if (dupeData.isDuplicate) { toast.warning("Already sent in last 24h."); setDrawerSending(false); return; }
      const res = await fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: drawerThread.leadEmail, subject: drawerSubj, body: drawerBody, leadId: drawerThread.leadId, scheduleFollowups: false }) });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      await fetch("/api/followup/mark-sent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: drawerThread.leadId, followupNumber: drawerThread.followupCount + 1, sentEmailId: d.sentEmailId ?? "", threadId: d.threadId ?? undefined, subject: drawerSubj, body: drawerBody, companyName: drawerThread.companyName, leadEmail: drawerThread.leadEmail }) }).catch(() => {});
      toast.success(`Sent to ${drawerThread.companyName}`);
      setDrawerThread(null); load();
    } catch (e: any) { toast.error(e.message || "Send failed"); }
    finally { setDrawerSending(false); }
  };

  const toggleSelect = (id: string) => setBulkSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setBulkSelected(new Set(filtered.map(t => t.leadId)));
  const clearAll = () => setBulkSelected(new Set());

  const generateBulk = async () => {
    const targets = filtered.filter(t => bulkSelected.has(t.leadId));
    if (!targets.length) return;
    setBulkGenerating(true); setBulkProgress({ done: 0, total: targets.length, errors: 0 });
    const previews: typeof bulkPreviews = [];
    let errors = 0;
    for (let i = 0; i < targets.length; i++) {
      const thread = targets[i];
      const latest = getLatest(thread);
      if (!latest) { previews.push({ leadId: thread.leadId, companyName: thread.companyName, leadEmail: thread.leadEmail, subject: "", body: "", latestEmailId: "", skipped: true, skipReason: "No valid sent email" }); errors++; setBulkProgress({ done: i+1, total: targets.length, errors }); continue; }
      try {
        const res = await fetch("/api/followup/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sentEmailId: latest.id, leadId: thread.leadId, followupNumber: thread.followupCount + 1, tone: bulkTone, overrideContext: { senderName: senderName || undefined, senderPhone: senderPhone || undefined } }) });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        previews.push({ leadId: thread.leadId, companyName: thread.companyName, leadEmail: thread.leadEmail, subject: data.subject, body: data.body, latestEmailId: latest.id, skipped: false });
      } catch (e: any) { errors++; previews.push({ leadId: thread.leadId, companyName: thread.companyName, leadEmail: thread.leadEmail, subject: "", body: "", latestEmailId: latest?.id || "", skipped: true, skipReason: e.message }); }
      setBulkProgress(prev => ({ ...prev, done: i+1, errors }));
    }
    setBulkPreviews(previews); setBulkGenerating(false); setBulkReviewIndex(0); setBulkStep("review");
  };

  const sendBulk = async () => {
    const toSend = bulkPreviews.filter(p => !p.skipped && p.body.trim());
    if (!toSend.length) return;
    setBulkStep("sending"); setBulkProgress({ done: 0, total: toSend.length, errors: 0 });
    let errors = 0;
    for (let i = 0; i < toSend.length; i++) {
      const p = toSend[i];
      try {
        const res = await fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: p.leadEmail, subject: p.subject, body: p.body, leadId: p.leadId, scheduleFollowups: false }) });
        const d = await res.json();
        if (!d.success) throw new Error(d.error);
        setBulkProgress(prev => ({ ...prev, done: i+1 }));
      } catch { errors++; setBulkProgress(prev => ({ ...prev, done: i+1, errors: prev.errors+1 })); }
      if (i < toSend.length-1) await new Promise(r => setTimeout(r, 2000));
    }
    const sent = toSend.length - errors;
    if (sent > 0) toast.success(`${sent} sent${errors > 0 ? `, ${errors} failed` : ""}`);
    else toast.error("All failed.");
    setBulkSelected(new Set()); setBulkPreviews([]); setBulkStep("list"); load();
  };

  const updatePreview = (leadId: string, f: "subject"|"body", v: string) => setBulkPreviews(prev => prev.map(p => p.leadId === leadId ? { ...p, [f]: v } : p));
  const skipPreview = (leadId: string) => setBulkPreviews(prev => prev.map(p => p.leadId === leadId ? { ...p, skipped: !p.skipped } : p));

  const checkInbox = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/inbox/check", { method: "POST" });
      const data = await res.json();
      if (data.success && data.totalNewReplies > 0) { toast.success(`${data.totalNewReplies} new replies`); load(); } else toast.info("No new replies");
    } catch { toast.error("Inbox check failed"); } finally { setChecking(false); }
  };

  const catchUpNow = async () => {
    setCatchingUp(true);
    try {
      const res = await fetch("/api/followup/catchup", { method: "POST" });
      const data = await res.json();
      if (data.success) { toast.success(data.message ?? "Catch-up complete"); load(); if (activeTab === "activity") loadActivityLog(); }
      else toast.error(data.error ?? "Catch-up failed");
    } catch { toast.error("Catch-up failed"); }
    finally { setCatchingUp(false); }
  };

  // ── Bulk review screen
  if (bulkStep === "review") {
    const readyCount = bulkPreviews.filter(p => !p.skipped && p.body.trim()).length;
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-gray-900">{readyCount} ready to send</p>
            <span className="text-xs text-gray-400">Review and edit before sending</span>
          </div>
          <button onClick={() => { setBulkStep("list"); setBulkPreviews([]); }} className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50">Back</button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-44">Company</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Subject</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-20">Status</th>
                <th className="px-4 py-2.5 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bulkPreviews.map((p, idx) => (
                <tr key={p.leadId} className={`hover:bg-gray-50 ${p.skipped ? "opacity-40" : ""}`}>
                  <td className="px-4 py-3 text-xs font-medium text-gray-900 truncate max-w-[160px]">{p.companyName}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 truncate">{p.subject || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${p.skipped ? "bg-white text-gray-400 border-gray-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                      {p.skipped ? "Skipped" : "Ready"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setBulkReviewIndex(idx)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"><Edit3 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 shrink-0">
          <button onClick={sendBulk} disabled={readyCount === 0} className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2">
            <Send size={14} /> Send {readyCount} follow-up{readyCount !== 1 ? "s" : ""}
          </button>
        </div>
        {bulkReviewIndex >= 0 && bulkPreviews[bulkReviewIndex] && (() => {
          const cur = bulkPreviews[bulkReviewIndex];
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setBulkReviewIndex(-1)}>
              <div className="absolute inset-0 bg-black/20" />
              <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                  <div><p className="text-sm font-semibold text-gray-900">{cur.companyName}</p><p className="text-xs text-gray-400">{cur.leadEmail}</p></div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => skipPreview(cur.leadId)} className={`text-xs px-2.5 py-1.5 rounded-md border ${cur.skipped ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>{cur.skipped ? "Undo" : "Skip"}</button>
                    <span className="text-xs text-gray-400">{bulkReviewIndex+1}/{bulkPreviews.length}</span>
                    <button onClick={() => setBulkReviewIndex(i => Math.max(0,i-1))} disabled={bulkReviewIndex===0} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={14}/></button>
                    <button onClick={() => setBulkReviewIndex(i => Math.min(bulkPreviews.length-1,i+1))} disabled={bulkReviewIndex===bulkPreviews.length-1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={14}/></button>
                    <button onClick={() => setBulkReviewIndex(-1)} className="p-1.5 rounded hover:bg-gray-100"><X size={15} className="text-gray-400"/></button>
                  </div>
                </div>
                <div className={`flex-1 overflow-y-auto p-5 space-y-4 ${cur.skipped ? "opacity-40 pointer-events-none" : ""}`}>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Subject</label><input value={cur.subject} onChange={e => updatePreview(cur.leadId,"subject",e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"/></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Body</label><textarea value={cur.body} onChange={e => updatePreview(cur.leadId,"body",e.target.value)} rows={10} className="w-full px-3 py-2 rounded-lg text-sm border border-gray-200 focus:border-blue-400 outline-none resize-none"/></div>
                </div>
                <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
                  <button onClick={() => setBulkReviewIndex(-1)} className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Close</button>
                  {bulkReviewIndex < bulkPreviews.length-1 && <button onClick={() => setBulkReviewIndex(i => i+1)} className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700">Next</button>}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ── Sending overlay
  if (bulkStep === "sending") return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm mx-4 text-center border border-gray-200">
        <Loader2 size={24} className="animate-spin text-blue-600 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-900">Sending follow-ups</p>
        <p className="text-xs text-gray-400 mt-1">{bulkProgress.done} of {bulkProgress.total}</p>
        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-4"><div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.done/bulkProgress.total)*100 : 0}%` }}/></div>
        {bulkProgress.errors > 0 && <p className="text-xs text-gray-500 mt-2">{bulkProgress.errors} failed</p>}
      </div>
    </div>
  );

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-blue-600"/></div>;

  // ── Activity log tab
  if (activeTab === "activity") return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="flex gap-0 px-6 pt-4 border-b border-gray-200 shrink-0">
        <button onClick={() => setActiveTab("manual")} className="px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-800">Manual</button>
        <button onClick={() => { setActiveTab("activity"); loadActivityLog(); }} className="px-4 py-2.5 text-sm font-medium border-b-2 border-blue-600 text-blue-600 flex items-center gap-1.5">
          <Activity size={13}/> Activity Log
        </button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {activityLoading ? <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-blue-600"/></div>
        : activityTableMissing ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <AlertCircle size={28} className="text-gray-300"/>
            <p className="text-sm font-medium text-gray-600">Activity log not set up</p>
            <p className="text-xs text-gray-400 max-w-sm">Run <strong>SETUP_FOLLOWUP_ACTIVITY_LOG.sql</strong> in Supabase SQL Editor.</p>
            <button onClick={loadActivityLog} className="mt-1 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700"><RefreshCw size={11}/> Retry</button>
          </div>
        ) : activityLog.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <Activity size={28} className="text-gray-200"/>
            <p className="text-sm text-gray-400">No automatic activity yet</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Company</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-16">Stage</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Subject</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-32">Time</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-20">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-16">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activityLog.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><p className="text-xs font-medium text-gray-900 truncate max-w-[150px]">{entry.company_name||"—"}</p><p className="text-[11px] text-gray-400 truncate">{entry.email||""}</p></td>
                    <td className="px-4 py-3"><span className="text-[10px] text-gray-500">FU #{entry.followup_number||"—"}</span></td>
                    <td className="px-4 py-3"><p className="text-xs text-gray-600 truncate max-w-[200px]">{entry.subject||"—"}</p>{entry.error_message&&<p className="text-[10px] text-red-400 truncate">{entry.error_message}</p>}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{fdatetime(entry.sent_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${entry.status==="sent"?"bg-blue-50 text-blue-700 border-blue-100":entry.status==="failed"?"bg-red-50 text-red-600 border-red-100":"bg-gray-50 text-gray-500 border-gray-200"}`}>
                        {entry.status==="sent"?"Sent":entry.status==="failed"?"Failed":entry.status==="duplicate_skipped"?"Duplicate":"Skipped"}
                      </span>
                      {entry.needs_manual_review&&<span className="ml-1 text-[10px] text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded-full">Review</span>}
                    </td>
                    <td className="px-4 py-3">
                      {entry.is_auto
                        ? <span className="flex items-center gap-1 text-[10px] text-gray-500"><Bot size={9}/>Auto</span>
                        : <span className="flex items-center gap-1 text-[10px] text-gray-400"><User size={9}/>Manual</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ── Main layout
  return (
    <div className="flex h-full bg-white overflow-hidden">
      {/* Left: table */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Tabs */}
        <div className="flex gap-0 px-6 pt-4 border-b border-gray-200 shrink-0">
          <button onClick={() => setActiveTab("manual")} className="px-4 py-2.5 text-sm font-medium border-b-2 border-blue-600 text-blue-600">Manual</button>
          <button onClick={() => { setActiveTab("activity"); loadActivityLog(); }} className="px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-1.5">
            <Activity size={13}/> Activity Log
          </button>
        </div>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-base font-semibold text-gray-900">Follow-Up</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {eligible.length} eligible
                {overdueCount > 0 && <> · <span className="text-red-500 font-medium">{overdueCount} overdue</span></>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {bulkSelected.size > 0 && (
                <button onClick={generateBulk} disabled={bulkGenerating} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {bulkGenerating ? <><Loader2 size={12} className="animate-spin"/>Generating {bulkProgress.done}/{bulkProgress.total}</> : <><Sparkles size={12}/>Generate {bulkSelected.size}</>}
                </button>
              )}
              {dueLeadIds.size > 0 && (
                <button onClick={catchUpNow} disabled={catchingUp} className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 text-blue-700 text-xs font-medium rounded-md hover:bg-blue-50 disabled:opacity-50">
                  {catchingUp ? <><Loader2 size={12} className="animate-spin"/>Processing</> : <><Send size={12}/>Send overdue ({dueLeadIds.size})</>}
                </button>
              )}
              <button onClick={checkInbox} disabled={checking} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-xs font-medium rounded-md hover:bg-gray-50 disabled:opacity-50">
                {checking ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>} Refresh
              </button>
            </div>
          </div>

          {/* Filters row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search company or email" className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-md outline-none focus:border-blue-400 bg-white placeholder:text-gray-400"/>
            </div>
            <button onClick={() => { setDueOnlyFilter(v => !v); setPage(0); }} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-all ${dueOnlyFilter ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
              <Clock size={11}/> Due only{dueLeadIds.size > 0 && !dueOnlyFilter && ` (${dueLeadIds.size})`}
            </button>
            <select value={daysFilter} onChange={e => { setDaysFilter(Number(e.target.value)); setPage(0); }} className="px-3 py-2 text-xs border border-gray-200 rounded-md outline-none bg-white text-gray-600 focus:border-blue-400">
              <option value={0}>All days</option>
              <option value={3}>3+ days</option>
              <option value={5}>5+ days</option>
              <option value={7}>7+ days</option>
            </select>
            {niches.length > 0 && (
              <select value={nicheFilter} onChange={e => { setNicheFilter(e.target.value); setPage(0); }} className="px-3 py-2 text-xs border border-gray-200 rounded-md outline-none bg-white text-gray-600 focus:border-blue-400">
                <option value="all">All niches</option>
                {niches.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            {/* Sort */}
            <div className="flex border border-gray-200 rounded-md overflow-hidden text-xs">
              {(["priority","days","name"] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)} className={`px-3 py-2 font-medium transition-colors ${sortBy===s ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                  {s === "priority" ? "Priority" : s === "days" ? "Days" : "A–Z"}
                </button>
              ))}
            </div>
          </div>

          {/* Stage filter pills — minimal text-only */}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            <button onClick={() => { setFuFilter("all"); setPage(0); }} className={`px-2.5 py-1 text-xs rounded-md border transition-all ${fuFilter==="all" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
              All ({eligible.length})
            </button>
            {fuCounts.map(fc => (
              <button key={fc} onClick={() => { setFuFilter(fc); setPage(0); }} className={`px-2.5 py-1 text-xs rounded-md border transition-all ${fuFilter===fc ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                {fc === 0 ? "No FU" : `FU #${fc} sent`} ({stageCounts[fc]||0})
              </button>
            ))}
          </div>
        </div>

        {/* Bulk bar */}
        {bulkSelected.size > 0 && (
          <div className="flex items-center gap-3 px-6 py-2.5 bg-blue-50 border-b border-blue-100 shrink-0">
            <span className="text-xs font-medium text-blue-800">{bulkSelected.size} selected</span>
            <div className="flex items-center gap-1">
              {["Direct","Aggressive","Surgical"].map(t => (
                <button key={t} onClick={() => setBulkTone(t)} className={`px-2 py-1 rounded text-xs border transition-all ${bulkTone===t ? "bg-blue-600 text-white border-blue-600" : "border-blue-200 text-blue-700 hover:bg-blue-100"}`}>{t}</button>
              ))}
            </div>
            <button onClick={clearAll} className="ml-auto text-xs text-blue-500 hover:text-blue-700">Clear</button>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-gray-400">
              <Send size={28} className="opacity-30"/>
              <p className="text-sm">No leads to follow up</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
                  <tr>
                    <th className="px-4 py-2.5 w-8"><input type="checkbox" checked={paginated.length>0&&paginated.every(t=>bulkSelected.has(t.leadId))} onChange={e => e.target.checked ? selectAll() : clearAll()} className="rounded border-gray-300 text-blue-600"/></th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wide">Company</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wide w-20">Stage</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wide w-24">Last email</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wide w-16">Days</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wide w-24">Engagement</th>
                    <th className="px-4 py-2.5 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.map(thread => {
                    const latest = getLatest(thread);
                    const days = latest ? daysSince(latest.sent_at) : 0;
                    const isSel = bulkSelected.has(thread.leadId);
                    return (
                      <tr key={thread.leadId} className={`hover:bg-gray-50 cursor-pointer transition-colors ${isSel ? "bg-blue-50/40" : ""}`} onClick={() => openDrawer(thread)}>
                        <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelect(thread.leadId); }}>
                          <input type="checkbox" checked={isSel} readOnly className="rounded border-gray-300 text-blue-600"/>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {thread.priority === 2 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"/>}
                            {thread.priority === 1 && <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0"/>}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{thread.companyName}</p>
                              <p className="text-[11px] text-gray-400 truncate">{thread.leadEmail}{thread.niche ? ` · ${thread.niche}` : ""}</p>
                            </div>
                            {thread.isDueToday && <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-600 font-medium">Due</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-500">{thread.followupCount === 0 ? "FU #1" : `FU #${thread.followupCount + 1}`}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{latest ? fdate(latest.sent_at) : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${days >= 7 ? "text-red-500" : days >= 3 ? "text-gray-600" : "text-gray-400"}`}>{days}d</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-[11px] text-gray-400">
                            {latest?.clicked_at && <span className="flex items-center gap-1 text-blue-600 font-medium"><MousePointer size={10}/>Clicked</span>}
                            {latest?.opened_at && !latest?.clicked_at && <span className="flex items-center gap-1 text-gray-500"><Eye size={10}/>Opened</span>}
                            {!latest?.opened_at && !latest?.clicked_at && "No opens"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={e => { e.stopPropagation(); openDrawer(thread); }} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                            Follow Up
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-white">
                  <span className="text-xs text-gray-400">{filtered.length} leads · Page {page+1} of {totalPages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0} className="px-3 py-1.5 text-xs border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50">Prev</button>
                    <button onClick={() => setPage(p => Math.min(totalPages-1,p+1))} disabled={page>=totalPages-1} className="px-3 py-1.5 text-xs border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right: drawer */}
      {drawerThread && (
        <div className="w-[400px] shrink-0 border-l border-gray-200 flex flex-col bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{drawerThread.companyName}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{drawerThread.leadEmail}</p>
                {drawerThread.niche && <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded border border-gray-200 text-gray-500 bg-gray-50">{drawerThread.niche}</span>}
              </div>
              <button onClick={closeDrawer} className="p-1.5 hover:bg-gray-100 rounded-md shrink-0"><X size={15} className="text-gray-400"/></button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-gray-500 border border-gray-200 px-2 py-0.5 rounded-md bg-gray-50">
                {drawerThread.followupCount === 0 ? "No follow-ups sent" : `${drawerThread.followupCount} sent`} · Next: FU #{drawerThread.followupCount + 1}
              </span>
              {drawerThread.isDueToday && <span className="text-[10px] px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-600">Due</span>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Email history */}
            <div>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">History</p>
              <div className="space-y-2">
                {drawerThread.emails.filter(e => !["failed","bounced"].includes(e.status||"")).map((email, idx) => {
                  const isFU = (email as any).is_followup;
                  return (
                    <div key={email.id} className="rounded-md border border-gray-200 px-3 py-2.5 bg-gray-50">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] text-gray-500 font-medium">{isFU ? `FU #${(email as any).followup_number||idx}` : "Original"}</span>
                        <span className="text-[10px] text-gray-400">{fdate(email.sent_at)}</span>
                      </div>
                      <p className="text-xs text-gray-700 truncate">{email.subject}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {email.opened_at ? <span className="flex items-center gap-1 text-[10px] text-gray-500"><Eye size={9}/>Opened</span> : <span className="text-[10px] text-gray-300">Not opened</span>}
                        {email.clicked_at && <span className="flex items-center gap-1 text-[10px] text-blue-500"><MousePointer size={9}/>Clicked</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sender fields */}
            <div className="rounded-md border border-gray-200 p-3 space-y-2">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1"><AtSign size={9}/>Sender</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 mb-0.5 block">Name</label>
                  <input value={senderName} onChange={e => { setSenderName(e.target.value); saveSender(e.target.value, senderPhone); }} placeholder="Your name" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:border-blue-400 bg-white"/>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-0.5 block">Phone</label>
                  <input value={senderPhone} onChange={e => { setSenderPhone(e.target.value); saveSender(senderName, e.target.value); }} placeholder="Phone" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:border-blue-400 bg-white"/>
                </div>
              </div>
            </div>

            {/* Generate / draft */}
            {!drawerDraft ? (
              <button onClick={generateForDrawer} disabled={drawerGenerating} className="w-full py-2.5 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {drawerGenerating ? <><Loader2 size={14} className="animate-spin"/>Generating…</> : <><Sparkles size={14}/>Generate FU #{drawerThread.followupCount + 1}</>}
              </button>
            ) : (
              <div className="space-y-3">
                {drawerDraft.decisionReason && <p className="text-[11px] text-gray-400 bg-gray-50 rounded-md px-3 py-2 border border-gray-100">{drawerDraft.decisionReason}</p>}
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Subject</label>
                  <input value={drawerSubj} onChange={e => setDrawerSubj(e.target.value)} className="w-full px-3 py-2 rounded-md text-xs font-medium text-gray-900 border border-gray-200 focus:border-blue-400 outline-none"/>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Body</label>
                  <div className="rounded-md border border-gray-200 px-3 py-2.5 text-xs text-gray-700 leading-relaxed space-y-2 min-h-[60px] bg-gray-50 mb-2">
                    {drawerBody.split(/\n\n+/).map((p,i) => <p key={i} className="whitespace-pre-wrap">{p}</p>)}
                  </div>
                  <textarea value={drawerBody} onChange={e => setDrawerBody(e.target.value)} rows={7} className="w-full px-3 py-2 rounded-md text-xs text-gray-900 border border-gray-200 focus:border-blue-400 outline-none resize-none bg-white"/>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={12} className="text-gray-400 shrink-0"/>
                  <input type="datetime-local" value={drawerSchedule} onChange={e => setDrawerSchedule(e.target.value)} className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:border-blue-400 bg-white text-gray-600"/>
                  {drawerSchedule && <button onClick={() => setDrawerSchedule("")} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>}
                </div>
                <div className="flex gap-2">
                  <button onClick={generateForDrawer} disabled={drawerGenerating} className="flex items-center gap-1 px-3 py-2 border border-gray-200 text-gray-500 text-xs rounded-md hover:bg-gray-50 disabled:opacity-50"><RotateCcw size={10}/>Redo</button>
                  <button onClick={() => setDrawerDraft(null)} className="px-3 py-2 border border-gray-200 text-gray-500 text-xs rounded-md hover:bg-gray-50">Cancel</button>
                  <button onClick={sendFromDrawer} disabled={drawerSending || !drawerBody.trim()} className="flex-1 py-2 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {drawerSending ? <><Loader2 size={12} className="animate-spin"/>Sending…</> : <><Send size={12}/>{drawerSchedule ? "Schedule" : `Send FU #${drawerThread.followupCount+1}`}</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
