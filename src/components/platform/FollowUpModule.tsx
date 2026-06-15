"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Lead, EmailReply, AIReply, SentEmail } from "@/types/platform";
import {
  Send, Loader2, X, ChevronDown, ChevronRight, ChevronLeft,
  Sparkles, RefreshCw, Eye, MousePointer, CheckCircle,
  Edit3, AtSign, Search, Clock, Mail,
  ArrowUpDown, Calendar, RotateCcw, Users, Activity, AlertCircle,
  Bot, User,
} from "lucide-react";
import { createClient } from "../../../supabase/client";
import { toast } from "sonner";

interface FollowUpModuleProps { userId: string; }
interface FUDraft { subject: string; body: string; decisionReason: string; modelUsed: string; }
interface LeadThread {
  leadId: string; leadEmail: string; companyName: string; niche: string | null;
  emails: SentEmail[]; replies: EmailReply[];
  hasReply: boolean; latestStatus: string; followupCount: number;
  priority: number;
  isDueToday: boolean;
}

interface ActivityLogEntry {
  id: string;
  lead_id: string | null;
  company_name: string | null;
  email: string | null;
  followup_number: number;
  subject: string | null;
  status: string;
  error_message: string | null;
  is_auto: boolean;
  needs_manual_review: boolean;
  sent_at: string;
}

// ── FU Stage config ────────────────────────────────────────────────────────────
const FU_STAGE = [
  { n: 0, label: "Send FU #1", bg: "bg-amber-100",  text: "text-amber-800",  border: "border-amber-300",  dot: "bg-amber-500"  },
  { n: 1, label: "Send FU #2", bg: "bg-blue-100",   text: "text-blue-800",   border: "border-blue-300",   dot: "bg-blue-500"   },
  { n: 2, label: "Send FU #3", bg: "bg-violet-100", text: "text-violet-800", border: "border-violet-300", dot: "bg-violet-500" },
  { n: 3, label: "Send FU #4", bg: "bg-rose-100",   text: "text-rose-800",   border: "border-rose-300",   dot: "bg-rose-500"   },
];
const getFUStage = (count: number) => FU_STAGE[Math.min(count, FU_STAGE.length - 1)]!;

