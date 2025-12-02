-- Migration: Create conversation_summaries table
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Create the conversation_summaries table
CREATE TABLE IF NOT EXISTS conversation_summaries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    summary_text TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    first_message_id UUID,
    last_message_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_conv_summaries_session_id ON conversation_summaries(session_id);
CREATE INDEX IF NOT EXISTS idx_conv_summaries_user_id ON conversation_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_summaries_session_user ON conversation_summaries(session_id, user_id);
CREATE INDEX IF NOT EXISTS idx_conv_summaries_created_at ON conversation_summaries(created_at DESC);

-- Enable Row Level Security
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own summaries
CREATE POLICY "Users can read own summaries" ON conversation_summaries
    FOR SELECT
    USING (user_id = auth.jwt() ->> 'sub' OR user_id = current_setting('request.jwt.claim.sub', true));

-- Policy: Users can only insert their own summaries
CREATE POLICY "Users can insert own summaries" ON conversation_summaries
    FOR INSERT
    WITH CHECK (user_id = auth.jwt() ->> 'sub' OR user_id = current_setting('request.jwt.claim.sub', true));

-- Policy: Users can only delete their own summaries
CREATE POLICY "Users can delete own summaries" ON conversation_summaries
    FOR DELETE
    USING (user_id = auth.jwt() ->> 'sub' OR user_id = current_setting('request.jwt.claim.sub', true));

-- Add a comment describing the table
COMMENT ON TABLE conversation_summaries IS 'Stores AI-generated summaries of conversation history for hierarchical memory management';

-- Function to auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_conversation_summaries_updated_at ON conversation_summaries;
CREATE TRIGGER update_conversation_summaries_updated_at
    BEFORE UPDATE ON conversation_summaries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (if using service role key, this allows full access)
-- Note: RLS policies above restrict access to user's own data
GRANT ALL ON conversation_summaries TO anon;
GRANT ALL ON conversation_summaries TO authenticated;
GRANT ALL ON conversation_summaries TO service_role;
