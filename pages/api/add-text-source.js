import { getAuth } from '@clerk/nextjs/server';
import { supabase } from '../../lib/supabase';
import { addDocumentsToStore } from '../../lib/vectorStore';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { text, title, sessionId } = req.body;

    if (!text || !sessionId) {
      return res.status(400).json({ error: 'Text and session ID are required' });
    }

    console.log(`📝 Adding pasted text source: ${title || 'Pasted text'}`);

    // Split content into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await textSplitter.splitText(text);

    console.log(`✂️ Split into ${chunks.length} chunks`);

    // Add to vector store
    await addDocumentsToStore(
      chunks.map(chunk => ({
        content: chunk,
        metadata: {
          source: title || 'Pasted text',
          type: 'text',
        }
      })),
      sessionId,
      userId
    );

    // Save to database
    const { data: fileData, error: dbError } = await supabase
      .from('uploaded_files')
      .insert({
        user_id: userId,
        session_id: sessionId,
        name: title || 'Pasted text',
        type: 'text',
        chunks: chunks.length,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    console.log(`✅ Successfully added pasted text: ${title || 'Pasted text'}`);

    return res.status(200).json({
      success: true,
      chunks: chunks.length,
      fileId: fileData.id,
      title: title || 'Pasted text',
    });

  } catch (error) {
    console.error('Error adding text source:', error);
    return res.status(500).json({
      error: 'Failed to add text source',
      details: error.message
    });
  }
}