// ── Helpers ────────────────────────────────────────────────────────────────────
function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}
function fdate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fdatetime(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function FollowUpModule({ userId }: FollowUpModuleProps) {
  const sb = createClient();

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"manual" | "activity">("manual");

  // ── Data ──────────────────────────────────────────────────────────────────
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [replies, setReplies] = useState<EmailReply[]>([]);
  const [leads, setLeads] = useState<Map<string, Lead>>(new Map());
  const [loading, setLoading] = useState(true);
  const [catchingUp, setCatchingUp]  = useState(false);

  const [checking, setChecking]       = useState(false);
  const [dueLeadIds, setDueLeadIds] = useState<Set<string>>(new Set());

  // ── Activity log ──────────────────────────────────────────────────────────
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityTableMissing, setActivityTableMissing] = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [nicheFilter, setNicheFilter] = useState("all");
  const [fuFilter, setFuFilter] = useState<number | "all">("all");
  const [dueOnlyFilter, setDueOnlyFilter] = useState(false);
  const [daysFilter, setDaysFilter] = useState<number>(0); // 0 = all, 3 = 3+, 5 = 5+, 7 = 7+
  const [dateFilter, setDateFilter] = useState("");
  const [sortBy, setSortBy] = useState<"priority" | "days" | "name" | "stage">("priority");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  // ── Drawer (lead detail) ──────────────────────────────────────────────────
  const [drawerThread, setDrawerThread] = useState<LeadThread | null>(null);
  const [drawerGenerating, setDrawerGenerating] = useState(false);
  const [drawerDraft, setDrawerDraft] = useState<FUDraft | null>(null);
  const [drawerSubj, setDrawerSubj] = useState("");
  const [drawerBody, setDrawerBody] = useState("");
  const [drawerSending, setDrawerSending] = useState(false);
  const [drawerSchedule, setDrawerSchedule] = useState(""); // ISO datetime for scheduling

  // ── Bulk ──────────────────────────────────────────────────────────────────
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
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkTone, setBulkTone] = useState("Direct");

  // ── Sender profile (persisted in localStorage) ────────────────────────────
  const STORAGE_KEY = `pryro_fu_sender_${userId}`;
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const saveSender = (n: string, p: string) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: n, phone: p })); } catch {}
  };

  // ── Load ──────────────────────────────────────────────────────────────────
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
        sb.from("email_replies").select("*").eq("user_id", userId)
          .order("received_at", { ascending: false }),
        // Due today: pending queue rows where scheduled_at <= now
        sb.from("followup_queue").select("lead_id").eq("user_id", userId)
          .eq("status", "pending")
          .lte("scheduled_at", new Date().toISOString()),
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
      const { data, error } = await sb
        .from("followup_activity_log")
        .select("*")
        .eq("user_id", userId)
        .not("status", "eq", "daily_summary")
        .order("sent_at", { ascending: false })
        .limit(200);
      if (error) {
        if (error.code === "42P01") { setActivityTableMissing(true); }
        else { toast.error("Could not load activity log"); }
        return;
      }
      setActivityLog((data ?? []) as ActivityLogEntry[]);
    } catch {
      setActivityTableMissing(true);
    } finally {
      setActivityLoading(false);
    }
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

  // ── Build threads ─────────────────────────────────────────────────────────
  const allThreads: LeadThread[] = useMemo(() => {
    const map = new Map<string, LeadThread>();
    const sorted = [...sentEmails].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
    for (const e of sorted) {
      if (!e.lead_id) continue;
      const lead = leads.get(e.lead_id);
      if (!lead?.email) continue;
      if (!map.has(e.lead_id)) {
        map.set(e.lead_id, {
          leadId: e.lead_id, leadEmail: lead.email,
          companyName: lead.company_name || lead.email,
          niche: lead.niche || null, emails: [], replies: [],
          hasReply: false, latestStatus: e.status || "sent",
          followupCount: 0, priority: 0, isDueToday: dueLeadIds.has(e.lead_id),
        });
      }
      const t = map.get(e.lead_id)!;
      t.emails.push(e);
      if (!["failed", "bounced"].includes(e.status || "")) t.latestStatus = e.status || "sent";
    }
    for (const r of replies) {
      const key = r.lead_id || "";
      if (map.has(key)) { map.get(key)!.replies.push(r); map.get(key)!.hasReply = true; map.get(key)!.latestStatus = "replied"; }
    }
    const all = Array.from(map.values());
    for (const t of all) {
      t.followupCount = t.emails.filter((e: any) => e.is_followup).length;
      const latest = t.emails.filter(e => !["failed", "bounced"].includes(e.status || "")).slice(-1)[0];
      t.priority = latest?.clicked_at ? 2 : latest?.opened_at ? 1 : 0;
      // Refresh isDueToday from latest set
      t.isDueToday = dueLeadIds.has(t.leadId);
    }
    return all.filter(t => t.emails.some(e => !["failed", "bounced"].includes(e.status || "")));
  }, [sentEmails, replies, leads, dueLeadIds]);

  // ── Eligible (no reply, not bounced) ──────────────────────────────────────
  const eligible = useMemo(() =>
    allThreads.filter(t => !t.hasReply && !["bounced", "failed"].includes(t.latestStatus)),
    [allThreads]
  );

  // ── Available filter options ───────────────────────────────────────────────
  const niches = useMemo(() => Array.from(new Set(eligible.map(t => t.niche || "").filter(Boolean))).sort(), [eligible]);
  const fuCounts = useMemo(() => Array.from(new Set(eligible.map(t => t.followupCount))).sort((a, b) => a - b), [eligible]);

  const getOriginalDate = (t: LeadThread) => {
    const orig = t.emails.find((e: any) => !e.is_followup) || t.emails[0];
    return orig?.sent_at?.slice(0, 10) ?? "";
  };
  const availableDates = useMemo(() =>
    Array.from(new Set(eligible.map(getOriginalDate).filter(Boolean))).sort((a, b) => b.localeCompare(a)),
    [eligible]
  );

  // ── Filtered + sorted ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = eligible;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.companyName.toLowerCase().includes(q) || t.leadEmail.toLowerCase().includes(q));
    }
    if (nicheFilter !== "all") list = list.filter(t => (t.niche || "") === nicheFilter);
    if (fuFilter !== "all") list = list.filter(t => t.followupCount === fuFilter);
    if (dueOnlyFilter) list = list.filter(t => t.isDueToday);
    if (daysFilter > 0) {
      list = list.filter(t => {
        const latest = t.emails.filter(e => !["failed","bounced"].includes(e.status||"")).slice(-1)[0];
        return latest ? daysSince(latest.sent_at) >= daysFilter : false;
      });
    }
    if (dateFilter) list = list.filter(t => getOriginalDate(t) === dateFilter);

    return [...list].sort((a, b) => {
      if (sortBy === "priority") {
        if (a.isDueToday !== b.isDueToday) return a.isDueToday ? -1 : 1;
        if (b.priority !== a.priority) return b.priority - a.priority;
        const daysA = daysSince((a.emails.filter(e => !["failed","bounced"].includes(e.status||"")).slice(-1)[0]?.sent_at || ""));
        const daysB = daysSince((b.emails.filter(e => !["failed","bounced"].includes(e.status||"")).slice(-1)[0]?.sent_at || ""));
        return daysB - daysA;
      }
      if (sortBy === "days") {
        const dA = daysSince((a.emails.slice(-1)[0]?.sent_at || ""));
        const dB = daysSince((b.emails.slice(-1)[0]?.sent_at || ""));
        return dB - dA;
      }
      if (sortBy === "name") return a.companyName.localeCompare(b.companyName);
      if (sortBy === "stage") return a.followupCount - b.followupCount;
      return 0;
    });
  }, [eligible, search, nicheFilter, fuFilter, dueOnlyFilter, daysFilter, dateFilter, sortBy]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Counts per FU stage for badges
  const stageCounts = useMemo(() => {
    const m: Record<number, number> = {};
    eligible.forEach(t => { m[t.followupCount] = (m[t.followupCount] || 0) + 1; });
    return m;
  }, [eligible]);

  // ── Drawer actions ─────────────────────────────────────────────────────────
  const openDrawer = (t: LeadThread) => {
    setDrawerThread(t); setDrawerDraft(null); setDrawerSubj(""); setDrawerBody(""); setDrawerSchedule("");
  };
  const closeDrawer = () => { setDrawerThread(null); setDrawerDraft(null); };

  const generateForDrawer = async () => {
    if (!drawerThread) return;
    setDrawerGenerating(true); setDrawerDraft(null);
    try {
      const latest = drawerThread.emails.filter(e => !["failed","bounced"].includes(e.status||"")).slice(-1)[0];
      if (!latest) throw new Error("No valid sent email");
      const r = await fetch("/api/followup/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentEmailId: latest.id, leadId: drawerThread.leadId, followupNumber: drawerThread.followupCount + 1, tone: "Direct", overrideContext: { senderName: senderName || undefined, senderPhone: senderPhone || undefined } }),
      });
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
      // De-dupe check
      const dupeRes = await fetch("/api/followup/check-duplicate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: drawerThread.leadId, followupNumber: drawerThread.followupCount + 1 }),
      });
      const dupeData = await dupeRes.json();
      if (dupeData.isDuplicate) {
        toast.warning("A follow-up for this lead at this stage was already sent in the last 24 hours.");
        setDrawerSending(false);
        return;
      }

      const res = await fetch("/api/send-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: drawerThread.leadEmail, subject: drawerSubj, body: drawerBody, leadId: drawerThread.leadId, scheduleFollowups: false }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);

      // Mark queue row as sent + schedule next stage
      await fetch("/api/followup/mark-sent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: drawerThread.leadId,
          followupNumber: drawerThread.followupCount + 1,
          sentEmailId: d.sentEmailId ?? "",
          threadId: d.threadId ?? undefined,
          subject: drawerSubj,
          body: drawerBody,
          companyName: drawerThread.companyName,
          leadEmail: drawerThread.leadEmail,
        }),
      }).catch(() => {});

      toast.success(`Follow-up sent to ${drawerThread.companyName}!`);
      setDrawerThread(null);
      load();
    } catch (e: any) { toast.error(e.message || "Send failed"); }
    finally { setDrawerSending(false); }
  };

  // ── Bulk actions ───────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setBulkSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
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
      const latest = thread.emails.filter(e => !["failed","bounced"].includes(e.status||"")).slice(-1)[0];
      if (!latest) { previews.push({ leadId: thread.leadId, companyName: thread.companyName, leadEmail: thread.leadEmail, subject: "", body: "", latestEmailId: "", skipped: true, skipReason: "No valid sent email" }); errors++; setBulkProgress({ done: i+1, total: targets.length, errors }); continue; }
      try {
        const res = await fetch("/api/followup/generate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentEmailId: latest.id, leadId: thread.leadId, followupNumber: thread.followupCount + 1, tone: bulkTone, overrideContext: { senderName: senderName || undefined, senderPhone: senderPhone || undefined } }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        previews.push({ leadId: thread.leadId, companyName: thread.companyName, leadEmail: thread.leadEmail, subject: data.subject, body: data.body, latestEmailId: latest.id, skipped: false });
      } catch (e: any) { errors++; previews.push({ leadId: thread.leadId, companyName: thread.companyName, leadEmail: thread.leadEmail, subject: "", body: "", latestEmailId: latest.id, skipped: true, skipReason: e.message }); }
      setBulkProgress(prev => ({ ...prev, done: i+1, errors }));
    }
    setBulkPreviews(previews); setBulkGenerating(false); setBulkReviewIndex(0); setBulkStep("review");
  };

  const sendBulk = async () => {
    const toSend = bulkPreviews.filter(p => !p.skipped && p.body.trim());
    if (!toSend.length) return;
    setBulkStep("sending"); setBulkSending(true); setBulkProgress({ done: 0, total: toSend.length, errors: 0 });
    let errors = 0;
    for (let i = 0; i < toSend.length; i++) {
      const p = toSend[i];
      try {
        const res = await fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: p.leadEmail, subject: p.subject, body: p.body, leadId: p.leadId, scheduleFollowups: false }) });
        const d = await res.json();
        if (!d.success) throw new Error(d.error);
        setBulkProgress(prev => ({ ...prev, done: i + 1 }));
      } catch (e: any) { errors++; setBulkProgress(prev => ({ ...prev, done: i + 1, errors: prev.errors + 1 })); }
      if (i < toSend.length - 1) await new Promise(r => setTimeout(r, 2000));
    }
    setBulkSending(false);
    const sent = toSend.length - errors;
    if (sent > 0) toast.success(`Bulk: ${sent} sent${errors > 0 ? `, ${errors} failed` : ""}!`);
    else toast.error("All failed.");
    setBulkSelected(new Set()); setBulkPreviews([]); setBulkStep("list"); load();
  };

  const updatePreview = (leadId: string, f: "subject"|"body", v: string) =>
    setBulkPreviews(prev => prev.map(p => p.leadId === leadId ? { ...p, [f]: v } : p));
  const skipPreview = (leadId: string) =>
    setBulkPreviews(prev => prev.map(p => p.leadId === leadId ? { ...p, skipped: !p.skipped } : p));

  const checkInbox = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/inbox/check", { method: "POST" });
      const data = await res.json();
      if (data.success && data.totalNewReplies > 0) { toast.success(`${data.totalNewReplies} new reply!`); load(); }
      else toast.info("No new replies");
    } catch { toast.error("Inbox check failed"); } finally { setChecking(false); }
  };

  const catchUpNow = async () => {
    setCatchingUp(true);
    try {
      const res = await fetch("/api/followup/catchup", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message ?? "Catch-up complete");
        load();
        if (activeTab === "activity") loadActivityLog();
      } else {
        toast.error(data.error ?? "Catch-up failed");
      }
    } catch { toast.error("Catch-up failed"); }
    finally { setCatchingUp(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // BULK REVIEW FULL-SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (bulkStep === "review") {
    const readyCount = bulkPreviews.filter(p => !p.skipped && p.body.trim()).length;
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <p className="text-sm font-bold text-gray-900">{readyCount} follow-ups ready</p>
            <span className="text-xs text-gray-500">Review and edit each before sending</span>
          </div>
          <button onClick={() => { setBulkStep("list"); setBulkPreviews([]); }} className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">← Back</button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 w-44">Company</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 w-52">Email</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Subject</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 w-24">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 w-16">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bulkPreviews.map((p, idx) => (
                <tr key={p.leadId} className={`hover:bg-gray-50 ${p.skipped ? "opacity-40" : ""}`}>
                  <td className="px-4 py-3 text-xs font-semibold text-gray-900 truncate max-w-[160px]">{p.companyName}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 truncate max-w-[200px]">{p.leadEmail}</td>
                  <td className="px-4 py-3 text-xs text-gray-800 truncate max-w-sm">{p.subject || "—"}</td>
                  <td className="px-4 py-3">
                    {p.skipped
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200 font-medium">Skipped</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">Ready</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setBulkReviewIndex(idx)} className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                      <Edit3 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 shrink-0">
          <button onClick={sendBulk} disabled={readyCount === 0} className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            <Send size={15} /> Send {readyCount} Follow-Up{readyCount !== 1 ? "s" : ""}
          </button>
        </div>

        {/* Edit modal */}
        {bulkReviewIndex >= 0 && bulkPreviews[bulkReviewIndex] && (() => {
          const cur = bulkPreviews[bulkReviewIndex];
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setBulkReviewIndex(-1)}>
              <div className="absolute inset-0 bg-black/30" />
              <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden mx-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                  <div><p className="text-sm font-bold text-gray-900">{cur.companyName}</p><p className="text-xs text-gray-500">{cur.leadEmail}</p></div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => skipPreview(cur.leadId)} className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${cur.skipped ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>{cur.skipped ? "Undo Skip" : "Skip"}</button>
                    <span className="text-xs text-gray-400">{bulkReviewIndex + 1}/{bulkPreviews.length}</span>
                    <button onClick={() => setBulkReviewIndex(i => Math.max(0, i - 1))} disabled={bulkReviewIndex === 0} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={15} /></button>
                    <button onClick={() => setBulkReviewIndex(i => Math.min(bulkPreviews.length - 1, i + 1))} disabled={bulkReviewIndex === bulkPreviews.length - 1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={15} /></button>
                    <button onClick={() => setBulkReviewIndex(-1)} className="p-1.5 rounded hover:bg-gray-100"><X size={16} className="text-gray-500" /></button>
                  </div>
                </div>
                <div className={`flex-1 overflow-y-auto p-5 space-y-4 ${cur.skipped ? "opacity-40 pointer-events-none" : ""}`}>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Subject</label>
                    <input value={cur.subject} onChange={e => updatePreview(cur.leadId, "subject", e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Body</label>
                    <div className="space-y-3 rounded-xl border border-gray-200 bg-white overflow-hidden">
                      <div className="px-5 py-4 text-sm text-gray-800 leading-relaxed space-y-3 min-h-[80px]">
                        {cur.body.split(/\n\n+/).map((para, pi) => <p key={pi} className="whitespace-pre-wrap">{para}</p>)}
                      </div>
                      <div className="px-5 pb-4">
                        <textarea value={cur.body} onChange={e => updatePreview(cur.leadId, "body", e.target.value)} rows={8}
                          className="w-full px-3 py-2.5 rounded-lg text-sm text-gray-900 border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none bg-gray-50" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
                  <button onClick={() => setBulkReviewIndex(-1)} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50">Done</button>
                  {bulkReviewIndex < bulkPreviews.length - 1 && <button onClick={() => setBulkReviewIndex(i => i + 1)} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">Next →</button>}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // SENDING OVERLAY
  if (bulkStep === "sending") return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4 text-center">
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3"><Loader2 size={22} className="animate-spin text-blue-600" /></div>
        <h3 className="text-base font-bold text-gray-900">Sending follow-ups…</h3>
        <p className="text-sm text-gray-500 mt-1">{bulkProgress.done} of {bulkProgress.total} sent</p>
        <div className="w-full bg-gray-100 rounded-full h-2.5 mt-4 mb-2"><div className="bg-blue-600 h-2.5 rounded-full transition-all" style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%` }} /></div>
        {bulkProgress.errors > 0 && <p className="text-xs text-red-500">{bulkProgress.errors} failed</p>}
        <p className="text-[11px] text-gray-400 mt-2">Sending with delay to avoid spam filters…</p>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN LAYOUT
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={22} className="animate-spin text-blue-600" /></div>;

  // ── Activity log counts for today ─────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayLogs = activityLog.filter(e => e.sent_at.startsWith(todayStr) && e.is_auto);
  const todaySent   = todayLogs.filter(e => e.status === "sent").length;
  const todayFailed = todayLogs.filter(e => e.status === "failed").length;

  // ── Activity Log Tab ──────────────────────────────────────────────────────
  if (activeTab === "activity") {
    return (
      <div className="flex flex-col h-full bg-white overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-gray-200 bg-white shrink-0">
          <button onClick={() => setActiveTab("manual")}
            className="px-4 py-2.5 text-sm font-semibold border-b-2 border-transparent text-gray-500 hover:text-gray-800 transition-colors">
            Manual Follow-Up
          </button>
          <button onClick={() => { setActiveTab("activity"); loadActivityLog(); }}
            className="px-4 py-2.5 text-sm font-semibold border-b-2 border-blue-600 text-blue-600 transition-colors flex items-center gap-1.5">
            <Activity size={13} /> Auto Activity Log
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 flex flex-col gap-4">
          {/* Summary banner */}
          {(todaySent > 0 || todayFailed > 0) && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${todayFailed > 0 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-green-50 border-green-200 text-green-800"}`}>
              <Activity size={15} className="flex-shrink-0" />
              <span>
                {todaySent + todayFailed} follow-ups processed automatically today —{" "}
                <strong>{todaySent} delivered</strong>
                {todayFailed > 0 && <>, <span className="text-red-600 font-bold">{todayFailed} failed</span></>}
              </span>
              {todayFailed > 0 && (
                <span className="ml-auto flex items-center gap-1 text-red-600 text-xs font-semibold">
                  <AlertCircle size={12} /> {todayFailed} need review
                </span>
              )}
            </div>
          )}

          {/* Table or states */}
          {activityLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={22} className="animate-spin text-blue-600" />
            </div>
          ) : activityTableMissing ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <AlertCircle size={32} className="text-amber-400" />
              <p className="text-sm font-semibold text-gray-700">Activity log table not set up yet</p>
              <p className="text-xs text-gray-500 max-w-sm">
                Run <strong>SETUP_FOLLOWUP_ACTIVITY_LOG.sql</strong> in your Supabase SQL Editor to enable this feature.
              </p>
              <button onClick={loadActivityLog}
                className="mt-2 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          ) : activityLog.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Activity size={32} className="text-gray-300" />
              <p className="text-sm font-semibold text-gray-500">No automatic activity yet</p>
              <p className="text-xs text-gray-400">Automatic follow-ups will appear here after the daily cron runs (8 AM UTC).</p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 w-44">Company</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 w-44">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 w-20">Stage</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Subject</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 w-36">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 w-20">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 w-20">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activityLog.map(entry => (
                    <tr key={entry.id} className={`hover:bg-gray-50 transition-colors ${entry.needs_manual_review ? "bg-red-50/30" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-gray-900 truncate max-w-[160px]">
                          {entry.company_name || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-500 truncate max-w-[160px]">{entry.email || "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        {entry.followup_number > 0 ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            FU #{entry.followup_number}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-700 truncate max-w-[240px]" title={entry.subject ?? ""}>
                          {entry.subject || "—"}
                        </p>
                        {entry.error_message && (
                          <p className="text-[10px] text-red-500 mt-0.5 truncate max-w-[240px]" title={entry.error_message}>
                            ⚠ {entry.error_message}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-500">{fdatetime(entry.sent_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        {entry.status === "sent" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-green-50 text-green-700 border border-green-200">Sent</span>
                        )}
                        {entry.status === "failed" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-red-50 text-red-700 border border-red-200">Failed</span>
                        )}
                        {entry.status === "duplicate_skipped" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-500 border border-gray-200">Duplicate</span>
                        )}
                        {entry.status === "skipped" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-500 border border-gray-200">Skipped</span>
                        )}
                        {entry.needs_manual_review && (
                          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200">Review</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {entry.is_auto ? (
                          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <Bot size={9} /> Auto
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                            <User size={9} /> Manual
                          </span>
                        )}
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
  }

  return (
    <div className="flex h-full bg-white overflow-hidden">

      {/* ── LEFT: Main table ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-gray-200 bg-white shrink-0">
          <button onClick={() => setActiveTab("manual")}
            className="px-4 py-2.5 text-sm font-semibold border-b-2 border-blue-600 text-blue-600 transition-colors">
            Manual Follow-Up
          </button>
          <button onClick={() => { setActiveTab("activity"); loadActivityLog(); }}
            className="px-4 py-2.5 text-sm font-semibold border-b-2 border-transparent text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1.5">
            <Activity size={13} /> Auto Activity Log
            {todayFailed > 0 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">{todayFailed}</span>
            )}
          </button>
        </div>

        {/* Top bar */}
        <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Follow-Up</h1>
              {(() => {
                const overdueCount = eligible.filter(t =>
                  daysSince(t.emails.filter(e => !["failed","bounced"].includes(e.status||"")).slice(-1)[0]?.sent_at || "") >= 3
                ).length;
                return (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {eligible.length} leads eligible
                    {overdueCount > 0 && (
                      <> · <span className="text-red-600 font-semibold">{overdueCount} overdue</span></>
                    )}
                  </p>
                );
              })()}
            </div>
            <div className="flex items-center gap-2">
              {bulkSelected.size > 0 && (
                <button onClick={generateBulk} disabled={bulkGenerating}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {bulkGenerating
                    ? <><Loader2 size={13} className="animate-spin" />Generating {bulkProgress.done}/{bulkProgress.total}…</>
                    : <><Sparkles size={13} />Generate {bulkSelected.size} Follow-Up{bulkSelected.size !== 1 ? "s" : ""}</>}
                </button>
              )}
              {/* Catch Up Now — processes all overdue pending follow-ups immediately */}
              {dueLeadIds.size > 0 && (
                <button onClick={catchUpNow} disabled={catchingUp}
                  className="flex items-center gap-1.5 px-3 py-2 border border-amber-300 bg-amber-50 text-amber-800 text-sm font-semibold rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors">
                  {catchingUp
                    ? <><Loader2 size={13} className="animate-spin" />Processing…</>
                    : <><Send size={13} />Catch Up Now ({dueLeadIds.size})</>}
                </button>
              )}
              <button onClick={checkInbox} disabled={checking}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Check Inbox
              </button>
            </div>
          </div>

          {/* Search + filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search company or email…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-white" />
            </div>

            {/* Due today toggle */}
            <button
              onClick={() => { setDueOnlyFilter(v => !v); setPage(0); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${dueOnlyFilter ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-600 border-gray-200 hover:border-amber-400"}`}>
              <Clock size={12} /> Due today{dueLeadIds.size > 0 && !dueOnlyFilter && ` (${dueLeadIds.size})`}
            </button>

            {/* Days since filter */}
            <select value={daysFilter} onChange={e => { setDaysFilter(Number(e.target.value)); setPage(0); }}
              className="px-3 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-white text-gray-700">
              <option value={0}>All days</option>
              <option value={3}>3+ days ago</option>
              <option value={5}>5+ days ago</option>
              <option value={7}>7+ days ago</option>
            </select>

            {/* Date filter */}
            <input type="date" value={dateFilter} onChange={e => { setDateFilter(e.target.value); setPage(0); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-white text-gray-700"
              title="Filter by original send date" />

            {/* Niche filter */}
            {niches.length > 0 && (
              <select value={nicheFilter} onChange={e => { setNicheFilter(e.target.value); setPage(0); }}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-white text-gray-700">
                <option value="all">All niches</option>
                {niches.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            )}

            {/* Sort */}
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
              {(["priority", "days", "name", "stage"] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${sortBy === s ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                  {s === "priority" ? "Priority" : s === "days" ? "Days" : s === "name" ? "A-Z" : "Stage"}
                </button>
              ))}
            </div>
          </div>

          {/* FU stage quick-filter tabs */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button onClick={() => { setFuFilter("all"); setPage(0); }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all ${fuFilter === "all" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
              All ({eligible.length})
            </button>
            {fuCounts.map(fc => {
              const stage = getFUStage(fc);
              const cnt = stageCounts[fc] || 0;
              return (
                <button key={fc} onClick={() => { setFuFilter(fc); setPage(0); }}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all flex items-center gap-1.5 ${fuFilter === fc ? `${stage.bg} ${stage.text} ${stage.border}` : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} />
                  {fc === 0 ? "No FU" : `FU #${fc} sent"` } ({cnt})
                </button>
              );
            })}
          </div>
        </div>

        {/* Bulk select header */}
        {bulkSelected.size > 0 && (
          <div className="flex items-center gap-3 px-6 py-2.5 bg-blue-50 border-b border-blue-200 shrink-0">
            <span className="text-sm font-semibold text-blue-800">{bulkSelected.size} selected</span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-blue-600 font-medium">Tone:</label>
              {["Direct", "Aggressive", "Surgical"].map(t => (
                <button key={t} onClick={() => setBulkTone(t)}
                  className={`px-2 py-1 rounded text-xs font-semibold border transition-all ${bulkTone === t ? "bg-blue-600 text-white border-blue-600" : "border-blue-200 text-blue-700 hover:bg-blue-100"}`}>{t}</button>
              ))}
            </div>
            <button onClick={clearAll} className="ml-auto text-xs text-blue-500 hover:text-blue-700 underline">Clear selection</button>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Send size={32} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">No leads to follow up</p>
              <p className="text-xs mt-1">All leads have replied, bounced, or been filtered out</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                  <tr>
                    <th className="px-4 py-2.5 w-8">
                      <input type="checkbox" checked={paginated.length > 0 && paginated.every(t => bulkSelected.has(t.leadId))}
                        onChange={e => e.target.checked ? selectAll() : clearAll()}
                        className="rounded border-gray-300 text-blue-600" />
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">Company</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide w-24">Stage</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide w-24">Last Email</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide w-20">Days</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide w-28">Engagement</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide w-24 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.map(thread => {
                    const latest = thread.emails.filter(e => !["failed","bounced"].includes(e.status||"")).slice(-1)[0];
                    const days = latest ? daysSince(latest.sent_at) : 0;
                    const stage = getFUStage(thread.followupCount);
                    const isSel = bulkSelected.has(thread.leadId);
                    const isHighPriority = thread.priority === 2; // clicked
                    const isOpened = thread.priority === 1;

                    return (
                      <tr key={thread.leadId}
                        className={`hover:bg-gray-50 cursor-pointer transition-colors ${isSel ? "bg-blue-50/40" : ""} ${isHighPriority ? "bg-orange-50/30" : ""}`}
                        onClick={() => openDrawer(thread)}>
                        <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelect(thread.leadId); }}>
                          <input type="checkbox" checked={isSel} readOnly className="rounded border-gray-300 text-blue-600" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {isHighPriority && <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" title="Clicked" />}
                            {isOpened && !isHighPriority && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Opened" />}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-semibold text-gray-900 truncate">{thread.companyName}</p>
                                {thread.isDueToday && (
                                  <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-amber-500 text-white">DUE</span>
                                )}
                              </div>
                              <p className="text-[11px] text-gray-400 truncate">{thread.leadEmail}{thread.niche ? ` · ${thread.niche}` : ""}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${stage.bg} ${stage.text} ${stage.border}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} />
                            {stage.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{latest ? fdate(latest.sent_at) : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold ${days >= 7 ? "text-red-600" : days >= 3 ? "text-amber-600" : "text-gray-400"}`}>
                          {days}d{days >= 7 ? <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-700 font-bold border border-red-200">Overdue</span> : days >= 3 ? <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-bold border border-amber-200">Due</span> : null}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {latest?.opened_at && <span className="flex items-center gap-1 text-[10px] text-amber-600 font-semibold"><Eye size={10} />Opened</span>}
                            {latest?.clicked_at && <span className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold"><MousePointer size={10} />Clicked</span>}
                            {!latest?.opened_at && !latest?.clicked_at && <span className="text-[10px] text-gray-300">No opens</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={e => { e.stopPropagation(); openDrawer(thread); }}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                            Follow Up
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-white sticky bottom-0">
                  <span className="text-xs text-gray-500">{filtered.length} leads · Page {page + 1} of {totalPages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">← Prev</button>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next →</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT: Lead drawer ────────────────────────────────────────────── */}
      {drawerThread && (
        <div className="w-[420px] shrink-0 border-l border-gray-200 flex flex-col bg-white overflow-hidden">
          {/* Drawer header */}
          <div className="px-5 py-4 border-b border-gray-200 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {drawerThread.priority === 2 && <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" title="Clicked" />}
                  {drawerThread.priority === 1 && <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" title="Opened" />}
                  <h2 className="text-base font-bold text-gray-900 truncate">{drawerThread.companyName}</h2>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{drawerThread.leadEmail}</p>
                {drawerThread.niche && <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">{drawerThread.niche}</span>}
              </div>
              <button onClick={closeDrawer} className="p-1.5 hover:bg-gray-100 rounded-lg shrink-0"><X size={16} className="text-gray-500" /></button>
            </div>

            {/* Stage badge */}
            {(() => {
              const stage = getFUStage(drawerThread.followupCount);
              return (
                <div className={`mt-3 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${stage.bg} ${stage.text} ${stage.border}`}>
                  <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                  {drawerThread.followupCount === 0 ? "No follow-ups sent yet" : `${drawerThread.followupCount} follow-up${drawerThread.followupCount > 1 ? "s" : ""} sent`}
                  · Next: Follow-Up #{drawerThread.followupCount + 1}
                </div>
              );
            })()}
          </div>

          {/* Drawer body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Email history timeline */}
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Email History</p>
              <div className="space-y-2">
                {drawerThread.emails.filter(e => !["failed","bounced"].includes(e.status||"")).map((email, idx) => {
                  const isFU = (email as any).is_followup;
                  const fNum = (email as any).followup_number || idx;
                  return (
                    <div key={email.id} className={`rounded-lg border px-3 py-2.5 ${isFU ? "border-blue-100 bg-blue-50/50" : "border-gray-200 bg-gray-50"}`}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isFU ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-600"}`}>
                          {isFU ? `FU #${fNum}` : "Original"}
                        </span>
                        <span className="text-[10px] text-gray-400">{fdate(email.sent_at)}</span>
                      </div>
                      <p className="text-xs text-gray-700 font-medium truncate">{email.subject}</p>
                      {/* Open/click timeline */}
                      <div className="flex items-center gap-3 mt-1.5">
                        {email.opened_at
                          ? <span className="flex items-center gap-1 text-[10px] text-amber-600 font-semibold"><Eye size={10} />Opened {fdatetime(email.opened_at)}</span>
                          : <span className="text-[10px] text-gray-300">Not opened</span>}
                        {email.clicked_at && <span className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold"><MousePointer size={10} />Clicked</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Signature */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-2">
              <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5"><AtSign size={10} />Signature</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-gray-500 mb-0.5 block">Name</label>
                  <input value={senderName} onChange={e => { setSenderName(e.target.value); saveSender(e.target.value, senderPhone); }}
                    placeholder="Your name" className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-white" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-500 mb-0.5 block">Phone</label>
                  <input value={senderPhone} onChange={e => { setSenderPhone(e.target.value); saveSender(senderName, e.target.value); }}
                    placeholder="+256 700 123 456" className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-white" />
                </div>
              </div>
            </div>

            {/* Generate / draft */}
            {!drawerDraft ? (
              <button onClick={generateForDrawer} disabled={drawerGenerating}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {drawerGenerating ? <><Loader2 size={15} className="animate-spin" />Generating AI Follow-Up…</> : <><Sparkles size={15} />Generate Follow-Up #{drawerThread.followupCount + 1}</>}
              </button>
            ) : (
              <div className="space-y-3">
                  {drawerDraft.decisionReason && (
                  <p className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">{drawerDraft.decisionReason}</p>
                )}
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Subject</label>
                  <input value={drawerSubj} onChange={e => setDrawerSubj(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Body</label>
                  {/* Preview */}
                  <div className="rounded-xl border border-gray-200 bg-white mb-2 px-4 py-3 text-sm text-gray-800 leading-relaxed space-y-2 min-h-[80px]">
                    {drawerBody.split(/\n\n+/).map((para, i) => <p key={i} className="whitespace-pre-wrap">{para}</p>)}
                  </div>
                  <textarea value={drawerBody} onChange={e => setDrawerBody(e.target.value)} rows={8}
                    className="w-full px-3 py-2 rounded-lg text-xs text-gray-900 border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none bg-gray-50" />
                </div>

                {/* Schedule option */}
                <div className="flex items-center gap-2">
                  <Calendar size={13} className="text-gray-400 shrink-0" />
                  <input type="datetime-local" value={drawerSchedule} onChange={e => setDrawerSchedule(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-white text-gray-700"
                    title="Schedule for a specific time (leave blank to send now)" />
                  {drawerSchedule && <button onClick={() => setDrawerSchedule("")} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>}
                </div>
                {drawerSchedule && (
                  <p className="text-[11px] text-blue-600 flex items-center gap-1"><Clock size={10} />Scheduled for {fdatetime(drawerSchedule)}</p>
                )}

                <div className="flex gap-2">
                  <button onClick={generateForDrawer} disabled={drawerGenerating}
                    className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 disabled:opacity-50">
                    <RotateCcw size={11} />Regenerate
                  </button>
                  <button onClick={() => setDrawerDraft(null)}
                    className="px-3 py-2 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50">Cancel</button>
                  <button onClick={sendFromDrawer} disabled={drawerSending || !drawerBody.trim()}
                    className="flex-1 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {drawerSending ? <><Loader2 size={13} className="animate-spin" />Sending…</> : <><Send size={13} />{drawerSchedule ? "Schedule" : `Send FU #${drawerThread.followupCount + 1}`}</>}
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
