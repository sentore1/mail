"use client";

import { useState } from "react";
import { createClient } from "../../../supabase/client";
import { toast } from "sonner";
import {
  Shield, CheckCircle, XCircle, AlertTriangle, Loader2,
  Download, Filter, TrendingUp, Mail,
} from "lucide-react";
import { verifyEmail, canSendTo, getVerificationBadge } from "@/utils/email-verifier";
import type { VerificationResult } from "@/utils/email-verifier";

interface EmailVerificationModuleProps { userId: string; }

interface LeadVerification {
  leadId: string;
  companyName: string;
  email: string;
  result: VerificationResult;
}

export default function EmailVerificationModule({ userId }: EmailVerificationModuleProps) {
  const supabase = createClient();

  const [verifying, setVerifying] = useState(false);
  const [results, setResults] = useState<LeadVerification[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [filterScore, setFilterScore] = useState(50);

  const verifyLeadsFromCRM = async () => {
    setVerifying(true);
    setResults([]);
    setProgress({ completed: 0, total: 0 });

    try {
      const { data: leads, error } = await supabase
        .from("leads")
        .select("id, email, company_name")
        .eq("user_id", userId)
        .not("email", "is", null)
        .limit(500);

      if (error) throw error;
      if (!leads || leads.length === 0) {
        toast.error("No leads with emails found");
        setVerifying(false);
        return;
      }

      setProgress({ completed: 0, total: leads.length });
      toast.info(`Verifying ${leads.length} email addresses...`);

      const out: LeadVerification[] = [];
      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const result = await verifyEmail(lead.email!).catch(() => null);
        if (!result) continue;

        out.push({ leadId: lead.id, companyName: lead.company_name, email: lead.email!, result });
        setProgress({ completed: i + 1, total: leads.length });
        setResults([...out]);

        // Update lead in DB
        await supabase.from("leads").update({
          email_verified: canSendTo(result),
          confidence_score: 100 - result.risk_score,
          updated_at: new Date().toISOString(),
        }).eq("id", lead.id).catch(() => {});

        // Small delay to avoid rate limiting
        if (i < leads.length - 1) await new Promise(r => setTimeout(r, 300));
      }

      const valid = out.filter(r => canSendTo(r.result)).length;
      toast.success(`Done! ${valid} valid, ${out.length - valid} flagged`);
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
    } finally {
      setVerifying(false); }
  };

  const exportResults = () => {
    if (results.length === 0) { toast.error("Run verification first"); return; }
    const csv = [
      ["Company", "Email", "Status", "Risk Score", "Reason"].join(","),
      ...results.map(r => [
        `"${r.companyName}"`, r.email, r.result.status,
        r.result.risk_score, `"${r.result.reason}"`,
      ].join(","))
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `email-verification-${Date.now()}.csv`;
    a.click();
    toast.success("Exported");
  };

  const markInvalidAsRemoved = async () => {
    const invalid = results.filter(r => !canSendTo(r.result));
    if (invalid.length === 0) { toast.info("No invalid emails found"); return; }
    for (const r of invalid) {
      await supabase.from("leads").update({ status: "invalid_email", email_verified: false })
        .eq("id", r.leadId).catch(() => {});
    }
    toast.success(`${invalid.length} invalid leads marked`);
  };

  const stats = results.length > 0 ? {
    total:    results.length,
    valid:    results.filter(r => r.result.status === "valid").length,
    catchAll: results.filter(r => r.result.status === "catch_all").length,
    risky:    results.filter(r => r.result.status === "risky").length,
    invalid:  results.filter(r => r.result.status === "invalid").length,
    disposable: results.filter(r => r.result.status === "disposable").length,
  } : null;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">

      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-5 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Shield size={18} className="text-green-600" /> Email Verification
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Check which emails are valid before sending to reduce bounces
            </p>
          </div>
          <div className="flex items-center gap-2">
            {results.length > 0 && (
              <>
                <button onClick={markInvalidAsRemoved}
                  className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors">
                  <XCircle size={13} /> Mark invalid
                </button>
                <button onClick={exportResults}
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  <Download size={13} /> Export CSV
                </button>
              </>
            )}
            <button onClick={verifyLeadsFromCRM} disabled={verifying}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">
              {verifying
                ? <><Loader2 size={14} className="animate-spin" /> Verifying {progress.completed}/{progress.total}</>
                : <><Shield size={14} /> Verify All Leads</>
              }
            </button>
          </div>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-5 gap-3 mt-4">
            {[
              { label: "Total",      value: stats.total,      color: "text-blue-600",  bg: "bg-blue-50",  icon: Mail },
              { label: "Valid",      value: stats.valid,      color: "text-green-600", bg: "bg-green-50", icon: CheckCircle },
              { label: "Catch-All",  value: stats.catchAll,   color: "text-amber-600", bg: "bg-amber-50", icon: AlertTriangle },
              { label: "Risky",      value: stats.risky,      color: "text-orange-600",bg: "bg-orange-50",icon: AlertTriangle },
              { label: "Invalid",    value: stats.invalid + stats.disposable, color: "text-red-600", bg: "bg-red-50", icon: XCircle },
            ].map(({ label, value, color, bg, icon: Icon }) => (
              <div key={label} className={`${bg} rounded-xl p-3 border border-gray-100`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={12} className={color} />
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
                </div>
                <p className="text-xl font-black text-gray-900">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progress bar while verifying */}
      {verifying && progress.total > 0 && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-blue-100 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${(progress.completed / progress.total) * 100}%` }} />
            </div>
            <span className="text-xs font-medium text-blue-700 shrink-0">
              {Math.round((progress.completed / progress.total) * 100)}%
            </span>
          </div>
          <p className="text-xs text-blue-600 mt-1">
            Checking {progress.completed} of {progress.total} addresses...
          </p>
        </div>
      )}

      {/* Results list */}
      <div className="flex-1 overflow-y-auto p-6">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
              <Shield size={28} className="text-green-400" />
            </div>
            <p className="text-base font-semibold text-gray-700">No verification run yet</p>
            <p className="text-sm text-gray-400 mt-1 max-w-xs">
              Click "Verify All Leads" to check your lead emails before sending
            </p>
            <div className="mt-6 text-left bg-gray-50 border border-gray-200 rounded-xl p-4 max-w-sm">
              <p className="text-xs font-bold text-gray-700 mb-2">What gets checked:</p>
              <ul className="text-xs text-gray-500 space-y-1.5">
                <li className="flex items-center gap-2"><CheckCircle size={11} className="text-green-500 shrink-0"/>Email format is valid</li>
                <li className="flex items-center gap-2"><CheckCircle size={11} className="text-green-500 shrink-0"/>Domain has a mail server (MX record)</li>
                <li className="flex items-center gap-2"><CheckCircle size={11} className="text-green-500 shrink-0"/>Not a disposable or throwaway address</li>
                <li className="flex items-center gap-2"><CheckCircle size={11} className="text-green-500 shrink-0"/>Whether the domain accepts all mail (catch-all)</li>
                <li className="flex items-center gap-2"><CheckCircle size={11} className="text-green-500 shrink-0"/>Risk score assigned to every address</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 max-w-4xl">
            {results.map((r) => {
              const badge = getVerificationBadge(r.result.status);
              const sendable = canSendTo(r.result);
              return (
                <div key={r.leadId}
                  className={`flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors ${
                    sendable ? "border-gray-200 bg-white hover:border-gray-300"
                             : "border-red-100 bg-red-50"
                  }`}>
                  <div className="shrink-0">
                    {sendable
                      ? <CheckCircle size={16} className="text-green-500" />
                      : <XCircle size={16} className="text-red-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.companyName}</p>
                    <p className="text-xs text-gray-500 truncate">{r.email}</p>
                  </div>
                  <p className="text-[11px] text-gray-400 max-w-xs truncate hidden md:block">{r.result.reason}</p>
                  <span className="text-[10px] px-2 py-1 rounded-full font-semibold shrink-0"
                    style={{ color: badge.color, background: badge.bg }}>
                    {badge.label}
                  </span>
                  <span className={`text-xs font-bold w-8 text-right shrink-0 ${
                    r.result.risk_score <= 20 ? "text-green-600"
                    : r.result.risk_score <= 50 ? "text-amber-600"
                    : "text-red-600"
                  }`}>
                    {100 - r.result.risk_score}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


interface VerificationResult {
  email: string;
  isValid: boolean;
  isDeliverable: boolean;
  isCatchAll: boolean;
  isDisposable: boolean;
  score: number;
  reason?: string;
}

interface EmailVerificationModuleProps {
  userId: string;
}

export default function EmailVerificationModule({ userId }: EmailVerificationModuleProps) {
  const supabase = createClient();
  
  const [verifying, setVerifying] = useState(false);
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [filterScore, setFilterScore] = useState(50);

  const verifyLeadsFromCRM = async () => {
    setVerifying(true);
    setResults([]);
    setProgress({ completed: 0, total: 0 });
    
    try {
      // Fetch all leads with emails
      const { data: leads, error } = await supabase
        .from('leads')
        .select('id, email, company_name')
        .eq('user_id', userId)
        .not('email', 'is', null);
      
      if (error) throw error;
      if (!leads || leads.length === 0) {
        toast.error('No leads with emails found');
        setVerifying(false);
        return;
      }
      
      setProgress({ completed: 0, total: leads.length });
      toast.info(`Verifying ${leads.length} email addresses...`);
      
      const { verifyEmailsBatch } = await import('@/utils/email-verifier');
      
      const verificationResults = await verifyEmailsBatch(
        leads.map(l => l.email!),
        (completed, total) => {
          setProgress({ completed, total });
        }
      );
      
      setResults(verificationResults);
      
      // Update leads with verification results
      const updates = verificationResults.map((result, index) => ({
        id: leads[index].id,
        email_verified: result.isDeliverable && result.score >= 50,
        confidence_score: result.score,
      }));
      
      // Batch update leads
      for (const update of updates) {
        await supabase
          .from('leads')
          .update({ 
            email_verified: update.email_verified,
            confidence_score: update.confidence_score 
          })
          .eq('id', update.id);
      }
      
      const validCount = verificationResults.filter(r => r.score >= 50).length;
      const invalidCount = verificationResults.length - validCount;
      
      toast.success(`Verification complete! ${validCount} valid, ${invalidCount} invalid`);
    } catch (error: any) {
      console.error('Verification error:', error);
      toast.error(error.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const filterLeadsByScore = async () => {
    if (results.length === 0) {
      toast.error('Run verification first');
      return;
    }
    
    const validEmails = results.filter(r => r.score >= filterScore).map(r => r.email);
    
    if (validEmails.length === 0) {
      toast.warning('No emails meet the quality threshold');
      return;
    }
    
    // Update lead statuses
    const { error } = await supabase
      .from('leads')
      .update({ status: 'new' })
      .eq('user_id', userId)
      .in('email', validEmails);
    
    if (error) {
      toast.error('Failed to filter leads');
    } else {
      toast.success(`${validEmails.length} high-quality leads marked as active`);
    }
  };

  const exportResults = () => {
    if (results.length === 0) {
      toast.error('No results to export');
      return;
    }
    
    const csv = [
      ['Email', 'Valid', 'Deliverable', 'Score', 'Reason'].join(','),
      ...results.map(r => [
        r.email,
        r.isValid ? 'Yes' : 'No',
        r.isDeliverable ? 'Yes' : 'No',
        r.score,
        r.reason || 'OK'
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-verification-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success('Results exported');
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 50) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return <CheckCircle size={16} className="text-green-600" />;
    if (score >= 50) return <AlertTriangle size={16} className="text-yellow-600" />;
    return <XCircle size={16} className="text-red-600" />;
  };

  const stats = results.length > 0 ? {
    total: results.length,
    valid: results.filter(r => r.isValid).length,
    deliverable: results.filter(r => r.isDeliverable).length,
    highQuality: results.filter(r => r.score >= 80).length,
    mediumQuality: results.filter(r => r.score >= 50 && r.score < 80).length,
    lowQuality: results.filter(r => r.score < 50).length,
    disposable: results.filter(r => r.isDisposable).length,
  } : null;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
              <Shield size={28} className="text-green-600" />
              Email Verification
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Verify email addresses to reduce bounces and improve deliverability
            </p>
          </div>
          <button
            onClick={verifyLeadsFromCRM}
            disabled={verifying}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {verifying ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Verifying... {progress.completed}/{progress.total}
              </>
            ) : (
              <>
                <Shield size={18} />
                Verify All Leads
              </>
            )}
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-6 gap-4 mt-6">
            {[
              { label: 'Total', value: stats.total, icon: Upload, color: 'blue' },
              { label: 'Valid Format', value: stats.valid, icon: CheckCircle, color: 'green' },
              { label: 'Deliverable', value: stats.deliverable, icon: TrendingUp, color: 'purple' },
              { label: 'High Quality', value: stats.highQuality, icon: CheckCircle, color: 'green' },
              { label: 'Medium Quality', value: stats.mediumQuality, icon: AlertTriangle, color: 'yellow' },
              { label: 'Low Quality', value: stats.lowQuality, icon: XCircle, color: 'red' },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={14} className={`text-${stat.color}-600`} />
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{stat.label}</p>
                  </div>
                  <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      {results.length > 0 && (
        <div className="border-b border-gray-200 px-8 py-4 bg-gray-50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Filter size={16} className="text-gray-500" />
              <label className="text-sm font-medium text-gray-700">Quality Threshold:</label>
              <input
                type="range"
                min="0"
                max="100"
                value={filterScore}
                onChange={(e) => setFilterScore(Number(e.target.value))}
                className="flex-1 max-w-xs"
              />
              <span className="text-sm font-semibold text-gray-900 min-w-[3rem]">{filterScore}+</span>
            </div>
            <button
              onClick={filterLeadsByScore}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Filter size={16} />
              Filter Leads
            </button>
            <button
              onClick={exportResults}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <Download size={16} />
              Export CSV
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {results.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield size={28} className="text-gray-400" />
            </div>
            <p className="text-gray-900 font-medium text-base">No verification results yet</p>
            <p className="text-gray-500 text-sm mt-1">Click "Verify All Leads" to check email quality</p>
            <div className="mt-6 max-w-2xl mx-auto text-left bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">How Email Verification Works:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>✓ <strong>Format Check:</strong> Validates email syntax</li>
                <li>✓ <strong>DNS Verification:</strong> Checks if domain has mail servers</li>
                <li>✓ <strong>Disposable Detection:</strong> Identifies temporary email services</li>
                <li>✓ <strong>Quality Score:</strong> 0-100 rating based on deliverability</li>
                <li>✓ <strong>Auto-Update:</strong> Updates lead confidence scores in CRM</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-2 max-w-5xl">
            {results.map((result, index) => (
              <div
                key={index}
                className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {getScoreIcon(result.score)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{result.email}</p>
                      {result.reason && (
                        <p className="text-xs text-gray-500">{result.reason}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {result.isValid && (
                        <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                          Valid Format
                        </span>
                      )}
                      {result.isDeliverable && (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          Deliverable
                        </span>
                      )}
                      {result.isCatchAll && (
                        <span className="text-xs px-2 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
                          Catch-All
                        </span>
                      )}
                      {result.isDisposable && (
                        <span className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                          Disposable
                        </span>
                      )}
                    </div>
                    <div className={`px-3 py-1.5 rounded-lg font-semibold text-sm ${getScoreColor(result.score)}`}>
                      {result.score}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
