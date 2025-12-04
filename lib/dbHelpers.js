// Database helper functions for robust file/session handling
import { supabase } from './supabase';
import { supabaseAdmin } from './supabaseServer';

// Get the database client (prefer admin to bypass RLS)
export function getDb() {
  return supabaseAdmin || supabase;
}

/**
 * Safely insert a file record, creating the session if it doesn't exist
 * This handles the foreign key constraint by auto-creating sessions
 */
export async function safeInsertFile(fileData) {
  const db = getDb();
  const { session_id, user_id } = fileData;

  // First attempt to insert
  let { data, error } = await db
    .from('uploaded_files')
    .insert(fileData)
    .select()
    .single();

  // If foreign key error, create session and retry
  if (error && error.code === '23503') {
    console.log(`⚠️ Session ${session_id} doesn't exist, creating it...`);

    // Create session
    const { error: sessionError } = await db
      .from('sessions')
      .upsert({
        id: session_id,
        user_id: user_id,
        name: 'New Notebook',
        tutoring_mode: 'direct',
        message_count: 0,
      }, { onConflict: 'id' });

    if (sessionError) {
      console.error('Failed to create session:', sessionError);
      return { data: null, error: sessionError };
    }

    console.log(`✅ Created session ${session_id}, retrying file insert...`);

    // Retry file insert
    const retryResult = await db
      .from('uploaded_files')
      .insert(fileData)
      .select()
      .single();

    data = retryResult.data;
    error = retryResult.error;
  }

  return { data, error };
}

/**
 * Ensure a session exists in the database
 */
export async function ensureSession(sessionId, userId, name = 'New Notebook') {
  const db = getDb();

  const { error } = await db
    .from('sessions')
    .upsert({
      id: sessionId,
      user_id: userId,
      name: name,
      tutoring_mode: 'direct',
      message_count: 0,
    }, { onConflict: 'id' });

  if (error) {
    console.error('Failed to ensure session:', error);
    return false;
  }

  return true;
}
