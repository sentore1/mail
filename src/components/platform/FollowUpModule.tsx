"use client";
import { useState, useEffect, useCallback } from "react";
import { Lead, EmailReply, AIReply, SentEmail } from "@/types/platform";
import {
  Mail, Send, Loader2, X, ChevronDown, ChevronRight, ChevronLeft,
  MessageSquare, Sparkles, RefreshCw, ThumbsUp, ThumbsDown,
  Inbox, Reply, CheckCircle, AlertCircle, Eye, MousePointer,
  RotateCcw, Plus, Bot, Edit3, Users, PenLine, AtSign,
} from "lucide-react";
import { createClient } from "../../../supabase/client";
import { toast } from "sonner";
import InboxConfigPanel from "./InboxConfigPanel";

interface FollowUpModuleProps { userId: string; }
interface AIDraft { subject: string; body: string; }
interface FUDraft { subject: string; body: string; decisionReason: string; modelUsed: string; }
interface LeadThread {
  leadId: string; leadEmail: string; companyName: string; niche: string | null;
  emails: SentEmail[]; replies: EmailReply[];
  hasReply: boolean; latestStatus: string; followupCount: number;
}

const TONES = [
  { value: "Direct",     label: "Direct",      desc: "Hard direct. No politeness. Problem → Solution → CTA" },
  { value: "Aggressive", label: "Aggressive",  desc: "High urgency, creates FOMO, pushes action hard" },
  { value: "Surgical",   label: "Surgical",    desc: "Hyper-personalized, proves you did your homework" },
];

function StatusPill({ status, opened, clicked }: { status?: string|null; opened: boolean; clicked: boolean }) {
  const s = status || "sent";
  if (s === "replied") return <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-100">Replied</span>;
  if (s === "bounced") return <span className="px-2 py-0.5 bg-red-50 text-red-600 text-xs font-medium rounded-full border border-red-100">Bounced</span>;
  if (s === "failed")  return <span className="px-2 py-0.5 bg-red-50 text-red-600 text-xs font-medium rounded-full border border-red-100">Failed</span>;
  if (clicked) return <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-100">Clicked</span>;
  if (opened)  return <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-100">Opened</span>;
  return <span className="px-2 py-0.5 bg-gray-50 text-gray-600 text-xs font-medium rounded-full border border-gray-200">Sent</span>;
}

