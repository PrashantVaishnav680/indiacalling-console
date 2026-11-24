export interface BolnaVoiceConfig {
  provider: string; // e.g., 'elevenlabs', 'polly', 'deepgram', 'sarvam', 'cartesia'
  voice_id: string;
  voiceName?: string;
  model?: string;
  language?: string;
  speed?: number;
  pitch?: number;
  temperature?: number;
}

export interface BolnaAgentConfig {
  agent_name: string;
  agent_type: "inbound" | "outbound" | "both" | string;
  agent_welcome_message: string;
  webhook_url?: string;
  aiHangupEnabled?: boolean;
  calling_guardrails?: {
    call_start_hour: number;
    call_end_hour: number;
  };
  call_summary_enabled?: boolean;
  tasks?: Array<{
    task_type: string;
    tools_config?: Record<string, any>;
    task_config?: Record<string, any>;
    toolchain?: Record<string, any>;
    prompt?: string;
  }>;
  llm_config?: {
    provider?: string;
    model: string;
    agent_flow_type?: string;
    system_prompt: string;
    max_tokens?: number;
    temperature?: number;
  };
  synthesizer_config?: BolnaVoiceConfig;
  transcriber_config?: {
    provider: string;
    language: string;
    model?: string;
  };
  call_transfer_config?: {
    enabled: boolean;
    destination_number: string;
    department?: string;
    pre_transfer_message?: string;
  };
  telephony_config?: {
    provider: string;
    phone_number?: string;
    max_duration_seconds?: number;
    hangup_after_silence?: number;
  };
}

export interface BolnaAgentResponse {
  agent_id: string;
  version_id?: string;
  agent_name: string;
  status: string;
  created_at: string;
  updated_at?: string;
  raw?: Record<string, any>;
  simulated?: boolean;
}

export interface BolnaCallRequest {
  agent_id: string;
  recipient_phone_number: string;
  from_phone_number?: string;
  scheduled_at?: string;
  webhook_url?: string;
  user_data?: Record<string, any>;
  agent_data?: {
    language?: string;
    voice_id?: string;
  };
  bypass_call_guardrails?: boolean;
  call_metadata?: Record<string, any>;
}

export interface BolnaCallResponse {
  call_id: string;
  execution_id: string;
  status: "initiated" | "queued" | "failed" | "in-progress" | string;
  agent_id: string;
  created_at: string;
  simulated?: boolean;
}

export interface BolnaExecutionRecord {
  id: string;
  execution_id?: string;
  call_id?: string;
  agent_id: string;
  batch_id?: string | null;
  status: string;
  direction?: string;
  termination_reason?: string | null;
  conversation_duration: number;
  duration_seconds?: number;
  duration?: number;
  total_cost?: number;
  transcript?: string | Array<{ speaker: string; text: string; timestamp?: string | number }>;
  summary?: string | null;
  extracted_data?: Record<string, any> | null;
  user_number?: string;
  agent_number?: string;
  recipient_phone_number?: string;
  recording_url?: string;
  created_at?: string;
  updated_at?: string;
  telephony_data?: {
    duration?: number;
    to_number?: string;
    from_number?: string;
    recording_url?: string | null;
    call_type?: "outbound" | "inbound" | string;
    provider?: string;
    hangup_by?: string;
    hangup_reason?: string;
  };
  cost_breakdown?: Record<string, number>;
  [key: string]: any;
}

export interface BolnaCallDetails {
  call_id: string;
  execution_id: string;
  agent_id?: string;
  status: string;
  direction?: "inbound" | "outbound" | "web_call";
  recipient_phone_number?: string;
  duration_seconds: number;
  total_cost?: number;
  recording_url?: string;
  transcript_text?: string;
  transcript?: Array<{
    speaker: "assistant" | "user" | "agent" | "customer" | "system";
    text: string;
    timestamp?: string | number;
  }>;
  extracted_data?: Record<string, any>;
  summary?: string;
  termination_reason?: string;
  created_at?: string;
  ended_at?: string;
}

export interface BolnaWebhookPayload {
  id?: string;
  event_id?: string;
  event_type?: string;
  status?: string;
  call_id?: string;
  execution_id?: string;
  agent_id?: string;
  conversation_duration?: number;
  total_cost?: number;
  transcript?: string | Array<{ speaker: string; text: string; timestamp?: string | number }>;
  summary?: string;
  extracted_data?: Record<string, any>;
  telephony_data?: {
    duration?: number;
    to_number?: string;
    from_number?: string;
    recording_url?: string;
    call_type?: string;
    provider?: string;
    hangup_by?: string;
    hangup_reason?: string;
  };
  timestamp?: string;
  created_at?: string;
  updated_at?: string;
  data?: {
    duration_seconds?: number;
    recording_url?: string;
    transcript?: Array<{
      speaker: string;
      text: string;
      timestamp?: string | number;
    }>;
    extracted_data?: {
      lead_qualified?: boolean;
      qualification_score?: number;
      interest_level?: "high" | "medium" | "low";
      customer_budget?: string;
      purchase_timeline?: string;
      summary?: string;
    };
    hangup_reason?: string;
  };
}
