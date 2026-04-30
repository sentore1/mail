"use client";

import { useState, useEffect, useCallback } from "react";
import { Lead, LeadStatus } from "@/types/platform";
import {
  Filter,
  Mail,
  X,
  Edit3,
  ChevronRight,
  Loader2,
  Users,
  Send,
  MessageSquare,
  TrendingUp,
  Save,
  Clock,
} from "lucide-react";
import { createClient } from "../../../supabase/client";
import { toast } from "sonner";

interface CRMModuleProps {
  userId: string;
  onWriteEmail?: (lead: Lead) => void;
}

const STATUSES: { value: LeadStatus; color: string; dot: string }[] = [
  { value: "New", color: "#2563EB", dot: "status-dot-blue" },
  { value: "Email Sent", color: "#F59E0B", dot: "status-dot-amber" },
  { value: "Replied", color: "#8B5CF6", dot: "status-dot-purple" },
  { value: "Interested", color: "#10B981", dot: "status-dot-green" },
  { value: "Closed", color: "#059669", dot: "status-dot-emerald" },
  { value: "Dead", color: "#EF4444", dot: "status-dot-red" },
];

const STATUS_COLORS: Record<LeadStatus, string> = {
  New: "#2563EB",
  "Email Sent": "#F59E0B",
  Replied: "#8B5CF6",
  Interested: "#10B981",
  Closed: "#059669",
  Dead: "#EF4444",
};

const STATUS_BG: Record<LeadStatus, string> = {
  New: "#EFF6FF",
  "Email Sent": "#FEF3C7",
  Replied: "#F3E8FF",
  Interested: "#D1FAE5",
  Closed: "#D1FAE5",
  Dead: "#FEE2E2",
};

interface LeadWithEmails extends Lead {
  generated_emails?: Array<{ id: string; subject: string; body: string; model_used: string; created_at: string; tone: string }>;
}