function fdate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    + " " + new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function FollowUpModule({ userId }: FollowUpModuleProps) {
  // ── Mode ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"single"|"bulk"|"manual">("single");

  // ── Data ──────────────────────────────────────────────────────────────────
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [replies, setReplies] = useState<EmailReply[]>([]);
  const [aiReplies, setAiReplies] = useState<AIReply[]>([]);
  const [leads, setLeads] = useState<Map<string,Lead>>(new Map());
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  // ── Sender signature ──────────────────────────────────────────────────────
  const [senderName, setSenderName] = useState("");
  const [senderTitle, setSenderTitle] = useState("Executive Sales");
  const [senderPhone, setSenderPhone] = useState("");

  // ── Single follow-up ──────────────────────────────────────────────────────
  const [singleTone, setSingleTone] = useState("Direct");
  const [singlePainPoint, setSinglePainPoint] = useState("");
  const [selectedThread, setSelectedThread] = useState<LeadThread|null>(null);
  const [threadDropOpen, setThreadDropOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [expandedBodyId, setExpandedBodyId] = useState<string|null>(null);
  const [singleGenerating, setSingleGenerating] = useState(false);
  const [singleDraft, setSingleDraft] = useState<FUDraft|null>(null);
  const [singleSubj, setSingleSubj] = useState("");
  const [singleBody, setSingleBody] = useState("");
  const [singleSending, setSingleSending] = useState(false);

  // ── Bulk follow-up ────────────────────────────────────────────────────────
  const [bulkTone, setBulkTone] = useState("Direct");
  const [bulkPainPoint, setBulkPainPoint] = useState("");
  const [bulkNiche, setBulkNiche] = useState("all");
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkStep, setBulkStep] = useState<"select"|"review"|"sending">("select");
  const [bulkReviewIndex, setBulkReviewIndex] = useState(-1);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [bulkPreviews, setBulkPreviews] = useState<Array<{
    leadId: string; companyName: string; leadEmail: string;
    subject: string; body: string; latestEmailId: string; campaignId: string;
    skipped: boolean; skipReason?: string;
  }>>([]);

  // ── Manual compose ────────────────────────────────────────────────────────
  const [manualTo, setManualTo] = useState("");
  const [manualSubject, setManualSubject] = useState("");
  const [manualBody, setManualBody] = useState("");
  const [manualSending, setManualSending] = useState(false);

  // ── Reply panel ───────────────────────────────────────────────────────────
  const [rpOpen, setRpOpen] = useState(false);
  const [rpReply, setRpReply] = useState<EmailReply|null>(null);
  const [rpDraft, setRpDraft] = useState<AIDraft|null>(null);
  const [rpGen, setRpGen] = useState(false);
  const [rpSubj, setRpSubj] = useState("");
  const [rpBody, setRpBody] = useState("");
  const [rpSend, setRpSend] = useState(false);

  const sb = createClient();

  // ── Load data ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, a] = await Promise.all([
        sb.from("sent_emails").select("*").eq("user_id", userId).order("sent_at", { ascending: false }).limit(300),
        sb.from("email_replies").select("*").eq("user_id", userId).order("received_at", { ascending: false }),
        sb.from("ai_replies").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      ]);
      if (s.data) setSentEmails(s.data as SentEmail[]);
      if (r.data) setReplies(r.data as EmailReply[]);
      if (a.data) setAiReplies(a.data as AIReply[]);
      const ids = new Set<string>();
      s.data?.forEach((e: any) => { if (e.lead_id) ids.add(e.lead_id); });
      r.data?.forEach((x: any) => { if (x.lead_id) ids.add(x.lead_id); });
      if (ids.size > 0) {
        const { data: ld } = await sb.from("leads").select("*").in("id", Array.from(ids));
        if (ld) { const m = new Map<string,Lead>(); ld.forEach((l: Lead) => m.set(l.id, l)); setLeads(m); }
      }
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  }, [userId, sb]);

  useEffect(() => {
    load();
    // Load sender name from SMTP
    sb.from("smtp_accounts").select("sender_name,email").eq("user_id", userId).eq("status","active").order("sent_today",{ascending:true}).limit(1).single()
      .then(({data}) => { if (data) setSenderName(data.sender_name || data.email.split("@")[0].replace(/[._-]/g," ").replace(/\b\w/g,(c:string)=>c.toUpperCase())); });
    const c1 = sb.channel("fu_r").on("postgres_changes",{event:"*",schema:"public",table:"email_replies"},load).subscribe();
    const c2 = sb.channel("fu_s").on("postgres_changes",{event:"UPDATE",schema:"public",table:"sent_emails"},load).subscribe();
    return () => { c1.unsubscribe(); c2.unsubscribe(); };
  }, [load]);

  // ── Build threads ─────────────────────────────────────────────────────────
  const threads: LeadThread[] = (() => {
    const map = new Map<string,LeadThread>();
    const sorted = [...sentEmails].sort((a,b) => new Date(a.sent_at).getTime()-new Date(b.sent_at).getTime());
    for (const e of sorted) {
      const key = e.lead_id || (e as any).to_email || "unknown";
      const lead = e.lead_id ? leads.get(e.lead_id) : undefined;
      if (!map.has(key)) map.set(key,{leadId:e.lead_id||"",leadEmail:lead?.email||(e as any).to_email||"",companyName:lead?.company_name||(e as any).to_email||"Unknown",niche:lead?.niche||null,emails:[],replies:[],hasReply:false,latestStatus:e.status||"sent",followupCount:0});
      const t=map.get(key)!; t.emails.push(e);
      if(!["failed","bounced"].includes(e.status||"")) t.latestStatus=e.status||"sent";
    }
    for (const r of replies) { const key=r.lead_id||""; if(map.has(key)){map.get(key)!.replies.push(r);map.get(key)!.hasReply=true;map.get(key)!.latestStatus="replied";} }
    const all=Array.from(map.values());
    for(const t of all) t.followupCount=t.emails.filter((e:any)=>e.is_followup).length;
    return all.filter(t=>t.emails.some(e=>!["failed","bounced"].includes(e.status||"")))
      .sort((a,b)=>{if(a.hasReply&&!b.hasReply)return -1;if(!a.hasReply&&b.hasReply)return 1;return(b.emails[b.emails.length-1]?.sent_at||"").localeCompare(a.emails[a.emails.length-1]?.sent_at||"");});
  })();

  const eligibleThreads = threads.filter(t=>!t.hasReply&&!["bounced","failed"].includes(t.latestStatus));
  const availableNiches = Array.from(new Set(eligibleThreads.map(t=>t.niche||"").filter(Boolean))).sort();
  const filteredEligible = bulkNiche==="all" ? eligibleThreads : eligibleThreads.filter(t=>(t.niche||"")===bulkNiche);

  const checkInbox = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/inbox/check",{method:"POST"});
      const data = await res.json();
      if(data.success&&data.totalNewReplies>0){toast.success(`Found ${data.totalNewReplies} new reply!`);load();}
      else toast.info("No new replies");
    } catch { toast.error("Inbox check failed"); } finally { setChecking(false); }
  };

  // ── Single follow-up actions ───────────────────────────────────────────────
  const generateSingle = async () => {
    if (!selectedThread) return;
    setSingleGenerating(true); setSingleDraft(null);
    try {
      const latestEmail = selectedThread.emails.filter(e=>!["failed","bounced"].includes(e.status||"")).slice(-1)[0];
      if (!latestEmail) throw new Error("No valid sent email found");
      const r = await fetch("/api/followup/generate",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({sentEmailId:latestEmail.id,leadId:latestEmail.lead_id,followupNumber:selectedThread.followupCount+1,tone:singleTone,
          overrideContext:{senderPhone:senderPhone||undefined,senderName:senderName||undefined}})});
      const d = await r.json();
      if(!d.success) throw new Error(d.error);
      setSingleDraft({subject:d.subject,body:d.body,decisionReason:d.decisionReason,modelUsed:d.modelUsed});
      setSingleSubj(d.subject); setSingleBody(d.body);
      toast.success("Follow-up generated!");
    } catch(e:any){toast.error(e.message||"Failed to generate");}
    finally{setSingleGenerating(false);}
  };

  const sendSingle = async () => {
    if(!selectedThread||!singleBody.trim()) return;
    setSingleSending(true);
    try {
      const r = await fetch("/api/send-email",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({to:selectedThread.leadEmail,subject:singleSubj,body:singleBody,leadId:selectedThread.leadId,scheduleFollowups:false})});
      const d = await r.json();
      if(!d.success) throw new Error(d.error);
      toast.success(`Follow-up sent to ${selectedThread.companyName}!`);
      setSingleDraft(null); setSingleSubj(""); setSingleBody(""); setSelectedThread(null); load();
    } catch(e:any){toast.error(e.message||"Send failed");}
    finally{setSingleSending(false);}
  };

  // ── Bulk follow-up actions ────────────────────────────────────────────────
  const toggleBulkSelect=(id:string)=>{const n=new Set(bulkSelected);n.has(id)?n.delete(id):n.add(id);setBulkSelected(n);};
  const selectAll=()=>setBulkSelected(new Set(filteredEligible.map(t=>t.leadId)));
  const clearAll=()=>setBulkSelected(new Set());
  const setNicheFilter=(niche:string)=>{setBulkNiche(niche);setBulkSelected(new Set());};

  const generateBulkPreviews = async () => {
    const targets = filteredEligible.filter(t=>bulkSelected.has(t.leadId));
    if(!targets.length) return;
    setBulkGenerating(true); setBulkProgress({done:0,total:targets.length,errors:0});
    const previews: typeof bulkPreviews = []; let errors=0;
    for(let i=0;i<targets.length;i++){
      const thread=targets[i];
      const latestEmail=thread.emails.filter(e=>!["failed","bounced"].includes(e.status||"")).slice(-1)[0];
      if(!latestEmail){previews.push({leadId:thread.leadId,companyName:thread.companyName,leadEmail:thread.leadEmail,subject:"",body:"",latestEmailId:"",campaignId:"",skipped:true,skipReason:"No valid sent email"});errors++;setBulkProgress({done:i+1,total:targets.length,errors});continue;}
      try{
        const genRes=await fetch("/api/followup/generate",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({sentEmailId:latestEmail.id,leadId:latestEmail.lead_id,followupNumber:thread.followupCount+1,tone:bulkTone,
            overrideContext:{senderPhone:senderPhone||undefined,senderName:senderName||undefined}})});
        const genData=await genRes.json();
        if(!genData.success) throw new Error(genData.error);
        previews.push({leadId:thread.leadId,companyName:thread.companyName,leadEmail:thread.leadEmail,subject:genData.subject,body:genData.body,latestEmailId:latestEmail.id,campaignId:(latestEmail as any).campaign_id||"",skipped:false});
      }catch(e:any){errors++;previews.push({leadId:thread.leadId,companyName:thread.companyName,leadEmail:thread.leadEmail,subject:"",body:"",latestEmailId:latestEmail.id,campaignId:"",skipped:true,skipReason:e.message});}
      setBulkProgress(prev=>({...prev,done:i+1,errors}));
    }
    setBulkPreviews(previews); setBulkGenerating(false); setBulkReviewIndex(0); setBulkStep("review");
  };

  const sendBulkPreviews = async () => {
    const toSend=bulkPreviews.filter(p=>!p.skipped&&p.body.trim());
    if(!toSend.length) return;
    setBulkStep("sending"); setBulkSending(true); setBulkProgress({done:0,total:toSend.length,errors:0});
    let errors=0;
    for(let i=0;i<toSend.length;i++){
      const p=toSend[i];
      try{
        const res=await fetch("/api/send-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:p.leadEmail,subject:p.subject,body:p.body,leadId:p.leadId,campaignId:p.campaignId||undefined,scheduleFollowups:false})});
        const d=await res.json(); if(!d.success) throw new Error(d.error);
        setBulkProgress(prev=>({...prev,done:i+1}));
      }catch(e:any){errors++;setBulkProgress(prev=>({...prev,done:i+1,errors:prev.errors+1}));}
      if(i<toSend.length-1) await new Promise(r=>setTimeout(r,2000));
    }
    setBulkSending(false);
    const sent=toSend.length-errors;
    if(sent>0) toast.success(`Bulk follow-up: ${sent} sent${errors>0?`, ${errors} failed`:""}!`);
    else toast.error("All follow-ups failed.");
    setBulkSelected(new Set()); setBulkPreviews([]); setBulkStep("select"); load();
  };

  const updatePreview=(leadId:string,field:"subject"|"body",value:string)=>setBulkPreviews(prev=>prev.map(p=>p.leadId===leadId?{...p,[field]:value}:p));
  const skipPreview=(leadId:string)=>setBulkPreviews(prev=>prev.map(p=>p.leadId===leadId?{...p,skipped:!p.skipped}:p));

  // ── Manual compose actions ────────────────────────────────────────────────
  const sendManual = async () => {
    if(!manualTo||!manualSubject||!manualBody.trim()) return;
    setManualSending(true);
    try{
      const r=await fetch("/api/send-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:manualTo,subject:manualSubject,body:manualBody,scheduleFollowups:false})});
      const d=await r.json(); if(!d.success) throw new Error(d.error);
      toast.success("Sent to "+manualTo+" via "+d.accountUsed);
      setManualTo(""); setManualSubject(""); setManualBody("");
    }catch(e:any){toast.error(e.message||"Send failed");}
    finally{setManualSending(false);}
  };

  // ── Reply panel actions ───────────────────────────────────────────────────
  const openRP=(reply:EmailReply)=>{setRpReply(reply);setRpDraft(null);setRpSubj(`Re: ${reply.subject}`);setRpBody("");setRpOpen(true);};
  const closeRP=()=>{setRpOpen(false);setRpReply(null);setRpDraft(null);};
  const genRP=async()=>{
    if(!rpReply) return; setRpGen(true);
    try{
      const lead=rpReply.lead_id?leads.get(rpReply.lead_id):undefined;
      const r=await fetch("/api/ai/generate-reply",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({replyBody:rpReply.body,replySubject:rpReply.subject,leadName:lead?.company_name,leadNiche:lead?.niche,fromEmail:rpReply.from_email})});
      const d=await r.json(); if(!d.success) throw new Error(d.error);
      setRpDraft({subject:d.subject||`Re: ${rpReply.subject}`,body:d.body});setRpSubj(d.subject||`Re: ${rpReply.subject}`);setRpBody(d.body);
      toast.success("AI reply generated!");
    }catch(e:any){toast.error(e.message||"Failed");}finally{setRpGen(false);}
  };
  const sendRP=async()=>{
    if(!rpReply||!rpBody.trim()) return; setRpSend(true);
    try{
      const lead=rpReply.lead_id?leads.get(rpReply.lead_id):undefined;
      const to=rpReply.from_email||lead?.email; if(!to) throw new Error("No recipient");
      const r=await fetch("/api/send-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to,subject:rpSubj,body:rpBody,leadId:rpReply.lead_id,scheduleFollowups:false})});
      const d=await r.json(); if(!d.success) throw new Error(d.error);
      if(rpDraft){await sb.from("ai_replies").insert({user_id:userId,reply_id:rpReply.id,lead_id:rpReply.lead_id,subject:rpSubj,body:rpBody,status:"sent",sent_at:new Date().toISOString()});await sb.from("email_replies").update({ai_response_generated:true,ai_response_sent:true}).eq("id",rpReply.id);}
      toast.success("Reply sent!"); closeRP(); load();
    }catch(e:any){toast.error(e.message||"Failed");}finally{setRpSend(false);}
  };

  const unread = replies.filter(r=>!(r as any).ai_response_sent).length;
  const filteredThreads = threadSearch ? threads.filter(t=>t.companyName.toLowerCase().includes(threadSearch.toLowerCase())||t.leadEmail.toLowerCase().includes(threadSearch.toLowerCase())) : threads;

  if(loading) return <div className="flex items-center justify-center h-full bg-white"><Loader2 size={22} className="animate-spin text-blue-600"/></div>;

  // ── Bulk review full-screen ───────────────────────────────────────────────
  if (bulkStep === "review") {
    const readyCount = bulkPreviews.filter(p=>!p.skipped&&p.body.trim()).length;
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <p className="text-sm font-bold text-gray-900">{readyCount} follow-up{readyCount!==1?"s":""} ready to send</p>
            <span className="text-xs text-gray-500">Review and edit before sending</span>
          </div>
          <button onClick={()=>{setBulkStep("select");setBulkPreviews([]);setBulkReviewIndex(-1);}} className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">← Back</button>
        </div>
        <div className="flex-1 overflow-hidden px-8 pt-4 pb-0 min-h-0 flex flex-col">
          <div className="border border-gray-200 rounded-lg overflow-hidden flex-1 min-h-0">
            <div className="overflow-auto h-full">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 w-44">Company</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 w-52">Email</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Subject</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 w-24">Status</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 w-20">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bulkPreviews.map((p,idx)=>(
                    <tr key={p.leadId} className={`hover:bg-gray-50 ${p.skipped?"opacity-40":""}`}>
                      <td className="px-4 py-3"><p className="text-xs font-semibold text-gray-900 truncate max-w-[160px]">{p.companyName}</p></td>
                      <td className="px-4 py-3"><p className="text-xs text-gray-500 truncate max-w-[200px]">{p.leadEmail||"—"}</p></td>
                      <td className="px-4 py-3"><p className="text-xs text-gray-800 truncate max-w-sm">{p.subject||"—"}</p></td>
                      <td className="px-4 py-3">
                        {p.skipped?<span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200 font-medium">Skipped</span>
                          :<span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">AI</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={()=>setBulkReviewIndex(idx)} className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"><Edit3 size={13}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex gap-3 py-4 shrink-0">
            <button onClick={sendBulkPreviews} disabled={readyCount===0} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              <Send size={15}/>Send {readyCount} Follow-Up{readyCount!==1?"s":""}
            </button>
          </div>
        </div>
        {/* Edit modal */}
        {bulkReviewIndex>=0&&bulkPreviews[bulkReviewIndex]&&(()=>{
          const cur=bulkPreviews[bulkReviewIndex];
          return(
            <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={()=>setBulkReviewIndex(-1)}>
              <div className="absolute inset-0 bg-black/30"/>
              <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden mx-4" onClick={e=>e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                  <div><p className="text-sm font-bold text-gray-900">{cur.companyName}</p><p className="text-xs text-gray-500">{cur.leadEmail}</p></div>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>skipPreview(cur.leadId)} className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${cur.skipped?"border-blue-200 bg-blue-50 text-blue-700":"border-gray-200 text-gray-500 hover:bg-gray-50"}`}>{cur.skipped?"Undo Skip":"Skip"}</button>
                    <span className="text-xs text-gray-400 ml-1">{bulkReviewIndex+1}/{bulkPreviews.length}</span>
                    <button onClick={()=>setBulkReviewIndex(i=>Math.max(0,i-1))} disabled={bulkReviewIndex===0} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={15}/></button>
                    <button onClick={()=>setBulkReviewIndex(i=>Math.min(bulkPreviews.length-1,i+1))} disabled={bulkReviewIndex===bulkPreviews.length-1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={15}/></button>
                    <button onClick={()=>setBulkReviewIndex(-1)} className="p-1.5 rounded hover:bg-gray-100 ml-1"><X size={16} className="text-gray-500"/></button>
                  </div>
                </div>
                <div className={`flex-1 overflow-y-auto p-5 flex flex-col gap-4 ${cur.skipped?"opacity-40 pointer-events-none":""}`}>
                  <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Subject</label><input value={cur.subject} onChange={e=>updatePreview(cur.leadId,"subject",e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"/></div>
                  <div className="flex-1"><label className="block text-xs font-semibold text-gray-700 mb-1.5">Body</label><textarea value={cur.body} onChange={e=>updatePreview(cur.leadId,"body",e.target.value)} rows={16} className="w-full px-3 py-2.5 rounded-lg text-sm text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none font-sans leading-relaxed"/></div>
                </div>
                <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
                  <button onClick={()=>setBulkReviewIndex(-1)} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50">Done</button>
                  {bulkReviewIndex<bulkPreviews.length-1&&<button onClick={()=>setBulkReviewIndex(i=>i+1)} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">Next →</button>}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ── Sending progress overlay ──────────────────────────────────────────────
  if (bulkStep === "sending") return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm"/>
      <div className="relative bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4 text-center">
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3"><Loader2 size={22} className="animate-spin text-blue-600"/></div>
        <h3 className="text-base font-bold text-gray-900">Sending follow-ups…</h3>
        <p className="text-sm text-gray-500 mt-1">{bulkProgress.done} of {bulkProgress.total} sent</p>
        <div className="w-full bg-gray-100 rounded-full h-3 mt-4 mb-2"><div className="bg-blue-600 h-3 rounded-full transition-all" style={{width:`${bulkProgress.total>0?(bulkProgress.done/bulkProgress.total)*100:0}%`}}/></div>
        {bulkProgress.errors>0&&<p className="text-xs text-red-500">{bulkProgress.errors} failed</p>}
        <p className="text-[11px] text-gray-400 mt-2">Sending with delay to avoid spam filters…</p>
      </div>
    </div>
  );

  // ── Shared signature box component ───────────────────────────────────────
  const SignatureBox = () => (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 flex flex-col gap-3">
      <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
        <AtSign size={12}/> Your Signature — appears at the bottom of every email
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Your Name</label>
          <input value={senderName} onChange={e=>setSenderName(e.target.value)} placeholder="e.g. Rukundo Abkar"
            className="w-full px-3 py-2 rounded-lg text-sm border border-gray-300 focus:border-blue-400 bg-white outline-none"/>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Your Title</label>
          <input value={senderTitle} onChange={e=>setSenderTitle(e.target.value)} placeholder="e.g. Executive Sales"
            className="w-full px-3 py-2 rounded-lg text-sm border border-gray-300 focus:border-blue-400 bg-white outline-none"/>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Your Phone <span className="text-gray-400 font-normal">(optional — shown in signature)</span></label>
        <input value={senderPhone} onChange={e=>setSenderPhone(e.target.value)} placeholder="e.g. +256 700 123 456"
          className="w-full px-3 py-2 rounded-lg text-sm border border-gray-300 focus:border-blue-400 bg-white outline-none"/>
      </div>
      <p className="text-[10px] text-blue-600">
        Signature preview: <span className="font-medium">{senderName||"Your Name"} · {senderTitle||"Executive Sales"}{senderPhone?` · ${senderPhone}`:""} · Pryro</span>
      </p>
    </div>
  );

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-8 py-5 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Follow-Up Manager</h1>
            <p className="text-sm text-gray-500 mt-0.5">Send and manage follow-up emails to your leads</p>
          </div>
          <button onClick={checkInbox} disabled={checking}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {checking?<Loader2 size={14} className="animate-spin"/>:<RefreshCw size={14}/>}Check Inbox
            {unread>0&&<span className="bg-white text-blue-600 text-[10px] font-bold px-1.5 rounded-full">{unread}</span>}
          </button>
        </div>
        {/* Mode tabs — identical style to Email Writer */}
        <div className="flex gap-2">
          <button onClick={()=>setMode("single")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode==="single"?"bg-blue-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            <Sparkles size={14}/> Single Follow-Up
          </button>
          <button onClick={()=>setMode("bulk")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode==="bulk"?"bg-blue-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            <Users size={14}/> Bulk Follow-Up
          </button>
          <button onClick={()=>setMode("manual")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode==="manual"?"bg-blue-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            <PenLine size={14}/> Manual Compose
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">

        {/* ══ SINGLE FOLLOW-UP MODE ══ */}
        {mode === "single" && (
          <div className="max-w-2xl space-y-5">
            <SignatureBox />

            {/* Target Lead selector */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">Target Lead</label>
              <div className="relative">
                <button onClick={()=>setThreadDropOpen(o=>!o)}
                  className="w-full flex items-center justify-between px-4 py-3 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-400 transition-colors">
                  <span className={selectedThread?"text-gray-900":"text-gray-400"}>
                    {selectedThread?`${selectedThread.companyName} — ${selectedThread.leadEmail}`:"Select a lead to follow up with…"}
                  </span>
                  <ChevronDown size={16} className="text-gray-400 shrink-0"/>
                </button>
                {threadDropOpen && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-gray-100">
                      <input autoFocus value={threadSearch} onChange={e=>setThreadSearch(e.target.value)} placeholder="Search leads…"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"/>
                    </div>
                    <div className="overflow-y-auto max-h-60">
                      {filteredThreads.length===0
                        ? <p className="text-center py-6 text-sm text-gray-400">No leads found</p>
                        : filteredThreads.map(t=>{
                          const latest=t.emails[t.emails.length-1];
                          return(
                            <button key={t.leadId} onClick={()=>{setSelectedThread(t);setThreadDropOpen(false);setThreadSearch("");setSingleDraft(null);setSingleSubj("");setSingleBody("");setExpandedBodyId(null);}}
                              className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0 transition-colors ${selectedThread?.leadId===t.leadId?"bg-blue-50":""}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-sm font-semibold text-gray-900 truncate">{t.companyName}</span>
                                  <StatusPill status={t.latestStatus} opened={!!latest?.opened_at} clicked={!!latest?.clicked_at}/>
                                  {t.followupCount>0&&<span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-full font-medium">{t.followupCount} FU</span>}
                                  {t.hasReply&&<span className="text-[10px] bg-green-50 text-green-700 border border-green-100 px-1.5 py-0.5 rounded-full font-medium">Replied</span>}
                                </div>
                                <p className="text-xs text-gray-400 truncate">{t.leadEmail}{t.niche?` · ${t.niche}`:""}</p>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Thread history — shown when a lead is selected */}
            {selectedThread && (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700">
                    Email Thread
                    <span className="ml-2 text-blue-600 font-bold">
                      {selectedThread.emails.filter(e=>!["failed","bounced"].includes(e.status||"")).length} sent
                      {selectedThread.followupCount>0?` · ${selectedThread.followupCount} follow-up${selectedThread.followupCount>1?"s":""}` :""}
                    </span>
                  </p>
                  <span className="text-[10px] text-gray-400">Click any email to see body</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {selectedThread.emails.filter(e=>!["failed","bounced"].includes(e.status||"")).map((email,idx)=>{
                    const isFU=(email as any).is_followup;
                    const fNum=(email as any).followup_number||idx;
                    const isExp=expandedBodyId===email.id;
                    return(
                      <div key={email.id}>
                        <button onClick={()=>setExpandedBodyId(isExp?null:email.id)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${isFU?"bg-blue-100 text-blue-700":"bg-gray-200 text-gray-600"}`}>
                              {isFU?`FU #${fNum}`:"Original"}
                            </span>
                            <span className="text-xs font-medium text-gray-800 truncate">{email.subject}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-[10px] text-gray-400">{fdate(email.sent_at)}</span>
                            {email.opened_at&&<Eye size={10} className="text-amber-500"/>}
                            {email.clicked_at&&<MousePointer size={10} className="text-blue-500"/>}
                            <ChevronDown size={12} className={`text-gray-400 transition-transform ${isExp?"rotate-180":""}`}/>
                          </div>
                        </button>
                        {isExp&&(
                          <div className="px-4 pb-3">
                            <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 max-h-40 overflow-y-auto">
                              <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                                {(email.body||"").replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").trim()||"(No body)"}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tone */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">Tone</label>
              <div className="grid grid-cols-3 gap-3">
                {TONES.map(t=>(
                  <button key={t.value} onClick={()=>{setSingleTone(t.value);setSingleDraft(null);}}
                    className={`p-3.5 rounded-xl border text-left transition-all ${singleTone===t.value?"border-blue-500 bg-blue-50 ring-2 ring-blue-200":"border-gray-200 bg-white hover:border-gray-300"}`}>
                    <p className={`text-sm font-bold ${singleTone===t.value?"text-blue-700":"text-gray-900"}`}>{t.label}</p>
                    <p className="text-[11px] text-gray-500 mt-1 leading-tight">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Pain point */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                Specific Pain Point <span className="font-normal text-gray-400">(optional — makes follow-up sharper)</span>
              </label>
              <input value={singlePainPoint} onChange={e=>setSinglePainPoint(e.target.value)}
                placeholder="e.g. losing leads due to slow follow-up, high customer churn, manual reporting…"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"/>
            </div>

            {/* Generate button */}
            {!singleDraft && (
              <button onClick={generateSingle} disabled={singleGenerating||!selectedThread}
                className="w-full py-3.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {singleGenerating?<><Loader2 size={16} className="animate-spin"/>Generating…</>:<><Sparkles size={16}/>Generate Follow-Up</>}
              </button>
            )}

            {/* Generated draft */}
            {singleDraft && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-900">Generated Follow-Up</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{singleDraft.modelUsed==="template"?"Template":"AI"}</span>
                    <button onClick={generateSingle} disabled={singleGenerating} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                      {singleGenerating?<Loader2 size={11} className="animate-spin"/>:<RotateCcw size={11}/>}Regenerate
                    </button>
                  </div>
                </div>
                {singleDraft.decisionReason&&<p className="text-[11px] text-gray-500 italic bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">💡 {singleDraft.decisionReason}</p>}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Subject</label>
                  <input value={singleSubj} onChange={e=>setSingleSubj(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Body</label>
                  <textarea value={singleBody} onChange={e=>setSingleBody(e.target.value)} rows={12}
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none font-sans leading-relaxed"/>
                </div>
                <div className="flex gap-3">
                  <button onClick={()=>{setSingleDraft(null);setSingleSubj("");setSingleBody("");}} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
                  <button onClick={sendSingle} disabled={singleSending||!singleBody.trim()}
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {singleSending?<><Loader2 size={15} className="animate-spin"/>Sending…</>:<><Send size={15}/>Send Follow-Up to {selectedThread?.companyName}</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ BULK FOLLOW-UP MODE ══ */}
        {mode === "bulk" && (
          <div className="space-y-5">
            <SignatureBox />

            {/* Tone */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">Tone</label>
              <div className="grid grid-cols-3 gap-3">
                {TONES.map(t=>(
                  <button key={t.value} onClick={()=>setBulkTone(t.value)}
                    className={`p-3.5 rounded-xl border text-left transition-all ${bulkTone===t.value?"border-blue-500 bg-blue-50 ring-2 ring-blue-200":"border-gray-200 bg-white hover:border-gray-300"}`}>
                    <p className={`text-sm font-bold ${bulkTone===t.value?"text-blue-700":"text-gray-900"}`}>{t.label}</p>
                    <p className="text-[11px] text-gray-500 mt-1 leading-tight">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Pain point */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">Pain Point <span className="font-normal text-gray-400">(optional)</span></label>
              <input value={bulkPainPoint} onChange={e=>setBulkPainPoint(e.target.value)}
                placeholder="e.g. slow follow-up, high churn…"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"/>
            </div>

            {/* Niche filter */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Filter by Niche <span className="font-normal text-gray-400">(click to auto-select all leads in that niche)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button onClick={()=>setNicheFilter("all")}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${bulkNiche==="all"?"bg-blue-600 text-white border-blue-600":"bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                  All ({eligibleThreads.length} unsent)
                </button>
                {availableNiches.map(niche=>{
                  const count=eligibleThreads.filter(t=>(t.niche||"")===niche).length;
                  return(
                    <button key={niche} onClick={()=>{setNicheFilter(niche);setBulkSelected(new Set(eligibleThreads.filter(t=>(t.niche||"")===niche).map(t=>t.leadId)));}}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${bulkNiche===niche?"bg-blue-600 text-white border-blue-600":"bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                      {niche} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lead list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-800">
                  {bulkNiche==="all"?"Unsent Leads":bulkNiche+" Leads"} ({bulkSelected.size} selected)
                </p>
                <div className="flex gap-3">
                  <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">Select all {filteredEligible.length}</button>
                  <button onClick={clearAll} className="text-xs text-gray-500 hover:underline">Clear</button>
                </div>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-y-auto max-h-72 divide-y divide-gray-100">
                  {filteredEligible.length===0
                    ? <p className="text-center py-8 text-sm text-gray-400">No eligible leads. All have replied or bounced.</p>
                    : filteredEligible.map(thread=>{
                      const latest=thread.emails.filter(e=>!["failed","bounced"].includes(e.status||"")).slice(-1)[0];
                      const isSel=bulkSelected.has(thread.leadId);
                      return(
                        <button key={thread.leadId} onClick={()=>toggleBulkSelect(thread.leadId)}
                          className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors ${isSel?"bg-blue-50/50":""}`}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${isSel?"border-blue-500 bg-blue-500":"border-gray-300"}`}>
                            {isSel&&<CheckCircle size={10} className="text-white"/>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{thread.companyName}</p>
                            <p className="text-[11px] text-gray-400 truncate">{thread.leadEmail}{thread.niche?` · ${thread.niche}`:""}</p>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <StatusPill status={latest?.status} opened={!!latest?.opened_at} clicked={!!latest?.clicked_at}/>
                            {thread.followupCount>0&&<span className="text-[10px] text-blue-600">{thread.followupCount} FU</span>}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Generate & review button */}
            <button onClick={generateBulkPreviews} disabled={bulkGenerating||bulkSelected.size===0}
              className="w-full py-3.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {bulkGenerating
                ?<><Loader2 size={16} className="animate-spin"/>Generating {bulkProgress.done}/{bulkProgress.total}…</>
                :<><Sparkles size={16}/>Generate &amp; Review {bulkSelected.size} Follow-Up{bulkSelected.size!==1?"s":""}</>}
            </button>
          </div>
        )}

        {/* ══ MANUAL COMPOSE MODE ══ */}
        {mode === "manual" && (
          <div className="max-w-2xl space-y-5">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-800">Manual Compose</p>
              <p className="text-xs text-blue-600 mt-0.5">Write and send to any email address — no lead required. Sent via your configured SMTP account.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">To</label>
              <div className="relative">
                <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input value={manualTo} onChange={e=>setManualTo(e.target.value)} placeholder="recipient@company.com" type="email"
                  className="w-full pl-9 pr-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"/>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">Subject</label>
              <input value={manualSubject} onChange={e=>setManualSubject(e.target.value)} placeholder="e.g. Quick question about your business"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"/>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">Body</label>
              <textarea value={manualBody} onChange={e=>setManualBody(e.target.value)} rows={14}
                placeholder={"Hi,\n\nWrite your email here...\n\nBest,\nYour Name"}
                className="w-full px-4 py-3 rounded-lg text-sm text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white outline-none resize-none placeholder:text-gray-400 leading-relaxed font-sans"/>
            </div>

            <button onClick={sendManual} disabled={manualSending||!manualTo||!manualSubject||!manualBody.trim()}
              className="w-full py-3.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {manualSending?<><Loader2 size={16} className="animate-spin"/>Sending…</>:<><Send size={16}/>Send Email</>}
            </button>
          </div>
        )}
      </div>

      {/* ══ REPLY SLIDE PANEL ══ */}
      {rpOpen&&rpReply&&(
        <div className="fixed inset-0 z-50 flex" onClick={closeRP}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm"/>
          <div className="relative ml-auto w-full max-w-xl h-full bg-white shadow-2xl flex flex-col border-l border-gray-200" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">Reply to Lead</h2>
                <p className="text-xs text-gray-500 mt-0.5">{leads.get(rpReply.lead_id||"")?.company_name||rpReply.from_email}</p>
              </div>
              <button onClick={closeRP} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={17} className="text-gray-500"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-bold text-green-700 uppercase tracking-widest">Their Reply</p>
                  {rpReply.is_positive&&<ThumbsUp size={11} className="text-green-600"/>}
                  {rpReply.sentiment&&<span className="text-[11px] text-gray-500 capitalize">{rpReply.sentiment}</span>}
                </div>
                <p className="text-sm font-semibold text-gray-900 mb-0.5">{rpReply.subject}</p>
                <p className="text-xs text-gray-400 mb-2">From {rpReply.from_email} · {fdate(rpReply.received_at)}</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{rpReply.body}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={genRP} disabled={rpGen}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {rpGen?<><Loader2 size={13} className="animate-spin"/>Generating…</>:<><Sparkles size={13}/>Generate AI Reply</>}
                </button>
                {rpBody&&<button onClick={genRP} disabled={rpGen} className="flex items-center gap-1 px-3 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50"><RotateCcw size={12}/>Regenerate</button>}
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Subject</label>
                <input value={rpSubj} onChange={e=>setRpSubj(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"/>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Your Reply {rpDraft&&<span className="text-gray-400 normal-case font-normal ml-1">AI generated — edit freely</span>}</label>
                <textarea value={rpBody} onChange={e=>setRpBody(e.target.value)} rows={9} placeholder="Type your reply, or click Generate AI Reply above…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"/>
              </div>
              <div className="flex gap-3">
                <button onClick={closeRP} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button onClick={sendRP} disabled={rpSend||!rpBody.trim()}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {rpSend?<><Loader2 size={15} className="animate-spin"/>Sending…</>:<><Send size={15}/>Send Reply</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
