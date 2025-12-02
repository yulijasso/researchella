import OpenAI from 'openai';
import { searchDocuments } from '../../lib/vectorStore';
import { supabase } from '../../lib/supabase';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Analyze images using GPT-4 Vision and return descriptions
 */
async function analyzeImages(images) {
  if (!images || images.length === 0) return [];

  const descriptions = [];

  for (const image of images) {
    try {
      // Skip if no base64 data
      if (!image.pdf_data) continue;

      console.log(`🖼️ Analyzing image: ${image.name}`);

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe this image in detail for an educational podcast. Focus on: key visual elements, diagrams, charts, labels, and any important information shown. Keep the description concise but informative (2-3 sentences).',
              },
              {
                type: 'image_url',
                image_url: {
                  url: image.pdf_data, // Already in data:image/... format
                  detail: 'low', // Use low detail to save tokens
                },
              },
            ],
          },
        ],
        max_tokens: 300,
      });

      descriptions.push({
        name: image.name,
        description: response.choices[0].message.content,
      });

      console.log(`✅ Analyzed image: ${image.name}`);
    } catch (error) {
      console.error(`Error analyzing image ${image.name}:`, error.message);
    }
  }

  return descriptions;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId = 'default' } = req.body;

    console.log(`🎙️ Generating podcast for session ${sessionId}`);

    // Fetch images from the database for this session
    let imageDescriptions = [];
    try {
      const { data: images, error: imgError } = await supabase
        .from('uploaded_files')
        .select('name, pdf_data')
        .eq('session_id', sessionId)
        .eq('type', 'image');

      if (!imgError && images && images.length > 0) {
        console.log(`🖼️ Found ${images.length} images for session`);
        imageDescriptions = await analyzeImages(images);
        console.log(`✅ Analyzed ${imageDescriptions.length} images`);
      }
    } catch (err) {
      console.error('Error fetching images:', err.message);
    }

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

    if (uniqueContent.length === 0 && imageDescriptions.length === 0) {
      return res.status(400).json({
        error: 'No content found. Please upload documents or images first.'
      });
    }

    console.log(`📚 Found ${uniqueContent.length} content chunks`);

    // Get unique source files
    const sources = [...new Set(uniqueContent.map(doc => doc.metadata.source))];

    // Create context string from retrieved documents
    const contextStr = uniqueContent.length > 0
      ? uniqueContent
          .slice(0, 15)
          .map(doc => `Source: ${doc.metadata.source}\n${doc.content}`)
          .join('\n\n---\n\n')
      : '';

    // Create image descriptions context
    const imageContextStr = imageDescriptions.length > 0
      ? '\n\nIMAGES/DIAGRAMS:\n' + imageDescriptions
          .map(img => `Image "${img.name}": ${img.description}`)
          .join('\n\n')
      : '';

    // Build content description
    const contentParts = [];
    if (sources.length > 0) contentParts.push(`${sources.length} document(s): ${sources.join(', ')}`);
    if (imageDescriptions.length > 0) contentParts.push(`${imageDescriptions.length} image(s): ${imageDescriptions.map(i => i.name).join(', ')}`);
    const contentDescription = contentParts.join(' and ');

    // Create a NotebookLM-style two-host dialogue script
    const scriptPrompt = `You are writing a script for an Audio Overview featuring TWO hosts having an engaging conversation about the user's documents. This should feel like a "deep dive" podcast discussion.

The user has uploaded ${contentDescription}.
${contextStr ? `\nHere is the content from their documents:\n\n${contextStr}` : ''}
${imageContextStr}

Write a dialogue between two hosts (Alex and Sam) discussing this material. Follow this style:

DIALOGUE STRUCTURE:
- Alternate between the two hosts naturally
- Mix short, punchy statements with longer explanations
- Use frequent affirmations: "Right," "Exactly," "Absolutely," "That's a great point"
- Include rhetorical questions to transition between topics
- One host can set up topics, the other can elaborate

TONE & LANGUAGE:
- Informal and accessible - use contractions ("it's", "that's", "we're")
- Enthusiastic and energetic throughout
- Use phrases like "You know," "I mean," "Here's the thing"
- Sound genuinely curious and excited about the material
- Make complex ideas accessible without dumbing them down

CONTENT FLOW:
1. Start with an enthusiastic welcome and hook about what they'll discuss
2. Dive into the main concepts - have hosts build on each other's points
3. If there are images/diagrams, discuss what they show and why they're interesting
4. Highlight surprising or important insights
5. End with key takeaways and an encouraging sign-off

FORMAT YOUR OUTPUT EXACTLY LIKE THIS:
ALEX: [Alex's line]
SAM: [Sam's line]
ALEX: [Alex's line]
...and so on

Keep it around 600-900 words total for a ~4-6 minute audio overview.`;

    console.log('📝 Generating Audio Overview script with GPT-4...');

    const scriptCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at creating engaging two-host podcast dialogues in the style of NotebookLM Audio Overviews. Your conversations feel natural, energetic, and educational.',
        },
        {
          role: 'user',
          content: scriptPrompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 2500,
    });

    const script = scriptCompletion.choices[0].message.content;
    console.log(`✅ Generated script (${script.length} characters)`);

    // Parse the script into individual host lines
    const lines = script.split('\n').filter(line => line.trim());
    const alexLines = [];
    const samLines = [];
    const orderedLines = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('ALEX:')) {
        const text = trimmed.replace('ALEX:', '').trim();
        if (text) {
          alexLines.push(text);
          orderedLines.push({ host: 'alex', text });
        }
      } else if (trimmed.startsWith('SAM:')) {
        const text = trimmed.replace('SAM:', '').trim();
        if (text) {
          samLines.push(text);
          orderedLines.push({ host: 'sam', text });
        }
      }
    }

    console.log(`📊 Parsed ${alexLines.length} Alex lines, ${samLines.length} Sam lines`);

    // Generate audio for each host with different voices
    console.log('🎤 Converting script to speech with two voices...');

    const audioBuffers = [];

    for (const line of orderedLines) {
      const voice = line.host === 'alex' ? 'onyx' : 'nova'; // onyx = male, nova = female

      const mp3Response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: voice,
        input: line.text,
        speed: 1.0,
      });

      const buffer = Buffer.from(await mp3Response.arrayBuffer());
      audioBuffers.push(buffer);
    }

    // Simple concatenation of MP3 buffers (works for basic playback)
    const combinedBuffer = Buffer.concat(audioBuffers);

    // Convert buffer to base64 for client
    const base64Audio = combinedBuffer.toString('base64');
    const audioDataUrl = `data:audio/mpeg;base64,${base64Audio}`;

    console.log(`✅ Generated Audio Overview (${combinedBuffer.length} bytes, ${orderedLines.length} segments)`);

    // Combine document sources and image names
    const allFiles = [...sources, ...imageDescriptions.map(i => i.name)];

    return res.status(200).json({
      success: true,
      audioUrl: audioDataUrl,
      script: script,
      fileCount: allFiles.length,
      files: allFiles,
      imageCount: imageDescriptions.length,
    });

  } catch (error) {
    console.error('Error generating podcast:', error);
    return res.status(500).json({
      error: 'Failed to generate podcast',
      details: error.message
    });
  }
}
