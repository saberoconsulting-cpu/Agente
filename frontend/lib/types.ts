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
  recent_events: Array<{
    event_type: string;
    aggregate_type: string | null;
    aggregate_id: string | null;
    created_at: string;
  }>;
};

export type AgentSettings = {
  settings: {
    agent_name: string;
    tone: string;
    llm_provider: string;
    llm_model: string;
    system_rules: string;
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
