"use client";

import { useState, useEffect } from "react";
import { ExternalLink, CheckCircle, AlertCircle, Loader2, Key, Trash2, RefreshCw, Mail, Link2 } from "lucide-react";
import { toast } from "sonner";

interface IntegrationsModuleProps { userId: string; }

interface Integration {
  id: string;
  name: string;
  logo: string;
  description: string;
  status: "connected" | "disconnected" | "error";
  connectedEmail?: string;
  setupType: "oauth" | "api_key" | "guide_only";
  oauthPath?: string;
  docsUrl: string;
  syncFields: string[];
  syncEvents: string[];
  smtpNote?: string; // shown instead of OAuth button when using SMTP
}

const INTEGRATIONS: Integration[] = [
  {
    id: "gmail",
    name: "Gmail",
    logo: "G",
    description: "Connect Gmail via OAuth — send emails with your Gmail account and automatically detect replies.",
    status: "disconnected",
    setupType: "oauth",
    oauthPath: "/api/auth/gmail",
    docsUrl: "https://console.cloud.google.com",
    syncFields: ["email address", "sender name"],
    syncEvents: ["emails sent", "replies detected"],
    smtpNote: "Using SMTP? Add Gmail as a standard SMTP account in SMTP Manager instead — no OAuth needed.",
  },
  {
    id: "outlook",
    name: "Outlook / Microsoft 365",
    logo: "O",
    description: "Connect Outlook via OAuth — send from your Microsoft account and sync inbox replies.",
    status: "disconnected",
    setupType: "oauth",
    oauthPath: "/api/auth/outlook",
    docsUrl: "https://portal.azure.com",
    syncFields: ["email address", "sender name"],
    syncEvents: ["emails sent", "replies detected"],
    smtpNote: "Using SMTP? Add Outlook in SMTP Manager (host: smtp.office365.com, port: 587) — no OAuth needed.",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    logo: "H",
    description: "Sync lead status changes and email activity to HubSpot contacts via their API.",
    status: "disconnected",
    setupType: "api_key",
    docsUrl: "https://developers.hubspot.com/docs/api/overview",
    syncFields: ["contact email", "company name", "lead status", "last contacted"],
    syncEvents: ["email sent", "reply received", "lead status changed"],
  },
  {
    id: "zapier",
    name: "Zapier",
    logo: "Z",
    description: "Connect to 6,000+ apps using webhooks. Set up triggers for email events in the Webhooks module.",
    status: "disconnected",
    setupType: "guide_only",
    docsUrl: "https://zapier.com/apps/webhook/integrations",
    syncFields: ["all event data via webhook payload"],
    syncEvents: ["any event configured in Webhooks tab"],
  },
  {
    id: "make",
    name: "Make (Integromat)",
    logo: "M",
    description: "Use Make's webhook module to receive real-time events from this platform.",
    status: "disconnected",
    setupType: "guide_only",
    docsUrl: "https://www.make.com/en/help/tools/webhooks",
    syncFields: ["all event data via webhook payload"],
    syncEvents: ["any event configured in Webhooks tab"],
  },
  {
    id: "salesforce",
    name: "Salesforce",
    logo: "S",
    description: "Sync leads and email activity to Salesforce via REST API. Requires Connected App setup.",
    status: "disconnected",
    setupType: "api_key",
    docsUrl: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/",
    syncFields: ["Lead email", "Company", "Status", "Last Activity Date"],
    syncEvents: ["email sent", "reply received", "status changed"],
  },
];

interface HubSpotConfig { apiKey: string; portalId: string; }
interface SalesforceConfig { instanceUrl: string; accessToken: string; }

