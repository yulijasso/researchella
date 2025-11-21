import OpenAI from 'openai';
import { getAuth } from '@clerk/nextjs/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Calculate cosine similarity between two vectors
function cosineSimilarity(vec1, vec2) {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (norm1 * norm2);
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

  try {
    const { claim, chunks } = req.body;

    if (!claim || !chunks || !Array.isArray(chunks)) {
      return res.status(400).json({ error: 'Claim and chunks are required' });
    }

    console.log(`🔍 Semantic search for claim: "${claim.substring(0, 100)}..."`);
    console.log(`   Searching through ${chunks.length} chunks`);

    // Extract all sentences from all chunks
    const allSentences = [];
    chunks.forEach((chunk, chunkIdx) => {
      // Split chunk into sentences
      const sentences = chunk.content
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .filter(s => s.trim().length > 20);

      sentences.forEach((sentence, sentIdx) => {
        allSentences.push({
          text: sentence.trim(),
          chunkIdx,
          sentIdx,
          source: chunk.source,
          page: chunk.page
        });
      });
    });

    if (allSentences.length === 0) {
      return res.status(200).json({
        matchedText: chunks[0]?.content || claim,
        score: 0
      });
    }

    console.log(`   Found ${allSentences.length} sentences to search`);

    // Get embedding for the claim
    const claimEmbedding = await openai.embeddings.create({
      input: claim,
      model: "text-embedding-3-large",
      dimensions: 1024
    });

    // Get embeddings for all sentences (batch for efficiency)
    const sentenceTexts = allSentences.map(s => s.text);

    // OpenAI has a limit on batch size, so we may need to batch
    const batchSize = 100;
    const sentenceEmbeddings = [];

    for (let i = 0; i < sentenceTexts.length; i += batchSize) {
      const batch = sentenceTexts.slice(i, i + batchSize);
      const batchEmbeddings = await openai.embeddings.create({
        input: batch,
        model: "text-embedding-3-large",
        dimensions: 1024
      });
      sentenceEmbeddings.push(...batchEmbeddings.data);
    }

    // Calculate cosine similarity for each sentence
    const claimVector = claimEmbedding.data[0].embedding;
    const similarities = allSentences.map((sentence, idx) => ({
      ...sentence,
      similarity: cosineSimilarity(claimVector, sentenceEmbeddings[idx].embedding)
    }));

    // Sort by similarity and get top matches
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topMatches = similarities.slice(0, 3);

    console.log(`   Top matches:`);
    topMatches.forEach((match, idx) => {
      console.log(`     [${idx + 1}] Score: ${match.similarity.toFixed(4)} - "${match.text.substring(0, 60)}..."`);
    });

    // Get the best match and some surrounding context if available
    const bestMatch = topMatches[0];
    let matchedText = bestMatch.text;

    // Try to add some context - get adjacent sentences if they're from the same chunk
    const adjacentSentences = similarities.filter(s =>
      s.chunkIdx === bestMatch.chunkIdx &&
      Math.abs(s.sentIdx - bestMatch.sentIdx) <= 1
    ).sort((a, b) => a.sentIdx - b.sentIdx);

    if (adjacentSentences.length > 1) {
      matchedText = adjacentSentences.map(s => s.text).join(' ');
    }

    res.status(200).json({
      matchedText,
      score: bestMatch.similarity,
      source: bestMatch.source,
      page: bestMatch.page,
      topMatches: topMatches.map(m => ({
        text: m.text,
        score: m.similarity,
        source: m.source,
        page: m.page
      }))
    });

  } catch (error) {
    console.error('Error in semantic citation search:', error);
    res.status(500).json({
      error: 'Failed to find matching text',
      details: error.message
    });
  }
}