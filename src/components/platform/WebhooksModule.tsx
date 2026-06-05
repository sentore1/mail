"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Zap, CheckCircle, XCircle, Eye, EyeOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface WebhooksModuleProps { userId: string; }

type WebhookEvent =
  | "email.sent" | "email.opened" | "email.clicked" | "email.bounced"
  | "reply.received" | "lead.status_changed" | "sequence.completed";

const EVENT_LABELS: Record<WebhookEvent, { label: string; desc: string }> = {
  "email.sent":          { label: "Email Sent",          desc: "Fires when an email is successfully delivered" },
  "email.opened":        { label: "Email Opened",         desc: "Fires when a recipient opens an email" },
  "email.clicked":       { label: "Link Clicked",         desc: "Fires when a recipient clicks a tracked link" },
  "email.bounced":       { label: "Email Bounced",        desc: "Fires when an email hard-bounces" },
  "reply.received":      { label: "Reply Received",       desc: "Fires when a reply is detected in your inbox" },
  "lead.status_changed": { label: "Lead Status Changed",  desc: "Fires when a lead's status is updated" },
  "sequence.completed":  { label: "Sequence Completed",   desc: "Fires when all follow-ups in a sequence are done" },
};

const ALL_EVENTS = Object.keys(EVENT_LABELS) as WebhookEvent[];

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  is_active: boolean;
  created_at: string;
}

interface Delivery {
  id: string;
  event: string;
  status_code: number;
  success: boolean;
  delivered_at: string;
  error_message?: string;
}

