import OpenAI from "openai";
import { searchDocuments } from "../../lib/vectorStore";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId = 'default' } = req.body;

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

    if (uniqueContent.length === 0) {
      return res.status(400).json({
        error: 'No content found. Please upload documents first.'
      });
    }

    const contextStr = uniqueContent
      .slice(0, 10)
      .map(doc => `Source: ${doc.metadata.source}\n${doc.content}`)
      .join('\n\n---\n\n');

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
          content: `Create study flashcards from these research documents:

${contextStr}`
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

    res.status(200).json({
      success: true,
      flashcards,
      sources: uniqueContent.map(doc => doc.metadata.source)
    });

  } catch (error) {
    console.error('Flashcards generation error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate flashcards'
    });
  }
}
