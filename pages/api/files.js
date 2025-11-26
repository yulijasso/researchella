import { getAuth } from '@clerk/nextjs/server';
import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // PATCH - Rename file
  if (req.method === 'PATCH') {
    const { id, name } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'File ID and name are required' });
    }

    try {
      // First get the current file to check ownership and get type
      const { data: file, error: fetchError } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (fetchError || !file) {
        return res.status(404).json({ error: 'File not found' });
      }

      // For YouTube/URL sources, preserve the ||videoId or ||url suffix
      let newName = name;
      if (file.type === 'youtube' && file.name.includes('||')) {
        const videoId = file.name.split('||')[1];
        newName = `${name}||${videoId}`;
      } else if (file.type === 'url' && file.name.includes('||')) {
        const url = file.name.split('||')[1];
        newName = `${name}||${url}`;
      }

      // Update the file name
      const { data, error } = await supabase
        .from('uploaded_files')
        .update({ name: newName })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('Error renaming file:', error);
        return res.status(500).json({ error: 'Failed to rename file' });
      }

      return res.status(200).json({ success: true, file: data });
    } catch (error) {
      console.error('Error renaming file:', error);
      return res.status(500).json({ error: 'Failed to rename file' });
    }
  }

  // DELETE - Delete file
  if (req.method === 'DELETE') {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    try {
      const { error } = await supabase
        .from('uploaded_files')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('Error deleting file:', error);
        return res.status(500).json({ error: 'Failed to delete file' });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting file:', error);
      return res.status(500).json({ error: 'Failed to delete file' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
