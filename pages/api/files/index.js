import { supabase } from '../../../lib/supabase';
import { getAuth } from '@clerk/nextjs/server';

export default async function handler(req, res) {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const { session_id } = req.query;

      if (!session_id) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      const { data, error } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('session_id', session_id)
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: true });

      if (error) throw error;

      return res.status(200).json({ files: data });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'File ID is required' });
      }

      const { error } = await supabase
        .from('uploaded_files')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Files API error:', error);
    return res.status(500).json({ error: 'Failed to process request' });
  }
}
