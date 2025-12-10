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
    const { sessionId = 'default' } = req.body;

    // Get comprehensive content
    const topics = [
      "introduction and background",
      "methodology and approach",
      "results and findings",
      "discussion and analysis",
      "conclusions and future work"
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
      .slice(0, 15)
      .map(doc => `Source: ${doc.metadata.source}\n${doc.content}`)
      .join('\n\n---\n\n');

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are creating a comprehensive analysis report from research documents. Create a well-structured report with the following sections:

## Executive Summary
[Brief overview of the research]

## Key Findings
[Main discoveries and results]

## Methodology
[Research approaches used]

## Detailed Analysis
[In-depth examination of the content]

## Implications
[What this means for the field]

## Recommendations
[Suggestions for future work]

## Conclusion
[Final thoughts and takeaways]

Make it professional, comprehensive, and well-organized.`
        },
        {
          role: "user",
          content: `Create a comprehensive analysis report from these research documents:

${contextStr}`
        }
      ],
      temperature: 0.7,
      max_tokens: 3000,
    });

    const report = completion.choices[0].message.content;

    res.status(200).json({
      success: true,
      report,
      sources: uniqueContent.map(doc => doc.metadata.source)
    });

  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate report'
    });
  }
}
