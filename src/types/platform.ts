export type LeadStatus = 'New' | 'Email Sent' | 'Replied' | 'Interested' | 'Closed' | 'Dead';

export interface Lead {
  id: string;
  user_id: string;
  company_name: string;
  email: string | null;
  niche: string | null;
  location: string | null;
  company_context: string | null;
  status: LeadStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedEmail {
  id: string;
  user_id: string;
  lead_id: string;
  subject: string | null;
  body: string | null;
  tone: string | null;
  model_used: string | null;
  created_at: string;
}

export interface AIProvider {
  id: string;
  user_id: string;
  provider: string;
  api_key: string | null;
  is_active: boolean;
  active_model: string | null;
  is_connected: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScrapedLead {
  company_name: string;
  email: string;
  niche: string;
  location: string;
  company_context: string;
}

export type ActiveModule = 'scraper' | 'email-writer' | 'crm' | 'ai-settings' | 'smtp-manager';

export type ToneType = 'Direct' | 'Aggressive' | 'Surgical';

export interface AIProviderConfig {
  name: string;
  key: string;
  models: string[];
  logo: string;
}