export default function IntegrationsModule({ userId }: IntegrationsModuleProps) {
  const [statuses, setStatuses] = useState<Record<string, "connected" | "disconnected" | "error">>({});
  const [details, setDetails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Config forms
  const [hubspot, setHubspot] = useState<HubSpotConfig>({ apiKey: "", portalId: "" });
  const [sfdc, setSfdc] = useState<SalesforceConfig>({ instanceUrl: "", accessToken: "" });

  useEffect(() => {
    // Check connected integrations from DB
    const check = async () => {
      setLoading(true);
      try {
        const [smtpRes, integRes] = await Promise.all([
          fetch("/api/smtp-check"),
          fetch("/api/integrations"),
        ]);

        const safeJson = async (r: Response) => {
          const text = await r.text();
          if (!text) return {};
          try { return JSON.parse(text); } catch { return {}; }
        };

        const smtpData = smtpRes.ok ? await safeJson(smtpRes) : {};
        const integData = integRes.ok ? await safeJson(integRes) : {};

        const s: Record<string, "connected" | "disconnected" | "error"> = {};
        const d: Record<string, string> = {};

        // Check Gmail / Outlook from SMTP accounts
        (smtpData.accounts ?? []).forEach((a: any) => {
          if (a.provider === "gmail_oauth")    { s["gmail"]   = "connected"; d["gmail"]   = a.email; }
          if (a.provider === "outlook_oauth")  { s["outlook"] = "connected"; d["outlook"] = a.email; }
        });

        // Check API-key integrations
        (integData.integrations ?? []).forEach((i: any) => {
          s[i.id] = i.status;
          if (i.detail) d[i.id] = i.detail;
          if (i.id === "hubspot" && i.config) setHubspot(i.config);
          if (i.id === "salesforce" && i.config) setSfdc(i.config);
        });

        setStatuses(s);
        setDetails(d);
      } finally { setLoading(false); }
    };
    check();
  }, [userId]);

  const connectOAuth = (path: string) => {
    window.location.href = path;
  };

  const saveHubSpot = async () => {
    if (!hubspot.apiKey) { toast.error("API key is required"); return; }
    setSaving("hubspot");
    try {
      // Test the API key
      const testRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
        headers: { Authorization: `Bearer ${hubspot.apiKey}` },
      });
      if (!testRes.ok) throw new Error("Invalid HubSpot API key — check your Private App token");

      await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "hubspot", config: hubspot }),
      });      setStatuses(s => ({ ...s, hubspot: "connected" }));
      setDetails(d => ({ ...d, hubspot: `Portal ${hubspot.portalId || "connected"}` }));
      toast.success("HubSpot connected successfully");
      setExpanded(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(null); }
  };

  const saveSalesforce = async () => {
    if (!sfdc.instanceUrl || !sfdc.accessToken) { toast.error("All fields are required"); return; }
    setSaving("salesforce");
    try {
      const testRes = await fetch(`${sfdc.instanceUrl}/services/data/v58.0/sobjects/Lead/describe`, {
        headers: { Authorization: `Bearer ${sfdc.accessToken}` },
      });
      if (!testRes.ok) throw new Error("Could not connect — check your Salesforce URL and token");

      await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "salesforce", config: sfdc }),
      });
      setStatuses(s => ({ ...s, salesforce: "connected" }));
      setDetails(d => ({ ...d, salesforce: sfdc.instanceUrl }));
      toast.success("Salesforce connected successfully");
      setExpanded(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(null); }
  };

  const disconnect = async (id: string) => {
    if (!confirm(`Disconnect ${id}?`)) return;
    await fetch(`/api/integrations?id=${id}`, { method: "DELETE" });
    setStatuses(s => ({ ...s, [id]: "disconnected" }));
    setDetails(d => { const n = { ...d }; delete n[id]; return n; });
    toast.success("Disconnected");
  };

  const getStatus = (id: string): "connected" | "disconnected" | "error" => statuses[id] ?? "disconnected";

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Link2 size={18} className="text-blue-600" /> Integrations
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">Connect email providers, CRMs, and automation tools</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32"><Loader2 size={18} className="animate-spin text-blue-600" /></div>
      ) : (
        <div className="space-y-3">
          {INTEGRATIONS.map(intg => {
            const status = getStatus(intg.id);
            const detail = details[intg.id];
            const isExpanded = expanded === intg.id;

            return (
              <div key={intg.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="flex items-center gap-4 px-4 py-4">
                  {/* Logo */}
                  <div className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-sm font-black text-gray-600 shrink-0">
                    {intg.logo}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900">{intg.name}</p>
                      {status === "connected" && <CheckCircle size={13} className="text-green-500" />}
                      {status === "error"     && <AlertCircle size={13} className="text-red-400" />}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {status === "connected" ? (detail || "Connected") : intg.description}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {status === "connected" ? (
                      <>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold border border-green-200">Connected</span>
                        <button onClick={() => disconnect(intg.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </>
                    ) : intg.setupType === "oauth" ? (
                      intg.smtpNote ? (
                        // Using SMTP — show info badge instead of OAuth button
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 font-medium">
                          Use SMTP Manager
                        </span>
                      ) : (
                        <button onClick={() => connectOAuth(intg.oauthPath!)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                          <Mail size={11} /> Connect
                        </button>
                      )
                    ) : intg.setupType === "api_key" ? (
                      <button onClick={() => setExpanded(isExpanded ? null : intg.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                        <Key size={11} /> {isExpanded ? "Close" : "Configure"}
                      </button>
                    ) : (
                      <a href="/dashboard" onClick={e => { e.preventDefault(); setExpanded(isExpanded ? null : intg.id); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                        Setup Guide
                      </a>
                    )}
                    <a href={intg.docsUrl} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>

                {/* Expanded section */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4">

                    {/* Sync info */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Synced Fields</p>
                        <ul className="space-y-0.5">
                          {intg.syncFields.map(f => (
                            <li key={f} className="text-xs text-gray-600 flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-gray-400 shrink-0" />{f}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Trigger Events</p>
                        <ul className="space-y-0.5">
                          {intg.syncEvents.map(e => (
                            <li key={e} className="text-xs text-gray-600 flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-blue-400 shrink-0" />{e}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* HubSpot form */}
                    {intg.id === "hubspot" && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Private App Access Token{" "}
                            <a href="https://app.hubspot.com/private-apps" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-normal hover:underline">
                              (create one here ↗)
                            </a>
                          </label>
                          <input type="password" value={hubspot.apiKey}
                            onChange={e => setHubspot(h => ({ ...h, apiKey: e.target.value }))}
                            placeholder="pat-na1-..."
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-mono outline-none focus:border-blue-400 bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Portal ID <span className="font-normal text-gray-400">(optional — found in HubSpot URL)</span></label>
                          <input value={hubspot.portalId}
                            onChange={e => setHubspot(h => ({ ...h, portalId: e.target.value }))}
                            placeholder="12345678"
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400 bg-white" />
                        </div>
                        <button onClick={saveHubSpot} disabled={saving === "hubspot"}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">
                          {saving === "hubspot" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                          Connect HubSpot
                        </button>
                      </div>
                    )}

                    {/* Salesforce form */}
                    {intg.id === "salesforce" && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Instance URL</label>
                          <input value={sfdc.instanceUrl}
                            onChange={e => setSfdc(s => ({ ...s, instanceUrl: e.target.value }))}
                            placeholder="https://yourorg.my.salesforce.com"
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400 bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Access Token</label>
                          <input type="password" value={sfdc.accessToken}
                            onChange={e => setSfdc(s => ({ ...s, accessToken: e.target.value }))}
                            placeholder="00D..."
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-mono outline-none focus:border-blue-400 bg-white" />
                        </div>
                        <button onClick={saveSalesforce} disabled={saving === "salesforce"}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50">
                          {saving === "salesforce" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                          Connect Salesforce
                        </button>
                      </div>
                    )}

                    {/* Zapier / Make guide */}
                    {(intg.id === "zapier" || intg.id === "make") && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-700">Setup steps:</p>
                        <ol className="text-xs text-gray-600 space-y-1.5 list-decimal list-inside">
                          <li>Go to the <strong>Webhooks</strong> tab in the sidebar</li>
                          <li>Click <strong>Add Webhook</strong> and paste your {intg.name} webhook URL</li>
                          <li>Select the events you want to forward (e.g. reply.received, email.sent)</li>
                          <li>In {intg.name}, use the "Catch Hook" or "Custom Webhook" trigger</li>
                          <li>Map the payload fields to your {intg.name} workflow actions</li>
                        </ol>
                        <a href="/dashboard" onClick={e => { e.preventDefault(); /* navigate to webhooks */ }}
                          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline mt-1">
                          → Go to Webhooks tab to set up
                        </a>
                      </div>
                    )}

                    {/* Gmail setup guide */}
                    {intg.id === "gmail" && status !== "connected" && (
                      <div className="space-y-2">
                        {intg.smtpNote && (
                          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <Mail size={13} className="text-blue-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-blue-800">You're using SMTP — no OAuth needed</p>
                              <p className="text-[11px] text-blue-700 mt-0.5">{intg.smtpNote}</p>
                              <p className="text-[11px] text-blue-600 mt-1">
                                Go to <strong>SMTP Manager</strong> in the sidebar → Add Account → host: <code className="bg-blue-100 px-1 rounded">smtp.gmail.com</code>, port: <code className="bg-blue-100 px-1 rounded">587</code>, use your Gmail App Password.
                              </p>
                            </div>
                          </div>
                        )}
                        {!intg.smtpNote && (
                          <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
                            <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Cloud Console ↗</a></li>
                            <li>Create project → Enable <strong>Gmail API</strong></li>
                            <li>Add to <code className="bg-gray-200 px-1 rounded text-[10px]">.env.local</code>: <code className="bg-gray-200 px-1 rounded text-[10px]">GOOGLE_OAUTH_CLIENT_ID</code> + <code className="bg-gray-200 px-1 rounded text-[10px]">GOOGLE_OAUTH_CLIENT_SECRET</code></li>
                          </ol>
                        )}
                      </div>
                    )}

                    {/* Outlook setup guide */}
                    {intg.id === "outlook" && status !== "connected" && (
                      <div className="space-y-2">
                        {intg.smtpNote && (
                          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <Mail size={13} className="text-blue-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-blue-800">You're using SMTP — no OAuth needed</p>
                              <p className="text-[11px] text-blue-700 mt-0.5">{intg.smtpNote}</p>
                              <p className="text-[11px] text-blue-600 mt-1">
                                Go to <strong>SMTP Manager</strong> → Add Account → host: <code className="bg-blue-100 px-1 rounded">smtp.office365.com</code>, port: <code className="bg-blue-100 px-1 rounded">587</code>, use your Microsoft password or App Password.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
