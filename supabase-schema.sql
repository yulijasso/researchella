-- PaperSage Database Schema for Supabase
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql/new

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- SESSIONS TABLE
-- ============================================
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  tutoring_mode TEXT DEFAULT 'direct' CHECK (tutoring_mode IN ('direct', 'interactive'))
);

-- Index for faster user queries
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);

-- Row Level Security (RLS)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
CREATE POLICY "Users can view own sessions" ON sessions
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own sessions" ON sessions
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own sessions" ON sessions
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own sessions" ON sessions
  FOR DELETE USING (auth.uid()::text = user_id);


-- ============================================
-- MESSAGES TABLE
-- ============================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  citations JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_user_id ON messages(user_id);

-- Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages" ON messages
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own messages" ON messages
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own messages" ON messages
  FOR DELETE USING (auth.uid()::text = user_id);


-- ============================================
-- UPLOADED FILES TABLE
-- ============================================
CREATE TABLE uploaded_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER,
  chunks INTEGER DEFAULT 0,
  pages INTEGER,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  pdf_data TEXT -- Base64 encoded PDF data for viewing
);

-- Indexes
CREATE INDEX idx_uploaded_files_session_id ON uploaded_files(session_id);
CREATE INDEX idx_uploaded_files_user_id ON uploaded_files(user_id);

-- Row Level Security
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own files" ON uploaded_files
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own files" ON uploaded_files
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own files" ON uploaded_files
  FOR DELETE USING (auth.uid()::text = user_id);


-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update session's updated_at timestamp
CREATE OR REPLACE FUNCTION update_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE sessions
  SET updated_at = NOW(),
      message_count = (SELECT COUNT(*) FROM messages WHERE session_id = NEW.session_id)
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session timestamp when message is added
CREATE TRIGGER update_session_on_message
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_session_timestamp();


-- ============================================
-- INITIAL DATA (Optional)
-- ============================================
-- No initial data needed


-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify your tables were created:
-- SELECT * FROM sessions;
-- SELECT * FROM messages;
-- SELECT * FROM uploaded_files;
