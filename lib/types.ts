// TypeScript types for the application

export interface TwilioNumber {
  sid: string;
  phone_number: string;
  friendly_name: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
}

export interface Message {
  id?: string;
  message_sid: string;
  from_number: string;
  to_number: string;
  body: string;
  direction: 'inbound' | 'outbound';
  status: string;
  created_at: string;
}

export interface Call {
  id?: string;
  call_sid: string;
  from_number: string;
  to_number: string;
  direction: 'inbound' | 'outbound';
  status: string;
  duration?: number;
  created_at: string;
  ended_at?: string;
}

export interface Settings {
  id?: string;
  user_email: string;
  forward_to?: string;
  call_mode?: 'browser' | 'forward';
  default_caller_id?: string;
  theme?: 'dark' | 'light';
}

export interface SupabaseUser {
  id: string;
  email: string;
}
