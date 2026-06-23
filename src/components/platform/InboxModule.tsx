"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Inbox, Plus, Trash2, RefreshCw, Loader2,
  Eye, EyeOff, CheckCircle2, AlertCircle,
  MessageSquare, Mail, ExternalLink, X,
  Calendar, XCircle, Repeat, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "../../../supabase/client";

interface InboxModuleProps { userId: string; }

interface InboxConfig {
  id: string;
  email_address: string;
  imap_host: string;
  imap_port: number;
  imap_username: string;
  last_checked_at: string | null;
  is_active: boolean;
  auto_reply_enabled: boolean;
}

interface Reply {
  id: string;
  from_email: string;
  subject: string | null;
  body: string;
  received_at: string;
  sentiment: string | null;
  is_positive: boolean | null;
  classification?: string | null;
  is_auto_reply?: boolean;
  lead_id: string | null;
  sent_email_id: string | null;
}

const CLASSIFICATION_STYLE: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  interested:      { label: "Interested",      color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200", icon: CheckCircle2 },
  meeting_request: { label: "Meeting Request", color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",  icon: Calendar },
  not_interested:  { label: "Not Interested",  color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",   icon: XCircle },
  auto_reply:      { label: "Auto Reply",      color: "text-gray-500",   bg: "bg-gray-100",  border: "border-gray-200",  icon: Repeat },
  positive:        { label: "Positive",        color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200", icon: CheckCircle2 },
  negative:        { label: "Negative",        color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",   icon: XCircle },
  neutral:         { label: "Neutral",         color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200", icon: MessageSquare },
};

function getStyle(r: Reply) {
  const key = r.classification ?? r.sentiment ?? "neutral";
  return CLASSIFICATION_STYLE[key] ?? CLASSIFICATION_STYLE.neutral;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3600000;
  if (diffH < 24) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffH < 168) return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function InboxModule({ userId }: InboxModuleProps) {
  const [tab, setTab] = useState<"replies" | "settings">("replies");
  const [configs, setConfigs]   = useState<InboxConfig[]>([]);
  const [replies, setReplies]   = useState<Reply[]>([]);
  const [loadingC, setLoadingC] = useState(true);
  const [loadingR, setLoadingR] = useState(true);
  const [checking, setChecking] = useState(false);
  const [showAdd, setShowAdd]   = useState(false);
  const [showPw, setShowPw]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [selected, setSelected] = useState<Reply | null>(null);
  const [filter, setFilter]     = useState("all");

  const supabase = createClient();

  const [form, setForm] = useState({
    email_address: "",
    imap_host: "imap.gmail.com",
    imap_port: 993,
    imap_username: "",
    imap_password: "",
    auto_reply_enabled: false,
  });

  const loadConfigs = useCallback(async () => {
    setLoadingC(true);
    // Load dedicated inbox configs
    const res = await fetch("/api/inbox/config").catch(() => null);
    const inboxConfigs: InboxConfig[] = res?.ok ? (await res.json()).configs ?? [] : [];

    // Also load smtp_accounts as implicit inboxes
    const { data: smtpData } = await supabase
      .from("smtp_accounts")
      .select("id, email, host, user_name, last_imap_check, status")
      .eq("user_id", userId)
      .eq("status", "active");

    // Build merged list — smtp accounts shown as "auto" configs
    const smtpAsConfigs: InboxConfig[] = (smtpData ?? [])
      .filter((s: any) => s.host?.toLowerCase().includes("gmail") || s.host?.toLowerCase().includes("outlook") || s.host?.toLowerCase().includes("yahoo"))
      .map((s: any) => ({
        id: `smtp:${s.id}`,
        email_address: s.email,
        imap_host: s.host?.includes("gmail") ? "imap.gmail.com" : s.host?.includes("outlook") ? "outlook.office365.com" : "imap.mail.yahoo.com",
        imap_port: 993,
        imap_username: s.user_name ?? s.email,
        last_checked_at: s.last_imap_check ?? null,
        is_active: true,
        auto_reply_enabled: false,
      }));

    // Merge — dedicated configs take priority, smtp fills the rest
    const seenEmails = new Set(inboxConfigs.map((c: InboxConfig) => c.email_address.toLowerCase()));
    const merged = [
      ...inboxConfigs,
      ...smtpAsConfigs.filter((c: InboxConfig) => !seenEmails.has(c.email_address.toLowerCase())),
    ];
    setConfigs(merged);
    setLoadingC(false);
  }, [userId]);

  const loadReplies = useCallback(async () => {
    setLoadingR(true);
    const { data } = await supabase
      .from("email_replies")
      .select("id, from_email, subject, body, received_at, sentiment, is_positive, classification, is_auto_reply, lead_id, sent_email_id")
      .eq("user_id", userId)
      .order("received_at", { ascending: false })
      .limit(200);
    setReplies(data ?? []);
    setLoadingR(false);
  }, [userId]);

  useEffect(() => {
    loadConfigs();
    loadReplies();
  }, [loadConfigs, loadReplies]);

  const [checkStatus, setCheckStatus] = useState<string>("");
  const [testing, setTesting]         = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);

  const handleTest = async () => {
    setTesting(true);
    setTestResults([]);
    try {
      const res = await fetch("/api/inbox/test");
      const d   = await res.json();
      setTestResults(d.accounts ?? []);
      if (d.ok) toast.success("All inboxes connected ✅");
      else      toast.error("Connection issue — see details below");
    } catch (e: any) {
      toast.error(`Test failed: ${e?.message}`);
    }
    setTesting(false);
  };

  const handleCheck = async () => {
    setChecking(true);
    setCheckStatus("Connecting to Gmail…");
    // Show progress messages while waiting
    const msgs = [
      "Connecting to Gmail…",
      "Scanning inbox…",
      "Matching replies to sent emails…",
      "Almost done…",
    ];
    let msgIdx = 0;
    const ticker = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, msgs.length - 1);
      setCheckStatus(msgs[msgIdx] ?? "");
    }, 8_000);

    try {
      const res = await fetch("/api/inbox/check", { method: "POST" });
      clearInterval(ticker);
      const d = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
      if (!res.ok) {
        toast.error(`Server error: ${d.error ?? res.statusText}`);
        setCheckStatus("");
        setChecking(false);
        return;
      }
      if (d.success) {
        if (d.totalNewReplies > 0) {
          toast.success(`✅ Found ${d.totalNewReplies} new repl${d.totalNewReplies === 1 ? "y" : "ies"}!`);
          await loadReplies();
        } else {
          const errors = (d.results ?? []).flatMap((r: any) => r.errors ?? []);
          if (errors.length > 0) {
            toast.error(`IMAP error: ${errors[0]}`);
          } else {
            toast.info(d.message || "No new replies found");
          }
        }
        await loadConfigs();
      } else {
        toast.error(d.error ?? "Check failed");
      }
    } catch (err: any) {
      clearInterval(ticker);
      toast.error(`Network error: ${err?.message ?? err}`);
    }
    setCheckStatus("");
    setChecking(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/inbox/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      toast.success("Inbox connected");
      setShowAdd(false);
      setForm({ email_address: "", imap_host: "imap.gmail.com", imap_port: 993, imap_username: "", imap_password: "", auto_reply_enabled: false });
      await loadConfigs();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this inbox?")) return;
    const res = await fetch(`/api/inbox/config?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Inbox removed"); await loadConfigs(); }
    else toast.error("Failed to remove");
  };

  const filteredReplies = replies.filter(r => {
    if (filter === "all") return true;
    const cls = r.classification ?? r.sentiment ?? "neutral";
    return cls === filter;
  });

  const counts = replies.reduce((acc, r) => {
    const k = r.classification ?? r.sentiment ?? "neutral";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Inbox size={17} className="text-blue-600" /> Inbox & Replies
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {configs.length === 0
              ? "Connect your Gmail to see replies here"
              : `${configs.length} inbox${configs.length !== 1 ? "es" : ""} connected · ${replies.length} replies`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCheck}
            disabled={checking}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-70 transition-colors min-w-[140px] justify-center"
          >
            {checking ? <Loader2 size={14} className="animate-spin shrink-0" /> : <RefreshCw size={14} />}
            {checking ? (checkStatus || "Checking…") : "Check Now"}
          </button>
        </div>
      </div>

      {/* ── No inbox warning banner ── */}
      {!loadingC && configs.length === 0 && (
        <div className="mx-6 mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">No Gmail/SMTP account connected</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Add a Gmail account in SMTP Manager first. The platform will automatically scan it for replies using the same App Password.
            </p>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 px-6 pt-4 border-b border-gray-200 bg-white">
        {[
          { id: "replies" as const, label: `Replies (${replies.length})`, icon: MessageSquare },
          { id: "settings" as const, label: "Inbox Settings", icon: Inbox },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === id ? "bg-blue-50 text-blue-700 border border-b-0 border-blue-200" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 p-6">

        {/* ══ REPLIES TAB ══ */}
        {tab === "replies" && (
          <div className="space-y-4">
            {/* Filter pills */}
            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: `All (${replies.length})` },
                ...Object.entries(counts).sort((a,b) => b[1]-a[1]).map(([k, c]) => {
                  const s = CLASSIFICATION_STYLE[k] ?? CLASSIFICATION_STYLE.neutral;
                  return { key: k, label: `${s.label} (${c})` };
                }),
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    filter === key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {loadingR ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={22} className="animate-spin text-blue-500" />
              </div>
            ) : filteredReplies.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <MessageSquare size={36} className="mx-auto mb-3 opacity-25" />
                <p className="text-sm font-medium">
                  {replies.length === 0 ? "No replies synced yet" : "No replies match this filter"}
                </p>
                {replies.length === 0 && configs.length > 0 && (
                  <p className="text-xs mt-1">Click "Check Now" to scan your inbox</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredReplies.map(r => {
                  const s = getStyle(r);
                  const Icon = s.icon;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className={`bg-white rounded-xl border cursor-pointer hover:shadow-sm transition-all p-4 ${s.border}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-bold text-gray-900 truncate">{r.from_email}</p>
                            <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(r.received_at)}</span>
                          </div>
                          <p className="text-xs text-gray-500 mb-1.5 truncate">{r.subject ?? "(no subject)"}</p>
                          <p className="text-xs text-gray-700 line-clamp-2">{r.body}</p>
                        </div>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold shrink-0 ${s.bg} ${s.color}`}>
                          <Icon size={10} /> {s.label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ SETTINGS TAB ══ */}
        {tab === "settings" && (
          <div className="space-y-4 max-w-xl">
            {/* Gmail setup guide */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm font-bold text-blue-800 mb-2">Gmail Setup — 3 steps</p>
              <ol className="text-xs text-blue-700 space-y-1.5 list-decimal list-inside">
                <li>In Gmail → Settings → <strong>See all settings</strong> → <strong>Forwarding and POP/IMAP</strong> → Enable IMAP → Save</li>
                <li>Go to <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" className="underline font-semibold">myaccount.google.com/security</a> → Enable 2-Step Verification</li>
                <li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline font-semibold">myaccount.google.com/apppasswords</a> → Create App Password → Select "Mail" → Copy the 16-character password</li>
              </ol>
              <p className="text-xs text-blue-600 mt-2 font-semibold">Use that App Password below — NOT your regular Gmail password.</p>
            </div>

            {/* Connected inboxes */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">Connected Inboxes</p>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
              >
                <Plus size={12} /> Add inbox
              </button>
            </div>

            {loadingC ? (
              <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
            ) : configs.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
                <Inbox size={28} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No inboxes connected yet</p>
                <p className="text-xs text-gray-400 mt-1">Add a Gmail account in SMTP Manager — it will appear here automatically</p>
              </div>
            ) : (
              <div className="space-y-2">
                {configs.map(c => {
                  const isSmtpDerived = c.id.startsWith("smtp:");
                  return (
                    <div key={c.id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200">
                      <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.is_active ? "bg-green-500" : "bg-gray-300"}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900">{c.email_address}</p>
                            {isSmtpDerived && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-semibold">auto from SMTP</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {c.imap_host} · Port {c.imap_port}
                            {c.last_checked_at && <> · Last synced {fmtDate(c.last_checked_at)}</>}
                            {!c.last_checked_at && <> · Not yet scanned — click Check Now</>}
                          </p>
                        </div>
                      </div>
                      {!isSmtpDerived && (
                        <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {configs.length > 0 && (
              <>
                {/* Test connection button */}
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} className="text-green-600" />}
                  {testing ? "Testing connection…" : "Test IMAP Connection"}
                </button>

                {/* Test results */}
                {testResults.length > 0 && (
                  <div className="space-y-2">
                    {testResults.map((r, i) => (
                      <div key={i} className={`p-3 rounded-xl border text-xs ${r.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                        <div className="flex items-center gap-2 font-semibold mb-1">
                          {r.ok
                            ? <CheckCircle2 size={13} className="text-green-600" />
                            : <AlertCircle  size={13} className="text-red-500" />}
                          <span className={r.ok ? "text-green-800" : "text-red-700"}>{r.email}</span>
                          {r.ok && <span className="text-green-600 font-normal ml-auto">{r.messages} msgs · {r.unseen} unread</span>}
                        </div>
                        {!r.ok && (
                          <p className="text-red-700 leading-relaxed pl-5">{r.error}</p>
                        )}
                        {r.ok && (
                          <p className="text-green-600 pl-5">Connected to {r.imapHost} ✓</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500 space-y-1">
                  <p className="font-semibold text-gray-700">How sync works</p>
                  <p>• Click <strong>Check Now</strong> at the top to manually scan your inbox right now</p>
                  <p>• The platform automatically checks for new replies every 15 minutes via cron</p>
                  <p>• Only replies to emails sent through the platform are imported</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Add inbox modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowAdd(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">Connect Inbox</h3>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} className="text-gray-400" /></button>
            </div>

            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Provider</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { k: "Gmail",   h: "imap.gmail.com",           p: 993 },
                    { k: "Outlook", h: "outlook.office365.com",    p: 993 },
                    { k: "Yahoo",   h: "imap.mail.yahoo.com",      p: 993 },
                    { k: "Custom",  h: "",                          p: 993 },
                  ].map(({ k, h, p }) => (
                    <button key={k} type="button"
                      onClick={() => setForm(f => ({ ...f, imap_host: h, imap_port: p }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        form.imap_host === h ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >{k}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email address</label>
                <input type="email" required value={form.email_address}
                  onChange={e => setForm(f => ({ ...f, email_address: e.target.value, imap_username: e.target.value }))}
                  placeholder="you@gmail.com"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">IMAP host</label>
                  <input type="text" required value={form.imap_host}
                    onChange={e => setForm(f => ({ ...f, imap_host: e.target.value }))}
                    placeholder="imap.gmail.com"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Port</label>
                  <input type="number" required value={form.imap_port}
                    onChange={e => setForm(f => ({ ...f, imap_port: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">App Password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} required value={form.imap_password}
                    onChange={e => setForm(f => ({ ...f, imap_password: e.target.value }))}
                    placeholder="16-character App Password (not your Gmail password)"
                    className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {form.imap_host.includes("gmail") && (
                  <p className="text-[11px] text-amber-600 mt-1.5 flex items-start gap-1">
                    <AlertCircle size={11} className="shrink-0 mt-0.5" />
                    Gmail requires an App Password — NOT your regular password. See the setup guide above.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="ar" checked={form.auto_reply_enabled}
                  onChange={e => setForm(f => ({ ...f, auto_reply_enabled: e.target.checked }))}
                  className="rounded border-gray-300" />
                <label htmlFor="ar" className="text-xs text-gray-700">Enable auto-reply for positive responses</label>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Connect inbox
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reply detail drawer ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl mx-0 sm:mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div>
                <p className="text-sm font-bold text-gray-900 truncate">{selected.from_email}</p>
                <p className="text-xs text-gray-500 mt-0.5">{fmtDate(selected.received_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                {(() => { const s = getStyle(selected); const Icon = s.icon; return (
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${s.bg} ${s.color}`}>
                    <Icon size={10} /> {s.label}
                  </div>
                ); })()}
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={15} className="text-gray-400" /></button>
              </div>
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold text-gray-500 mb-1">Subject</p>
              <p className="text-sm text-gray-900 mb-4">{selected.subject ?? "(no subject)"}</p>
              <p className="text-xs font-semibold text-gray-500 mb-1">Message</p>
              <div className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-xl p-4 leading-relaxed">
                {selected.body || "(empty)"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