export default function WebhooksModule({ userId }: WebhooksModuleProps) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({});
  const [showDeliveries, setShowDeliveries] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});

  // Form state
  const [form, setForm] = useState({ name: "", url: "", secret: "", events: [] as WebhookEvent[] });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/webhooks");
      const data = await res.json();
      setWebhooks(data.webhooks ?? []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleEvent = (ev: WebhookEvent) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter(e => e !== ev) : [...f.events, ev],
    }));
  };

  const save = async () => {
    if (!form.url) { toast.error("URL is required"); return; }
    if (!form.url.startsWith("https://")) { toast.error("URL must start with https://"); return; }
    if (form.events.length === 0) { toast.error("Select at least one event"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Webhook created");
      setShowForm(false);
      setForm({ name: "", url: "", secret: "", events: [] });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const toggle = async (hook: Webhook) => {
    await fetch("/api/webhooks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: hook.id, is_active: !hook.is_active }),
    });
    setWebhooks(prev => prev.map(h => h.id === hook.id ? { ...h, is_active: !h.is_active } : h));
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this webhook?")) return;
    await fetch(`/api/webhooks?id=${id}`, { method: "DELETE" });
    setWebhooks(prev => prev.filter(h => h.id !== id));
    toast.success("Webhook deleted");
  };

  const sendTest = async (hook: Webhook) => {
    setTestingId(hook.id);
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "email.sent",
          timestamp: new Date().toISOString(),
          data: { test: true, userId, message: "Test delivery from Pryro Mail" },
        }),
      });
      if (res.ok) toast.success(`Test delivered — ${res.status}`);
      else toast.error(`Server responded with ${res.status}`);
    } catch (e: any) {
      toast.error(`Delivery failed: ${e.message}`);
    } finally { setTestingId(null); }
  };

  const loadDeliveries = async (hookId: string) => {
    if (showDeliveries === hookId) { setShowDeliveries(null); return; }
    try {
      const res = await fetch(`/api/webhooks/deliveries?webhookId=${hookId}`);
      const data = await res.json();
      setDeliveries(prev => ({ ...prev, [hookId]: data.deliveries ?? [] }));
      setShowDeliveries(hookId);
    } catch { toast.error("Failed to load delivery history"); }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Zap size={18} className="text-blue-600" /> Webhooks
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Send real-time event data to any URL — use with Zapier, Make, or your own server</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
          <Plus size={14} /> Add Webhook
        </button>
      </div>

      {/* New webhook form */}
      {showForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4">
          <p className="text-sm font-bold text-blue-900">New Webhook</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Name <span className="font-normal text-gray-400">(optional)</span></label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Zapier CRM Sync"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Endpoint URL <span className="text-red-500">*</span></label>
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://hooks.zapier.com/..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400 bg-white" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Signing Secret <span className="font-normal text-gray-400">(optional — for HMAC verification)</span></label>
            <input value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))}
              placeholder="Leave blank to skip signature verification"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400 bg-white font-mono" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Events to subscribe to <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_EVENTS.map(ev => {
                const { label, desc } = EVENT_LABELS[ev];
                const checked = form.events.includes(ev);
                return (
                  <label key={ev} onClick={() => toggleEvent(ev)}
                    className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${checked ? "border-blue-400 bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${checked ? "border-blue-500 bg-blue-500" : "border-gray-300"}`}>
                      {checked && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{label}</p>
                      <p className="text-[10px] text-gray-400">{desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Save Webhook
            </button>
            <button onClick={() => { setShowForm(false); setForm({ name: "", url: "", secret: "", events: [] }); }}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Webhook list */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><Loader2 size={18} className="animate-spin text-blue-600" /></div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-xl">
          <Zap size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No webhooks configured</p>
          <p className="text-xs mt-1">Add one above to forward events to Zapier, Make, or your own endpoint</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map(hook => (
            <div key={hook.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${hook.is_active ? "bg-green-500" : "bg-gray-300"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{hook.name || hook.url}</p>
                    <p className="text-[11px] text-gray-400 font-mono truncate">{hook.url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-3">
                  <button onClick={() => sendTest(hook)} disabled={testingId === hook.id}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1">
                    {testingId === hook.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Test
                  </button>
                  <button onClick={() => loadDeliveries(hook.id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1">
                    <Eye size={11} /> Logs
                  </button>
                  <button onClick={() => toggle(hook)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${hook.is_active ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    {hook.is_active ? "Active" : "Paused"}
                  </button>
                  <button onClick={() => remove(hook.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Events */}
              <div className="px-4 pb-3 flex flex-wrap gap-1">
                {hook.events.map(ev => (
                  <span key={ev} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-100">
                    {EVENT_LABELS[ev]?.label ?? ev}
                  </span>
                ))}
              </div>

              {/* Delivery logs */}
              {showDeliveries === hook.id && (
                <div className="border-t border-gray-100 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Recent Deliveries</p>
                  {(deliveries[hook.id] ?? []).length === 0 ? (
                    <p className="text-xs text-gray-400">No deliveries yet</p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {(deliveries[hook.id] ?? []).map(d => (
                        <div key={d.id} className="flex items-center gap-2 text-xs">
                          {d.success
                            ? <CheckCircle size={11} className="text-green-500 shrink-0" />
                            : <XCircle size={11} className="text-red-400 shrink-0" />}
                          <span className="font-mono text-gray-500 shrink-0">{d.status_code}</span>
                          <span className="text-gray-600 shrink-0">{d.event}</span>
                          <span className="text-gray-400 text-[10px] ml-auto shrink-0">
                            {new Date(d.delivered_at).toLocaleString()}
                          </span>
                          {d.error_message && <span className="text-red-400 truncate text-[10px]">{d.error_message}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Payload reference */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs font-bold text-gray-700 mb-2">Sample Payload</p>
        <pre className="text-[10px] text-gray-600 overflow-x-auto leading-relaxed">{`{
  "event": "reply.received",
  "timestamp": "2025-06-05T10:30:00.000Z",
  "data": {
    "leadId": "uuid-...",
    "fromEmail": "john@company.com",
    "subject": "Re: Strategic Partnership Opportunity",
    "sentiment": "interested",
    "userId": "uuid-..."
  }
}`}</pre>
        <p className="text-[10px] text-gray-400 mt-2">The <code className="bg-gray-200 px-1 rounded">X-Pryro-Signature</code> header contains an HMAC-SHA256 signature if you set a signing secret.</p>
      </div>
    </div>
  );
}
