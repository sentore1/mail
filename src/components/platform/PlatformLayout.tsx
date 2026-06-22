"use client";

import { useState, useEffect } from "react";
import { ActiveModule, Lead, ScrapedLead } from "@/types/platform";
import PlatformSidebar from "./PlatformSidebar";
import TopBar from "./TopBar";
import ScraperModule from "./ScraperModule";
import EmailWriterModule from "./EmailWriterModule";
import CRMModule from "./CRMModule";
import AISettingsModule from "./AISettingsModule";
import SMTPManager from "./SMTPManager";
import FollowUpModule from "./FollowUpModule";
import EmailVerificationModule from "./EmailVerificationModule";
import AnalyticsModule from "./AnalyticsModule";
import MonthlyReportModule from "./MonthlyReportModule";
import WebhooksModule from "./WebhooksModule";
import SequenceBuilderModule from "./SequenceBuilderModule";
import ABTestingModule from "./ABTestingModule";
import CustomFieldsModule from "./CustomFieldsModule";
import IntegrationsModule from "./IntegrationsModule";
import WhatsAppNotificationsModule from "./WhatsAppNotificationsModule";
import SenderProfileModule from "./SenderProfileModule";
import BillingModule from "./BillingModule";
import { createClient } from "../../../supabase/client";
import { useRouter } from "next/navigation";

// Lazy-loaded modules (only rendered when active)
function LazyModule({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (!active) return null;
  return <>{children}</>;
}

interface PlatformLayoutProps {
  userId: string;
  userEmail?: string;
}

export default function PlatformLayout({ userId, userEmail }: PlatformLayoutProps) {
  const [activeModule, setActiveModule] = useState<ActiveModule>("scraper");
  const [preloadedLead, setPreloadedLead] = useState<Lead | null>(null);
  const [crmRefreshKey, setCrmRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Proactively refresh the JWT every 45 minutes so long-running operations
  // (scraping, bulk send) never hit a JWT expired error mid-operation.
  useEffect(() => {
    const REFRESH_INTERVAL = 45 * 60 * 1000; // 45 minutes
    const interval = setInterval(async () => {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        // Session truly gone — force sign-in
        router.push("/sign-in");
      }
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/sign-in");
  };

  const handleGenerateEmailFromScraper = (leads: ScrapedLead[]) => {
    if (leads.length > 0) {
      const lead = leads[0];
      setPreloadedLead({
        id: "temp-" + Date.now(),
        user_id: userId,
        company_name: lead.company_name,
        email: lead.email,
        niche: lead.niche,
        location: lead.location,
        company_context: lead.company_context,
        status: "new",
        notes: null,
        category: null,
        source: "scraper",
        tags: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    setActiveModule("email-writer");
  };

  const handleWriteEmailFromCRM = (lead: Lead) => {
    setPreloadedLead(lead);
    setActiveModule("email-writer");
  };

  const handleLeadsAdded = () => {
    setCrmRefreshKey((k) => k + 1);
  };

  const handleModuleChange = (module: ActiveModule) => {
    setActiveModule(module);
    setSidebarOpen(false);
    // Clear preloaded lead when switching away from email writer
    if (module !== "email-writer") {
      setPreloadedLead(null);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed lg:relative z-30 lg:z-10 h-full transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <PlatformSidebar activeModule={activeModule} onModuleChange={handleModuleChange} />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <TopBar
          activeModule={activeModule}
          userEmail={userEmail}
          userId={userId}
          onLogout={handleLogout}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="flex-1 overflow-y-auto bg-white">
          {/* Always-mounted modules (keep state) */}
          <div className={activeModule === "scraper" ? "block h-full" : "hidden"}>
            <ScraperModule
              userId={userId}
              onLeadsAdded={handleLeadsAdded}
              onGenerateEmails={handleGenerateEmailFromScraper}
            />
          </div>

          <div className={activeModule === "crm" ? "block h-full" : "hidden"}>
            <CRMModule
              key={crmRefreshKey}
              userId={userId}
              onWriteEmail={handleWriteEmailFromCRM}
            />
          </div>

          {/* Lazy-mounted modules */}
          <LazyModule active={activeModule === "email-writer"}>
            <EmailWriterModule
              key={preloadedLead?.id || "email-writer"}
              userId={userId}
              preloadedLead={preloadedLead}
              onGoToProfile={() => handleModuleChange("sender-profile")}
            />
          </LazyModule>

          <LazyModule active={activeModule === "ai-settings"}>
            <AISettingsModule userId={userId} />
          </LazyModule>

          <LazyModule active={activeModule === "smtp-manager"}>
            <SMTPManager userId={userId} />
          </LazyModule>

          <LazyModule active={activeModule === "follow-up"}>
            <FollowUpModule userId={userId} />
          </LazyModule>

          <LazyModule active={activeModule === "analytics"}>
            <AnalyticsModule userId={userId} />
          </LazyModule>

          <LazyModule active={activeModule === "monthly-report"}>
            <MonthlyReportModule userId={userId} />
          </LazyModule>

          <LazyModule active={activeModule === "webhooks"}>
            <WebhooksModule userId={userId} />
          </LazyModule>

          <LazyModule active={activeModule === "sequences"}>
            <SequenceBuilderModule userId={userId} />
          </LazyModule>

          <LazyModule active={activeModule === "ab-testing"}>
            <ABTestingModule userId={userId} />
          </LazyModule>

          <LazyModule active={activeModule === "custom-fields"}>
            <CustomFieldsModule userId={userId} />
          </LazyModule>

          <LazyModule active={activeModule === "integrations"}>
            <IntegrationsModule userId={userId} />
          </LazyModule>

          <LazyModule active={activeModule === "whatsapp"}>
            <WhatsAppNotificationsModule userId={userId} />
          </LazyModule>

          <LazyModule active={activeModule === "sender-profile"}>
            <SenderProfileModule userId={userId} />
          </LazyModule>
        </main>
      </div>
    </div>
  );
}
