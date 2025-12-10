import OpenAI from "openai";
import { searchDocuments } from "../../lib/vectorStore";
import { getAuth } from "@clerk/nextjs/server";
import { rateLimit } from "../../lib/rateLimit";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const { sessionId = 'default', selectedSources = [] } = req.body;

    // Get comprehensive content from all uploaded documents
    console.log(`Generating audio overview for session: ${sessionId}`);

    // Search for broad topics to get representative content
    const topics = [
      "main topic and subject matter",
      "key findings and results",
      "methodology and approach",
      "conclusions and implications"
    ];

    let allContext = [];
    for (const topic of topics) {
      const results = await searchDocuments(topic, 5, sessionId);
      allContext = [...allContext, ...results];
    }

    // Deduplicate content
    const uniqueContent = Array.from(
      new Map(allContext.map(item => [item.content, item])).values()
    );

    if (uniqueContent.length === 0) {
      return res.status(400).json({
        error: 'No content found. Please upload documents first.'
      });
    }

    // Build context string
    const contextStr = uniqueContent
      .slice(0, 15) // Limit to prevent token overflow
      .map(doc => `Source: ${doc.metadata.source}\n${doc.content}`)
      .join('\n\n---\n\n');

    // Generate podcast-style dialogue using GPT-4
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are creating a podcast-style audio overview dialogue between two hosts discussing research documents.

Generate an engaging, natural conversation between:
- Host 1 (Alex): An enthusiastic educator who asks questions and guides the discussion
- Host 2 (Jamie): A knowledgeable expert who explains concepts clearly

Guidelines:
- Make it conversational and engaging, like a real podcast
- Use natural speech patterns, including filler words occasionally
- Break down complex concepts into digestible explanations
- Include interesting insights and "aha!" moments
- Keep the tone informative but accessible
- Aim for ~800-1000 words total (about 5-7 minutes of dialogue)
- End with key takeaways

Format each line as:
**Alex:** [dialogue]
**Jamie:** [dialogue]`
        },
        {
          role: "user",
          content: `Create an engaging podcast-style discussion about these research documents:

${contextStr}

Make it informative, engaging, and easy to understand!`
        }
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });

    const dialogue = completion.choices[0].message.content;

    res.status(200).json({
      success: true,
      dialogue,
      sources: uniqueContent.map(doc => doc.metadata.source)
    });

  } catch (error) {
    console.error('Audio overview generation error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate audio overview'
    });
  }
}
