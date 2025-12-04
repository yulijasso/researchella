import { getAuth } from '@clerk/nextjs/server';
import {
  getUserSessions,
  ensureSession,
  updateSession,
  deleteSession,
  useMongoDb,
} from '../../../lib/dbHelpers';

export default async function handler(req, res) {
  // Get authenticated user ID from Clerk
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized - Please sign in' });
  }

  console.log(`📦 Sessions API using ${useMongoDb ? 'MongoDB' : 'Supabase'}`);

  try {
    // GET - Fetch all sessions for the user
    if (req.method === 'GET') {
      const sessions = await getUserSessions(userId);
      return res.status(200).json({ sessions });
    }

    // POST - Create a new session (or return existing one)
    if (req.method === 'POST') {
      const { id, name, tutoring_mode = 'direct' } = req.body;

      if (!id || !name) {
        return res.status(400).json({ error: 'Session ID and name are required' });
      }

      // ensureSession creates or returns existing session
      await ensureSession(id, userId, name);

      // Return the session data
      return res.status(201).json({
        session: {
          id,
          user_id: userId,
          name,
          tutoring_mode,
          message_count: 0,
        }
      });
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

      const { data, error } = await updateSession(id, userId, updates);

      if (error) {
        console.error('Session update error:', error);
        throw error;
      }

      return res.status(200).json({ session: data });
    }

    // DELETE - Delete a session
    if (req.method === 'DELETE') {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      const { error } = await deleteSession(id, userId);

      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Sessions API error:', error);
    return res.status(500).json({ error: 'Failed to process session request', details: error.message });
  }
}
