import { getAuth } from '@clerk/nextjs/server';
import { supabase } from '../../lib/supabase';
import { addDocumentsToStore } from '../../lib/vectorStore';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Innertube } from 'youtubei.js';

// Extract video ID from various YouTube URL formats
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { url, sessionId } = req.body;

    if (!url || !sessionId) {
      return res.status(400).json({ error: 'URL and session ID are required' });
    }

    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    console.log(`🎬 Fetching YouTube transcript for video: ${videoId}`);

    // Initialize YouTube client
    const youtube = await Innertube.create({
      lang: 'en',
      location: 'US',
      retrieve_player: false,
    });

    // Get video info
    let videoInfo;
    try {
      videoInfo = await youtube.getInfo(videoId);
    } catch (infoError) {
      console.error('Error getting video info:', infoError);
      return res.status(400).json({
        error: 'Could not fetch video information. The video may be private or unavailable.',
        details: infoError.message
      });
    }

    const title = videoInfo.basic_info?.title || `YouTube Video (${videoId})`;
    const author = videoInfo.basic_info?.author || 'Unknown';
    console.log(`📝 Video title: ${title}`);

    // Get transcript
    let transcript;
    try {
      const transcriptData = await videoInfo.getTranscript();

      if (!transcriptData || !transcriptData.transcript?.content?.body?.initial_segments) {
        return res.status(400).json({
          error: 'No transcript available for this video. It may not have captions enabled.'
        });
      }

      transcript = transcriptData.transcript.content.body.initial_segments;
    } catch (transcriptError) {
      console.error('Transcript error:', transcriptError);
      return res.status(400).json({
        error: 'Could not fetch transcript. The video may not have captions available.',
        details: transcriptError.message
      });
    }

    if (!transcript || transcript.length === 0) {
      return res.status(400).json({
        error: 'No transcript available for this video. It may not have captions enabled.'
      });
    }

    // Filter only actual transcript segments (skip headers)
    const transcriptSegments = transcript.filter(seg =>
      seg.type === 'TranscriptSegment' && seg.snippet?.text
    );

    // Build transcript data for storage and display
    const transcriptForDisplay = transcriptSegments.map(segment => {
      const startMs = parseInt(segment.start_ms) || 0;
      const minutes = Math.floor(startMs / 60000);
      const seconds = Math.floor((startMs % 60000) / 1000);
      return {
        timestamp: `${minutes}:${seconds.toString().padStart(2, '0')}`,
        startMs: startMs,
        text: segment.snippet.text.replace(/\n/g, ' ').trim()
      };
    });

    // Combine transcript segments into full text with timestamps for RAG
    const fullText = transcriptForDisplay.map(seg =>
      `[${seg.timestamp}] ${seg.text}`
    ).join('\n');

    console.log(`✂️ Transcript length: ${fullText.length} characters`);

    // Split content into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await textSplitter.splitText(fullText);
    console.log(`✂️ Split into ${chunks.length} chunks`);

    // Add to vector store
    await addDocumentsToStore(
      chunks.map(chunk => ({
        content: chunk,
        metadata: {
          source: title,
          type: 'youtube',
          url: `https://www.youtube.com/watch?v=${videoId}`,
          author: author,
          videoId: videoId,
        }
      })),
      sessionId,
      userId
    );

    // Save to database (store videoId in name for URL construction later)
    const { data: fileData, error: dbError } = await supabase
      .from('uploaded_files')
      .insert({
        user_id: userId,
        session_id: sessionId,
        name: `${title}||${videoId}`, // Store videoId with title for URL reconstruction
        type: 'youtube',
        chunks: chunks.length,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    console.log(`✅ Successfully added YouTube video: ${title}`);

    return res.status(200).json({
      success: true,
      chunks: chunks.length,
      fileId: fileData.id,
      title: title,
      author: author,
      videoId: videoId,
      transcript: transcriptForDisplay, // Return transcript for UI display
      duration: videoInfo.basic_info?.duration || null,
      thumbnail: videoInfo.basic_info?.thumbnail?.[0]?.url || null,
    });

  } catch (error) {
    console.error('Error adding YouTube source:', error);
    return res.status(500).json({
      error: 'Failed to add YouTube source',
      details: error.message
    });
  }
}
