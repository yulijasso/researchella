import { getAuth } from '@clerk/nextjs/server';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Check if Google Custom Search API credentials are configured
    if (!process.env.GOOGLE_SEARCH_API_KEY || !process.env.GOOGLE_SEARCH_ENGINE_ID) {
      console.warn('⚠️ Google Custom Search not configured. Web search is disabled.');
      return res.status(503).json({
        error: 'Web search not configured',
        message: 'Please add GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID to your environment variables to enable web search.',
        results: []
      });
    }

    // Use Google Custom Search API
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=5`;

    const response = await fetch(searchUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Search API error:', errorText);
      throw new Error('Search API failed');
    }

    const data = await response.json();

    // Format results
    const results = (data.items || []).map(item => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet || '',
    }));

    console.log(`🔍 Found ${results.length} results for "${query}"`);

    return res.status(200).json({ results });

  } catch (error) {
    console.error('Web search error:', error);
    return res.status(500).json({
      error: 'Failed to search the web',
      details: error.message
    });
  }
}
