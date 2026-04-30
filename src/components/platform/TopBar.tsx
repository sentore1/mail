"use client";

import { ActiveModule } from "@/types/platform";
import { Radio, Mail, Settings, Layout, LogOut, Server } from "lucide-react";

interface TopBarProps {
  activeModule: ActiveModule;
  userEmail?: string;
  onLogout?: () => void;
}

const moduleInfo: Record<ActiveModule, { label: string; desc: string; icon: React.ElementType }> = {
  scraper: { label: "Email Scraper", desc: "Find and scrape leads by niche & location", icon: Radio },
  "email-writer": { label: "AI Email Writer", desc: "Generate personalized cold outreach emails", icon: Mail },
  crm: { label: "CRM Pipeline", desc: "Manage and track your outreach pipeline", icon: Layout },
  "smtp-manager": { label: "SMTP Manager", desc: "Manage your email sending accounts (60 Gmail accounts)", icon: Server },
  "ai-settings": { label: "AI Settings", desc: "Configure AI providers and active model", icon: Settings },
};

export default function TopBar({ activeModule, userEmail, onLogout }: TopBarProps) {
  const info = moduleInfo[activeModule];
  const Icon = info.icon;

  return (
    <header
      className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
          <Icon size={18} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-base font-bold text-gray-900">
            {info.label}
          </h1>
          <p className="text-xs text-gray-500">
            {info.desc}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Status indicators */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-500">
              SUPABASE
            </span>
          </div>
        </div>

        {/* User */}
        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="hidden md:block text-sm text-gray-600">
              {userEmail}
            </span>
          )}
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors border border-red-100"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
