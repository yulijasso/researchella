import { getAuth } from '@clerk/nextjs/server';
import {
  getSessionFiles,
  deleteFile,
  useMongoDb,
  getDb,
} from '../../lib/dbHelpers';

// For MongoDB operations we need direct access
let mongoLib = null;
async function getMongoLib() {
  if (!mongoLib && useMongoDb) {
    mongoLib = await import('../../lib/mongodb.js');
  }
  return mongoLib;
}

export default async function handler(req, res) {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log(`📦 Files API using ${useMongoDb ? 'MongoDB' : 'Supabase'}`);

  // GET - List files for a session
  if (req.method === 'GET') {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    try {
      const files = await getSessionFiles(session_id, userId);
      return res.status(200).json({ files: files || [] });
    } catch (error) {
      console.error('Error fetching files:', error);
      return res.status(500).json({ error: 'Failed to fetch files' });
    }
  }

  // PATCH - Rename file
  if (req.method === 'PATCH') {
    const { id, name } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'File ID and name are required' });
    }

    try {
      if (useMongoDb) {
        const mongo = await getMongoLib();
        await mongo.connectToDatabase();

        // Get file first
        const file = await mongo.File.findOne({ _id: id, userId });
        if (!file) {
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

        file.name = newName;
        await file.save();

        return res.status(200).json({
          success: true,
          file: {
            id: file._id.toString(),
            name: file.name,
            type: file.type,
          }
        });
      }

      // Supabase path
      const db = await getDb();

      // First get the current file to check ownership and get type
      const { data: file, error: fetchError } = await db
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
      const { data, error } = await db
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
      const { error } = await deleteFile(id, userId);

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
