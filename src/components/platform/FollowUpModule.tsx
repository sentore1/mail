"use client";
import { useState, useEffect, useCallback } from "react";
import { Lead, EmailReply, AIReply, SentEmail } from "@/types/platform";
import {
  Mail, Send, Loader2, X, ChevronDown, ChevronRight, ChevronLeft,
  MessageSquare, Sparkles, RefreshCw, ThumbsUp, ThumbsDown,
  Inbox, Reply, CheckCircle, AlertCircle, Eye, MousePointer,
  RotateCcw, Plus, Bot, Edit3,
} from "lucide-react";
import { createClient } from "../../../supabase/client";
import { toast } from "sonner";
import InboxConfigPanel from "./InboxConfigPanel";

interface FollowUpModuleProps { userId: string; }
interface AIDraft { subject: string; body: string; }
interface FUDraft { subject: string; body: string; style: string; decisionReason: string; modelUsed: string; }
interface LeadThread {
  leadId: string; leadEmail: string; companyName: string;
  emails: SentEmail[]; replies: EmailReply[];
  hasReply: boolean; latestStatus: string; followupCount: number;
}

const TONES = [
  { value: "Direct",     label: "Direct",      desc: "Problem → Solution → CTA. No fluff." },
  { value: "Aggressive", label: "Aggressive",  desc: "High urgency, FOMO, push hard." },
  { value: "Surgical",   label: "Surgical",    desc: "Hyper-personalized, proves homework." },
];

function StatusPill({ status, opened, clicked }: { status?: string|null; opened: boolean; clicked: boolean }) {
  const s = status || "sent";
  if (s === "replied") return <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-100">Replied</span>;
  if (s === "bounced") return <span className="px-2 py-0.5 bg-red-50 text-red-600 text-xs font-medium rounded-full border border-red-100">Bounced</span>;
  if (s === "failed")  return <span className="px-2 py-0.5 bg-red-50 text-red-600 text-xs font-medium rounded-full border border-red-100">Failed</span>;
  if (clicked) return <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-100">Clicked</span>;
  if (opened)  return <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-100">Opened</span>;
  return <span className="px-2 py-0.5 bg-gray-50 text-gray-600 text-xs font-medium rounded-full border border-gray-200">Sent</span>;
}

