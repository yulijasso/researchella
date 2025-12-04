import { getAuth } from '@clerk/nextjs/server';
import {
  getSessionMessages,
  insertMessage,
  ensureSession,
  useMongoDb,
  getDb,
} from '../../../lib/dbHelpers';

// For MongoDB operations we need direct access
let mongoLib = null;
async function getMongoLib() {
  if (!mongoLib && useMongoDb) {
    mongoLib = await import('../../../lib/mongodb.js');
  }
  return mongoLib;
}

export default async function handler(req, res) {
  // Get authenticated user ID from Clerk
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized - Please sign in' });
  }

  console.log(`📦 Messages API using ${useMongoDb ? 'MongoDB' : 'Supabase'}`);

  try {
    // GET - Fetch all messages for a session
    if (req.method === 'GET') {
      const { session_id } = req.query;

      if (!session_id) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      const messages = await getSessionMessages(session_id, userId);
      return res.status(200).json({ messages });
    }

    // POST - Create a new message
    if (req.method === 'POST') {
      const { session_id, role, content, citations } = req.body;

      if (!session_id || !role || !content) {
        return res.status(400).json({ error: 'Session ID, role, and content are required' });
      }

      // Ensure session exists
      await ensureSession(session_id, userId);

      const { data, error } = await insertMessage({
        session_id,
        user_id: userId,
        role,
        content,
        sources: citations || null,
      });

      if (error) throw error;

      return res.status(201).json({ message: data });
    }

    // DELETE - Delete all messages for a session
    if (req.method === 'DELETE') {
      const { session_id } = req.body;

      if (!session_id) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      if (useMongoDb) {
        const mongo = await getMongoLib();
        await mongo.connectToDatabase();
        await mongo.Message.deleteMany({ sessionId: session_id, userId });
        return res.status(200).json({ success: true });
      }

      // Supabase path
      const db = await getDb();
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
