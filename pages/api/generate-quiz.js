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
          content: `Create a quiz from these research documents:

${contextStr}`
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

    res.status(200).json({
      success: true,
      questions,
      sources: uniqueContent.map(doc => doc.metadata.source)
    });

  } catch (error) {
    console.error('Quiz generation error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate quiz'
    });
  }
}
