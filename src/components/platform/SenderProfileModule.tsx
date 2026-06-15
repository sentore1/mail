"use client";

import { useState, useEffect } from "react";
import {
  User, Phone, Briefcase, Building2, Mail, Globe, Linkedin,
  Save, CheckCircle, Loader2, Eye, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadSenderProfile,
  saveSenderProfile,
  renderFooter,
  type SenderProfile,
} from "@/utils/sender-profile";

interface SenderProfileProps {
  userId: string;
  onSaved?: (profile: SenderProfile) => void;
}

export default function SenderProfileModule({ userId, onSaved }: SenderProfileProps) {
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [preview,  setPreview]  = useState(false);

  const [fullName,    setFullName]    = useState("");
  const [jobTitle,    setJobTitle]    = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone,       setPhone]       = useState("");
  const [email,       setEmail]       = useState("");
  const [website,     setWebsite]     = useState("");
  const [linkedin,    setLinkedin]    = useState("");
  const [customPryro, setCustomPryro] = useState("");

  // ── Load existing profile ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      const profile = await loadSenderProfile(userId);
      if (profile) {
        setFullName(profile.full_name    || "");
        setJobTitle(profile.job_title    || "");
        setCompanyName(profile.company_name || "");
        setPhone(profile.phone           || "");
        setEmail(profile.email           || "");
        setWebsite(profile.website       || "");
        setLinkedin(profile.linkedin_url || "");
        setCustomPryro(profile.custom_pryro_sentence || "");
      }
      setLoading(false);
    })();
  }, [userId]);

  const previewText = renderFooter({
    user_id:      userId,
    full_name:    fullName    || "Alice Umubyeyi",
    job_title:    jobTitle    || "",
    company_name: companyName || "Pryro",
    phone:        phone       || "",
    email:        email       || null,
  });

  const handleSave = async () => {
    setSaving(true);
    const result = await saveSenderProfile(userId, {
      full_name:             fullName,
      job_title:             jobTitle,
      company_name:          companyName,
      phone,
      email:                 email    || null,
      website:               website  || null,
      linkedin_url:          linkedin || null,
      custom_pryro_sentence: customPryro.trim() || null,
    });
    setSaving(false);
    if (result.success) {
      toast.success("Sender profile saved");
      onSaved?.({
        user_id:               userId,
        full_name:             fullName,
        job_title:             jobTitle,
        company_name:          companyName,
        phone,
        email:                 email    || null,
        website:               website  || null,
        linkedin_url:          linkedin || null,
        custom_pryro_sentence: customPryro.trim() || null,
        is_complete:           !!fullName.trim(),
      });
    } else {
      toast.error(result.error ?? "Failed to save");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={22} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col gap-6">

      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-gray-900">Sender Profile</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Fill in whatever you have — everything is optional. What you enter appears at the bottom of every email.
        </p>
      </div>

      {/* Saved indicator */}
      {fullName.trim() && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle size={15} className="text-green-600 flex-shrink-0" />
          <p className="text-sm font-medium text-green-800">
            Profile ready — footer will be added to every email.
          </p>
        </div>
      )}

      {/* Profile fields */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Your details</p>
        </div>
        <div className="p-4 grid grid-cols-1 gap-4 sm:grid-cols-2">

          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Full Name</label>
            <div className="relative">
              <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Alice Umubyeyi"
                className="w-full pl-8 pr-3 py-2.5 rounded-lg text-sm border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white text-gray-900 placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Job Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Job Title</label>
            <div className="relative">
              <Briefcase size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder="Executive Sales"
                className="w-full pl-8 pr-3 py-2.5 rounded-lg text-sm border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white text-gray-900 placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Company Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Company Name</label>
            <div className="relative">
              <Building2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Pryro"
                className="w-full pl-8 pr-3 py-2.5 rounded-lg text-sm border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white text-gray-900 placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Phone</label>
            <div className="relative">
              <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0790038006"
                className="w-full pl-8 pr-3 py-2.5 rounded-lg text-sm border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white text-gray-900 placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Your Email</label>
            <div className="relative">
              <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="alice@pryro.com"
                className="w-full pl-8 pr-3 py-2.5 rounded-lg text-sm border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white text-gray-900 placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Website */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Website</label>
            <div className="relative">
              <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="https://pryro.com"
                className="w-full pl-8 pr-3 py-2.5 rounded-lg text-sm border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white text-gray-900 placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* LinkedIn */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">LinkedIn URL</label>
            <div className="relative">
              <Linkedin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={linkedin}
                onChange={e => setLinkedin(e.target.value)}
                placeholder="https://linkedin.com/in/alice-umubyeyi"
                className="w-full pl-8 pr-3 py-2.5 rounded-lg text-sm border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white text-gray-900 placeholder:text-gray-400"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Custom Pryro sentence */}
      <div className="rounded-xl border border-blue-200 overflow-hidden">
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-200 flex items-center gap-2">
          <Sparkles size={13} className="text-blue-600" />
          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
            Custom Pryro sentence
          </p>
          <span className="ml-auto text-[11px] text-blue-400 font-normal normal-case tracking-normal">
            Optional — overrides AI generation
          </span>
        </div>
        <div className="p-4">
          <textarea
            value={customPryro}
            onChange={e => setCustomPryro(e.target.value)}
            rows={3}
            placeholder={`Pryro is an ERP that connects finance, inventory, HR, and operations into one platform so your team stops moving data between tools every month.`}
            className="w-full px-3 py-2.5 rounded-lg text-sm border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white text-gray-900 placeholder:text-gray-400 resize-none"
          />
          <p className="text-[11px] text-gray-400 mt-1.5">
            When filled in, this sentence replaces AI-generated Pryro lines in every email — no AI call is made.
            Leave blank to let the AI write a sector-specific line per lead.
          </p>
        </div>
      </div>

      {/* Footer preview */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setPreview(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
        >
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
            <Eye size={12} />
            Email footer preview
          </p>
          <span className="text-xs text-gray-400">{preview ? "Hide" : "Show"}</span>
        </button>
        {preview && (
          <div className="p-4 bg-white">
            <pre className="text-sm text-gray-700 font-sans whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-4 border border-gray-200">
              {previewText}
            </pre>
            <p className="text-[11px] text-gray-400 mt-2">
              This footer appears at the bottom of every email you generate.
            </p>
          </div>
        )}
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {saving
          ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
          : <><Save size={15} /> Save Profile</>}
      </button>

    </div>
  );
}
