"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "../../../supabase/client";
import { Loader2, Plus, Trash2, FlaskConical, TrendingUp, Trophy, BarChart2, Play, Pause } from "lucide-react";
import { toast } from "sonner";

interface ABTestingModuleProps { userId: string; }

interface Variant {
  id: string;
  label: string;
  subject: string;
  body: string;
  splitPct: number; // 0-100
}

interface ABTest {
  id: string;
  name: string;
  status: "draft" | "active" | "completed";
  variants: Variant[];
  winnerMetric: "open_rate" | "click_rate" | "reply_rate";
  autoPickWinner: boolean;
  minSampleSize: number;
  created_at: string;
  stats?: {
    variantId: string;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
  }[];
}

const WINNER_METRICS = [
  { value: "open_rate",  label: "Open Rate",  desc: "Which subject line gets more opens" },
  { value: "click_rate", label: "Click Rate",  desc: "Which email drives more link clicks" },
  { value: "reply_rate", label: "Reply Rate",  desc: "Which email generates more replies" },
];

function VariantCard({
  variant, index, total, onChange, onDelete,
}: {
  variant: Variant;
  index: number;
  total: number;
  onChange: (v: Variant) => void;
  onDelete: () => void;
}) {
  const letter = String.fromCharCode(65 + index); // A, B, C...
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center">{letter}</span>
          <span className="text-sm font-semibold text-gray-700">Variant {letter}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Split:</label>
            <input type="number" min={1} max={99} value={variant.splitPct}
              onChange={e => onChange({ ...variant, splitPct: Math.max(1, Math.min(99, parseInt(e.target.value) || 1)) })}
              className="w-14 px-2 py-1 rounded border border-gray-300 text-xs text-center outline-none focus:border-blue-400" />
            <span className="text-xs text-gray-400">%</span>
          </div>
          <button onClick={onDelete} disabled={total <= 2}
            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Subject Line</label>
          <input value={variant.subject}
            onChange={e => onChange({ ...variant, subject: e.target.value })}
            placeholder="e.g. Strategic Partnership Opportunity"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400 bg-white" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Email Body <span className="font-normal text-gray-400">(optional — leave blank to only test subject lines)</span></label>
          <textarea value={variant.body} rows={4}
            onChange={e => onChange({ ...variant, body: e.target.value })}
            placeholder="Dear Sir/Madam,&#10;&#10;Write variant body here..."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400 bg-white resize-none font-sans leading-relaxed" />
        </div>
      </div>
    </div>
  );
}

function StatBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-gray-500 text-right shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="w-10 text-gray-700 font-semibold shrink-0">{pct.toFixed(1)}%</span>
    </div>
  );
}