export default function CRMModule({ userId, onWriteEmail }: CRMModuleProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerLead, setDrawerLead] = useState<LeadWithEmails | null>(null);
  const [drawerEmails, setDrawerEmails] = useState<LeadWithEmails["generated_emails"]>([]);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | "all">("all");
  const [filterCategory, setFilterCategory] = useState<string | "all">("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);
  const [draggingLead, setDraggingLead] = useState<string | null>(null);

  const supabase = createClient();

  const fetchLeads = useCallback(async () => {
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (data) {
      setLeads(data as Lead[]);
      
      // Extract unique categories
      const uniqueCategories = [...new Set(
        data
          .map((l: any) => l.category)
          .filter(Boolean)
      )] as string[];
      setCategories(uniqueCategories);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchLeads();

    // Real-time subscription
    const channel = supabase
      .channel("leads_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `user_id=eq.${userId}` }, () => {
        fetchLeads();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchLeads]);

  const updateLeadStatus = async (leadId: string, newStatus: LeadStatus, oldStatus: LeadStatus) => {
    const { error } = await supabase
      .from("leads")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", leadId);
    if (!error) {
      // Log status history
      await supabase.from("lead_status_history").insert({
        lead_id: leadId,
        old_status: oldStatus,
        new_status: newStatus,
      });
      setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, status: newStatus } : l));
    }
  };

  const openDrawer = async (lead: Lead) => {
    setDrawerLead(lead as LeadWithEmails);
    setNotes(lead.notes || "");
    // Fetch generated emails for this lead
    const { data } = await supabase
      .from("generated_emails")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false });
    setDrawerEmails(data || []);
  };

  const saveNotes = async () => {
    if (!drawerLead) return;
    setSavingNotes(true);
    await supabase
      .from("leads")
      .update({ notes, updated_at: new Date().toISOString() })
      .eq("id", drawerLead.id);
    toast.success("Notes saved");
    setSavingNotes(false);
    setLeads((prev) => prev.map((l) => l.id === drawerLead.id ? { ...l, notes } : l));
  };

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData("leadId", leadId);
    setDraggingLead(leadId);
  };

  const handleDragEnd = () => {
    setDraggingLead(null);
    setDragOver(null);
  };

  const handleDrop = async (e: React.DragEvent, status: LeadStatus) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("leadId");
    const lead = leads.find((l) => l.id === leadId);
    if (lead && lead.status !== status) {
      await updateLeadStatus(leadId, status, lead.status);
      toast.success(`Lead moved to ${status}`);
    }
    setDragOver(null);
    setDraggingLead(null);
  };

  const handleDragOver = (e: React.DragEvent, status: LeadStatus) => {
    e.preventDefault();
    setDragOver(status);
  };

  const filteredLeads = leads.filter((l) => {
    const statusMatch = filterStatus === "all" || l.status === filterStatus;
    const categoryMatch = filterCategory === "all" || (l as any).category === filterCategory;
    return statusMatch && categoryMatch;
  });

  const stats = {
    total: leads.length,
    emailSent: leads.filter((l) => l.status === "Email Sent").length,
    interested: leads.filter((l) => l.status === "Interested").length,
    closed: leads.filter((l) => l.status === "Closed").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin" style={{ color: "#00D4FF" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Stats Strip */}
      <div className="px-6 pt-5 pb-4" style={{ background: "#F9FAFB" }}>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Leads", value: stats.total, icon: Users, color: "#2563EB" },
            { label: "Emails Sent", value: stats.emailSent, icon: Send, color: "#F59E0B" },
            { label: "Interested", value: stats.interested, icon: TrendingUp, color: "#10B981" },
            { label: "Closed", value: stats.closed, icon: MessageSquare, color: "#8B5CF6" },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="rounded-xl p-3 flex items-center justify-between"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
              >
                <div>
                  <p className="text-[10px] mb-1" style={{ color: "#6B7280" }}>
                    {stat.label.toUpperCase()}
                  </p>
                  <p className="text-2xl font-bold" style={{ color: stat.color }}>
                    {stat.value}
                  </p>
                </div>
                <Icon size={18} style={{ color: stat.color, opacity: 0.4 }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-6 pb-4 space-y-3" style={{ background: "#F9FAFB" }}>
        {/* Status Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={13} style={{ color: "#555" }} />
          <span className="text-xs text-gray-500 font-medium">Status:</span>
          <button
            onClick={() => setFilterStatus("all")}
            className="px-3 py-1 rounded-full text-[11px] font-medium transition-all"
            style={{
              background: filterStatus === "all" ? "rgba(0,212,255,0.1)" : "rgba(255,255,255,0.03)",
              border: filterStatus === "all" ? "1px solid rgba(0,212,255,0.3)" : "1px solid #2A2D35",
              color: filterStatus === "all" ? "#00D4FF" : "#666",
            }}
          >
            All ({leads.length})
          </button>
          {STATUSES.map((s) => {
            const count = leads.filter((l) => l.status === s.value).length;
            return (
              <button
                key={s.value}
                onClick={() => setFilterStatus(s.value)}
                className="px-3 py-1 rounded-full text-[11px] font-medium transition-all"
                style={{
                  background: filterStatus === s.value ? `${s.color}15` : "rgba(255,255,255,0.03)",
                  border: filterStatus === s.value ? `1px solid ${s.color}44` : "1px solid #2A2D35",
                  color: filterStatus === s.value ? s.color : "#666",
                }}
              >
                {s.value} ({count})
              </button>
            );
          })}
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-700 ml-5">📁 Category:</span>
            <button
              onClick={() => setFilterCategory("all")}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
              style={{
                background: filterCategory === "all" ? "#8B5CF6" : "#FFFFFF",
                borderColor: filterCategory === "all" ? "#8B5CF6" : "#E5E7EB",
                color: filterCategory === "all" ? "#FFFFFF" : "#6B7280",
                border: "2px solid"
              }}
            >
              All Categories
            </button>
            {categories.map((cat) => {
              const count = leads.filter((l: any) => l.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                  style={{
                    background: filterCategory === cat ? "#8B5CF6" : "#FFFFFF",
                    borderColor: filterCategory === cat ? "#8B5CF6" : "#E5E7EB",
                    color: filterCategory === cat ? "#FFFFFF" : "#6B7280",
                    border: "2px solid"
                  }}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Kanban Board */}
      <div className="flex-1 px-6 pb-6 overflow-hidden" style={{ background: "#F3F4F6" }}>
        <style>{`
          .kanban-scroll {
            overflow-x: auto;
            overflow-y: hidden;
            padding-bottom: 8px;
          }
          .kanban-scroll::-webkit-scrollbar {
            height: 14px;
          }
          .kanban-scroll::-webkit-scrollbar-track {
            background: #E5E7EB;
            border-radius: 8px;
            margin: 0 24px;
          }
          .kanban-scroll::-webkit-scrollbar-thumb {
            background: #9CA3AF;
            border-radius: 8px;
            border: 3px solid #E5E7EB;
          }
          .kanban-scroll::-webkit-scrollbar-thumb:hover {
            background: #6B7280;
          }
          .kanban-scroll::-webkit-scrollbar-thumb:active {
            background: #4B5563;
          }
        `}</style>
        <div className="kanban-scroll">
        {leads.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Users size={32} className="mx-auto mb-3" style={{ color: "#2A2D35" }} />
              <p className="text-sm font-medium" style={{ color: "#444", fontFamily: "Space Grotesk, sans-serif" }}>
                No leads in CRM yet
              </p>
              <p className="text-xs mt-1" style={{ color: "#333" }}>
                Add leads from the Scraper module to get started
              </p>
            </div>
          </div>
        ) : filterStatus !== "all" ? (
          // List view when filtering
          <div className="flex flex-col gap-2">
            {filteredLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onOpen={openDrawer}
                onWriteEmail={onWriteEmail}
                isDragging={draggingLead === lead.id}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        ) : (
          // Kanban view
          <div className="flex gap-4 min-w-max pb-2">
            {STATUSES.map((status, index) => {
              const columnLeads = leads.filter((l) => l.status === status.value);
              const isOver = dragOver === status.value;
              const isLastColumn = index === STATUSES.length - 1;

              return (
                <div
                  key={status.value}
                  className="flex flex-col gap-3 w-64 flex-shrink-0"
                  style={{
                    borderRight: isLastColumn ? "none" : "2px dashed #D1D5DB",
                    paddingRight: isLastColumn ? "0" : "16px",
                    marginRight: isLastColumn ? "0" : "16px"
                  }}
                  onDrop={(e) => handleDrop(e, status.value)}
                  onDragOver={(e) => handleDragOver(e, status.value)}
                  onDragLeave={() => setDragOver(null)}
                >
                  {/* Column header */}
                  <div className="flex items-center gap-2 pb-2" style={{ borderBottom: `2px solid ${status.color}` }}>
                    <div style={{ background: status.color, borderRadius: "50%", width: 6, height: 6, boxShadow: `0 0 6px ${status.color}` }} />
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: status.color, fontFamily: "JetBrains Mono, monospace" }}>
                      {status.value}
                    </span>
                    <span
                      className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: `${status.color}15`, color: status.color }}
                    >
                      {columnLeads.length}
                    </span>
                  </div>

                  {/* Drop zone */}
                  <div
                    className={`flex flex-col gap-2 min-h-24 rounded-xl p-2 transition-all`}
                    style={{
                      background: isOver ? `${status.color}15` : "#F9FAFB",
                      border: isOver ? `2px dashed ${status.color}` : "2px dashed transparent",
                    }}
                  >
                    {columnLeads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        onOpen={openDrawer}
                        onWriteEmail={onWriteEmail}
                        isDragging={draggingLead === lead.id}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                    {columnLeads.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-32 rounded-lg" style={{ border: "2px dashed #D1D5DB", background: "#F9FAFB" }}>
                        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-2">
                          <circle cx="20" cy="20" r="3" fill="#D1D5DB"/>
                          <circle cx="20" cy="10" r="2" fill="#E5E7EB"/>
                          <circle cx="20" cy="30" r="2" fill="#E5E7EB"/>
                          <circle cx="10" cy="20" r="2" fill="#E5E7EB"/>
                          <circle cx="30" cy="20" r="2" fill="#E5E7EB"/>
                        </svg>
                        <p className="text-[10px] text-gray-400">Drop cards here</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {/* Lead Detail Drawer */}
      {drawerLead && (
        <div className="fixed inset-0 z-50" onClick={() => setDrawerLead(null)}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} />
          <div
            className="absolute right-0 top-0 bottom-0 w-full max-w-lg flex flex-col overflow-hidden"
            style={{ background: "#FFFFFF", borderLeft: "1px solid #E5E7EB" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #E5E7EB" }}>
              <div>
                <h2 className="text-base font-bold" style={{ color: "#111827" }}>
                  {drawerLead.company_name}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                  {drawerLead.email}
                </p>
              </div>
              <button onClick={() => setDrawerLead(null)}>
                <X size={18} style={{ color: "#6B7280" }} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
              {/* Status + meta */}
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className="text-[10px] px-2.5 py-1 rounded-full font-medium"
                  style={{
                    background: STATUS_BG[drawerLead.status],
                    color: STATUS_COLORS[drawerLead.status],
                    border: `1px solid ${STATUS_COLORS[drawerLead.status]}33`,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  {drawerLead.status}
                </span>
                {drawerLead.niche && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(0,212,255,0.08)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.15)" }}>
                    {drawerLead.niche}
                  </span>
                )}
                {drawerLead.location && (
                  <span className="text-xs" style={{ color: "#666" }}>📍 {drawerLead.location}</span>
                )}
                <span className="text-xs flex items-center gap-1" style={{ color: "#444" }}>
                  <Clock size={10} />
                  {new Date(drawerLead.created_at).toLocaleDateString()}
                </span>
              </div>

              {/* Quick status change */}
              <div>
                <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "#6B7280" }}>
                  Update Status
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => {
                        updateLeadStatus(drawerLead.id, s.value, drawerLead.status);
                        setDrawerLead({ ...drawerLead, status: s.value });
                      }}
                      className="text-[10px] px-2.5 py-1 rounded-full transition-all"
                      style={{
                        background: drawerLead.status === s.value ? STATUS_BG[s.value] : "#F9FAFB",
                        border: `1px solid ${drawerLead.status === s.value ? s.color : "#E5E7EB"}`,
                        color: drawerLead.status === s.value ? s.color : "#6B7280",
                      }}
                    >
                      {s.value}
                    </button>
                  ))}
                </div>
              </div>

              {/* Company context */}
              {drawerLead.company_context && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "#6B7280" }}>
                    Company Context
                  </p>
                  <p className="text-xs leading-relaxed p-3 rounded-lg" style={{ color: "#374151", background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
                    {drawerLead.company_context}
                  </p>
                </div>
              )}

              {/* Generated emails */}
              {drawerEmails && drawerEmails.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "#6B7280" }}>
                    Generated Emails ({drawerEmails.length})
                  </p>
                  <div className="flex flex-col gap-2">
                    {drawerEmails.map((em) => (
                      <div
                        key={em.id}
                        className="p-3 rounded-lg"
                        style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium" style={{ color: "#111827" }}>
                            {em.subject}
                          </p>
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: "#F59E0B", background: "#FEF3C7" }}>
                            {em.tone}
                          </span>
                        </div>
                        <p className="text-[10px] truncate" style={{ color: "#6B7280" }}>
                          {em.model_used}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "#6B7280" }}>
                  Notes
                </p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Add notes about this lead..."
                  className="w-full px-3 py-2.5 rounded-lg text-xs outline-none resize-none"
                  style={{
                    background: "#F9FAFB",
                    border: "1px solid #E5E7EB",
                    color: "#374151",
                    lineHeight: "1.6",
                  }}
                />
                <button
                  onClick={saveNotes}
                  disabled={savingNotes}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: "#D1FAE5", border: "1px solid #10B981", color: "#059669" }}
                >
                  {savingNotes ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                  Save Notes
                </button>
              </div>
            </div>

            {/* Drawer footer */}
            <div className="px-6 py-4 flex gap-2" style={{ borderTop: "1px solid #E5E7EB" }}>
              <button
                onClick={() => { onWriteEmail?.(drawerLead); setDrawerLead(null); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: "#EFF6FF", border: "1px solid #2563EB", color: "#2563EB" }}
              >
                <Mail size={14} />
                Generate Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LeadCard({
  lead,
  onOpen,
  onWriteEmail,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  lead: Lead;
  onOpen: (lead: Lead) => void;
  onWriteEmail?: (lead: Lead) => void;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      onDragEnd={onDragEnd}
      className="rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all group"
      style={{
        background: isDragging ? "rgba(37,99,235,0.08)" : "#FFFFFF",
        border: "1px solid #E5E7EB",
        opacity: isDragging ? 0.5 : 1,
        transform: isDragging ? "rotate(1deg)" : undefined,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "#2563EB";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB";
        (e.currentTarget as HTMLElement).style.transform = "";
      }}
    >
      <p className="text-xs font-semibold leading-tight" style={{ color: "#111827" }}>
        {lead.company_name}
      </p>
      {lead.email && (
        <p className="text-[10px] mt-1 truncate" style={{ color: "#2563EB" }}>
          {lead.email}
        </p>
      )}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {/* Status Badge */}
        <span 
          className="text-[9px] px-2 py-0.5 rounded-full font-medium"
          style={{ 
            background: STATUS_BG[lead.status], 
            color: STATUS_COLORS[lead.status],
            border: `1px solid ${STATUS_COLORS[lead.status]}33`
          }}
        >
          {lead.status}
        </span>
        {/* Category Badge */}
        {(lead as any).category && (
          <span className="text-[9px] px-2 py-0.5 rounded-full font-medium" style={{ background: "#F3E8FF", color: "#8B5CF6", border: "1px solid #8B5CF633" }}>
            📁 {(lead as any).category}
          </span>
        )}
        {lead.niche && (
          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(37,99,235,0.1)", color: "#2563EB" }}>
            {lead.niche}
          </span>
        )}
      </div>

      {/* Action buttons on hover */}
      <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(lead); }}
          className="text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors"
          style={{ background: "#F3F4F6", color: "#6B7280" }}
        >
          <ChevronRight size={9} />
          View
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onWriteEmail?.(lead); }}
          className="text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors"
          style={{ background: "rgba(37,99,235,0.1)", color: "#2563EB" }}
        >
          <Mail size={9} />
          Email
        </button>
      </div>
    </div>
  );
}
