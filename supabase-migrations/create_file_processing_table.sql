-- Create file_processing table for tracking async file processing
CREATE TABLE IF NOT EXISTS file_processing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  s3_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending_upload',
  chunks_count INTEGER,
  error_message TEXT,
  ecs_task_arn TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_file_processing_user_session
  ON file_processing(user_id, session_id);

CREATE INDEX IF NOT EXISTS idx_file_processing_status
  ON file_processing(status);

-- Enable RLS
ALTER TABLE file_processing ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own processing records
CREATE POLICY "Users can view own processing records" ON file_processing
  FOR SELECT USING (auth.uid()::text = user_id OR user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can insert own processing records" ON file_processing
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own processing records" ON file_processing
  FOR UPDATE USING (true);