export default function ABTestingModule({ userId }: ABTestingModuleProps) {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  // Form state
  const [name, setName] = useState("");
  const [winnerMetric, setWinnerMetric] = useState<ABTest["winnerMetric"]>("open_rate");
  const [autoPickWinner, setAutoPickWinner] = useState(true);
  const [minSampleSize, setMinSampleSize] = useState(50);
  const [variants, setVariants] = useState<Variant[]>([
    { id: "v-a", label: "A", subject: "", body: "", splitPct: 50 },
    { id: "v-b", label: "B", subject: "", body: "", splitPct: 50 },
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: testRows } = await supabase
        .from("ab_tests")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!testRows) { setTests([]); return; }

      // For each test load stats
      const testsWithStats: ABTest[] = await Promise.all(
        testRows.map(async (t: any) => {
          const { data: stats } = await supabase
            .from("ab_test_stats")
            .select("*")
            .eq("test_id", t.id);
          return { ...t, variants: t.variants ?? [], stats: stats ?? [] };
        })
      );
      setTests(testsWithStats);
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const addVariant = () => {
    if (variants.length >= 5) return;
    const even = Math.floor(100 / (variants.length + 1));
    setVariants(prev => [
      ...prev.map(v => ({ ...v, splitPct: even })),
      { id: `v-${Date.now()}`, label: "", subject: "", body: "", splitPct: even },
    ]);
  };

  const updateVariant = (index: number, v: Variant) => {
    setVariants(prev => prev.map((vv, i) => i === index ? v : vv));
  };

  const removeVariant = (index: number) => {
    if (variants.length <= 2) return;
    const remaining = variants.filter((_, i) => i !== index);
    const even = Math.floor(100 / remaining.length);
    setVariants(remaining.map(v => ({ ...v, splitPct: even })));
  };

  const totalSplit = variants.reduce((s, v) => s + v.splitPct, 0);

  const save = async () => {
    if (!name.trim()) { toast.error("Give this test a name"); return; }
    if (variants.some(v => !v.subject.trim())) { toast.error("All variants need a subject line"); return; }
    if (totalSplit !== 100) { toast.error(`Split percentages must add up to 100 (currently ${totalSplit})`); return; }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("ab_tests")
        .insert({
          user_id: userId,
          name,
          status: "draft",
          variants,
          winner_metric: winnerMetric,
          auto_pick_winner: autoPickWinner,
          min_sample_size: minSampleSize,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success("A/B test created — attach it to a campaign to start sending");
      setShowForm(false);
      setName(""); setVariants([
        { id: "v-a", label: "A", subject: "", body: "", splitPct: 50 },
        { id: "v-b", label: "B", subject: "", body: "", splitPct: 50 },
      ]);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (test: ABTest) => {
    const next = test.status === "active" ? "paused" : "active";
    await supabase.from("ab_tests").update({ status: next }).eq("id", test.id);
    setTests(prev => prev.map(t => t.id === test.id ? { ...t, status: next as any } : t));
    toast.success(next === "active" ? "Test activated" : "Test paused");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this A/B test?")) return;
    await supabase.from("ab_tests").delete().eq("id", id);
    setTests(prev => prev.filter(t => t.id !== id));
    toast.success("Test deleted");
  };

  // Compute winner for a test
  const getWinner = (test: ABTest): string | null => {
    if (!test.stats || test.stats.length === 0) return null;
    const scored = test.stats.map(s => {
      const sent = s.sent || 1;
      const score = test.winnerMetric === "open_rate" ? s.opened / sent
        : test.winnerMetric === "click_rate" ? s.clicked / sent
        : s.replied / sent;
      const variant = test.variants.find(v => v.id === s.variantId);
      return { variantId: s.variantId, label: variant?.label || s.variantId, score };
    });
    if (scored.length === 0) return null;
    const best = scored.reduce((a, b) => a.score > b.score ? a : b);
    return best.label;
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FlaskConical size={18} className="text-blue-600" /> A/B Testing
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Test different subject lines or email bodies and let the data pick the winner</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
          <Plus size={14} /> New Test
        </button>
      </div>

      {/* New test form */}
      {showForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-5">
          <p className="text-sm font-bold text-blue-900">Create A/B Test</p>

          {/* Test name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Test Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Subject line test — Hotel Doha"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400 bg-white" />
          </div>

          {/* Winner metric */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Winner determined by</label>
            <div className="grid grid-cols-3 gap-2">
              {WINNER_METRICS.map(m => (
                <button key={m.value} onClick={() => setWinnerMetric(m.value as any)}
                  className={`p-3 rounded-xl border text-left transition-all ${winnerMetric === m.value ? "border-blue-500 bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                  <p className={`text-xs font-bold ${winnerMetric === m.value ? "text-blue-700" : "text-gray-800"}`}>{m.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Settings row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Min. sample per variant before picking winner</label>
              <input type="number" min={10} max={1000} value={minSampleSize}
                onChange={e => setMinSampleSize(Math.max(10, parseInt(e.target.value) || 10))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400 bg-white" />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <button onClick={() => setAutoPickWinner(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${autoPickWinner ? "bg-blue-600" : "bg-gray-200"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoPickWinner ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
                <span className="text-xs text-gray-700">Auto-pick winner when sample is reached</span>
              </label>
            </div>
          </div>

          {/* Variants */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-700">
                Variants
                <span className={`ml-2 text-[10px] font-bold ${totalSplit === 100 ? "text-green-600" : "text-red-500"}`}>
                  ({totalSplit}% total — must equal 100%)
                </span>
              </label>
              {variants.length < 5 && (
                <button onClick={addVariant} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Plus size={11} /> Add variant
                </button>
              )}
            </div>
            {variants.map((v, i) => (
              <VariantCard key={v.id} variant={v} index={i} total={variants.length}
                onChange={updated => updateVariant(i, updated)}
                onDelete={() => removeVariant(i)} />
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={saving || totalSplit !== 100}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />} Create Test
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {/* Tests list */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><Loader2 size={18} className="animate-spin text-blue-600" /></div>
      ) : tests.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl text-gray-400">
          <FlaskConical size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No A/B tests yet</p>
          <p className="text-xs mt-1">Create a test above, then attach it to a campaign when sending</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tests.map(test => {
            const winner = getWinner(test);
            const colors = ["bg-blue-400", "bg-purple-400", "bg-green-400", "bg-amber-400", "bg-pink-400"];

            return (
              <div key={test.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                {/* Test header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <FlaskConical size={14} className={test.status === "active" ? "text-blue-600" : "text-gray-400"} />
                    <p className="text-sm font-bold text-gray-900 truncate">{test.name}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                      test.status === "active" ? "bg-blue-100 text-blue-700"
                      : test.status === "completed" ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                    }`}>{test.status.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {test.status !== "completed" && (
                      <button onClick={() => toggleStatus(test)}
                        className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
                        {test.status === "active" ? <Pause size={12} /> : <Play size={12} />}
                      </button>
                    )}
                    <button onClick={() => remove(test.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Variants summary */}
                <div className="px-4 py-3 space-y-3">
                  {test.variants.map((v, vi) => {
                    const stats = test.stats?.find(s => s.variantId === v.id);
                    const sent = stats?.sent || 0;
                    const openPct  = sent > 0 ? (stats!.opened  / sent) * 100 : 0;
                    const replyPct = sent > 0 ? (stats!.replied / sent) * 100 : 0;
                    const label = String.fromCharCode(65 + vi);
                    const isWinner = winner === v.label || winner === label;

                    return (
                      <div key={v.id} className={`rounded-lg p-3 border ${isWinner ? "border-green-300 bg-green-50" : "border-gray-100 bg-gray-50"}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`w-5 h-5 rounded-full text-white text-[10px] font-black flex items-center justify-center ${colors[vi]}`}>{label}</span>
                          <span className="text-xs font-semibold text-gray-800 truncate flex-1">{v.subject}</span>
                          {isWinner && <Trophy size={12} className="text-green-600 shrink-0" />}
                          <span className="text-[10px] text-gray-400 shrink-0">{v.splitPct}% · {sent} sent</span>
                        </div>
                        {sent > 0 && (
                          <div className="space-y-1">
                            <StatBar label="Opens" pct={openPct}  color={colors[vi] || "bg-blue-400"} />
                            <StatBar label="Replies" pct={replyPct} color={colors[vi] || "bg-blue-400"} />
                          </div>
                        )}
                        {sent === 0 && <p className="text-[10px] text-gray-400">No sends yet</p>}
                      </div>
                    );
                  })}
                </div>

                <div className="px-4 pb-3 flex items-center gap-2">
                  <TrendingUp size={11} className="text-gray-400" />
                  <span className="text-[10px] text-gray-500">Winner metric: <span className="font-semibold">{WINNER_METRICS.find(m => m.value === test.winnerMetric)?.label}</span></span>
                  <span className="text-[10px] text-gray-400 ml-2">· Min sample: {test.minSampleSize} per variant</span>
                  {winner && <span className="ml-auto text-[10px] font-bold text-green-700 flex items-center gap-1"><Trophy size={10} />Variant {winner} winning</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5"><BarChart2 size={12} /> How A/B testing works</p>
        <ul className="text-[11px] text-gray-500 space-y-1">
          <li>1. Create a test with 2–5 variants (subject lines and/or bodies)</li>
          <li>2. Set the split percentage — e.g. 50/50 or 60/40</li>
          <li>3. When sending bulk emails, attach this test — each lead gets a random variant</li>
          <li>4. Platform tracks opens, clicks, and replies per variant</li>
          <li>5. Once the minimum sample is reached, the winner is highlighted automatically</li>
          <li>6. Send future campaigns with the winning variant</li>
        </ul>
      </div>
    </div>
  );
}
