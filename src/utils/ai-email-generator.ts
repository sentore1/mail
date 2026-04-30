import { createClient } from "../../supabase/client";

interface EmailGenerationParams {
  lead: {
    company_name: string;
    niche: string | null;
    location: string | null;
    company_context: string | null;
  };
  yourCompany: string;
  yourService: string;
  tone: 'Direct' | 'Aggressive' | 'Surgical';
  customPainPoint?: string;
  userId: string;
}

export async function generateAIEmail(params: EmailGenerationParams): Promise<{ subject: string; body: string }> {
  const { lead, yourCompany, yourService, tone, customPainPoint, userId } = params;
  
  const supabase = createClient();
  
  // Debug: Check what user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  console.log("Authenticated user ID:", user?.id);
  console.log("Passed userId param:", userId);
  
  // Fetch AI provider settings
  // RLS policies automatically filter by auth.uid(), so we don't need to filter by user_id
  const { data: aiProvider, error } = await supabase
    .from("ai_providers")
    .select("*")
    .eq("is_active", true)
    .single();
  
  if (!aiProvider) {
    console.error("AI provider fetch error:", error);
    console.error("No AI provider found for authenticated user:", user?.id);
    throw new Error("No active AI provider configured. Please set up AI in Settings.");
  }
  
  // Build the prompt based on tone
  const toneInstructions = {
    'Direct': 'Write a clear, concise, professional email. No fluff. Get straight to the point.',
    'Aggressive': 'Write an urgent, compelling email that creates FOMO. Push for immediate action.',
    'Surgical': 'Write a deeply personalized email showing you researched them. Reference specific details.'
  };
  
  const prompt = `You are writing a cold outreach email for ${yourCompany}.

YOUR COMPANY: ${yourCompany}
YOUR SERVICE: ${yourService}

TARGET COMPANY: ${lead.company_name}
INDUSTRY: ${lead.niche || 'Unknown'}
LOCATION: ${lead.location || 'Unknown'}
CONTEXT: ${lead.company_context || 'No additional context'}

${customPainPoint ? `PAIN POINT TO ADDRESS: ${customPainPoint}` : ''}

TONE: ${toneInstructions[tone]}

Write a cold email with:
1. A compelling subject line (max 60 characters)
2. Email body that:
   - Opens with a personalized hook about their company
   - States the problem they likely face
   - Briefly explains how ${yourService} solves it
   - Ends with a clear, low-friction call-to-action
   - Keep it under 150 words
   - Use their company name naturally
   - Don't use placeholder text like [Your Name]

Format your response EXACTLY as:
SUBJECT: [subject line here]
BODY: [email body here]`;

  // Call AI API
  let aiResponse;
  
  try {
    if (aiProvider.provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${aiProvider.api_key}`
        },
        body: JSON.stringify({
          model: aiProvider.model_name || "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are an expert cold email copywriter." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      });
      
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      aiResponse = data.choices[0].message.content;
      
    } else if (aiProvider.provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": aiProvider.api_key,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: aiProvider.model_name || "claude-3-5-sonnet-20241022",
          max_tokens: 500,
          messages: [
            { role: "user", content: prompt }
          ]
        })
      });
      
      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      aiResponse = data.content[0].text;
      
    } else if (aiProvider.provider === "groq") {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${aiProvider.api_key}`
        },
        body: JSON.stringify({
          model: aiProvider.model_name || "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "You are an expert cold email copywriter." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      });
      
      if (!response.ok) {
        throw new Error(`Groq API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      aiResponse = data.choices[0].message.content;
      
    } else {
      throw new Error(`Unsupported AI provider: ${aiProvider.provider}`);
    }
    
    // Parse the response
    const subjectMatch = aiResponse.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
    const bodyMatch = aiResponse.match(/BODY:\s*([\s\S]+?)$/i);
    
    if (!subjectMatch || !bodyMatch) {
      throw new Error("AI response format invalid");
    }
    
    return {
      subject: subjectMatch[1].trim(),
      body: bodyMatch[1].trim()
    };
    
  } catch (error) {
    console.error('AI email generation error:', error);
    throw error;
  }
}
