-- Twillo Y2K Portal - Supabase Schema
-- Run this in your Supabase project's SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_sid TEXT UNIQUE NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  twilio_number TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_to_number ON messages(to_number);
CREATE INDEX IF NOT EXISTS idx_messages_from_number ON messages(from_number);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_twilio_number ON messages(twilio_number);

-- Calls table
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_sid TEXT UNIQUE NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  twilio_number TEXT NOT NULL,
  status TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  duration INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  call_mode TEXT CHECK (call_mode IN ('browser', 'forward')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for calls
CREATE INDEX IF NOT EXISTS idx_calls_twilio_number ON calls(twilio_number);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);

-- Settings table (singleton - only one row with id=1)
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  forward_to TEXT,
  preferred_call_mode TEXT NOT NULL DEFAULT 'browser' CHECK (preferred_call_mode IN ('browser', 'forward')),
  default_caller_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT singleton_settings CHECK (id = 1)
);

-- Enable Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for messages
CREATE POLICY "Authenticated users can read all messages"
  ON messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert messages"
  ON messages FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update messages"
  ON messages FOR UPDATE
  TO service_role
  WITH CHECK (true);

-- RLS Policies for calls
CREATE POLICY "Authenticated users can read all calls"
  ON calls FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert calls"
  ON calls FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update calls"
  ON calls FOR UPDATE
  TO service_role
  WITH CHECK (true);

-- RLS Policies for settings
CREATE POLICY "Authenticated users can read settings"
  ON settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update settings"
  ON settings FOR UPDATE
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role has full access to settings"
  ON settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add tables to supabase_realtime publication for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE calls;

-- Insert default settings row
INSERT INTO settings (id, forward_to, preferred_call_mode, default_caller_id)
VALUES (1, NULL, 'browser', NULL)
ON CONFLICT (id) DO NOTHING;

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
