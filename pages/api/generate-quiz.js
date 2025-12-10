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

      console.log(`Analyzing image for quiz: ${image.name}`);

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe this image in detail for creating quiz questions. Focus on: key concepts shown, diagrams, labels, data, relationships, and any important information that could be tested. Be thorough but concise.',
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

    console.log(`Generating quiz for session ${sessionId}`);

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
      "main concepts and theories",
      "research findings and results",
      "methodologies and approaches",
      "implications and applications"
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
          content: `You are creating a multiple-choice quiz from research documents. Generate 8-10 challenging questions that test understanding of key concepts.

Format each question as:
Q[N]: [Question text]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
CORRECT: [Letter of correct answer]
EXPLANATION: [Brief explanation of why the answer is correct]

Make questions thought-provoking and test deep understanding, not just memorization.`
        },
        {
          role: "user",
          content: `Create a quiz from these research materials:
${contextStr ? `\nDOCUMENTS:\n${contextStr}` : ''}${imageContextStr}`
        }
      ],
      temperature: 0.7,
      max_tokens: 2500,
    });

    const content = completion.choices[0].message.content;

    // Parse quiz questions
    const questions = [];
    const questionBlocks = content.split(/Q\d+:/).filter(block => block.trim());

    for (const block of questionBlocks) {
      const lines = block.split('\n').filter(line => line.trim());
      if (lines.length < 6) continue;

      const questionText = lines[0].trim();
      const options = [];
      let correct = '';
      let explanation = '';

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.match(/^[A-D]\)/)) {
          options.push(line);
        } else if (line.startsWith('CORRECT:')) {
          correct = line.substring(8).trim();
        } else if (line.startsWith('EXPLANATION:')) {
          explanation = line.substring(12).trim();
        }
      }

      if (questionText && options.length === 4 && correct) {
        questions.push({
          question: questionText,
          options,
          correct,
          explanation
        });
      }
    }

    // Combine document sources and image names
    const allSources = [
      ...uniqueContent.map(doc => doc.metadata.source),
      ...imageDescriptions.map(img => img.name)
    ];

    console.log(`Generated ${questions.length} quiz questions from ${uniqueContent.length} docs and ${imageDescriptions.length} images`);

    res.status(200).json({
      success: true,
      questions,
      sources: allSources,
      imageCount: imageDescriptions.length
    });

  } catch (error) {
    console.error('Quiz generation error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate quiz'
    });
  }
}