function fdate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    + " " + new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function FollowUpModule({ userId }: FollowUpModuleProps) {
  const [tab, setTab] = useState<"threads"|"replies"|"inbox">("threads");
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [replies, setReplies] = useState<EmailReply[]>([]);
  const [aiReplies, setAiReplies] = useState<AIReply[]>([]);
  const [leads, setLeads] = useState<Map<string,Lead>>(new Map());
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Bulk follow-up state
  const [bulkTone, setBulkTone] = useState("Direct");
  const [bulkNiche, setBulkNiche] = useState("all");
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set()); // leadIds
  const [bulkStep, setBulkStep] = useState<"select"|"review"|"sending">("select"); // 3-step flow
  const [bulkReviewIndex, setBulkReviewIndex] = useState(0); // which email we're currently reviewing
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  // Preview drafts: leadId → { subject, body, companyName, leadEmail, latestEmailId, leadId, campaignId }
  const [bulkPreviews, setBulkPreviews] = useState<Array<{
    leadId: string; companyName: string; leadEmail: string;
    subject: string; body: string;
    latestEmailId: string; campaignId: string;
    skipped: boolean; skipReason?: string;
  }>>([]);

  // Follow-up panel
  const [fpOpen, setFpOpen] = useState(false);
  const [fpEmail, setFpEmail] = useState<SentEmail|null>(null);
  const [fpThread, setFpThread] = useState<LeadThread|null>(null);
  const [fpTone, setFpTone] = useState("Direct");
  const [fpGen, setFpGen] = useState(false);
  const [fpDraft, setFpDraft] = useState<FUDraft|null>(null);
  const [fpSubj, setFpSubj] = useState("");
  const [fpBody, setFpBody] = useState("");
  const [fpSend, setFpSend] = useState(false);

  // Reply panel
  const [rpOpen, setRpOpen] = useState(false);
  const [rpReply, setRpReply] = useState<EmailReply|null>(null);
  const [rpDraft, setRpDraft] = useState<AIDraft|null>(null);
  const [rpGen, setRpGen] = useState(false);
  const [rpSubj, setRpSubj] = useState("");
  const [rpBody, setRpBody] = useState("");
  const [rpSend, setRpSend] = useState(false);

  const sb = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, a] = await Promise.all([
        sb.from("sent_emails").select("*").eq("user_id", userId).order("sent_at", { ascending: false }).limit(300),
        sb.from("email_replies").select("*").eq("user_id", userId).order("received_at", { ascending: false }),
        sb.from("ai_replies").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      ]);
      if (s.data) setSentEmails(s.data as SentEmail[]);
      if (r.data) setReplies(r.data as EmailReply[]);
      if (a.data) setAiReplies(a.data as AIReply[]);
      const ids = new Set<string>();
      s.data?.forEach((e: any) => { if (e.lead_id) ids.add(e.lead_id); });
      r.data?.forEach((x: any) => { if (x.lead_id) ids.add(x.lead_id); });
      if (ids.size > 0) {
        const { data: ld } = await sb.from("leads").select("*").in("id", Array.from(ids));
        if (ld) { const m = new Map<string,Lead>(); ld.forEach((l: Lead) => m.set(l.id, l)); setLeads(m); }
      }
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  }, [userId, sb]);

  useEffect(() => {
    load();
    const c1 = sb.channel("fu_r").on("postgres_changes", { event: "*", schema: "public", table: "email_replies" }, load).subscribe();
    const c2 = sb.channel("fu_s").on("postgres_changes", { event: "UPDATE", schema: "public", table: "sent_emails" }, load).subscribe();
    return () => { c1.unsubscribe(); c2.unsubscribe(); };
  }, [load]);

  // Build threads — only include leads where at least one email was successfully sent (not all failed/bounced)
  const threads: LeadThread[] = (() => {
    const map = new Map<string,LeadThread>();
    const sorted = [...sentEmails].sort((a,b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
    for (const e of sorted) {
      const key = e.lead_id || (e as any).to_email || "unknown";
      const lead = e.lead_id ? leads.get(e.lead_id) : undefined;
      if (!map.has(key)) map.set(key, { leadId: e.lead_id||"", leadEmail: lead?.email||(e as any).to_email||"", companyName: lead?.company_name||(e as any).to_email||"Unknown", emails: [], replies: [], hasReply: false, latestStatus: e.status||"sent", followupCount: 0 });
      const t = map.get(key)!;
      t.emails.push(e);
      // Only update latestStatus with non-failed status if there's a successful email
      if (!["failed","bounced"].includes(e.status||"")) t.latestStatus = e.status || "sent";
    }
    for (const r of replies) {
      const key = r.lead_id || "";
      if (map.has(key)) { map.get(key)!.replies.push(r); map.get(key)!.hasReply = true; map.get(key)!.latestStatus = "replied"; }
    }
    const all = Array.from(map.values());
    for (const t of all) t.followupCount = t.emails.filter((e: any) => e.is_followup).length;
    return all
      // Only show threads that have at least one successfully sent email
      .filter(t => t.emails.some(e => !["failed","bounced"].includes(e.status||"")))
      .sort((a,b) => {
        if (a.hasReply && !b.hasReply) return -1;
        if (!a.hasReply && b.hasReply) return 1;
        return (b.emails[b.emails.length-1]?.sent_at||"").localeCompare(a.emails[a.emails.length-1]?.sent_at||"");
      });
  })();

  const toggleExpand = (id: string) => {
    const n = new Set(expanded);
    n.has(id) ? n.delete(id) : n.add(id);
    setExpanded(n);
  };

  const checkInbox = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/inbox/check", { method: "POST" });
      const data = await res.json();
      if (data.success && data.totalNewReplies > 0) { toast.success(`Found ${data.totalNewReplies} new reply!`); load(); }
      else toast.info("No new replies found");
    } catch { toast.error("Inbox check failed"); } finally { setChecking(false); }
  };

  // Follow-up panel actions
  const openFP = (email: SentEmail, thread: LeadThread) => { setFpEmail(email); setFpThread(thread); setFpDraft(null); setFpTone("Direct"); setFpSubj(""); setFpBody(""); setFpOpen(true); };
  const closeFP = () => { setFpOpen(false); setFpDraft(null); };

  const genFP = async () => {
    if (!fpEmail) return;
    setFpGen(true);
    try {
      const r = await fetch("/api/followup/generate", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentEmailId: fpEmail.id, leadId: fpEmail.lead_id, followupNumber: (fpThread?.followupCount||0)+1, tone: fpTone }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setFpDraft({ subject: d.subject, body: d.body, style: d.style, decisionReason: d.decisionReason, modelUsed: d.modelUsed });
      setFpSubj(d.subject); setFpBody(d.body);
      toast.success("Follow-up generated!");
    } catch (e: any) { toast.error(e.message || "Failed to generate"); } finally { setFpGen(false); }
  };

  const sendFP = async () => {
    if (!fpThread || !fpBody.trim()) return;
    setFpSend(true);
    try {
      const r = await fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: fpThread.leadEmail, subject: fpSubj, body: fpBody, leadId: fpEmail?.lead_id, campaignId: (fpEmail as any)?.campaign_id, scheduleFollowups: false }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      toast.success(`Follow-up sent to ${fpThread.companyName}!`);
      closeFP(); load();
    } catch (e: any) { toast.error(e.message || "Send failed"); } finally { setFpSend(false); }
  };

  // Reply panel actions
  const openRP = (reply: EmailReply) => { setRpReply(reply); setRpDraft(null); setRpSubj(`Re: ${reply.subject}`); setRpBody(""); setRpOpen(true); };
  const closeRP = () => { setRpOpen(false); setRpReply(null); setRpDraft(null); };

  const genRP = async () => {
    if (!rpReply) return;
    setRpGen(true);
    try {
      const lead = rpReply.lead_id ? leads.get(rpReply.lead_id) : undefined;
      const r = await fetch("/api/ai/generate-reply", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyBody: rpReply.body, replySubject: rpReply.subject, leadName: lead?.company_name, leadNiche: lead?.niche, fromEmail: rpReply.from_email }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setRpDraft({ subject: d.subject||`Re: ${rpReply.subject}`, body: d.body });
      setRpSubj(d.subject||`Re: ${rpReply.subject}`); setRpBody(d.body);
      toast.success("AI reply generated!");
    } catch (e: any) { toast.error(e.message || "Failed to generate"); } finally { setRpGen(false); }
  };

  const sendRP = async () => {
    if (!rpReply || !rpBody.trim()) return;
    setRpSend(true);
    try {
      const lead = rpReply.lead_id ? leads.get(rpReply.lead_id) : undefined;
      const to = rpReply.from_email || lead?.email;
      if (!to) throw new Error("No recipient email");
      const r = await fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject: rpSubj, body: rpBody, leadId: rpReply.lead_id, scheduleFollowups: false }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      if (rpDraft) {
        await sb.from("ai_replies").insert({ user_id: userId, reply_id: rpReply.id, lead_id: rpReply.lead_id, subject: rpSubj, body: rpBody, status: "sent", sent_at: new Date().toISOString() });
        await sb.from("email_replies").update({ ai_response_generated: true, ai_response_sent: true }).eq("id", rpReply.id);
      }
      toast.success("Reply sent!"); closeRP(); load();
    } catch (e: any) { toast.error(e.message || "Send failed"); } finally { setRpSend(false); }
  };

  // Eligible threads = sent (not replied, not bounced, not failed)
  const eligibleThreads = threads.filter(t => !t.hasReply && !["bounced","failed"].includes(t.latestStatus));

  // All unique niches from eligible threads
  const availableNiches = Array.from(
    new Set(eligibleThreads.map(t => leads.get(t.leadId)?.niche || "").filter(Boolean))
  ).sort();

  // Niche-filtered subset
  const filteredEligible = bulkNiche === "all"
    ? eligibleThreads
    : eligibleThreads.filter(t => (leads.get(t.leadId)?.niche || "") === bulkNiche);

  const toggleBulkSelect = (leadId: string) => {
    const n = new Set(bulkSelected);
    n.has(leadId) ? n.delete(leadId) : n.add(leadId);
    setBulkSelected(n);
  };
  const selectAll = () => setBulkSelected(new Set(filteredEligible.map(t => t.leadId)));
  const clearAll = () => setBulkSelected(new Set());
  const setNicheFilter = (niche: string) => { setBulkNiche(niche); setBulkSelected(new Set()); };

  const runBulkFollowUp = async () => {
    // This is now PHASE 2 — sends the already-reviewed previews
    await sendBulkPreviews();
  };

  // PHASE 1: Generate AI drafts for all selected leads — no sending yet
  const generateBulkPreviews = async () => {
    const targets = filteredEligible.filter(t => bulkSelected.has(t.leadId));
    if (targets.length === 0) return;
    setBulkGenerating(true);
    setBulkProgress({ done: 0, total: targets.length, errors: 0 });
    const previews: typeof bulkPreviews = [];
    let errors = 0;
    for (let i = 0; i < targets.length; i++) {
      const thread = targets[i];
      const latestEmail = thread.emails.filter(e => !["failed","bounced"].includes(e.status||"")).slice(-1)[0];
      if (!latestEmail) {
        previews.push({ leadId: thread.leadId, companyName: thread.companyName, leadEmail: thread.leadEmail, subject: "", body: "", latestEmailId: "", campaignId: "", skipped: true, skipReason: "No valid sent email found" });
        errors++;
        setBulkProgress({ done: i+1, total: targets.length, errors });
        continue;
      }
      try {
        const genRes = await fetch("/api/followup/generate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentEmailId: latestEmail.id, leadId: latestEmail.lead_id, followupNumber: thread.followupCount + 1, tone: bulkTone }),
        });
        const genData = await genRes.json();
        if (!genData.success) throw new Error(genData.error);
        previews.push({ leadId: thread.leadId, companyName: thread.companyName, leadEmail: thread.leadEmail, subject: genData.subject, body: genData.body, latestEmailId: latestEmail.id, campaignId: (latestEmail as any).campaign_id || "", skipped: false });
      } catch (e: any) {
        errors++;
        previews.push({ leadId: thread.leadId, companyName: thread.companyName, leadEmail: thread.leadEmail, subject: "", body: "", latestEmailId: latestEmail.id, campaignId: "", skipped: true, skipReason: e.message });
        console.error(`Generate failed for ${thread.companyName}:`, e.message);
      }
      setBulkProgress(prev => ({ ...prev, done: i + 1, errors }));
    }
    setBulkPreviews(previews);
    setBulkGenerating(false);
    setBulkReviewIndex(0);
    setBulkStep("review");
  };

  // PHASE 2: Send the reviewed/edited previews
  const sendBulkPreviews = async () => {
    const toSend = bulkPreviews.filter(p => !p.skipped && p.subject && p.body);
    if (toSend.length === 0) return;
    setBulkStep("sending");
    setBulkSending(true);
    setBulkProgress({ done: 0, total: toSend.length, errors: 0 });
    let errors = 0;
    for (let i = 0; i < toSend.length; i++) {
      const p = toSend[i];
      try {
        const sendRes = await fetch("/api/send-email", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: p.leadEmail, subject: p.subject, body: p.body, leadId: p.leadId, campaignId: p.campaignId || undefined, scheduleFollowups: false }),
        });
        const sendData = await sendRes.json();
        if (!sendData.success) throw new Error(sendData.error);
        setBulkProgress(prev => ({ ...prev, done: i + 1 }));
      } catch (e: any) {
        errors++;
        setBulkProgress(prev => ({ ...prev, done: i + 1, errors: prev.errors + 1 }));
        console.error(`Send failed for ${p.companyName}:`, e.message);
      }
      if (i < toSend.length - 1) await new Promise(r => setTimeout(r, 2000));
    }
    setBulkSending(false);
    const sent = toSend.length - errors;
    if (sent > 0) toast.success(`Bulk follow-up: ${sent} sent${errors > 0 ? `, ${errors} failed` : ""}!`);
    else toast.error("All follow-ups failed. Check SMTP accounts.");
    setBulkSelected(new Set());
    setBulkPreviews([]);
    setBulkStep("select");
    setShowBulkPanel(false);
    load();
  };

  // Update a single preview (subject or body edit)
  const updatePreview = (leadId: string, field: "subject"|"body", value: string) => {
    setBulkPreviews(prev => prev.map(p => p.leadId === leadId ? { ...p, [field]: value } : p));
  };
  const skipPreview = (leadId: string) => {
    setBulkPreviews(prev => prev.map(p => p.leadId === leadId ? { ...p, skipped: !p.skipped } : p));
  };

  const stats = {
    leads: threads.length,    sent: sentEmails.filter(e => !["failed","bounced"].includes(e.status||"")).length,
    followups: sentEmails.filter(e => (e as any).is_followup).length,
    replied: replies.length,
    positive: replies.filter(r => r.is_positive).length,
    failed: sentEmails.filter(e => ["failed","bounced"].includes(e.status||"")).length,
  };
  const unread = replies.filter(r => !(r as any).ai_response_sent).length;

  if (loading) return (
    <div className="flex items-center justify-center h-full bg-white">
      <Loader2 size={22} className="animate-spin text-blue-600" />
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white">

      {/* ── Header ── */}
      <div className="border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Follow-Up Manager</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage email threads, follow-ups and replies</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowBulkPanel(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
              <Sparkles size={15} /> Bulk Follow-Up
              {eligibleThreads.length > 0 && <span className="bg-white text-gray-900 text-[10px] font-bold px-1.5 rounded-full">{eligibleThreads.length}</span>}
            </button>
            <button onClick={checkInbox} disabled={checking}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              Check Inbox
            </button>
          </div>        </div>

        {/* Stats row */}
        <div className="grid grid-cols-6 gap-3">
          {[
            { label: "Leads",      val: stats.leads,     color: "text-gray-900" },
            { label: "Sent",       val: stats.sent,      color: "text-blue-600" },
            { label: "Follow-Ups", val: stats.followups, color: "text-blue-600" },
            { label: "Replied",    val: stats.replied,   color: "text-green-600" },
            { label: "Positive",   val: stats.positive,  color: "text-green-600" },
            { label: "Failed",     val: stats.failed,    color: stats.failed > 0 ? "text-red-500" : "text-gray-400" },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-gray-200 px-8">
        <div className="flex gap-0.5">
          {([
            { id: "threads" as const,  label: "Email Threads", count: threads.length, badge: 0 },
            { id: "replies" as const,  label: "Replies",       count: stats.replied,  badge: unread },
            { id: "inbox"   as const,  label: "Inbox Setup",   count: null,           badge: 0 },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`relative px-4 py-3 text-sm font-medium transition-colors rounded-t-lg ${
                tab === t.id ? "text-blue-600 bg-blue-50 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              }`}>
              {t.label}
              {t.count !== null && <span className="ml-1.5 text-xs text-gray-400">({t.count})</span>}
              {t.badge > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-8 py-5">

        {/* THREADS */}
        {tab === "threads" && (
          <div className="space-y-2 max-w-4xl">
            {threads.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail size={24} className="text-gray-400" />
                </div>
                <p className="text-gray-900 font-semibold">No emails sent yet</p>
                <p className="text-gray-500 text-sm mt-1">Send emails and they will appear here grouped by lead</p>
              </div>
            ) : threads.map(thread => {
              const isExpanded = expanded.has(thread.leadId);
              const latest = thread.emails[thread.emails.length - 1];
              const borderColor = thread.hasReply ? "border-green-200" : ["failed","bounced"].includes(thread.latestStatus) ? "border-red-200" : "border-gray-200";
              return (
                <div key={thread.leadId} className={`bg-white rounded-xl border ${borderColor} transition-all`}>

                  {/* Collapsed row */}
                  <div className="flex items-center px-4 py-3.5 cursor-pointer hover:bg-gray-50 rounded-xl" onClick={() => toggleExpand(thread.leadId)}>
                    <div className="mr-2.5 text-gray-400">
                      {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{thread.companyName}</span>
                        <StatusPill status={thread.latestStatus} opened={!!latest.opened_at} clicked={!!latest.clicked_at} />
                        {thread.followupCount > 0 && (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[11px] font-semibold rounded-full border border-blue-100 flex items-center gap-1">
                            <RotateCcw size={9} />{thread.followupCount} FU
                          </span>
                        )}
                        {thread.replies.length > 0 && (
                          <span className="px-2 py-0.5 bg-green-50 text-green-700 text-[11px] font-semibold rounded-full border border-green-100 flex items-center gap-1">
                            <MessageSquare size={9} />{thread.replies.length} repl{thread.replies.length > 1 ? "ies" : "y"}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{thread.leadEmail} &bull; {thread.emails.length} email{thread.emails.length > 1 ? "s" : ""} &bull; {fdate(latest.sent_at)}</p>
                    </div>
                    {/* Quick follow-up button visible even when collapsed */}
                    {!thread.hasReply && (
                      <button onClick={ev => { ev.stopPropagation(); openFP(latest, thread); }}
                        className="ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
                        <Plus size={11} /> Follow Up
                      </button>
                    )}
                  </div>

                  {/* Expanded conversation */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                      <div className="ml-5 space-y-2">

                        {/* Each email in thread */}
                        {thread.emails.map((email, idx) => {
                          const isFU = (email as any).is_followup;
                          const fNum = (email as any).followup_number || idx;
                          return (
                            <div key={email.id} className={`rounded-lg border p-3 ${isFU ? "border-blue-100 bg-blue-50/40" : "border-gray-100 bg-gray-50/60"}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    {isFU
                                      ? <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Follow-Up #{fNum}</span>
                                      : <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">Original</span>
                                    }
                                    <StatusPill status={email.status} opened={!!email.opened_at} clicked={!!email.clicked_at} />
                                    {(email as any).ai_generated && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Bot size={9} />AI</span>}
                                  </div>
                                  <p className="text-sm font-medium text-gray-900 truncate">{email.subject}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">{fdate(email.sent_at)}</p>
                                  {email.opened_at && <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1"><Eye size={9} />Opened {fdate(email.opened_at)}</p>}
                                  {email.clicked_at && <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1"><MousePointer size={9} />Clicked {fdate(email.clicked_at)}</p>}
                                  {(email as any).bounce_reason && <p className="text-xs text-red-500 mt-0.5">&#9888; {(email as any).bounce_reason}</p>}
                                </div>
                                {!thread.hasReply && (
                                  <button onClick={ev => { ev.stopPropagation(); openFP(email, thread); }}
                                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors">
                                    <Plus size={10} /> FU
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Replies in thread */}
                        {thread.replies.map(reply => (
                          <div key={reply.id} className="rounded-lg border border-green-200 bg-green-50/50 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-[11px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <MessageSquare size={9} />Reply
                                  </span>
                                  {reply.is_positive && <ThumbsUp size={11} className="text-green-600" />}
                                  {reply.sentiment && <span className="text-[11px] text-gray-500 capitalize">{reply.sentiment}</span>}
                                </div>
                                <p className="text-sm font-medium text-gray-900 truncate">{reply.subject}</p>
                                <p className="text-xs text-gray-400 mb-1">From {reply.from_email} &bull; {fdate(reply.received_at)}</p>
                                <p className="text-sm text-gray-600 line-clamp-2">{reply.body}</p>
                              </div>
                              <button onClick={ev => { ev.stopPropagation(); openRP(reply); }}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
                                <Reply size={11} />Reply
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Bottom Follow-Up CTA */}
                        {!thread.hasReply && (
                          <button onClick={() => openFP(thread.emails[thread.emails.length - 1], thread)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-gray-300 text-gray-500 text-sm font-medium rounded-lg hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                            <Plus size={13} />Send Follow-Up to {thread.companyName}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* REPLIES */}
        {tab === "replies" && (
          <div className="space-y-3 max-w-4xl">
            {replies.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Inbox size={24} className="text-gray-400" />
                </div>
                <p className="text-gray-900 font-semibold">No replies yet</p>
                <p className="text-gray-500 text-sm mt-1">Click "Check Inbox" to scan for new replies</p>
              </div>
            ) : replies.map(reply => {
              const lead = reply.lead_id ? leads.get(reply.lead_id) : undefined;
              const done = aiReplies.some(a => a.reply_id === reply.id && a.status === "sent");
              return (
                <div key={reply.id} className={`bg-white rounded-xl border p-5 ${reply.is_positive ? "border-green-200" : "border-gray-200"}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{lead?.company_name || "Unknown"}</span>
                        {reply.sentiment && (
                          <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full flex items-center gap-1 border ${reply.is_positive ? "bg-green-50 text-green-700 border-green-100" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                            {reply.is_positive ? <ThumbsUp size={9} /> : <ThumbsDown size={9} />}{reply.sentiment}
                          </span>
                        )}
                        {done && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-medium rounded-full border border-blue-100 flex items-center gap-1"><CheckCircle size={9} />Replied</span>}
                      </div>
                      <p className="text-sm font-semibold text-gray-800 mb-0.5">{reply.subject}</p>
                      <p className="text-xs text-gray-400">From {reply.from_email} &bull; {fdate(reply.received_at)}</p>
                    </div>
                    {!done && (
                      <button onClick={() => openRP(reply)}
                        className="ml-4 shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                        <Reply size={14} />Reply
                      </button>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed line-clamp-4">{reply.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* INBOX SETUP */}
        {tab === "inbox" && (
          <div className="max-w-3xl">
            <InboxConfigPanel onRepliesFound={load} />
          </div>
        )}
      </div>

      {/* ── Bulk Follow-Up Panel ── */}
      {showBulkPanel && (
        <div className="fixed inset-0 z-50 flex" onClick={() => { if (!bulkGenerating && !bulkSending) { setShowBulkPanel(false); setBulkStep("select"); setBulkPreviews([]); } }}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div className="relative ml-auto w-full max-w-xl h-full bg-white shadow-2xl flex flex-col border-l border-gray-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">Bulk Follow-Up</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {bulkNiche === "all"
                    ? `${eligibleThreads.length} leads eligible · all niches`
                    : `${filteredEligible.length} leads in "${bulkNiche}"`}
                </p>
              </div>
              {!bulkGenerating && !bulkSending && <button onClick={() => { setShowBulkPanel(false); setBulkStep("select"); setBulkPreviews([]); }} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={17} className="text-gray-500" /></button>}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Tone picker */}
              <div>
                <p className="text-sm font-bold text-gray-900 mb-2">Tone for All</p>
                <div className="grid grid-cols-3 gap-2 mb-1">
                  {TONES.map(t => (
                    <button key={t.value} onClick={() => setBulkTone(t.value)} disabled={bulkGenerating}
                      className={`p-3 rounded-lg border text-left transition-all ${bulkTone === t.value ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                      <p className={`text-xs font-bold ${bulkTone === t.value ? "text-blue-700" : "text-gray-800"}`}>{t.label}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Niche filter */}
              <div>
                <p className="text-sm font-bold text-gray-900 mb-2">Filter by Niche</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setNicheFilter("all")} disabled={bulkGenerating}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${bulkNiche === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                    All niches ({eligibleThreads.length})
                  </button>
                  {availableNiches.map(niche => {
                    const count = eligibleThreads.filter(t => (leads.get(t.leadId)?.niche || "") === niche).length;
                    return (
                      <button key={niche} onClick={() => setNicheFilter(niche)} disabled={bulkGenerating}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${bulkNiche === niche ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                        {niche} ({count})
                      </button>
                    );
                  })}                  {availableNiches.length === 0 && (
                    <p className="text-xs text-gray-400 py-1">No niche data — leads will all appear under "All"</p>
                  )}
                </div>
                {/* Quick select all in active niche */}
                {bulkNiche !== "all" && filteredEligible.length > 0 && (
                  <button onClick={selectAll} disabled={bulkGenerating}
                    className="mt-2 text-xs text-blue-600 hover:underline">
                    Select all {filteredEligible.length} in "{bulkNiche}"
                  </button>
                )}
              </div>

              {/* Lead selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-gray-900">
                    Select Leads
                    <span className="ml-2 text-gray-400 font-normal text-xs">
                      {bulkSelected.size} selected · {filteredEligible.length} shown
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <button onClick={selectAll} disabled={bulkGenerating} className="text-xs text-blue-600 hover:underline">Select All</button>
                    <span className="text-gray-300">|</span>
                    <button onClick={clearAll} disabled={bulkGenerating} className="text-xs text-gray-500 hover:underline">Clear</button>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {filteredEligible.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">
                      {bulkNiche === "all" ? "No eligible leads. Eligible = sent + no reply received." : `No eligible leads in "${bulkNiche}" niche.`}
                    </p>
                  ) : filteredEligible.map(thread => {
                    const latest = thread.emails.filter(e => !["failed","bounced"].includes(e.status||"")).slice(-1)[0];
                    const isSelected = bulkSelected.has(thread.leadId);
                    return (
                      <button key={thread.leadId} onClick={() => toggleBulkSelect(thread.leadId)} disabled={bulkGenerating}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${isSelected ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${isSelected ? "border-blue-500 bg-blue-500" : "border-gray-300"}`}>
                          {isSelected && <CheckCircle size={10} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{thread.companyName}</p>
                          <p className="text-[11px] text-gray-400 truncate">{thread.leadEmail}</p>
                          {leads.get(thread.leadId)?.niche && bulkNiche === "all" && (
                            <p className="text-[10px] text-gray-400 truncate mt-0.5">
                              <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{leads.get(thread.leadId)?.niche}</span>
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <StatusPill status={latest?.status} opened={!!latest?.opened_at} clicked={!!latest?.clicked_at} />
                          {thread.followupCount > 0 && <p className="text-[10px] text-blue-600 mt-0.5">{thread.followupCount} FU sent</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Progress bar while GENERATING */}
              {bulkGenerating && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-blue-900">Generating AI drafts…</p>
                    <p className="text-sm text-blue-700">{bulkProgress.done} / {bulkProgress.total}</p>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%` }} />
                  </div>
                  <p className="text-[11px] text-blue-600 mt-1.5">Please wait — generating personalized emails…</p>
                </div>
              )}
            </div>

            {/* Footer — STEP 1: select */}
            {bulkStep === "select" && (
              <div className="px-6 py-4 border-t border-gray-200 shrink-0">
                <div className="flex gap-3">
                  <button onClick={() => { setShowBulkPanel(false); setBulkStep("select"); setBulkPreviews([]); }} disabled={bulkGenerating}
                    className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={generateBulkPreviews} disabled={bulkGenerating || bulkSelected.size === 0}
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                    {bulkGenerating
                      ? <><Loader2 size={15} className="animate-spin" />Generating {bulkProgress.done}/{bulkProgress.total}…</>
                      : <><Sparkles size={15} />Generate Previews for {bulkSelected.size} Lead{bulkSelected.size !== 1 ? "s" : ""}</>
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bulk Review Panel (Step 2) — Email Writer style table ── */}
      {bulkStep === "review" && (() => {
        const readyCount = bulkPreviews.filter(p => !p.skipped && p.body.trim()).length;
        return (
          <div className="fixed inset-0 z-50 bg-white flex flex-col">
            {/* Top bar — matches Email Writer header */}
            <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-3">
                <p className="text-sm font-bold text-gray-900">
                  {readyCount} follow-up{readyCount !== 1 ? "s" : ""} ready to send
                </p>
                <span className="text-xs text-gray-500">Review and edit before sending</span>
              </div>
              <button onClick={() => { setBulkStep("select"); setBulkPreviews([]); setBulkReviewIndex(0); }}
                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                ← Back
              </button>
            </div>

            {/* Table — same as Email Writer */}
            <div className="flex-1 overflow-hidden px-8 pt-4 pb-0 min-h-0 flex flex-col">
              <div className="border border-gray-200 rounded-lg overflow-hidden flex-1 min-h-0">
                <div className="overflow-auto h-full">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 w-44">Company</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 w-52">Email</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Subject</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 w-24">Status</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 w-20">Edit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bulkPreviews.map((p, idx) => (
                        <tr key={p.leadId} className={`hover:bg-gray-50 transition-colors ${p.skipped ? "opacity-40" : ""}`}>
                          <td className="px-4 py-3">
                            <p className="text-xs font-semibold text-gray-900 truncate max-w-[160px]">{p.companyName}</p>
                            {leads.get(p.leadId)?.niche && (
                              <p className="text-[10px] text-gray-400 truncate">{leads.get(p.leadId)?.niche}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs text-gray-500 truncate max-w-[200px]">{p.leadEmail || "—"}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs text-gray-800 truncate max-w-sm">{p.subject || "—"}</p>
                          </td>
                          <td className="px-4 py-3">
                            {p.skipped ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200 font-medium">Skipped</span>
                            ) : p.skipReason ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 font-medium">Error</span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">AI</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => setBulkReviewIndex(idx)}
                              className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                              title="View & edit this follow-up">
                              <Edit3 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action bar — same as Email Writer */}
              <div className="flex gap-3 py-4 shrink-0">
                <button onClick={sendBulkPreviews} disabled={readyCount === 0}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  <Send size={15} />
                  Send {readyCount} Follow-Up{readyCount !== 1 ? "s" : ""}
                </button>
              </div>
            </div>

            {/* Edit modal — same as Email Writer previewIndex modal */}
            {bulkReviewIndex >= 0 && bulkPreviews[bulkReviewIndex] && (() => {
              const cur = bulkPreviews[bulkReviewIndex];
              const total = bulkPreviews.length;
              return (
                <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setBulkReviewIndex(-1)}>
                  <div className="absolute inset-0 bg-black/30" />
                  <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden mx-4" onClick={e => e.stopPropagation()}>
                    {/* Modal header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <div>
                        <p className="text-sm font-bold text-gray-900">{cur.companyName}</p>
                        <p className="text-xs text-gray-500">{cur.leadEmail}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => skipPreview(cur.leadId)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${cur.skipped ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                          {cur.skipped ? "Undo Skip" : "Skip"}
                        </button>
                        <span className="text-xs text-gray-400 ml-1">{bulkReviewIndex + 1} / {total}</span>
                        <button onClick={() => setBulkReviewIndex(i => Math.max(0, i - 1))} disabled={bulkReviewIndex === 0}
                          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={15} /></button>
                        <button onClick={() => setBulkReviewIndex(i => Math.min(total - 1, i + 1))} disabled={bulkReviewIndex === total - 1}
                          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={15} /></button>
                        <button onClick={() => setBulkReviewIndex(-1)} className="p-1.5 rounded hover:bg-gray-100 ml-1">
                          <X size={16} className="text-gray-500" />
                        </button>
                      </div>
                    </div>

                    {/* Modal body */}
                    <div className={`flex-1 overflow-y-auto p-5 flex flex-col gap-4 ${cur.skipped ? "opacity-40 pointer-events-none" : ""}`}>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Subject</label>
                        <input value={cur.subject} onChange={e => updatePreview(cur.leadId, "subject", e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Body</label>
                        <textarea value={cur.body} onChange={e => updatePreview(cur.leadId, "body", e.target.value)}
                          rows={16}
                          className="w-full px-3 py-2.5 rounded-lg text-sm text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none font-sans leading-relaxed" />
                      </div>
                    </div>

                    {/* Modal footer */}
                    <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
                      <button onClick={() => setBulkReviewIndex(-1)}
                        className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50">
                        Done
                      </button>
                      {bulkReviewIndex < total - 1 && (
                        <button onClick={() => setBulkReviewIndex(i => i + 1)}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">
                          Next →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ── Sending Progress (Step 3) ── */}
      {bulkStep === "sending" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Loader2 size={22} className="animate-spin text-blue-600" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Sending follow-ups…</h3>
              <p className="text-sm text-gray-500 mt-1">{bulkProgress.done} of {bulkProgress.total} sent</p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 mb-3">
              <div className="bg-blue-600 h-3 rounded-full transition-all"
                style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%` }} />
            </div>
            {bulkProgress.errors > 0 && <p className="text-xs text-red-500 text-center">{bulkProgress.errors} failed</p>}
            <p className="text-[11px] text-gray-400 text-center mt-2">Sending with delay to avoid spam filters…</p>
          </div>
        </div>
      )}

      {/* ── Follow-Up Slide Panel ── */}
      {fpOpen && (
        <div className="fixed inset-0 z-50 flex" onClick={closeFP}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div className="relative ml-auto w-full max-w-xl h-full bg-white shadow-2xl flex flex-col border-l border-gray-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">Send Follow-Up #{(fpThread?.followupCount||0)+1}</h2>
                <p className="text-xs text-gray-500 mt-0.5">to {fpThread?.companyName}</p>
              </div>
              <button onClick={closeFP} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={17} className="text-gray-500" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1.5">Original Email</p>
                <p className="text-sm font-semibold text-gray-900 mb-0.5">{fpEmail?.subject}</p>
                <p className="text-xs text-gray-400">{fdate(fpEmail?.sent_at||"")}</p>
                {fpThread && fpThread.followupCount > 0 && (
                  <p className="text-xs text-blue-600 mt-1">{fpThread.followupCount} follow-up{fpThread.followupCount > 1 ? "s" : ""} already sent</p>
                )}
              </div>

              <div>
                <p className="text-sm font-bold text-gray-900 mb-2.5">Choose Tone</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {TONES.map(t => (
                    <button key={t.value} onClick={() => { setFpTone(t.value); setFpDraft(null); }}
                      className={`p-3 rounded-lg border text-left transition-all ${fpTone === t.value ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                      <p className={`text-xs font-bold ${fpTone === t.value ? "text-blue-700" : "text-gray-800"}`}>{t.label}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {!fpDraft && (
                <button onClick={genFP} disabled={fpGen}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {fpGen ? <><Loader2 size={15} className="animate-spin" />Generating…</> : <><Sparkles size={15} />Generate AI Follow-Up</>}
                </button>
              )}

              {fpDraft && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-900">Generated Follow-Up</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{fpDraft.modelUsed === "template" ? "Template" : "AI"}</span>
                      <button onClick={genFP} disabled={fpGen} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors">
                        {fpGen ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}Regenerate
                      </button>
                    </div>
                  </div>
                  {fpDraft.decisionReason && (
                    <p className="text-[11px] text-gray-500 italic bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">&#128161; {fpDraft.decisionReason}</p>
                  )}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Subject</label>
                    <input value={fpSubj} onChange={e => setFpSubj(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Body</label>
                    <textarea value={fpBody} onChange={e => setFpBody(e.target.value)} rows={9}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 resize-none" />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button onClick={closeFP} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
                    <button onClick={sendFP} disabled={fpSend || !fpBody.trim()}
                      className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                      {fpSend ? <><Loader2 size={15} className="animate-spin" />Sending…</> : <><Send size={15} />Send Follow-Up</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Reply Slide Panel ── */}
      {rpOpen && rpReply && (
        <div className="fixed inset-0 z-50 flex" onClick={closeRP}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div className="relative ml-auto w-full max-w-xl h-full bg-white shadow-2xl flex flex-col border-l border-gray-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">Reply to Lead</h2>
                <p className="text-xs text-gray-500 mt-0.5">{leads.get(rpReply.lead_id||"")?.company_name || rpReply.from_email}</p>
              </div>
              <button onClick={closeRP} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={17} className="text-gray-500" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-bold text-green-700 uppercase tracking-widest">Their Reply</p>
                  {rpReply.is_positive && <ThumbsUp size={11} className="text-green-600" />}
                  {rpReply.sentiment && <span className="text-[11px] text-gray-500 capitalize">{rpReply.sentiment}</span>}
                </div>
                <p className="text-sm font-semibold text-gray-900 mb-0.5">{rpReply.subject}</p>
                <p className="text-xs text-gray-400 mb-2">From {rpReply.from_email} &bull; {fdate(rpReply.received_at)}</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{rpReply.body}</p>
              </div>

              <div className="flex gap-2">
                <button onClick={genRP} disabled={rpGen}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {rpGen ? <><Loader2 size={13} className="animate-spin" />Generating…</> : <><Sparkles size={13} />Generate AI Reply</>}
                </button>
                {rpBody && (
                  <button onClick={genRP} disabled={rpGen} className="flex items-center gap-1 px-3 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                    <RotateCcw size={12} />Regenerate
                  </button>
                )}
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Subject</label>
                <input value={rpSubj} onChange={e => setRpSubj(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Your Reply {rpDraft && <span className="text-gray-400 normal-case font-normal ml-1">AI generated — edit freely</span>}
                </label>
                <textarea value={rpBody} onChange={e => setRpBody(e.target.value)} rows={9}
                  placeholder="Type your reply, or click Generate AI Reply above…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 resize-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={closeRP} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
                <button onClick={sendRP} disabled={rpSend || !rpBody.trim()}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {rpSend ? <><Loader2 size={15} className="animate-spin" />Sending…</> : <><Send size={15} />Send Reply</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
