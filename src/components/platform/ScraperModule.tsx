"use client";

import { useState, useEffect } from "react";
import { ScrapedLead } from "@/types/platform";
import {
  Radio,
  Search,
  MapPin,
  Plus,
  Download,
  ChevronRight,
  X,
  CheckSquare,
  Square,
  Loader2,
  ChevronLeft,
  ExternalLink,
  Mail,
  Send,
  Zap,
} from "lucide-react";
import { createClient } from "../../../supabase/client";
import { toast } from "sonner";
import BulkEmailSender from "./BulkEmailSender";
import { scrapeLeadsAction } from "@/app/actions";

interface ScraperModuleProps {
  userId: string;
  onLeadsAdded?: () => void;
  onGenerateEmails?: (leads: ScrapedLead[]) => void;
}

const MOCK_LEADS: ScrapedLead[] = [
  {
    company_name: "Apex Digital Agency",
    email: "hello@apexdigital.io",
    niche: "Digital Marketing",
    location: "New York, USA",
    company_context:
      "Apex Digital is a full-service digital marketing agency specializing in paid media, SEO, and conversion optimization for e-commerce brands. Founded in 2018, they manage over $5M in monthly ad spend for DTC brands. Their team of 45 focuses heavily on data-driven creative testing and LTV optimization.",
  },
  {
    company_name: "CloudStack Solutions",
    email: "info@cloudstack.dev",
    niche: "SaaS / Cloud Infrastructure",
    location: "San Francisco, USA",
    company_context:
      "CloudStack is a B2B SaaS platform that automates cloud cost management for mid-market tech companies. They recently raised Series A funding of $8M and are scaling their sales team aggressively. Primary pain points include customer onboarding time and reducing churn below 5%.",
  },
  {
    company_name: "Meridian Consulting",
    email: "contact@meridianconsult.com",
    niche: "Management Consulting",
    location: "London, UK",
    company_context:
      "Meridian is a boutique management consultancy focused on operational efficiency for financial services firms. 28-person team, primarily serving FTSE 250 companies. Known for their proprietary 6-week transformation sprint methodology.",
  },
  {
    company_name: "TechFlow Ventures",
    email: "founders@techflow.vc",
    niche: "Venture Capital",
    location: "Austin, TX",
    company_context:
      "TechFlow is an early-stage VC firm focused on B2B SaaS and fintech. They manage a $45M fund and make 8-12 investments per year. Portfolio companies often need help with GTM strategy and sales infrastructure.",
  },
  {
    company_name: "Pulse Health Tech",
    email: "bd@pulsehealth.co",
    niche: "Health Technology",
    location: "Toronto, Canada",
    company_context:
      "Pulse builds remote patient monitoring software for hospital networks. Currently serving 12 hospital systems in North America. They're in the middle of a product-led growth pivot and looking to hire aggressively for their customer success team.",
  },
  {
    company_name: "Nomad eCommerce",
    email: "growth@nomad-ec.com",
    niche: "E-Commerce",
    location: "Amsterdam, Netherlands",
    company_context:
      "Nomad operates a multi-brand DTC portfolio with 4 active brands in outdoor apparel. Annual GMV of approximately €12M. Seeking to improve email marketing automation and influencer partnership management.",
  },
  {
    company_name: "DataBridge Analytics",
    email: "hello@databridge.ai",
    niche: "Data Analytics / AI",
    location: "Berlin, Germany",
    company_context:
      "DataBridge provides predictive analytics dashboards for manufacturing companies. Their ML models reduce downtime by 23% on average. Recently expanded to the US market and seeking channel partners.",
  },
  {
    company_name: "Velocity PR",
    email: "press@velocitypr.agency",
    niche: "Public Relations",
    location: "Los Angeles, USA",
    company_context:
      "Velocity PR specializes in tech and entertainment PR, securing placements in TechCrunch, Wired, and Forbes. They work with 30+ startups and scale-ups on media strategy and brand building.",
  },
];

const NICHES = [
  "SaaS", "E-Commerce", "Digital Marketing", "Fintech", "Health Tech",
  "Real Estate", "Education", "Legal", "Consulting", "Venture Capital",
  "Data Analytics", "Agency", "Manufacturing", "Retail", "Media",
];

