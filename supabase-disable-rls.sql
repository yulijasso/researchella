-- Disable Row Level Security for Clerk Authentication
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/kzhrwscngmclqntitual/sql/new

-- Since we're using Clerk for authentication instead of Supabase Auth,
-- we need to disable RLS policies that expect Supabase auth.uid()

-- Disable RLS on sessions table
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;

-- Disable RLS on messages table
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;

-- Disable RLS on uploaded_files table
ALTER TABLE uploaded_files DISABLE ROW LEVEL SECURITY;

-- Drop existing policies (optional - they won't be enforced anyway)
DROP POLICY IF EXISTS "Users can view own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON sessions;

DROP POLICY IF EXISTS "Users can view own messages" ON messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON messages;

DROP POLICY IF EXISTS "Users can view own files" ON uploaded_files;
DROP POLICY IF EXISTS "Users can insert own files" ON uploaded_files;
DROP POLICY IF EXISTS "Users can delete own files" ON uploaded_files;
