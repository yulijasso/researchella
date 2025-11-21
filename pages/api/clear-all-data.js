import { clearVectorStore } from '../../lib/vectorStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🗑️  Clearing all data from Pinecone...');
    await clearVectorStore();
    console.log('✅ All data cleared successfully');

    res.status(200).json({
      success: true,
      message: 'All data has been cleared from the vector store'
    });
  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).json({
      error: error.message || 'Failed to clear data'
    });
  }
}
