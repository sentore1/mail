"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, Save, Mail, Clock, GitBranch, CheckCircle, ArrowDown } from "lucide-react";
import { toast } from "sonner";

interface SequenceBuilderProps { userId: string; }

interface SequenceStep {
  id: string;
  step: number;
  label: string;
  delayDays: number;
  delayHours: number;
  tone: "professional" | "casual" | "friendly" | "direct" | "final_bump" | "breakup";
  stopOnReply: boolean;
  stopOnOpen: boolean;
  businessDaysOnly: boolean;
  sendWindowStart: string;
  sendWindowEnd: string;
}

const DEFAULT_STEPS: SequenceStep[] = [
  { id: "step-1", step: 1, label: "First Follow-Up", delayDays: 3,  delayHours: 0, tone: "friendly",      stopOnReply: true, stopOnOpen: false, businessDaysOnly: true, sendWindowStart: "09:00", sendWindowEnd: "17:00" },
  { id: "step-2", step: 2, label: "Second Follow-Up",delayDays: 5,  delayHours: 0, tone: "casual",        stopOnReply: true, stopOnOpen: false, businessDaysOnly: true, sendWindowStart: "09:00", sendWindowEnd: "17:00" },
  { id: "step-3", step: 3, label: "Third Follow-Up", delayDays: 7,  delayHours: 0, tone: "direct",        stopOnReply: true, stopOnOpen: false, businessDaysOnly: true, sendWindowStart: "09:00", sendWindowEnd: "17:00" },
  { id: "step-4", step: 4, label: "Final Follow-Up", delayDays: 14, delayHours: 0, tone: "final_bump",    stopOnReply: true, stopOnOpen: false, businessDaysOnly: true, sendWindowStart: "09:00", sendWindowEnd: "17:00" },
];

const TONE_OPTIONS = [
  { value: "friendly",   label: "Friendly",   desc: "Warm, conversational" },
  { value: "casual",     label: "Casual",     desc: "Light, informal tone" },
  { value: "professional",label:"Professional",desc: "Formal and polished" },
  { value: "direct",     label: "Direct",     desc: "Straight to the point" },
  { value: "final_bump", label: "Final Bump", desc: "Low-pressure last try" },
  { value: "breakup",    label: "Break-Up",   desc: "Closing the loop email" },
];

