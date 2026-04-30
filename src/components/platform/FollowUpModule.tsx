"use client";

import { useState, useEffect } from "react";
import { Lead, EmailReply, AIReply, SentEmail } from "@/types/platform";
import {
  Mail,
  Send,
  Clock,
  Plus,
  Loader2,
  Eye,
  CheckCircle,
  X,
  MessageSquare,
  Sparkles,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Inbox,
  TrendingUp,
  Bot,
  ArrowRight,
} from "lucide-react";
import { createClient } from "../../../supabase/client";
import { toast } from "sonner";

interface FollowUpModuleProps {
  userId: string;
}

export default function FollowUpModule({ userId }: FollowUpModuleProps) {
  const [activeTab, setActiveTab] = useState<"sent" | "replies" | "ai-responses">("sent");
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [emailReplies, setEmailReplies] = useState<EmailReply[]>([]);
  const [aiReplies, setAIReplies] = useState<AIReply[]>([]);
  const [leads, setLeads] = useState<Map<string, Lead>>(new Map());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [selectedReply, setSelectedReply] = useState<EmailReply | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiDraft, setAIDraft] = useState<{ subject: string; body: string } | null>(null);

  const supabase = createClient();

  useEffect(() => {
    fetchData();
    
    // Subscribe to realtime updates
    const repliesChannel = supabase
      .channel("email_replies_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_replies" },
        () => fetchData()
      )
      .subscribe();

    return () => {
      repliesChannel.unsubscribe();
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);

    // Fetch sent emails
    const { data: sentData } = await supabase
      .from("sent_emails")
      .select("*")
      .eq("user_id", userId)
      .order("sent_at", { ascending: false })
      .limit(100);

    if (sentData) setSentEmails(sentData as SentEmail[]);

    // Fetch email replies
    const { data: repliesData } = await supabase
      .from("email_replies")
      .select("*")
      .eq("user_id", userId)
      .order("received_at", { ascending: false });

    if (repliesData) setEmailReplies(repliesData as EmailReply[]);

    // Fetch AI replies
    const { data: aiRepliesData } = await supabase
      .from("ai_replies")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (aiRepliesData) setAIReplies(aiRepliesData as AIReply[]);

    // Fetch all related leads
    const leadIds = new Set([
      ...sentData?.map((e) => e.lead_id) || [],
      ...repliesData?.map((r) => r.lead_id) || [],
    ]);

    if (leadIds.size > 0) {
      const { data: leadsData } = await supabase
        .from("leads")
        .select("*")
        .in("id", Array.from(leadIds));

      if (leadsData) {
        const leadsMap = new Map();
        leadsData.forEach((lead) => leadsMap.set(lead.id, lead));
        setLeads(leadsMap);
      }
    }

    setLoading(false);
  };

  const simulateReplyCheck = async () => {
    toast.info("Checking for new replies...");
    
    // Simulate finding a reply (in production, this would check IMAP/Gmail API)
    setTimeout(async () => {
      const unrepliedEmails = sentEmails.filter(e => !e.replied_at);
      
      if (unrepliedEmails.length > 0) {
        const randomEmail = unrepliedEmails[Math.floor(Math.random() * unrepliedEmails.length)];
        const lead = leads.get(randomEmail.lead_id);
        
        if (lead) {
          // Simulate a reply
          const { error } = await supabase
            .from("email_replies")
            .insert({
              user_id: userId,
              sent_email_id: randomEmail.id,
              lead_id: randomEmail.lead_id,
              from_email: lead.email || "reply@example.com",
              subject: `Re: ${randomEmail.subject}`,
              body: `Hi,\n\nThanks for reaching out! I'm interested in learning more about your services. Could you send me some more information?\n\nBest regards,\n${lead.company_name}`,
              sentiment: "interested",
              is_positive: true,
            });

          if (!error) {
            toast.success("New reply detected!");
            fetchData();
          }
        }
      } else {
        toast.info("No new replies found");
      }
    }, 1500);
  };

  const generateAIResponse = async (reply: EmailReply) => {
    setGenerating(reply.id);
    setSelectedReply(reply);

    try {
      const lead = leads.get(reply.lead_id);
      if (!lead) throw new Error("Lead not found");

      // Simulate AI generation (in production, call your AI API)
      await new Promise(resolve => setTimeout(resolve, 2000));

      const aiResponse = {
        subject: `Re: ${reply.subject}`,
        body: `Hi ${lead.company_name} team,\n\nThank you for your interest! I'd be happy to provide more details about how we can help.\n\nBased on your ${lead.niche} business in ${lead.location}, here's what we can offer:\n\n• Customized outreach strategies\n• AI-powered email personalization\n• Automated follow-up sequences\n• Real-time analytics and tracking\n\nWould you be available for a quick 15-minute call this week? I can walk you through some examples specific to your industry.\n\nLooking forward to connecting!\n\nBest regards,\n[Your Name]`,
      };

      // Save AI reply to database
      const { data, error } = await supabase
        .from("ai_replies")
        .insert({
          user_id: userId,
          reply_id: reply.id,
          lead_id: reply.lead_id,
          subject: aiResponse.subject,
          body: aiResponse.body,
          tone: "professional",
          model_used: "gpt-4",
          status: "draft",
        })
        .select()
        .single();

      if (error) throw error;

      // Update reply as having AI response generated
      await supabase
        .from("email_replies")
        .update({ ai_response_generated: true })
        .eq("id", reply.id);

      setAIDraft(aiResponse);
      setShowAIModal(true);
      toast.success("AI response generated!");
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate AI response");
    } finally {
      setGenerating(null);
    }
  };

  const sendAIReply = async (aiReplyId: string) => {
    try {
      // In production, this would actually send the email via SMTP
      await supabase
        .from("ai_replies")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", aiReplyId);

      // Update the email reply as having AI response sent
      const aiReply = aiReplies.find(r => r.id === aiReplyId);
      if (aiReply) {
        await supabase
          .from("email_replies")
          .update({ ai_response_sent: true })
          .eq("id", aiReply.reply_id);
      }

      toast.success("AI reply sent successfully!");
      setShowAIModal(false);
      setAIDraft(null);
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error("Failed to send AI reply");
    }
  };

  const stats = {
    totalSent: sentEmails.length,
    replied: emailReplies.length,
    positiveReplies: emailReplies.filter((r) => r.is_positive).length,
    aiResponsesGenerated: aiReplies.length,
    aiResponsesSent: aiReplies.filter((r) => r.status === "sent").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header with Stats */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Email Follow-Up & Reply Management</h2>
          <button
            onClick={simulateReplyCheck}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            <RefreshCw size={16} />
            Check for Replies
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: "Emails Sent", value: stats.totalSent, icon: Send, color: "#2563EB" },
            { label: "Replies Received", value: stats.replied, icon: MessageSquare, color: "#10B981" },
            { label: "Positive Replies", value: stats.positiveReplies, icon: ThumbsUp, color: "#F59E0B" },
            { label: "AI Responses", value: stats.aiResponsesGenerated, icon: Bot, color: "#8B5CF6" },
            { label: "AI Sent", value: stats.aiResponsesSent, icon: Sparkles, color: "#EC4899" },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="rounded-xl p-4 flex items-center justify-between bg-gray-50 border border-gray-200"
              >
                <div>
                  <p className="text-xs text-gray-600 mb-1">{stat.label.toUpperCase()}</p>
                  <p className="text-2xl font-bold" style={{ color: stat.color }}>
                    {stat.value}
                  </p>
                </div>
                <Icon size={20} style={{ color: stat.color, opacity: 0.4 }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-6">
          {[
            { id: "sent", label: "Sent Emails", count: sentEmails.length },
            { id: "replies", label: "Replies", count: emailReplies.length },
            { id: "ai-responses", label: "AI Responses", count: aiReplies.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Sent Emails Tab */}
        {activeTab === "sent" && (
          <div className="space-y-3">
            {sentEmails.length === 0 ? (
              <div className="text-center py-12">
                <Mail size={48} className="text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">No emails sent yet</p>
              </div>
            ) : (
              sentEmails.map((email) => {
                const lead = leads.get(email.lead_id);
                const hasReply = emailReplies.some((r) => r.sent_email_id === email.id);
                
                return (
                  <div
                    key={email.id}
                    className="bg-white rounded-xl p-5 border border-gray-200 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {lead?.company_name || "Unknown"}
                          </h3>
                          {hasReply && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                              Replied
                            </span>
                          )}
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${
                              email.status === "sent"
                                ? "bg-blue-100 text-blue-700"
                                : email.status === "opened"
                                ? "bg-yellow-100 text-yellow-700"
                                : email.status === "replied"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {email.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">
                          <strong>Subject:</strong> {email.subject}
                        </p>
                        <p className="text-xs text-gray-500">
                          Sent {new Date(email.sent_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Replies Tab */}
        {activeTab === "replies" && (
          <div className="space-y-3">
            {emailReplies.length === 0 ? (
              <div className="text-center py-12">
                <Inbox size={48} className="text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">No replies yet</p>
                <p className="text-sm text-gray-500 mt-1">
                  Click "Check for Replies" to scan your inbox
                </p>
              </div>
            ) : (
              emailReplies.map((reply) => {
                const lead = leads.get(reply.lead_id);
                const hasAIResponse = aiReplies.some((ai) => ai.reply_id === reply.id);
                
                return (
                  <div
                    key={reply.id}
                    className="bg-white rounded-xl p-5 border border-gray-200 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {lead?.company_name || "Unknown"}
                          </h3>
                          {reply.sentiment && (
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded-full flex items-center gap-1 ${
                                reply.sentiment === "interested" || reply.sentiment === "positive"
                                  ? "bg-green-100 text-green-700"
                                  : reply.sentiment === "negative" || reply.sentiment === "not_interested"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {reply.is_positive ? (
                                <ThumbsUp size={12} />
                              ) : (
                                <ThumbsDown size={12} />
                              )}
                              {reply.sentiment}
                            </span>
                          )}
                          {hasAIResponse && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full flex items-center gap-1">
                              <Bot size={12} />
                              AI Response Ready
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-1">
                          <strong>From:</strong> {reply.from_email}
                        </p>
                        <p className="text-sm text-gray-600 mb-2">
                          <strong>Subject:</strong> {reply.subject}
                        </p>
                        <div className="bg-gray-50 rounded-lg p-3 mb-3">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            {reply.body}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500">
                          Received {new Date(reply.received_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    
                    {!reply.ai_response_generated && (
                      <button
                        onClick={() => generateAIResponse(reply)}
                        disabled={generating === reply.id}
                        className="w-full mt-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {generating === reply.id ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Generating AI Response...
                          </>
                        ) : (
                          <>
                            <Sparkles size={16} />
                            Generate AI Response
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* AI Responses Tab */}
        {activeTab === "ai-responses" && (
          <div className="space-y-3">
            {aiReplies.length === 0 ? (
              <div className="text-center py-12">
                <Bot size={48} className="text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">No AI responses yet</p>
                <p className="text-sm text-gray-500 mt-1">
                  Generate AI responses from the Replies tab
                </p>
              </div>
            ) : (
              aiReplies.map((aiReply) => {
                const lead = leads.get(aiReply.lead_id);
                const originalReply = emailReplies.find((r) => r.id === aiReply.reply_id);
                
                return (
                  <div
                    key={aiReply.id}
                    className="bg-white rounded-xl p-5 border border-gray-200 hover:border-purple-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {lead?.company_name || "Unknown"}
                          </h3>
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${
                              aiReply.status === "sent"
                                ? "bg-green-100 text-green-700"
                                : aiReply.status === "approved"
                                ? "bg-blue-100 text-blue-700"
                                : aiReply.status === "rejected"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {aiReply.status.toUpperCase()}
                          </span>
                        </div>
                        
                        {originalReply && (
                          <div className="bg-gray-50 rounded-lg p-3 mb-3 border-l-4 border-gray-300">
                            <p className="text-xs text-gray-600 mb-1">Original Reply:</p>
                            <p className="text-sm text-gray-700 line-clamp-2">
                              {originalReply.body}
                            </p>
                          </div>
                        )}
                        
                        <p className="text-sm text-gray-600 mb-1">
                          <strong>Subject:</strong> {aiReply.subject}
                        </p>
                        <div className="bg-purple-50 rounded-lg p-3 mb-3 border-l-4 border-purple-500">
                          <p className="text-xs text-purple-600 mb-1 flex items-center gap-1">
                            <Bot size={12} />
                            AI Generated Response:
                          </p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            {aiReply.body}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500">
                          Generated {new Date(aiReply.created_at).toLocaleString()}
                          {aiReply.sent_at && ` • Sent ${new Date(aiReply.sent_at).toLocaleString()}`}
                        </p>
                      </div>
                    </div>
                    
                    {aiReply.status === "draft" && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => sendAIReply(aiReply.id)}
                          className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <Send size={16} />
                          Send Reply
                        </button>
                        <button
                          onClick={() => {
                            supabase
                              .from("ai_replies")
                              .update({ status: "rejected" })
                              .eq("id", aiReply.id)
                              .then(() => {
                                toast.success("AI reply rejected");
                                fetchData();
                              });
                          }}
                          className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* AI Response Modal */}
      {showAIModal && aiDraft && selectedReply && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowAIModal(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="text-purple-600" />
                AI Generated Response
              </h2>
              <button onClick={() => setShowAIModal(false)}>
                <X size={24} className="text-gray-600" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-gray-300">
                <p className="text-xs text-gray-600 mb-2">Original Reply:</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {selectedReply.body}
                </p>
              </div>

              <div className="bg-purple-50 rounded-lg p-4 border-l-4 border-purple-500">
                <p className="text-xs text-purple-600 mb-2 flex items-center gap-1">
                  <Bot size={12} />
                  AI Response:
                </p>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Subject:</p>
                    <p className="text-sm font-medium text-gray-900">{aiDraft.subject}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Body:</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{aiDraft.body}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAIModal(false)}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const latestAIReply = aiReplies.find(
                      (r) => r.reply_id === selectedReply.id && r.status === "draft"
                    );
                    if (latestAIReply) {
                      sendAIReply(latestAIReply.id);
                    }
                  }}
                  className="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Send size={16} />
                  Send Reply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
