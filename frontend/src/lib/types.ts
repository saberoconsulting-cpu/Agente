export type DashboardSummary = {
  company_id: string;
  metrics: {
    leads: number;
    conversations: number;
    indexed_documents: number;
    upcoming_meetings: number;
    scheduled_followups: number;
  };
  integrations: {
    google_connected: boolean;
    drive_files: number;
  };
  opportunities?: { open: number; hot: number; unassigned: number; proposed: number; won: number };
  sales?: {
    created: number; qualified: number; meetings: number; proposals: number; won: number; lost: number;
    pipeline_value: number; won_value: number; pending_drafts: number;
    conversion: { qualified: number; meetings: number; proposals: number; won: number };
    by_assignee: Array<{ label: string; count: number; value: string }>;
    by_service: Array<{ label: string; count: number; value: string }>;
  };
  recent_events: Array<{
    event_type: string;
    aggregate_type: string | null;
    aggregate_id: string | null;
    created_at: string;
  }>;
};

export type Opportunity = { id: string; lead_name: string; whatsapp_number: string; stage: string; score: number; assignee_email?: string; service_interest?: string; next_action?: string; last_activity_at: string; };

export type OpportunityFollowupDraft = {
  id: string; opportunity_id: string; rule_key: string; priority: string; message: string; template_name?: string;
  status: 'pending' | 'approved' | 'rejected' | 'sent' | 'blocked'; lead_name?: string; whatsapp_number: string;
  assignee_email?: string; created_at: string; rejection_reason?: string;
};

export type AgentSettings = {
  settings: {
    agent_name: string;
    tone: string;
    llm_provider: string;
    llm_model: string;
    system_rules: string;
    scheduling_enabled?: boolean;
  };
  services: Array<{ id: string; name: string; description: string; active: boolean }>;
  policies: Array<{ id: string; policy_key: string; policy_text: string; active: boolean }>;
};

export type DriveFile = {
  id: string;
  name: string;
  mime_type: string;
  sync_status: string;
  last_synced_at?: string;
  web_view_link?: string;
};

export type Meeting = {
  id: string;
  title: string;
  description?: string;
  attendee_name?: string;
  attendee_email?: string;
  attendee_phone?: string;
  start_time: string;
  end_time: string;
  timezone: string;
  status: string;
  provider_event_id?: string;
  created_at: string;
};
