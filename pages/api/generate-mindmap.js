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
      "main concepts and ideas",
      "relationships between concepts",
      "key findings",
      "implications"
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
          content: `You are creating a hierarchical mind map from research documents. Create a structured outline showing relationships between concepts.

Format as a hierarchical structure:
# Central Topic
## Main Branch 1
### Sub-concept 1.1
- Detail
- Detail
### Sub-concept 1.2
- Detail
## Main Branch 2
### Sub-concept 2.1
...

Focus on showing connections and relationships between ideas.`
        },
        {
          role: "user",
          content: `Create a mind map from these research documents:

${contextStr}`
        }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const mindmap = completion.choices[0].message.content;

    res.status(200).json({
      success: true,
      mindmap,
      sources: uniqueContent.map(doc => doc.metadata.source)
    });

  } catch (error) {
    console.error('Mind map generation error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate mind map'
    });
  }
}
