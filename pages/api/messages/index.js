import { supabase } from '../../../lib/supabase';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getAuth } from '@clerk/nextjs/server';

export default async function handler(req, res) {
  // Get authenticated user ID from Clerk
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized - Please sign in' });
  }

  // Use admin client to bypass RLS (since we use Clerk auth, not Supabase auth)
  const db = supabaseAdmin || supabase;

  try {
    // GET - Fetch all messages for a session
    if (req.method === 'GET') {
      const { session_id } = req.query;

      if (!session_id) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      // Verify the session belongs to the user
      const { data: session } = await db
        .from('sessions')
        .select('id')
        .eq('id', session_id)
        .eq('user_id', userId)
        .single();

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const { data, error } = await db
        .from('messages')
        .select('*')
        .eq('session_id', session_id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return res.status(200).json({ messages: data });
    }

    // POST - Create a new message
    if (req.method === 'POST') {
      const { session_id, role, content, citations } = req.body;

      if (!session_id || !role || !content) {
        return res.status(400).json({ error: 'Session ID, role, and content are required' });
      }

      // Verify the session belongs to the user
      const { data: session } = await db
        .from('sessions')
        .select('id')
        .eq('id', session_id)
        .eq('user_id', userId)
        .single();

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const { data, error } = await db
        .from('messages')
        .insert([
          {
            session_id,
            user_id: userId,
            role,
            content,
            citations: citations || null,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({ message: data });
    }

    // DELETE - Delete all messages for a session
    if (req.method === 'DELETE') {
      const { session_id } = req.body;

      if (!session_id) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      // Verify the session belongs to the user
      const { data: session } = await db
        .from('sessions')
        .select('id')
        .eq('id', session_id)
        .eq('user_id', userId)
        .single();

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const { error } = await db
        .from('messages')
        .delete()
        .eq('session_id', session_id)
        .eq('user_id', userId);

      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Messages API error:', error);
    return res.status(500).json({ error: 'Failed to process message request', details: error.message });
  }
}
