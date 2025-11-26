import OpenAI from 'openai';
import { searchDocuments } from '../../lib/vectorStore';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId = 'default' } = req.body;

    console.log(`🎙️ Generating podcast for session ${sessionId}`);

    // Get content from documents using vector search
    const topics = [
      "main topics and themes",
      "key concepts and definitions",
      "important facts and findings",
      "conclusions and implications",
      "methodologies and techniques"
    ];

    let allContext = [];
    for (const topic of topics) {
      const results = await searchDocuments(topic, 5, sessionId);
      allContext = [...allContext, ...results];
    }

    // Remove duplicates
    const uniqueContent = Array.from(
      new Map(allContext.map(item => [item.content, item])).values()
    );

    if (uniqueContent.length === 0) {
      return res.status(400).json({
        error: 'No content found. Please upload documents first.'
      });
    }

    console.log(`📚 Found ${uniqueContent.length} content chunks`);

    // Get unique source files
    const sources = [...new Set(uniqueContent.map(doc => doc.metadata.source))];

    // Create context string from retrieved documents
    const contextStr = uniqueContent
      .slice(0, 15)
      .map(doc => `Source: ${doc.metadata.source}\n${doc.content}`)
      .join('\n\n---\n\n');

    // Create a podcast script using GPT
    const scriptPrompt = `You are a podcast host creating an engaging audio study guide.

The user has uploaded ${sources.length} document(s): ${sources.join(', ')}.

Here is the content from their documents:

${contextStr}

Create a 3-5 minute podcast script that:
1. Starts with a warm welcome and brief introduction
2. Summarizes the key concepts from the documents in an engaging, conversational way
3. Highlights the most important takeaways
4. Ends with encouraging words for studying

Make it sound natural and conversational, like a friendly tutor explaining concepts.
Use transitions like "Let's talk about...", "Here's an interesting point...", "The key thing to remember is..."

Keep the total script to around 500-800 words for a ~3-5 minute podcast.

IMPORTANT: Just write the script text that will be spoken. No stage directions, no [pause], no speaker labels.`;

    console.log('📝 Generating podcast script with GPT-4...');

    const scriptCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a skilled podcast host and educator who creates engaging audio study guides.',
        },
        {
          role: 'user',
          content: scriptPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const script = scriptCompletion.choices[0].message.content;
    console.log(`✅ Generated script (${script.length} characters)`);

    // Convert script to speech using OpenAI TTS
    console.log('🎤 Converting script to speech...');

    const mp3Response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova', // Warm, friendly voice
      input: script,
      speed: 1.0,
    });

    // Convert response to buffer
    const buffer = Buffer.from(await mp3Response.arrayBuffer());

    // Convert buffer to base64 for client
    const base64Audio = buffer.toString('base64');
    const audioDataUrl = `data:audio/mpeg;base64,${base64Audio}`;

    console.log(`✅ Generated podcast audio (${buffer.length} bytes)`);

    return res.status(200).json({
      success: true,
      audioUrl: audioDataUrl,
      script: script,
      fileCount: sources.length,
      files: sources,
    });

  } catch (error) {
    console.error('Error generating podcast:', error);
    return res.status(500).json({
      error: 'Failed to generate podcast',
      details: error.message
    });
  }
}
