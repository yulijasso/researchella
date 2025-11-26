import { getAuth } from '@clerk/nextjs/server';
import { initializeVectorStore } from '../../lib/vectorStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId query param required' });
  }

  try {
    const store = await initializeVectorStore();

    console.log(`🔍 DEBUG: Checking Pinecone for user ${userId}, session ${sessionId}`);

    // Search WITHOUT any source filter - just session and user
    const filter = { sessionId, userId };

    // Use a generic query to find ANY documents
    const results = await store.similaritySearchWithScore("content information data", 50, filter);

    console.log(`📊 Found ${results.length} documents for this session`);

    // Extract unique sources
    const sources = new Map();
    results.forEach(([doc, score]) => {
      const source = doc.metadata.source || 'unknown';
      const sourceNormalized = doc.metadata.sourceNormalized || 'unknown';
      if (!sources.has(source)) {
        sources.set(source, {
          source,
          sourceNormalized,
          count: 0,
          samples: [],
          sessionId: doc.metadata.sessionId,
          userId: doc.metadata.userId,
        });
      }
      const info = sources.get(source);
      info.count++;
      if (info.samples.length < 2) {
        info.samples.push({
          content: doc.pageContent.substring(0, 200) + '...',
          score
        });
      }
    });

    const response = {
      requestParams: {
        userId,
        sessionId,
        filter
      },
      totalDocuments: results.length,
      uniqueSources: Array.from(sources.values()),
      rawResults: results.slice(0, 5).map(([doc, score]) => ({
        source: doc.metadata.source,
        sourceNormalized: doc.metadata.sourceNormalized,
        sessionId: doc.metadata.sessionId,
        userId: doc.metadata.userId,
        type: doc.metadata.type,
        score,
        content: doc.pageContent.substring(0, 150) + '...'
      }))
    };

    console.log('📋 Debug response:', JSON.stringify(response, null, 2));

    return res.status(200).json(response);
  } catch (error) {
    console.error('Debug endpoint error:', error);
    return res.status(500).json({ error: error.message });
  }
}
