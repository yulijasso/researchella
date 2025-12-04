import { supabase } from '../../../lib/supabase';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getAuth } from '@clerk/nextjs/server';

export default async function handler(req, res) {
  // Get authenticated user ID from Clerk
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized - Please sign in' });
  }

  // Use admin client to bypass RLS (since we're using Clerk auth, not Supabase auth)
  const db = supabaseAdmin || supabase;

  try {
    // GET - Fetch all sessions for the user
    if (req.method === 'GET') {
      const { data, error } = await db
        .from('sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return res.status(200).json({ sessions: data });
    }

    // POST - Create a new session
    if (req.method === 'POST') {
      const { id, name, tutoring_mode = 'direct' } = req.body;

      if (!id || !name) {
        return res.status(400).json({ error: 'Session ID and name are required' });
      }

      const { data, error } = await db
        .from('sessions')
        .insert([
          {
            id,
            user_id: userId,
            name,
            tutoring_mode,
            message_count: 0,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({ session: data });
    }

    // PATCH - Update an existing session
    if (req.method === 'PATCH') {
      const { id, name, tutoring_mode } = req.body;

      console.log('PATCH session request:', { id, name, userId });

      if (!id) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (tutoring_mode !== undefined) updates.tutoring_mode = tutoring_mode;

      console.log('Updates to apply:', updates);

      const { data, error } = await db
        .from('sessions')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select();

      console.log('Supabase response:', { data, error });

      if (error) {
        console.error('Supabase update error:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.error('No session found to update. ID:', id, 'User:', userId);
        return res.status(404).json({ error: 'Session not found or you do not have permission to update it' });
      }

      return res.status(200).json({ session: data[0] });
    }

    // DELETE - Delete a session
    if (req.method === 'DELETE') {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      // Delete will cascade to messages and uploaded_files due to foreign key constraints
      const { error } = await db
        .from('sessions')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Sessions API error:', error);
    return res.status(500).json({ error: 'Failed to process session request', details: error.message });
  }
}
