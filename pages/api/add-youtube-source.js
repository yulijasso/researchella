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
    let youtube;
    try {
      console.log('📡 Creating Innertube client...');
      youtube = await Innertube.create({
        lang: 'en',
        location: 'US',
        retrieve_player: false,
      });
      console.log('✅ Innertube client created');
    } catch (createError) {
      console.error('❌ Error creating Innertube client:', createError);
      return res.status(500).json({
        error: 'Failed to initialize YouTube client',
        details: createError.message
      });
    }

    // Get video info
    let videoInfo;
    try {
      console.log('📡 Fetching video info...');
      videoInfo = await youtube.getInfo(videoId);
      console.log('✅ Got video info');
    } catch (infoError) {
      console.error('❌ Error getting video info:', infoError);
      return res.status(400).json({
        error: 'Could not fetch video information. The video may be private or unavailable.',
        details: infoError.message
      });
    }

    const title = videoInfo.basic_info?.title || `YouTube Video (${videoId})`;
    const author = videoInfo.basic_info?.author || 'Unknown';
    const description = videoInfo.basic_info?.short_description || '';
    const duration = videoInfo.basic_info?.duration || 0;
    const viewCount = videoInfo.basic_info?.view_count || 0;
    const keywords = videoInfo.basic_info?.keywords || [];

    console.log(`📝 Video title: ${title}`);
    console.log(`📝 Author: ${author}`);
    console.log(`📝 Description length: ${description.length} chars`);

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

    // Build video metadata summary for RAG context
    const durationStr = duration ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : 'Unknown';
    const viewStr = viewCount ? viewCount.toLocaleString() : 'Unknown';

    const videoSummary = [
      `VIDEO TITLE: ${title}`,
      `CHANNEL/AUTHOR: ${author}`,
      `DURATION: ${durationStr}`,
      viewCount ? `VIEWS: ${viewStr}` : null,
      keywords.length > 0 ? `TOPICS: ${keywords.slice(0, 10).join(', ')}` : null,
      description ? `\nVIDEO DESCRIPTION:\n${description}` : null,
      `\n---\nTRANSCRIPT:\n`
    ].filter(Boolean).join('\n');

    // Combine transcript segments into full text with timestamps for RAG
    const transcriptText = transcriptForDisplay.map(seg =>
      `[${seg.timestamp}] ${seg.text}`
    ).join('\n');

    // Full text includes video context + transcript
    const fullText = videoSummary + transcriptText;

    console.log(`✂️ Transcript length: ${transcriptText.length} characters`);
    console.log(`✂️ Full content length: ${fullText.length} characters`);

    // Split content into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await textSplitter.splitText(fullText);
    console.log(`✂️ Split into ${chunks.length} chunks`);

    // Add to vector store with rich metadata
    await addDocumentsToStore(
      chunks.map((chunk, idx) => ({
        content: chunk,
        metadata: {
          source: title,
          type: 'youtube',
          url: `https://www.youtube.com/watch?v=${videoId}`,
          author: author,
          videoId: videoId,
          description: description ? description.substring(0, 500) : '', // First 500 chars of description
          chunkIndex: idx,
          totalChunks: chunks.length,
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
      description: description,
      transcript: transcriptForDisplay, // Return transcript for UI display
      duration: duration || null,
      thumbnail: videoInfo.basic_info?.thumbnail?.[0]?.url || null,
      viewCount: viewCount || null,
      keywords: keywords.slice(0, 10),
    });

  } catch (error) {
    console.error('Error adding YouTube source:', error);
    return res.status(500).json({
      error: 'Failed to add YouTube source',
      details: error.message
    });
  }
}
