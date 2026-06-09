"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "../../../supabase/client";
import { Plus, Trash2, Loader2, Save, GripVertical, Tag, Hash, Calendar, ToggleLeft, List } from "lucide-react";
import { toast } from "sonner";

interface CustomFieldsModuleProps { userId: string; }

type FieldType = "text" | "number" | "date" | "dropdown" | "boolean" | "url";

interface CustomField {
  id: string;
  name: string;
  key: string; // snake_case identifier used in templates as {{key}}
  type: FieldType;
  options?: string[]; // for dropdown
  required: boolean;
  showInCRM: boolean;
  useInTemplates: boolean;
  order: number;
}

const TYPE_CONFIG: Record<FieldType, { label: string; icon: any; color: string }> = {
  text:     { label: "Text",     icon: Tag,         color: "text-blue-500" },
  number:   { label: "Number",   icon: Hash,        color: "text-purple-500" },
  date:     { label: "Date",     icon: Calendar,    color: "text-amber-500" },
  dropdown: { label: "Dropdown", icon: List,        color: "text-green-500" },
  boolean:  { label: "Yes/No",   icon: ToggleLeft,  color: "text-red-500" },
  url:      { label: "URL",      icon: Tag,         color: "text-cyan-500" },
};

const SUGGESTED_FIELDS: Omit<CustomField, "id" | "order">[] = [
  { name: "Decision Maker", key: "decision_maker", type: "text",     required: false, showInCRM: true,  useInTemplates: true,  options: undefined },
  { name: "Company Size",   key: "company_size",   type: "dropdown", required: false, showInCRM: true,  useInTemplates: false, options: ["1-10", "11-50", "51-200", "201-500", "500+"] },
  { name: "Annual Revenue", key: "annual_revenue", type: "dropdown", required: false, showInCRM: true,  useInTemplates: false, options: ["<$100K", "$100K-$500K", "$500K-$1M", "$1M-$5M", "$5M+"] },
  { name: "Last Called",    key: "last_called",    type: "date",     required: false, showInCRM: true,  useInTemplates: false, options: undefined },
  { name: "LinkedIn URL",   key: "linkedin_url",   type: "url",      required: false, showInCRM: true,  useInTemplates: false, options: undefined },
  { name: "Priority",       key: "priority",       type: "dropdown", required: false, showInCRM: true,  useInTemplates: false, options: ["Low", "Medium", "High", "VIP"] },
  { name: "Referred By",    key: "referred_by",    type: "text",     required: false, showInCRM: false, useInTemplates: false, options: undefined },
  { name: "Interested",     key: "is_interested",  type: "boolean",  required: false, showInCRM: true,  useInTemplates: false, options: undefined },
];

function toKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 30);
}