function StepCard({
  step, index, total,
  onChange, onDelete,
}: {
  step: SequenceStep;
  index: number;
  total: number;
  onChange: (s: SequenceStep) => void;
  onDelete: () => void;
}) {
  const cumulativeDays = step.delayDays; // shown per-step

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Step header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center">{index + 1}</div>
          <input
            value={step.label}
            onChange={e => onChange({ ...step, label: e.target.value })}
            className="text-sm font-semibold text-gray-800 bg-transparent border-none outline-none focus:bg-white focus:px-2 focus:rounded focus:border focus:border-blue-300 transition-all"
          />
        </div>
        <button onClick={onDelete} disabled={total <= 1}
          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>

      {/* Step config */}
      <div className="px-4 py-4 grid grid-cols-2 gap-4">
        {/* Delay */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
            <Clock size={11} /> Send after (since last email)
          </label>
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={90} value={step.delayDays}
              onChange={e => onChange({ ...step, delayDays: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-16 px-2 py-1.5 rounded-lg border border-gray-300 text-sm text-center outline-none focus:border-blue-400" />
            <span className="text-xs text-gray-500">days</span>
            <input type="number" min={0} max={23} value={step.delayHours}
              onChange={e => onChange({ ...step, delayHours: Math.max(0, parseInt(e.target.value) || 0) })}
              className="w-16 px-2 py-1.5 rounded-lg border border-gray-300 text-sm text-center outline-none focus:border-blue-400" />
            <span className="text-xs text-gray-500">hours</span>
          </div>
        </div>

        {/* Tone */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tone</label>
          <select value={step.tone} onChange={e => onChange({ ...step, tone: e.target.value as any })}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400 bg-white">
            {TONE_OPTIONS.map(t => (
              <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
            ))}
          </select>
        </div>

        {/* Send window */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Send window</label>
          <div className="flex items-center gap-2">
            <input type="time" value={step.sendWindowStart}
              onChange={e => onChange({ ...step, sendWindowStart: e.target.value })}
              className="px-2 py-1.5 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400" />
            <span className="text-xs text-gray-400">to</span>
            <input type="time" value={step.sendWindowEnd}
              onChange={e => onChange({ ...step, sendWindowEnd: e.target.value })}
              className="px-2 py-1.5 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400" />
          </div>
        </div>

        {/* Conditions */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
            <GitBranch size={11} /> Stop conditions
          </label>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={step.stopOnReply}
                onChange={e => onChange({ ...step, stopOnReply: e.target.checked })}
                className="rounded border-gray-300 text-blue-600" />
              <span className="text-xs text-gray-700">Stop if lead replies</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={step.businessDaysOnly}
                onChange={e => onChange({ ...step, businessDaysOnly: e.target.checked })}
                className="rounded border-gray-300 text-blue-600" />
              <span className="text-xs text-gray-700">Business days only (skip weekends)</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SequenceBuilderModule({ userId }: SequenceBuilderProps) {
  const [steps, setSteps] = useState<SequenceStep[]>(DEFAULT_STEPS);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [maxFollowups, setMaxFollowups] = useState(4);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load saved settings
    fetch("/api/followup/settings")
      .then(r => r.json())
      .then(data => {
        if (data.settings) {
          setAutoEnabled(data.settings.auto_followup_enabled ?? false);
          setMaxFollowups(data.settings.max_followups ?? 4);
        }
        // Load sequence steps if available
        if (data.settings?.sequence_steps) {
          try { setSteps(JSON.parse(data.settings.sequence_steps)); } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addStep = () => {
    const last = steps[steps.length - 1];
    const newStep: SequenceStep = {
      id: `step-${Date.now()}`,
      step: steps.length + 1,
      label: `Follow-Up #${steps.length + 1}`,
      delayDays: last ? last.delayDays + 3 : 3,
      delayHours: 0,
      tone: "professional",
      stopOnReply: true,
      stopOnOpen: false,
      businessDaysOnly: true,
      sendWindowStart: "09:00",
      sendWindowEnd: "17:00",
    };
    setSteps(prev => [...prev, newStep]);
  };

  const updateStep = (index: number, updated: SequenceStep) => {
    setSteps(prev => prev.map((s, i) => i === index ? updated : s));
  };

  const deleteStep = (index: number) => {
    setSteps(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, step: i + 1 })));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/followup/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_followup_enabled: autoEnabled,
          max_followups: maxFollowups,
          sequence_steps: JSON.stringify(steps),
          default_delay_days: steps[0]?.delayDays ?? 3,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Sequence saved — auto follow-ups " + (autoEnabled ? "enabled" : "disabled"));
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // Calculate total timeline
  let cumulative = 0;

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
            <Mail size={18} className="text-blue-600" /> Sequence Builder
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Configure automatic follow-up steps — platform sends them on schedule without manual action</p>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Sequence
        </button>
      </div>

      {/* Global toggle */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-800">Auto Follow-Up</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {autoEnabled
              ? "Platform will automatically send follow-ups according to this sequence"
              : "Follow-ups are manual only — you send them from the Follow-Up tab"}
          </p>
        </div>
        <button
          onClick={() => setAutoEnabled(v => !v)}
          className={`relative w-11 h-6 rounded-full transition-colors ${autoEnabled ? "bg-blue-600" : "bg-gray-200"}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Max follow-ups */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Max follow-ups per lead</p>
          <p className="text-xs text-gray-400 mt-0.5">After this many follow-ups, the sequence stops automatically</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMaxFollowups(v => Math.max(1, v - 1))}
            className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold">−</button>
          <span className="w-6 text-center text-sm font-bold text-gray-900">{maxFollowups}</span>
          <button onClick={() => setMaxFollowups(v => Math.min(10, v + 1))}
            className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold">+</button>
        </div>
      </div>

      {/* Sequence steps */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Sequence Steps</p>

        {/* Initial email node */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-green-200 bg-green-50 mb-2">
          <CheckCircle size={16} className="text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">Initial Email Sent</p>
            <p className="text-xs text-green-600">Sequence starts when you send the first cold email</p>
          </div>
          <span className="ml-auto text-[10px] text-green-600 bg-green-100 px-2 py-0.5 rounded font-semibold">Day 0</span>
        </div>

        {steps.map((step, i) => {
          cumulative += step.delayDays;
          return (
            <div key={step.id}>
              {/* Connector arrow */}
              <div className="flex items-center gap-2 py-1 pl-5">
                <ArrowDown size={14} className="text-gray-300" />
                <span className="text-[10px] text-gray-400">
                  +{step.delayDays}d{step.delayHours > 0 ? ` ${step.delayHours}h` : ""}
                  {step.businessDaysOnly ? " (business days)" : ""}
                  {" "}· Day ~{cumulative}
                </span>
              </div>
              <StepCard
                step={step}
                index={i}
                total={steps.length}
                onChange={updated => updateStep(i, updated)}
                onDelete={() => deleteStep(i)}
              />
            </div>
          );
        })}

        {/* Terminator */}
        <div className="flex items-center gap-2 py-1 pl-5">
          <ArrowDown size={14} className="text-gray-300" />
        </div>
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
          <div className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0" />
          <p className="text-xs font-semibold text-gray-500">Sequence ends — lead marked as closed</p>
        </div>

        {/* Add step button */}
        {steps.length < 10 && (
          <button onClick={addStep}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm font-medium text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all">
            <Plus size={14} /> Add Follow-Up Step
          </button>
        )}
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-bold text-amber-800 mb-1.5">How auto follow-ups work</p>
        <ul className="text-[11px] text-amber-700 space-y-1">
          <li>• When you send an initial email, the sequence is scheduled automatically</li>
          <li>• Follow-ups are sent at the configured delay unless the lead replies</li>
          <li>• Sends respect your send window — no emails outside business hours</li>
          <li>• The platform's cron job processes due follow-ups every 15 minutes</li>
          <li>• You can always pause a lead's sequence from the CRM drawer</li>
        </ul>
      </div>
    </div>
  );
}