export default function ScraperModule({ userId, onLeadsAdded, onGenerateEmails }: ScraperModuleProps) {
  const [niche, setNiche] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [isScaping, setIsScraping] = useState(false);
  const [results, setResults] = useState<ScrapedLead[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [drawerLead, setDrawerLead] = useState<ScrapedLead | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [nicheSuggestions, setNicheSuggestions] = useState<string[]>([]);
  const [addingTocrm, setAddingToCrm] = useState(false);
  const [showBulkEmailSender, setShowBulkEmailSender] = useState(false);
  const pageSize = 5;

  const supabase = createClient();

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("lead_categories")
      .select("name")
      .eq("user_id", userId);
    if (data) {
      setCategories(data.map((c: any) => c.name));
    }
  };

  const handleNicheInput = (val: string) => {
    setNiche(val);
    if (val.length > 0) {
      setNicheSuggestions(
        NICHES.filter((n) => n.toLowerCase().includes(val.toLowerCase())).slice(0, 5)
      );
    } else {
      setNicheSuggestions([]);
    }
  };

  const handleScrape = async () => {
    if (!niche && !location) {
      toast.error("Please enter a niche or location");
      return;
    }
    
    setIsScraping(true);
    setResults([]);
    setSelectedRows(new Set());
    setCurrentPage(1);
    
    try {
      // Try real scraping first
      const scrapedData = await scrapeLeadsAction(niche, location);
      
      if (scrapedData.success && scrapedData.leads.length > 0) {
        setResults(scrapedData.leads);
        toast.success(`Found ${scrapedData.leads.length} leads`);
      } else {
        // Fallback to filtered mock data with improved AND logic
        const filtered = MOCK_LEADS.filter((l) => {
          const nicheMatch = !niche || l.niche.toLowerCase().includes(niche.toLowerCase());
          const locMatch = !location || l.location.toLowerCase().includes(location.toLowerCase());
          
          // Use AND logic: both conditions must be true if both filters are provided
          if (niche && location) {
            return nicheMatch && locMatch;
          }
          // If only one filter is provided, use OR logic
          return nicheMatch || locMatch;
        });
        
        if (filtered.length > 0) {
          setResults(filtered);
          toast.success(`Found ${filtered.length} leads (using sample data)`);
        } else {
          toast.warning("No matching leads found. Showing sample results.");
          setResults(MOCK_LEADS.slice(0, 3));
        }
      }
    } catch (error) {
      console.error('Scraping error:', error);
      toast.error("Scraping failed. Showing sample data.");
      
      // Fallback to mock data with improved filtering
      const filtered = MOCK_LEADS.filter((l) => {
        const nicheMatch = !niche || l.niche.toLowerCase().includes(niche.toLowerCase());
        const locMatch = !location || l.location.toLowerCase().includes(location.toLowerCase());
        
        if (niche && location) {
          return nicheMatch && locMatch;
        }
        return nicheMatch || locMatch;
      });
      
      setResults(filtered.length > 0 ? filtered : MOCK_LEADS.slice(0, 3));
    } finally {
      setIsScraping(false);
    }
  };

  const toggleRow = (idx: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    const pageLeads = paginated;
    const allSelected = pageLeads.every((_, i) => selectedRows.has((currentPage - 1) * pageSize + i));
    if (allSelected) {
      setSelectedRows(new Set());
    } else {
      const next = new Set<number>();
      pageLeads.forEach((_, i) => next.add((currentPage - 1) * pageSize + i));
      setSelectedRows(next);
    }
  };

  const addToCRM = async (leads: ScrapedLead[]) => {
    setAddingToCrm(true);
    try {
      // Use selected category or create from niche/location
      let finalCategory = category;
      
      if (!finalCategory) {
        finalCategory = niche && location 
          ? `${niche} - ${location}` 
          : niche || location || 'Uncategorized';
      }
      
      // Save category if new
      if (finalCategory && !categories.includes(finalCategory)) {
        await supabase.from("lead_categories").insert({
          user_id: userId,
          name: finalCategory,
        });
        setCategories([...categories, finalCategory]);
      }
      
      // Prepare inserts - try with all fields first, fallback to basic fields if schema issue
      const inserts = leads.map((l) => ({
        user_id: userId,
        company_name: l.company_name,
        email: l.email,
        niche: l.niche,
        location: l.location,
        company_context: l.company_context,
        status: "New",
        category: finalCategory || null,
        source: 'scraper',
        tags: [niche, location].filter(Boolean).length > 0 ? [niche, location].filter(Boolean) : null,
      }));
      
      // Try insert with full schema using RPC to bypass schema cache
      let { data, error } = await supabase.rpc('insert_leads_with_category', {
        leads_data: inserts
      });
      
      // If RPC function doesn't exist, fall back to regular insert
      if (error && error.message?.includes('function') && error.message?.includes('does not exist')) {
        console.warn('RPC function not found, using direct insert');
        const result = await supabase.from("leads").insert(inserts).select();
        data = result.data;
        error = result.error;
      }
      
      // Check if it's a schema cache error for category/source/tags columns
      if (error && (
        error.message?.includes("category") || 
        error.message?.includes("source") || 
        error.message?.includes("tags") ||
        error.message?.includes("schema cache")
      )) {
        console.warn('Schema cache issue detected, retrying with basic fields only');
        
        // Fallback: insert without category, source, and tags
        const basicInserts = leads.map((l) => ({
          user_id: userId,
          company_name: l.company_name,
          email: l.email,
          niche: l.niche,
          location: l.location,
          company_context: l.company_context,
          status: "New",
        }));
        
        const fallbackResult = await supabase.from("leads").insert(basicInserts).select();
        data = fallbackResult.data;
        error = fallbackResult.error;
        
        if (!error) {
          toast.warning(`${leads.length} lead(s) added (without category). Restart your dev server to enable categories.`);
          onLeadsAdded?.();
          return;
        }
      }
      
      // Check if error has any meaningful content
      const hasRealError = error && (
        (error.message && typeof error.message === 'string' && error.message.trim().length > 0) || 
        (error.details && typeof error.details === 'string' && error.details.trim().length > 0) || 
        (error.code && typeof error.code === 'string' && error.code.trim().length > 0) || 
        (error.hint && typeof error.hint === 'string' && error.hint.trim().length > 0)
      );
      
      if (hasRealError) {
        console.error('Database error:', error);
        
        // Provide helpful error message for schema issues
        if (error.message?.includes("column") || error.message?.includes("schema")) {
          throw new Error(
            `Database schema issue: ${error.message}. Please run QUICK_FIX_CRM_INSERT.sql in Supabase SQL Editor.`
          );
        }
        
        throw new Error(
          error.message || 
          error.details || 
          error.hint ||
          'Database insert failed'
        );
      }
      
      toast.success(`${leads.length} lead(s) added to CRM under category "${finalCategory}"`);
      onLeadsAdded?.();
    } catch (e: unknown) {
      console.error('Add to CRM error:', e);
      
      let errorMessage = 'Failed to add to CRM';
      
      if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === 'object' && e !== null) {
        const err = e as any;
        errorMessage = err.message || err.details || err.hint || 'Database error occurred';
      }
      
      // If error is still generic, provide helpful hint
      if (errorMessage === 'Failed to add to CRM' || errorMessage === 'Database insert failed') {
        errorMessage = 'Failed to add to CRM. Check browser console for details, or run QUICK_FIX_CRM_INSERT.sql in Supabase';
      }
      
      toast.error(errorMessage);
    } finally {
      setAddingToCrm(false);
    }
  };

  const exportCSV = () => {
    const csvLeads = selectedRows.size > 0
      ? Array.from(selectedRows).map((i) => results[i])
      : results;
    const headers = ["Company Name", "Email", "Niche", "Location", "Context"];
    const rows = csvLeads.map((l) => [
      l.company_name, l.email, l.niche, l.location, l.company_context.replace(/,/g, ";")
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads.csv";
    a.click();
  };

  const paginated = results.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalPages = Math.ceil(results.length / pageSize);
  const selectedLeads = Array.from(selectedRows).map((i) => results[i]).filter(Boolean);

  return (
    <div className="flex flex-col gap-6 p-6 h-full bg-white">
      {/* Search Panel */}
      <div className="rounded-xl p-5 bg-white border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Radio size={16} className="text-blue-600" />
          <span className="text-sm font-semibold text-gray-900">
            Lead Scraper
          </span>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Niche input */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Industry / Niche (e.g. SaaS, E-Commerce)"
              value={niche}
              onChange={(e) => handleNicheInput(e.target.value)}
              className="w-full bg-white pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none transition-all border border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            {nicheSuggestions.length > 0 && (
              <div
                className="absolute top-full mt-1 left-0 right-0 rounded-lg z-10 overflow-hidden"
                style={{ background: "#161920", border: "1px solid #2A2D35" }}
              >
                {nicheSuggestions.map((s) => (
                  <button
                    key={s}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[#00D4FF10] transition-colors"
                    style={{ color: "#aaa", fontFamily: "Space Grotesk, sans-serif" }}
                    onClick={() => { setNiche(s); setNicheSuggestions([]); }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Location input */}
          <div className="relative flex-1">
            <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#555" }} />
            <input
              type="text"
              placeholder="Location (City, Country, or Region)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-transparent pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid #2A2D35",
                color: "#ccc",
                fontFamily: "Space Grotesk, sans-serif",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#00D4FF66")}
              onBlur={(e) => (e.target.style.borderColor = "#2A2D35")}
            />
          </div>

          {/* Category selector */}
          <div className="relative flex-1">
            <select
              value={category}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setShowNewCategory(true);
                  setCategory("");
                } else {
                  setCategory(e.target.value);
                  setShowNewCategory(false);
                }
              }}
              className="w-full bg-white pl-3 pr-3 py-2.5 rounded-lg text-sm outline-none transition-all border border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Auto-generate category</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              <option value="__new__">+ New Category</option>
            </select>
          </div>

          {showNewCategory && (
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Enter new category name"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white pl-3 pr-3 py-2.5 rounded-lg text-sm outline-none transition-all border border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          )}

          {/* Scrape button */}
          <button
            onClick={handleScrape}
            disabled={isScaping}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${isScaping ? "opacity-80" : "hover:bg-blue-700"}`}
            style={{
              background: "#2563eb",
              color: "#ffffff",
              fontFamily: "Syne, sans-serif",
              minWidth: "120px",
            }}
          >
            {isScaping ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Scraping...
              </>
            ) : (
              <>
                <Radio size={14} />
                Scrape
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results Header with Actions */}
      {results.length > 0 && (
        <div className="rounded-xl p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {results.length} Leads Found
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Select leads or move all to CRM
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  // Select all leads
                  const allIndices = new Set(results.map((_, i) => i));
                  setSelectedRows(allIndices);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <CheckSquare size={14} />
                Select All
              </button>
              <button
                onClick={async () => {
                  setAddingToCrm(true);
                  await addToCRM(results);
                  setAddingToCrm(false);
                }}
                disabled={addingTocrm}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {addingTocrm ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Moving to CRM...
                  </>
                ) : (
                  <>
                    <Plus size={14} />
                    Move All to CRM ({results.length})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedRows.size > 0 && (
        <div
          className="rounded-xl px-5 py-3 flex items-center justify-between"
          style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)" }}
        >
          <span className="text-sm" style={{ color: "#00D4FF", fontFamily: "Space Grotesk, sans-serif" }}>
            {selectedRows.size} lead(s) selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => addToCRM(selectedLeads)}
              disabled={addingTocrm}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: "rgba(0,232,122,0.1)", border: "1px solid rgba(0,232,122,0.3)", color: "#00E87A" }}
            >
              {addingTocrm ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Add to CRM
            </button>
            <button
              onClick={() => setShowBulkEmailSender(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: "rgba(138,43,226,0.1)", border: "1px solid rgba(138,43,226,0.3)", color: "#8A2BE2" }}
            >
              <Zap size={12} />
              Generate & Send Bulk Emails
            </button>
            <button
              onClick={() => onGenerateEmails?.(selectedLeads)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }}
            >
              <ChevronRight size={12} />
              Generate Emails
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2A2D35", color: "#888" }}
            >
              <Download size={12} />
              Export CSV
            </button>
            <button onClick={() => setSelectedRows(new Set())}>
              <X size={14} style={{ color: "#555" }} />
            </button>
          </div>
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="glass-card rounded-xl overflow-hidden flex-1">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid #1A1D24", background: "rgba(0,0,0,0.3)" }}>
                  <th className="px-4 py-3 text-left w-10">
                    <button onClick={toggleAll}>
                      {paginated.every((_, i) => selectedRows.has((currentPage - 1) * pageSize + i))
                        ? <CheckSquare size={14} style={{ color: "#00D4FF" }} />
                        : <Square size={14} style={{ color: "#555" }} />
                      }
                    </button>
                  </th>
                  {["Company", "Email", "Niche", "Location", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-semibold tracking-widest uppercase"
                      style={{ color: "#444", fontFamily: "JetBrains Mono, monospace" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((lead, i) => {
                  const globalIdx = (currentPage - 1) * pageSize + i;
                  const isSelected = selectedRows.has(globalIdx);
                  return (
                    <tr
                      key={globalIdx}
                      className="border-b transition-all duration-150 hover:bg-[#00D4FF05] group cursor-pointer"
                      style={{ borderColor: "#1A1D24", background: isSelected ? "rgba(0,212,255,0.04)" : undefined }}
                    >
                      <td className="px-4 py-3">
                        <button onClick={() => toggleRow(globalIdx)}>
                          {isSelected
                            ? <CheckSquare size={14} style={{ color: "#00D4FF" }} />
                            : <Square size={14} style={{ color: "#444" }} />
                          }
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium" style={{ color: "#e8eaed", fontFamily: "Space Grotesk, sans-serif" }}>
                          {lead.company_name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs" style={{ color: "#00D4FF", fontFamily: "JetBrains Mono, monospace" }}>
                          {lead.email}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(0,212,255,0.08)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.2)" }}
                        >
                          {lead.niche}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs flex items-center gap-1" style={{ color: "#777" }}>
                          <MapPin size={10} />
                          {lead.location}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setDrawerLead(lead)}
                            className="p-1.5 rounded-md transition-colors text-[10px] flex items-center gap-1"
                            style={{ background: "rgba(255,255,255,0.05)", color: "#888" }}
                          >
                            <ExternalLink size={11} />
                            View
                          </button>
                          <button
                            onClick={async () => { await addToCRM([lead]); }}
                            className="p-1.5 rounded-md transition-colors text-[10px] flex items-center gap-1"
                            style={{ background: "rgba(0,232,122,0.08)", color: "#00E87A" }}
                          >
                            <Plus size={11} />
                            CRM
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: "1px solid #1A1D24" }}
            >
              <span className="text-xs" style={{ color: "#555", fontFamily: "JetBrains Mono, monospace" }}>
                {results.length} results · Page {currentPage}/{totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded disabled:opacity-30"
                  style={{ color: "#777" }}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded disabled:opacity-30"
                  style={{ color: "#777" }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {results.length === 0 && !isScaping && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.1)" }}>
              <Radio size={24} style={{ color: "#333" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "#444", fontFamily: "Space Grotesk, sans-serif" }}>
              Enter a niche and location to find leads
            </p>
            <p className="text-xs mt-1" style={{ color: "#333" }}>
              Results will appear here after scraping
            </p>
          </div>
        </div>
      )}

      {/* Context Drawer */}
      {drawerLead && (
        <div className="fixed inset-0 z-50" onClick={() => setDrawerLead(null)}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
          <div
            className="absolute right-0 top-0 bottom-0 w-full max-w-md p-6 flex flex-col gap-4 overflow-y-auto"
            style={{ background: "#0F1117", borderLeft: "1px solid #2A2D35" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ fontFamily: "Syne, sans-serif", color: "#e8eaed" }}>
                Company Context
              </h2>
              <button onClick={() => setDrawerLead(null)}>
                <X size={18} style={{ color: "#555" }} />
              </button>
            </div>

            <div className="rounded-xl p-4" style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}>
              <p className="font-semibold text-base" style={{ color: "#00D4FF", fontFamily: "Syne, sans-serif" }}>
                {drawerLead.company_name}
              </p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(0,212,255,0.1)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.2)" }}>
                  {drawerLead.niche}
                </span>
                <span className="text-xs flex items-center gap-1" style={{ color: "#777" }}>
                  <MapPin size={10} />
                  {drawerLead.location}
                </span>
              </div>
              <p className="text-xs mt-2" style={{ color: "#00D4FF", fontFamily: "JetBrains Mono, monospace" }}>
                {drawerLead.email}
              </p>
            </div>

            <div>
              <p className="text-[10px] mb-2 uppercase tracking-widest" style={{ color: "#444", fontFamily: "JetBrains Mono, monospace" }}>
                Company Overview
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#aaa", fontFamily: "Space Grotesk, sans-serif" }}>
                {drawerLead.company_context}
              </p>
            </div>

            <div className="flex gap-2 mt-auto pt-4" style={{ borderTop: "1px solid #1A1D24" }}>
              <button
                onClick={async () => { await addToCRM([drawerLead]); setDrawerLead(null); }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                style={{ background: "rgba(0,232,122,0.1)", border: "1px solid rgba(0,232,122,0.3)", color: "#00E87A" }}
              >
                <Plus size={14} /> Add to CRM
              </button>
              <button
                onClick={() => { onGenerateEmails?.([drawerLead]); setDrawerLead(null); }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }}
              >
                <Mail size={14} /> Write Email
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Bulk Email Sender Modal */}
      {showBulkEmailSender && (
        <BulkEmailSender
          userId={userId}
          selectedLeads={selectedLeads}
          onComplete={() => {
            setShowBulkEmailSender(false);
            setSelectedRows(new Set());
          }}
        />
      )}
    </div>
  );
}
