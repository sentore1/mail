"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, Send, CheckCircle, AlertCircle, MessageSquare, Bell, BellOff, Phone } from "lucide-react";
import { toast } from "sonner";

interface WhatsAppNotificationsModuleProps { userId: string; }

type WAEvent =
  | "email.sent"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "reply.received"
  | "lead.status_changed"
  | "sequence.completed";

const EVENT_CONFIG: Record<WAEvent, { label: string; desc: string; defaultOn: boolean; emoji: string }> = {
  "reply.received":      { label: "Reply Received",      desc: "Someone replied to your email",                 defaultOn: true,  emoji: "💬" },
  "email.opened":        { label: "Email Opened",         desc: "A recipient opened your email",                 defaultOn: true,  emoji: "👀" },
  "email.clicked":       { label: "Link Clicked",         desc: "A recipient clicked a link in your email",      defaultOn: true,  emoji: "🖱️" },
  "email.bounced":       { label: "Email Bounced",        desc: "An email failed to deliver",                    defaultOn: true,  emoji: "⚠️" },
  "sequence.completed":  { label: "Sequence Completed",   desc: "A lead finished the full follow-up sequence",   defaultOn: false, emoji: "✅" },
  "lead.status_changed": { label: "Lead Status Changed",  desc: "A lead's status was updated in CRM",            defaultOn: false, emoji: "🔄" },
  "email.sent":          { label: "Email Sent",           desc: "Every email you send (can be high volume)",     defaultOn: false, emoji: "📤" },
};

const ALL_EVENTS = Object.keys(EVENT_CONFIG) as WAEvent[];

interface Settings {
  whatsapp_number: string;
  enabled: boolean;
  sender_name: string;
  events: WAEvent[];
}

