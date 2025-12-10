import OpenAI from "openai";
import { searchDocuments } from "../../lib/vectorStore";
import { supabase } from "../../lib/supabase";
import { getAuth } from "@clerk/nextjs/server";
import { rateLimit } from "../../lib/rateLimit";

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
      if (!image.pdf_data) continue;

      console.log(`Analyzing image for flashcards: ${image.name}`);

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe this image in detail for creating educational flashcards. Focus on: key concepts shown, diagrams, labels, data, and any important information that could be tested. Be thorough but concise.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: image.pdf_data,
                  detail: 'low',
                },
              },
            ],
          },
        ],
        max_tokens: 400,
      });

      descriptions.push({
        name: image.name,
        description: response.choices[0].message.content,
      });
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

  // Get authenticated user ID from Clerk
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized - Please sign in' });
  }

  // Check rate limit
  const allowed = await rateLimit(req, res, userId, 'generate');
  if (!allowed) return;

  try {
    const { sessionId = 'default' } = req.body;

    console.log(`Generating flashcards for session ${sessionId}`);

    // Fetch images from the database for this session
    let imageDescriptions = [];
    try {
      const { data: images, error: imgError } = await supabase
        .from('uploaded_files')
        .select('name, pdf_data')
        .eq('session_id', sessionId)
        .eq('type', 'image');

      if (!imgError && images && images.length > 0) {
        console.log(`Found ${images.length} images for session`);
        imageDescriptions = await analyzeImages(images);
        console.log(`Analyzed ${imageDescriptions.length} images`);
      }
    } catch (err) {
      console.error('Error fetching images:', err.message);
    }

    // Get content from documents
    const topics = [
      "key concepts and definitions",
      "important facts and findings",
      "methodologies and techniques",
      "conclusions and implications"
    ];

    let allContext = [];
    for (const topic of topics) {
      const results = await searchDocuments(topic, 5, sessionId);
      allContext = [...allContext, ...results];
    }

    const uniqueContent = Array.from(
      new Map(allContext.map(item => [item.content, item])).values()
    );

    if (uniqueContent.length === 0 && imageDescriptions.length === 0) {
      return res.status(400).json({
        error: 'No content found. Please upload documents or images first.'
      });
    }

    const contextStr = uniqueContent
      .slice(0, 10)
      .map(doc => `Source: ${doc.metadata.source}\n${doc.content}`)
      .join('\n\n---\n\n');

    // Create image context string
    const imageContextStr = imageDescriptions.length > 0
      ? '\n\nIMAGES/DIAGRAMS:\n' + imageDescriptions
          .map(img => `Image "${img.name}":\n${img.description}`)
          .join('\n\n')
      : '';

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are creating study flashcards from research documents. Generate 10-15 high-quality flashcards covering key concepts, definitions, and important facts.

Format each flashcard as:
Q: [Question]
A: [Answer]

Make questions clear and concise. Answers should be informative but not too long.`
        },
        {
          role: "user",
          content: `Create study flashcards from these research materials:
${contextStr ? `\nDOCUMENTS:\n${contextStr}` : ''}${imageContextStr}`
        }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = completion.choices[0].message.content;

    // Parse flashcards
    const flashcards = [];
    const lines = content.split('\n');
    let currentCard = null;

    for (const line of lines) {
      if (line.startsWith('Q:')) {
        if (currentCard) {
          flashcards.push(currentCard);
        }
        currentCard = { question: line.substring(2).trim(), answer: '' };
      } else if (line.startsWith('A:') && currentCard) {
        currentCard.answer = line.substring(2).trim();
      }
    }

    if (currentCard && currentCard.answer) {
      flashcards.push(currentCard);
    }

    // Combine document sources and image names
    const allSources = [
      ...uniqueContent.map(doc => doc.metadata.source),
      ...imageDescriptions.map(img => img.name)
    ];

    console.log(`Generated ${flashcards.length} flashcards from ${uniqueContent.length} docs and ${imageDescriptions.length} images`);

    res.status(200).json({
      success: true,
      flashcards,
      sources: allSources,
      imageCount: imageDescriptions.length
    });

  } catch (error) {
    console.error('Flashcards generation error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate flashcards'
    });
  }
}