export default function CustomFieldsModule({ userId }: CustomFieldsModuleProps) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const supabase = createClient();

  // Form state
  const [form, setForm] = useState<Omit<CustomField, "id" | "order">>({
    name: "", key: "", type: "text", required: false,
    showInCRM: true, useInTemplates: false, options: undefined,
  });
  const [optionsText, setOptionsText] = useState(""); // comma-separated

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("custom_field_definitions")
        .select("*")
        .eq("user_id", userId)
        .order("order", { ascending: true });
      // Normalize DB snake_case to camelCase for local state
      setFields((data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        key: r.key,
        type: r.type,
        options: r.options,
        required: r.required,
        showInCRM: r.show_in_crm,
        useInTemplates: r.use_in_templates,
        order: r.order,
      })));
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const saveField = async () => {
    if (!form.name.trim()) { toast.error("Field name is required"); return; }
    if (!form.key.trim()) { toast.error("Field key is required"); return; }
    if (form.type === "dropdown" && !optionsText.trim()) {
      toast.error("Add at least one option for dropdown fields"); return;
    }

    const parsed = form.type === "dropdown"
      ? optionsText.split(",").map(s => s.trim()).filter(Boolean)
      : undefined;

    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from("custom_field_definitions")
          .update({
            name: form.name, key: form.key, type: form.type,
            options: parsed, required: form.required,
            show_in_crm: form.showInCRM, use_in_templates: form.useInTemplates,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId)
          .eq("user_id", userId);
        if (error) throw error;
        setFields(prev => prev.map(f => f.id === editingId ? { ...f, ...form, options: parsed } : f));
        toast.success("Field updated");
      } else {
        const maxOrder = fields.length > 0 ? Math.max(...fields.map(f => f.order)) + 1 : 0;
        const { data, error } = await supabase
          .from("custom_field_definitions")
          .insert({
            user_id: userId, name: form.name, key: form.key, type: form.type,
            options: parsed, required: form.required,
            show_in_crm: form.showInCRM, use_in_templates: form.useInTemplates,
            order: maxOrder,
          })
          .select()
          .single();
        if (error) throw error;
        setFields(prev => [...prev, {
          id: data.id, name: data.name, key: data.key, type: data.type,
          options: data.options, required: data.required,
          showInCRM: data.show_in_crm, useInTemplates: data.use_in_templates,
          order: data.order,
        }]);
        toast.success("Field created");
      }
      resetForm();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const deleteField = async (id: string) => {
    if (!confirm("Delete this field? All lead data stored in it will be lost.")) return;
    await supabase.from("custom_field_definitions").delete().eq("id", id).eq("user_id", userId);
    setFields(prev => prev.filter(f => f.id !== id));
    toast.success("Field deleted");
  };

  const editField = (f: CustomField) => {
    setForm({ name: f.name, key: f.key, type: f.type, required: f.required, showInCRM: f.showInCRM, useInTemplates: f.useInTemplates, options: f.options });
    setOptionsText(f.options?.join(", ") ?? "");
    setEditingId(f.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addSuggested = async (s: typeof SUGGESTED_FIELDS[0]) => {
    if (fields.some(f => f.key === s.key)) { toast.info("Field already exists"); return; }
    const maxOrder = fields.length > 0 ? Math.max(...fields.map(f => f.order)) + 1 : 0;
    const { data, error } = await supabase
      .from("custom_field_definitions")
      .insert({
        user_id: userId, name: s.name, key: s.key, type: s.type,
        options: s.options ?? null, required: s.required,
        show_in_crm: s.showInCRM, use_in_templates: s.useInTemplates,
        order: maxOrder,
      })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    setFields(prev => [...prev, {
      id: data.id, name: data.name, key: data.key, type: data.type,
      options: data.options, required: data.required,
      showInCRM: data.show_in_crm, useInTemplates: data.use_in_templates,
      order: data.order,
    }]);
    toast.success(`"${s.name}" field added`);
  };

  const resetForm = () => {
    setForm({ name: "", key: "", type: "text", required: false, showInCRM: true, useInTemplates: false, options: undefined });
    setOptionsText("");
    setEditingId(null);
    setShowForm(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Tag size={18} className="text-blue-600" /> Custom Contact Fields
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Add extra data fields to your leads — use them in CRM filters and email templates with {`{{key}}`}</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(v => !v); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
          <Plus size={14} /> Add Field
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4">
          <p className="text-sm font-bold text-blue-900">{editingId ? "Edit Field" : "New Field"}</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Field Label <span className="text-red-500">*</span></label>
              <input value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value, key: editingId ? f.key : toKey(e.target.value) }))}
                placeholder="e.g. Decision Maker"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Template Key <span className="text-gray-400 font-normal">(used as {`{{key}}`} in emails)</span>
              </label>
              <input value={form.key}
                onChange={e => setForm(f => ({ ...f, key: toKey(e.target.value) }))}
                placeholder="decision_maker"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400 bg-white font-mono"
              />
            </div>
          </div>

          {/* Field type */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Field Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TYPE_CONFIG) as FieldType[]).map(t => {
                const { label, icon: Icon, color } = TYPE_CONFIG[t];
                return (
                  <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${form.type === t ? "border-blue-500 bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                    <Icon size={13} className={color} />
                    <span className={`text-xs font-semibold ${form.type === t ? "text-blue-700" : "text-gray-700"}`}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dropdown options */}
          {form.type === "dropdown" && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Options <span className="font-normal text-gray-400">(comma-separated)</span></label>
              <input value={optionsText} onChange={e => setOptionsText(e.target.value)}
                placeholder="e.g. Small, Medium, Large, Enterprise"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm outline-none focus:border-blue-400 bg-white" />
              {optionsText && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {optionsText.split(",").map(o => o.trim()).filter(Boolean).map(o => (
                    <span key={o} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">{o}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Toggles */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: "required",        label: "Required",             desc: "Mandatory when adding a lead" },
              { key: "showInCRM",       label: "Show in CRM",          desc: "Visible in lead detail drawer" },
              { key: "useInTemplates",  label: "Use in Templates",     desc: "Available as {{key}} variable" },
            ].map(({ key, label, desc }) => (
              <label key={key} className="flex items-start gap-2 p-3 rounded-lg border border-gray-200 bg-white cursor-pointer hover:border-gray-300 transition-colors">
                <button
                  onClick={() => setForm(f => ({ ...f, [key]: !f[key as keyof typeof f] }))}
                  className={`relative w-8 h-4 rounded-full mt-0.5 transition-colors shrink-0 ${(form as any)[key] ? "bg-blue-600" : "bg-gray-200"}`}>
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${(form as any)[key] ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
                <div>
                  <p className="text-xs font-semibold text-gray-800">{label}</p>
                  <p className="text-[10px] text-gray-400">{desc}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={saveField} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {editingId ? "Update Field" : "Create Field"}
            </button>
            <button onClick={resetForm} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {/* Fields list */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><Loader2 size={18} className="animate-spin text-blue-600" /></div>
      ) : fields.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl text-gray-400">
          <Tag size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No custom fields yet</p>
          <p className="text-xs mt-1">Add fields to capture extra data about your leads</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-6 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
            <span className="col-span-2">Field</span>
            <span>Type</span>
            <span>Key</span>
            <span>Flags</span>
            <span className="text-right">Actions</span>
          </div>
          {fields.map(f => {
            const { label, icon: Icon, color } = TYPE_CONFIG[f.type];
            return (
              <div key={f.id} className="grid grid-cols-6 items-center px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                <div className="col-span-2 flex items-center gap-2 min-w-0">
                  <GripVertical size={12} className="text-gray-300 shrink-0" />
                  <span className="text-sm font-semibold text-gray-800 truncate">{f.name}</span>
                  {f.required && <span className="text-[9px] text-red-500 font-bold shrink-0">*</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon size={12} className={color} />
                  <span className="text-xs text-gray-600">{label}</span>
                </div>
                <span className="text-[11px] font-mono text-gray-500 truncate">{`{{${f.key}}}`}</span>
                <div className="flex gap-1 flex-wrap">
                  {f.showInCRM && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold border border-blue-100">CRM</span>}
                  {f.useInTemplates && <span className="text-[9px] px-1 py-0.5 rounded bg-green-50 text-green-600 font-semibold border border-green-100">TPL</span>}
                </div>
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => editField(f)} className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onClick={() => deleteField(f.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Suggested fields */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs font-bold text-gray-700 mb-3">Suggested Fields for B2B Outreach</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_FIELDS.map(s => {
            const exists = fields.some(f => f.key === s.key);
            const { icon: Icon, color } = TYPE_CONFIG[s.type];
            return (
              <button key={s.key}
                onClick={() => !exists && addSuggested(s)}
                disabled={exists}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  exists
                    ? "border-green-200 bg-green-50 text-green-600 opacity-60 cursor-default"
                    : "border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:text-blue-700 cursor-pointer"
                }`}>
                <Icon size={11} className={exists ? "text-green-500" : color} />
                {s.name}
                {exists && <span className="text-[9px] text-green-500">✓</span>}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-400 mt-2">Click any field above to add it instantly. Fields with ✓ are already in your setup.</p>
      </div>

      {/* Usage guide */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-bold text-amber-800 mb-2">How to use custom fields</p>
        <ul className="text-[11px] text-amber-700 space-y-1">
          <li>• Fields marked <strong>Show in CRM</strong> appear in the lead detail drawer when you click a contact</li>
          <li>• Fields marked <strong>Use in Templates</strong> can be inserted in email subject/body as <code className="bg-amber-100 px-1 rounded">{"{{field_key}}"}</code></li>
          <li>• Example: Add a "Decision Maker" field, fill it for each lead, then write <code className="bg-amber-100 px-1 rounded">{"Hi {{decision_maker}},"}</code> in your email</li>
          <li>• Import field values via CSV — column headers must match the field key exactly</li>
          <li>• Run <code className="bg-amber-100 px-1 rounded">CREATE_NEW_FEATURES_TABLES.sql</code> in Supabase to create the required tables</li>
        </ul>
      </div>
    </div>
  );
}