export default function WhatsAppNotificationsModule({ userId }: WhatsAppNotificationsModuleProps) {
  const [settings, setSettings] = useState<Settings>({
    whatsapp_number: "",
    enabled: false,
    sender_name: "",
    events: ["reply.received", "email.opened", "email.clicked", "email.bounced"],
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/whatsapp/settings")
      .then(async r => {
        const text = await r.text();
        if (!text) return;
        try { const d = JSON.parse(text); if (d.settings) setSettings(d.settings); } catch {}
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/whatsapp/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      toast.success("WhatsApp settings saved");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp_number: settings.whatsapp_number,
          sender_name: settings.sender_name || "there",
        }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setTestResult({ ok: true, msg: `✅ Test message sent to ${settings.whatsapp_number}! Check your WhatsApp.` });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message });
    } finally { setTesting(false); }
  };

  const toggleEvent = (ev: WAEvent) => {
    setSettings(s => ({
      ...s,
      events: s.events.includes(ev) ? s.events.filter(e => e !== ev) : [...s.events, ev],
    }));
  };

  const phoneValid = !settings.whatsapp_number || /^\+\d{7,15}$/.test(settings.whatsapp_number);
  const canTest    = !!settings.whatsapp_number && phoneValid;

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
            <MessageSquare size={18} className="text-green-600" /> WhatsApp Notifications
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Get instant WhatsApp alerts when leads open, reply, or bounce — via Twilio</p>
        </div>
        {/* Master toggle */}
        <button
          onClick={() => setSettings(s => ({ ...s, enabled: !s.enabled }))}
          className={`relative w-12 h-6 rounded-full transition-colors ${settings.enabled ? "bg-green-500" : "bg-gray-200"}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.enabled ? "translate-x-6" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Status banner */}
      {!settings.enabled && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-100 border border-gray-200">
          <BellOff size={14} className="text-gray-400" />
          <p className="text-xs text-gray-500">WhatsApp notifications are <strong>off</strong>. Toggle on above to activate.</p>
        </div>
      )}

      {/* Phone number */}
      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-1.5 flex items-center gap-1.5">
          <Phone size={14} className="text-gray-500" /> Your WhatsApp Number
        </label>
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              value={settings.whatsapp_number}
              onChange={e => setSettings(s => ({ ...s, whatsapp_number: e.target.value.trim() }))}
              placeholder="+250788123456"
              className={`w-full px-4 py-2.5 rounded-lg border text-sm outline-none font-mono transition-colors ${
                settings.whatsapp_number && !phoneValid
                  ? "border-red-400 bg-red-50 focus:border-red-500"
                  : "border-gray-300 focus:border-green-400 focus:ring-2 focus:ring-green-100 bg-white"
              }`}
            />
            {settings.whatsapp_number && phoneValid && (
              <CheckCircle size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500" />
            )}
          </div>
        </div>
        {settings.whatsapp_number && !phoneValid && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertCircle size={11} /> Use international format: +countrycode followed by your number (e.g. +250788123456)
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1.5">
          Must be a WhatsApp-enabled number in international format (+ followed by country code and number, no spaces or dashes)
        </p>
      </div>

      {/* Sender name */}
      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">Your First Name</label>
        <input
          value={settings.sender_name}
          onChange={e => setSettings(s => ({ ...s, sender_name: e.target.value }))}
          placeholder="e.g. Alice"
          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 bg-white"
        />
        <p className="text-xs text-gray-400 mt-1">Used to personalize messages — e.g. "Hi Alice, your email to Acme was opened!"</p>
      </div>

      {/* Event toggles */}
      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-2">
          Notify me when…
          <span className="font-normal text-gray-400 ml-2 text-xs">
            ({settings.events.length} of {ALL_EVENTS.length} enabled)
          </span>
        </label>
        <div className="space-y-2">
          {ALL_EVENTS.map(ev => {
            const { label, desc, emoji } = EVENT_CONFIG[ev];
            const on = settings.events.includes(ev);
            return (
              <div key={ev} onClick={() => toggleEvent(ev)}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                  on ? "border-green-300 bg-green-50" : "border-gray-200 bg-white hover:border-gray-300"
                }`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg w-6 text-center">{emoji}</span>
                  <div>
                    <p className={`text-sm font-semibold ${on ? "text-green-800" : "text-gray-700"}`}>{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                </div>
                <div className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${on ? "bg-green-500" : "bg-gray-200"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Message preview */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs font-bold text-gray-600 mb-2">Example message you'll receive</p>
        <div className="bg-[#DCF8C6] rounded-xl rounded-br-sm px-4 py-3 max-w-xs ml-auto shadow-sm">
          <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
            {`💬 *Reply Received* — ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}\nHi ${settings.sender_name || "Alice"}, *Acme Corp* just replied to your email!\n\nSentiment: interested\n\nOpen Pryro Mail to respond.`}
          </p>
          <p className="text-[10px] text-gray-400 text-right mt-1">
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ✓✓
          </p>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border ${
          testResult.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
        }`}>
          {testResult.ok
            ? <CheckCircle size={14} className="text-green-600 shrink-0 mt-0.5" />
            : <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />}
          <p className={`text-xs leading-relaxed ${testResult.ok ? "text-green-800" : "text-red-700"}`}>
            {testResult.msg}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={save} disabled={saving || !phoneValid}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Settings
        </button>
        <button onClick={sendTest} disabled={testing || !canTest}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-40 transition-colors">
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send Test Message
        </button>
      </div>

      {/* Twilio setup guide */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
        <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
          <Bell size={12} /> Twilio Setup (required once)
        </p>
        <ol className="text-[11px] text-amber-700 space-y-1.5 list-decimal list-inside">
          <li>Create a free account at <strong>twilio.com</strong></li>
          <li>Go to Console → get your <strong>Account SID</strong> and <strong>Auth Token</strong></li>
          <li>Activate the WhatsApp Sandbox: Messaging → Try it out → Send a WhatsApp message</li>
          <li>Send the join code from your WhatsApp to <strong>+1 415 523 8886</strong> — e.g. "join word-word"</li>
          <li>Add to <code className="bg-amber-100 px-1 rounded">.env.local</code>:
            <pre className="mt-1 bg-amber-100 rounded p-2 text-[10px] font-mono whitespace-pre-wrap">{`TWILIO_ACCOUNT_SID=ACxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886`}</pre>
          </li>
          <li>Restart the server and click <strong>Send Test Message</strong> above</li>
        </ol>
        <p className="text-[10px] text-amber-600 mt-1">
          ⚡ For production: upgrade to a Twilio approved WhatsApp Business number — $5/month, unlimited messages
        </p>
      </div>
    </div>
  );
}
