"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "../../../supabase/client";
import {
  Loader2, Plus, Trash2, FlaskConical, TrendingUp, Trophy,
  Play, Pause, Target, Zap, BarChart2, CheckCircle, X,
} from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface ABTestingModuleProps { userId: string; }

interface Variant { id: string; label: string; subject: string; body: string; splitPct: number; }
interface ABTest {
  id: string; name: string;
  status: "draft" | "active" | "completed" | "paused";
  variants: Variant[];
  winnerMetric: "open_rate" | "click_rate" | "reply_rate";
  autoPickWinner: boolean; minSampleSize: number; created_at: string;
  stats?: { variantId: string; sent: number; opened: number; clicked: number; replied: number; }[];
}

const WINNER_METRICS = [
  { value: "open_rate",  label: "Open Rate",  desc: "Best subject line",   icon: "📬" },
  { value: "click_rate", label: "Click Rate",  desc: "Most link clicks",    icon: "🖱️" },
  { value: "reply_rate", label: "Reply Rate",  desc: "Most replies",        icon: "💬" },
];

const VARIANT_COLORS = ["#3b82f6", "#a855f7", "#10b981", "#f59e0b", "#ec4899"];

function VariantInput({ variant, index, total, onChange, onDelete }: {
  variant: Variant; index: number; total: number;
  onChange: (v: Variant) => void; onDelete: () => void;
}) {
  const letter = String.fromCharCode(65 + index);
  const color  = VARIANT_COLORS[index] ?? "#6b7280";
  return (
    <div className="rounded-xl border-2 bg-white overflow-hidden transition-all"
      style={{ borderColor: color + "33" }}>
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ background: color + "0d" }}>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full text-white text-xs font-black flex items-center justify-center"
            style={{ background: color }}>{letter}</span>
          <span className="text-sm font-bold" style={{ color }}> Variant {letter}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Split</span>
            <input type="number" min={1} max={99} value={variant.splitPct}
              onChange={e => onChange({ ...variant, splitPct: Math.max(1, Math.min(99, parseInt(e.target.value) || 1)) })}
              className="w-14 px-2 py-1 rounded-lg border border-gray-200 text-xs text-center outline-none focus:border-blue-400 bg-white font-semibold" />
            <span className="text-xs text-gray-400">%</span>
          </div>
          <button onClick={onDelete} disabled={total <= 2}
            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-20">
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Subject Line *</label>
          <input value={variant.subject}
            onChange={e => onChange({ ...variant, subject: e.target.value })}
            placeholder={`Variant ${letter} subject line...`}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-400 bg-white" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
            Body <span className="font-normal normal-case text-gray-400">— optional, leave blank to test subjects only</span>
          </label>
          <textarea value={variant.body} rows={3}
            onChange={e => onChange({ ...variant, body: e.target.value })}
            placeholder="Leave blank to only test subject lines..."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-400 bg-white resize-none leading-relaxed" />
        </div>
      </div>
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-xs">
      <p className="font-bold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold">{p.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
};

