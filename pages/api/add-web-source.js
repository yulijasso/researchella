import { getAuth } from '@clerk/nextjs/server';
import { supabase } from '../../lib/supabase';
import { supabaseAdmin } from '../../lib/supabaseServer';
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

  // Use admin client to bypass RLS (since we use Clerk auth, not Supabase auth)
  const db = supabaseAdmin || supabase;

  try {
    const { url, title, snippet, sessionId } = req.body;

    if (!url || !sessionId) {
      return res.status(400).json({ error: 'URL and session ID are required' });
    }

    console.log(`📄 Adding web source: ${title || url}`);

    // Fetch the web page content
    let content = '';
    try {
      const response = await fetch(url);
      const html = await response.text();

      // Simple HTML to text conversion (strip tags)
      content = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Fallback to snippet if content is too short
      if (content.length < 100 && snippet) {
        content = snippet;
      }
    } catch (fetchError) {
      console.error('Error fetching URL:', fetchError);
      // Use snippet as fallback
      content = snippet || 'Unable to fetch content from this URL';
    }

    // Split content into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await textSplitter.splitText(content);

    console.log(`✂️ Split into ${chunks.length} chunks`);

    // Add to vector store
    await addDocumentsToStore(
      chunks.map(chunk => ({
        content: chunk,
        metadata: {
          source: title || url,
          type: 'url',
          url: url,
        }
      })),
      sessionId,
      userId
    );

    // Save to database (store url in name for reference)
    const { data: fileData, error: dbError } = await db
      .from('uploaded_files')
      .insert({
        user_id: userId,
        session_id: sessionId,
        name: `${title || 'Web Page'}||${url}`, // Store URL with title
        type: 'url',
        chunks: chunks.length,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    console.log(`✅ Successfully added web source: ${title || url}`);

    return res.status(200).json({
      success: true,
      chunks: chunks.length,
      fileId: fileData.id,
    });

  } catch (error) {
    console.error('Error adding web source:', error);
    return res.status(500).json({
      error: 'Failed to add web source',
      details: error.message
    });
  }
}
