import { getAuth } from '@clerk/nextjs/server';
import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { fileId } = req.query;

    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required' });
    }

    const { data: record, error } = await supabase
      .from('file_processing')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', userId)
      .single();

    if (error || !record) {
      return res.status(404).json({ error: 'Processing record not found' });
    }

    return res.status(200).json({
      fileId: record.id,
      fileName: record.file_name,
      status: record.status,
      chunksCount: record.chunks_count,
      errorMessage: record.error_message,
      createdAt: record.created_at,
      startedAt: record.started_at,
      completedAt: record.completed_at,
    });

  } catch (error) {
    console.error('Error fetching processing status:', error);
    return res.status(500).json({ error: error.message });
  }
}
