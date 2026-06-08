"use client";

import { useState, useEffect } from "react";
import { Loader2, Zap, CheckCircle, XCircle, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

interface WebhooksModuleProps { userId: string; }

type WebhookEvent =
  | "email.sent" | "email.opened" | "email.clicked" | "email.bounced"
  | "reply.received" | "lead.status_changed" | "sequence.completed";

const EVENT_CONFIG: Record<WebhookEvent, { label: string; desc: string; emoji: string; defaultOn: boolean }> = {
  "reply.received":      { label: "Reply Received",      desc: "Someone replied to one of your emails",              emoji: "💬", defaultOn: true  },
  "email.opened":        { label: "Email Opened",         desc: "A recipient opened your email",                      emoji: "👀", defaultOn: true  },
  "email.clicked":       { label: "Link Clicked",         desc: "A recipient clicked a tracked link",                 emoji: "🖱️", defaultOn: true  },
  "email.bounced":       { label: "Email Bounced",        desc: "An email failed to deliver",                         emoji: "⚠️", defaultOn: true  },
  "email.sent":          { label: "Email Sent",           desc: "Every time an email is delivered (high volume)",     emoji: "📤", defaultOn: false },
  "lead.status_changed": { label: "Lead Status Changed",  desc: "A lead's CRM status is updated",                    emoji: "🔄", defaultOn: false },
  "sequence.completed":  { label: "Sequence Completed",   desc: "A lead finishes the full follow-up sequence",        emoji: "✅", defaultOn: false },
};

const ALL_EVENTS = Object.keys(EVENT_CONFIG) as WebhookEvent[];

interface ZapierSettings {
  enabled: boolean;
  events: WebhookEvent[];
}

interface RecentDelivery {
  event: string;
  success: boolean;
  status_code: number;
  delivered_at: string;
  error_message?: string;
}

export default function WebhooksModule({ userId }: WebhooksModuleProps) {
  const [settings, setSettings] = useState<ZapierSettings>({
    enabled: true,
    events: ALL_EVENTS.filter(e => EVENT_CONFIG[e].defaultOn),
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [deliveries, setDeliveries] = useState<RecentDelivery[]>([]);
  const [zapierConfigured, setZapierConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    // Load saved settings
    fetch("/api/webhooks/zapier-settings")
      .then(async r => {
        const text = await r.text();
        if (!text) return;
        try {
          const d = JSON.parse(text);
          if (d.settings) setSettings(d.settings);
          if (typeof d.configured === "boolean") setZapierConfigured(d.configured);
        } catch {}
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Load recent deliveries
    fetch("/api/webhooks/zapier-deliveries")
      .then(async r => {
        const text = await r.text();
        if (!text) return;
        try { const d = JSON.parse(text); setDeliveries(d.deliveries ?? []); } catch {}
      })
      .catch(() => {});
  }, []);

  const toggleEvent = (ev: WebhookEvent) => {
    setSettings(s => ({
      ...s,
      events: s.events.includes(ev) ? s.events.filter(e => e !== ev) : [...s.events, ev],
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/webhooks/zapier-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Zapier settings saved");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/webhooks/test-zapier", { method: "POST" });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || "Test failed");
      setTestResult({ ok: true, msg: "✅ Test event sent to Zapier! Check your Zap's task history." });
      // Refresh deliveries
      fetch("/api/webhooks/zapier-deliveries")
        .then(async r => { const t = await r.text(); if (t) { try { const d = JSON.parse(t); setDeliveries(d.deliveries ?? []); } catch {} } })
        .catch(() => {});
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message });
    } finally { setTesting(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 size={20} className="animate-spin text-blue-600" />
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Zap size={18} className="text-blue-600" /> Zapier Integration
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Select which events get forwarded to Zapier — connect to 6,000+ apps automatically
          </p>
        </div>
        {/* Master enable toggle */}
        <button
          onClick={() => setSettings(s => ({ ...s, enabled: !s.enabled }))}
          className={`relative w-12 h-6 rounded-full transition-colors ${settings.enabled ? "bg-blue-600" : "bg-gray-200"}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.enabled ? "translate-x-6" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Connection status */}
      {zapierConfigured === false && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
          <Zap size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-800">Zapier URL not configured</p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              Ask your administrator to add <code className="bg-amber-100 px-1 rounded">ZAPIER_WEBHOOK_URL</code> to the server's environment variables, then restart the server.
            </p>
          </div>
        </div>
      )}

      {zapierConfigured === true && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle size={14} className="text-green-500" />
          <p className="text-xs font-semibold text-green-800">Zapier is connected and ready to receive events</p>
        </div>
      )}

      {/* Event toggles */}
      {settings.enabled && (
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-3">
            Send to Zapier when…
            <span className="font-normal text-gray-400 ml-2 text-xs">
              ({settings.events.length} of {ALL_EVENTS.length} events enabled)
            </span>
          </p>
          <div className="space-y-2">
            {ALL_EVENTS.map(ev => {
              const { label, desc, emoji } = EVENT_CONFIG[ev];
              const on = settings.events.includes(ev);
              return (
                <div key={ev} onClick={() => toggleEvent(ev)}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                    on ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
                  }`}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg w-6 text-center">{emoji}</span>
                    <div>
                      <p className={`text-sm font-semibold ${on ? "text-blue-800" : "text-gray-700"}`}>{label}</p>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </div>
                  </div>
                  <div className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${on ? "bg-blue-500" : "bg-gray-200"}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Test result */}
      {testResult && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border ${
          testResult.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
        }`}>
          {testResult.ok
            ? <CheckCircle size={14} className="text-green-600 shrink-0 mt-0.5" />
            : <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />}
          <p className={`text-xs leading-relaxed ${testResult.ok ? "text-green-800" : "text-red-700"}`}>
            {testResult.msg}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          Save Settings
        </button>
        <button onClick={sendTest} disabled={testing || zapierConfigured === false}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 transition-colors">
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send Test Event
        </button>
      </div>

      {/* Payload preview */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs font-bold text-gray-700 mb-2">Payload sent to Zapier for each event</p>
        <pre className="text-[10px] text-gray-600 overflow-x-auto leading-relaxed">{`{
  "event": "reply.received",
  "timestamp": "2025-06-08T10:30:00.000Z",
  "platform": "pryro_mail",
  "data": {
    "leadId": "uuid-...",
    "leadEmail": "john@company.com",
    "companyName": "Acme Corp",
    "sentiment": "interested",
    "subject": "Re: Strategic Partnership Opportunity",
    "userId": "uuid-..."
  }
}`}</pre>
      </div>

      {/* Recent deliveries */}
      {deliveries.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-700">Recent Zapier Deliveries</p>
            <button onClick={() => {
              fetch("/api/webhooks/zapier-deliveries")
                .then(async r => { const t = await r.text(); if (t) { try { const d = JSON.parse(t); setDeliveries(d.deliveries ?? []); } catch {} } })
                .catch(() => {});
            }} className="p-1 rounded hover:bg-gray-100">
              <RefreshCw size={11} className="text-gray-400" />
            </button>
          </div>
          <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
            {deliveries.map((d, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                {d.success
                  ? <CheckCircle size={12} className="text-green-500 shrink-0" />
                  : <XCircle size={12} className="text-red-400 shrink-0" />}
                <span className="font-mono text-gray-500 shrink-0 w-4 text-center">{d.status_code || "—"}</span>
                <span className="text-gray-700 shrink-0">{d.event}</span>
                <span className="text-gray-400 text-[10px] ml-auto shrink-0">
                  {new Date(d.delivered_at).toLocaleString()}
                </span>
                {d.error_message && (
                  <span className="text-red-400 text-[10px] truncate max-w-32">{d.error_message}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
