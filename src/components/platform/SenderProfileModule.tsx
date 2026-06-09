"use client";

import { useState, useEffect } from "react";
import {
  User, Phone, Briefcase, Building2, Mail, Globe, Linkedin,
  Save, CheckCircle, AlertCircle, Loader2, Eye,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadSenderProfile,
  saveSenderProfile,
  renderFooter,
  getMissingFields,
  isProfileComplete,
  type SenderProfile,
} from "@/utils/sender-profile";

interface SenderProfileProps {
  userId: string;
  /** Called after a successful save so parent can refresh the profile */
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
      }
      setLoading(false);
    })();
  }, [userId]);

  const currentProfile: Partial<SenderProfile> = {
    user_id: userId, full_name: fullName, job_title: jobTitle,
    company_name: companyName, phone, email, website, linkedin_url: linkedin,
  };

  const missing   = getMissingFields(currentProfile);
  const complete  = missing.length === 0;
  const previewText = renderFooter({
    user_id: userId, full_name: fullName || "Your Name", job_title: jobTitle || "Your Title",
    company_name: companyName || "Your Company", phone: phone || "Your Phone",
    email: email || undefined,
  });

  const handleSave = async () => {
    if (!complete) {
      toast.error(`Fill in: ${missing.map(m => m.label).join(", ")}`);
      return;
    }
    setSaving(true);
    const result = await saveSenderProfile(userId, {
      full_name: fullName, job_title: jobTitle, company_name: companyName,
      phone, email: email || null, website: website || null, linkedin_url: linkedin || null,
    });
    setSaving(false);
    if (result.success) {
      toast.success("Sender profile saved");
      onSaved?.({
        user_id: userId, full_name: fullName, job_title: jobTitle,
        company_name: companyName, phone, email: email || null,
        website: website || null, linkedin_url: linkedin || null,
        is_complete: true,
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
          Fill this in once — it appears automatically at the bottom of every email you generate.
        </p>
      </div>

      {/* Incomplete warning (Q7) */}
      {!complete && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Profile incomplete</p>
            <p className="text-xs text-amber-700 mt-0.5">
              You need to fill in <span className="font-semibold">{missing.map(m => m.label).join(", ")}</span> before
              you can generate or send emails.
            </p>
          </div>
        </div>
      )}

      {/* Complete badge */}
      {complete && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle size={15} className="text-green-600 flex-shrink-0" />
          <p className="text-sm font-medium text-green-800">Profile complete — footer will be added to every email.</p>
        </div>
      )}

      {/* Required fields */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Required</p>
        </div>
        <div className="p-4 grid grid-cols-1 gap-4 sm:grid-cols-2">

          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Alice UMUBYEYI"
                className="w-full pl-8 pr-3 py-2.5 rounded-lg text-sm border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white text-gray-900 placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Job Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Job Title <span className="text-red-500">*</span>
            </label>
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
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Company Name <span className="text-red-500">*</span>
            </label>
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
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Phone <span className="text-red-500">*</span>
            </label>
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
        </div>
      </div>

      {/* Optional fields */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Optional</p>
        </div>
        <div className="p-4 grid grid-cols-1 gap-4 sm:grid-cols-2">

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
              This exact footer will be inserted at the bottom of every email you generate.
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
