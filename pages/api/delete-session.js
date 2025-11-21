import { getAuth } from '@clerk/nextjs/server';
import { deleteSessionVectors } from '../../lib/vectorStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get authenticated user ID from Clerk
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized - Please sign in' });
  }

  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    console.log(`🗑️  Deleting session ${sessionId} for user ${userId}`);

    // Delete all vectors for this session from Pinecone
    await deleteSessionVectors(userId, sessionId);

    console.log(`✅ Successfully deleted session ${sessionId} from vector database`);

    res.status(200).json({
      success: true,
      message: 'Session deleted from vector database'
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session from vector database' });
  }
}