export default function ABTestingModule({ userId }: ABTestingModuleProps) {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

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
        .from("ab_tests").select("*").eq("user_id", userId).order("created_at", { ascending: false });
      if (!testRows) { setTests([]); return; }
      const withStats: ABTest[] = await Promise.all(testRows.map(async (t: any) => {
        const { data: stats } = await supabase.from("ab_test_stats").select("*").eq("test_id", t.id);
        return { ...t, variants: t.variants ?? [], stats: stats ?? [] };
      }));
      setTests(withStats);
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const addVariant = () => {
    if (variants.length >= 5) return;
    const even = Math.floor(100 / (variants.length + 1));
    setVariants(prev => [...prev.map(v => ({ ...v, splitPct: even })),
      { id: `v-${Date.now()}`, label: "", subject: "", body: "", splitPct: even }]);
  };

  const totalSplit = variants.reduce((s, v) => s + v.splitPct, 0);

  const save = async () => {
    if (!name.trim()) { toast.error("Give this test a name"); return; }
    if (variants.some(v => !v.subject.trim())) { toast.error("All variants need a subject line"); return; }
    if (totalSplit !== 100) { toast.error(`Split must total 100% (currently ${totalSplit}%)`); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("ab_tests").insert({
        user_id: userId, name, status: "draft", variants,
        winner_metric: winnerMetric, auto_pick_winner: autoPickWinner, min_sample_size: minSampleSize,
      });
      if (error) throw error;
      toast.success("Test created — attach it to a bulk send to start collecting data");
      setShowForm(false);
      setName("");
      setVariants([
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
    toast.success("Deleted");
  };

  const getWinnerIdx = (test: ABTest): number => {
    if (!test.stats?.length) return -1;
    let best = -1, bestScore = -1;
    test.stats.forEach((s, si) => {
      const sent = s.sent || 1;
      const score = test.winnerMetric === "open_rate" ? s.opened / sent
        : test.winnerMetric === "click_rate" ? s.clicked / sent : s.replied / sent;
      if (score > bestScore) { bestScore = score; best = si; }
    });
    return best;
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FlaskConical size={18} className="text-blue-600" /> A/B Testing
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Test subject lines or email bodies — the data picks the winner automatically
          </p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm">
          <Plus size={14} /> New Test
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-blue-900 flex items-center gap-2">
              <FlaskConical size={15} className="text-blue-600" /> Create A/B Test
            </p>
            <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-blue-100 text-blue-400">
              <X size={14} />
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Test Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Subject line WH-question vs statement — Hospital batch"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-400 bg-white shadow-sm" />
          </div>

          {/* Winner metric */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Declare winner based on</label>
            <div className="grid grid-cols-3 gap-2">
              {WINNER_METRICS.map(m => (
                <button key={m.value} onClick={() => setWinnerMetric(m.value as any)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${winnerMetric === m.value ? "border-blue-500 bg-white shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                  <span className="text-lg">{m.icon}</span>
                  <p className={`text-xs font-bold mt-1 ${winnerMetric === m.value ? "text-blue-700" : "text-gray-800"}`}>{m.label}</p>
                  <p className="text-[10px] text-gray-400">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Config row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Min sends per variant before picking winner</label>
              <input type="number" min={10} max={1000} value={minSampleSize}
                onChange={e => setMinSampleSize(Math.max(10, parseInt(e.target.value) || 10))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-400 bg-white" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2.5 cursor-pointer" onClick={() => setAutoPickWinner(v => !v)}>
                <div className={`relative w-10 h-5 rounded-full transition-colors ${autoPickWinner ? "bg-blue-600" : "bg-gray-200"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoPickWinner ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
                <span className="text-xs text-gray-700">Auto-declare winner</span>
              </label>
            </div>
          </div>

          {/* Variants */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-700 flex items-center gap-2">
                Variants
                <span className={`font-bold text-[10px] px-2 py-0.5 rounded-full ${totalSplit === 100 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                  {totalSplit}% {totalSplit === 100 ? "✓" : `— needs ${100 - totalSplit > 0 ? "+" : ""}${100 - totalSplit}%`}
                </span>
              </label>
              {variants.length < 5 && (
                <button onClick={addVariant} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-semibold">
                  <Plus size={11} /> Add variant
                </button>
              )}
            </div>
            {variants.map((v, i) => (
              <VariantInput key={v.id} variant={v} index={i} total={variants.length}
                onChange={updated => setVariants(prev => prev.map((vv, ii) => ii === i ? updated : vv))}
                onDelete={() => {
                  if (variants.length <= 2) return;
                  const rest = variants.filter((_, ii) => ii !== i);
                  const even = Math.floor(100 / rest.length);
                  setVariants(rest.map(vv => ({ ...vv, splitPct: even })));
                }} />
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving || totalSplit !== 100}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 shadow-sm">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />} Create Test
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tests list */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={20} className="animate-spin text-blue-600" />
        </div>
      ) : tests.length === 0 ? (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-12 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <FlaskConical size={24} className="text-blue-400" />
            </div>
            <p className="text-base font-bold text-gray-700">No A/B tests yet</p>
            <p className="text-sm text-gray-400 mt-1">Create your first test above, then attach it when doing a bulk send</p>
            <button onClick={() => setShowForm(true)}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 mx-auto">
              <Plus size={14} /> Create First Test
            </button>
          </div>

          {/* How it works cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: "1", title: "Create a test", desc: "Write 2–5 different subject lines. Set the split (50/50 or 60/40).", color: "bg-blue-50 border-blue-100" },
              { icon: "2", title: "Attach to bulk send", desc: "When sending in bulk, the system assigns each lead a random variant.", color: "bg-purple-50 border-purple-100" },
              { icon: "3", title: "Winner declared", desc: "Once your minimum sample is hit, the best performing variant is flagged automatically.", color: "bg-green-50 border-green-100" },
            ].map(s => (
              <div key={s.title} className={`rounded-xl border p-4 ${s.color}`}>
                <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center mb-2 shadow-sm">
                  <span className="text-xs font-black text-gray-600">{s.icon}</span>
                </div>
                <p className="text-xs font-bold text-gray-800 mb-1">{s.title}</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {tests.map(test => {
            const winnerIdx = getWinnerIdx(test);
            const totalSent = (test.stats ?? []).reduce((s, r) => s + r.sent, 0);

            // Build chart data
            const chartData = test.variants.map((v, vi) => {
              const s = test.stats?.find(x => x.variantId === v.id);
              const sent = s?.sent || 0;
              const label = String.fromCharCode(65 + vi);
              return {
                name: `Variant ${label}`,
                "Open %":  sent > 0 ? Math.round((s!.opened  / sent) * 100) : 0,
                "Reply %": sent > 0 ? Math.round((s!.replied / sent) * 100) : 0,
                sent,
                color: VARIANT_COLORS[vi] ?? "#6b7280",
                isWinner: vi === winnerIdx && totalSent > 0,
              };
            });

            const statusColor = test.status === "active" ? "bg-blue-100 text-blue-700"
              : test.status === "completed" ? "bg-green-100 text-green-700"
              : test.status === "paused" ? "bg-amber-100 text-amber-700"
              : "bg-gray-100 text-gray-500";

            return (
              <div key={test.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                {/* Test header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <FlaskConical size={15} className={test.status === "active" ? "text-blue-600" : "text-gray-400"} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{test.name}</p>
                      <p className="text-[10px] text-gray-400">
                        {WINNER_METRICS.find(m => m.value === test.winnerMetric)?.label} · min {test.minSampleSize} per variant · {totalSent} total sends
                      </p>
                    </div>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold shrink-0 ${statusColor}`}>
                      {test.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    {test.status !== "completed" && (
                      <button onClick={() => toggleStatus(test)}
                        className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500">
                        {test.status === "active" ? <Pause size={12} /> : <Play size={12} />}
                      </button>
                    )}
                    <button onClick={() => remove(test.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <div className="p-5 grid grid-cols-2 gap-5">
                  {/* Variant cards */}
                  <div className="space-y-2">
                    {test.variants.map((v, vi) => {
                      const s   = test.stats?.find(x => x.variantId === v.id);
                      const sent  = s?.sent || 0;
                      const label = String.fromCharCode(65 + vi);
                      const isWinner = vi === winnerIdx && totalSent > 0;
                      const color = VARIANT_COLORS[vi] ?? "#6b7280";
                      return (
                        <div key={v.id}
                          className={`rounded-xl p-3 border-2 ${isWinner ? "border-green-400 bg-green-50" : "border-gray-100 bg-gray-50"}`}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="w-5 h-5 rounded-full text-white text-[10px] font-black flex items-center justify-center shrink-0"
                              style={{ background: color }}>{label}</span>
                            <span className="text-xs font-semibold text-gray-800 flex-1 truncate">{v.subject}</span>
                            {isWinner && <Trophy size={13} className="text-green-600 shrink-0" />}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-gray-500">
                            <span>{v.splitPct}% split</span>
                            <span>{sent} sent</span>
                            {sent > 0 && <>
                              <span className="text-amber-600 font-semibold">
                                {Math.round((s!.opened / sent) * 100)}% open
                              </span>
                              <span className="text-purple-600 font-semibold">
                                {Math.round((s!.replied / sent) * 100)}% reply
                              </span>
                            </>}
                          </div>
                        </div>
                      );
                    })}
                    {winnerIdx >= 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-green-700 font-semibold mt-1">
                        <Trophy size={12} />
                        Variant {String.fromCharCode(65 + winnerIdx)} is currently winning
                      </div>
                    )}
                    {totalSent === 0 && (
                      <p className="text-xs text-gray-400 italic">No sends yet — attach this test to a bulk send to start collecting data</p>
                    )}
                  </div>

                  {/* Chart */}
                  <div>
                    {totalSent > 0 ? (
                      <>
                        <p className="text-xs font-semibold text-gray-600 mb-2">Performance comparison</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={chartData} barSize={18} barCategoryGap="35%">
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="Open %" name="Open %" radius={[3,3,0,0]}>
                              {chartData.map((entry, i) => (
                                <Cell key={i} fill={entry.isWinner ? "#22c55e" : (VARIANT_COLORS[i] ?? "#6b7280")} fillOpacity={0.8} />
                              ))}
                            </Bar>
                            <Bar dataKey="Reply %" name="Reply %" radius={[3,3,0,0]}>
                              {chartData.map((entry, i) => (
                                <Cell key={i} fill={entry.isWinner ? "#16a34a" : (VARIANT_COLORS[i] ?? "#6b7280")} fillOpacity={0.4} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 min-h-[140px]">
                        <BarChart2 size={28} className="mb-2 opacity-30" />
                        <p className="text-xs">Chart appears once sends start</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
