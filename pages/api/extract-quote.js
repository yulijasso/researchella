import OpenAI from 'openai';
import { getAuth } from '@clerk/nextjs/server';

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

  try {
    const { claim, chunkContent, allChunks } = req.body;

    if (!claim) {
      return res.status(400).json({ error: 'Claim is required' });
    }

    console.log(`🎯 Extracting relevant quote`);
    console.log(`   Claim: "${claim}"`);

    // If we have all chunks, search for the best matching one
    let contentToSearch = chunkContent;

    if (allChunks && allChunks.length > 0) {
      console.log(`   Searching through ${allChunks.length} chunks for best match`);

      // Find the chunk that best matches the claim
      let bestChunk = chunkContent;
      let bestScore = 0;

      const claimWords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);

      allChunks.forEach(chunk => {
        const chunkLower = chunk.toLowerCase();
        let score = 0;

        // Count matching words
        claimWords.forEach(word => {
          if (chunkLower.includes(word)) score++;
        });

        // Check for key phrases
        if (claim.toLowerCase().includes('scope') && chunkLower.includes('scope')) score += 5;
        if (claim.toLowerCase().includes('implementation') && chunkLower.includes('implementation')) score += 5;
        if (claim.toLowerCase().includes('grading') && chunkLower.includes('grading')) score += 5;
        if (claim.toLowerCase().includes('points') && chunkLower.includes('points')) score += 3;

        if (score > bestScore) {
          bestScore = score;
          bestChunk = chunk;
        }
      });

      if (bestScore > 0) {
        contentToSearch = bestChunk;
        console.log(`   Found better matching chunk (score: ${bestScore})`);
      }
    }

    console.log(`   Chunk preview: "${contentToSearch.substring(0, 150)}..."`);

    // Use GPT to extract the most relevant 1-2 sentences
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',  // Fast and cheap for extraction
      messages: [
        {
          role: 'system',
          content: `You are a precise quote extractor. Extract ONLY 1-2 sentences from the text that directly relate to the claim.

IMPORTANT RULES:
- Return EXACTLY 1-2 sentences maximum
- Use the EXACT text from the chunk (copy-paste, don't paraphrase)
- Fix spacing issues (add spaces between run-together words)
- Do NOT return the entire chunk
- Do NOT add explanations

Example:
Claim: "Students can work in pairs"
Chunk: "The project guidelines state that students may form teams. Teams of two are encouraged. Individual work is also permitted."
Output: "Teams of two are encouraged."`
        },
        {
          role: 'user',
          content: `Claim: "${claim}"

Chunk: "${chunkContent}"

Extract 1-2 relevant sentences:`
        }
      ],
      temperature: 0,  // Deterministic extraction
      max_tokens: 150,  // Limit response length
    });

    const extractedQuote = completion.choices[0].message.content.trim();

    // Clean up common PDF extraction issues
    let cleanedQuote = extractedQuote
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // Add space between camelCase
      .replace(/\s+/g, ' ')  // Normalize spaces
      .trim();

    // Safety check: If the extraction returned too much text, take first 2 sentences
    if (cleanedQuote.length > 300) {
      console.log(`⚠️  Extraction too long (${cleanedQuote.length} chars), limiting to 2 sentences`);
      const sentences = cleanedQuote.match(/[^.!?]+[.!?]+/g) || [cleanedQuote];
      cleanedQuote = sentences.slice(0, 2).join(' ').trim();
    }

    console.log(`✅ Extracted (${cleanedQuote.length} chars): "${cleanedQuote}"`);

    res.status(200).json({
      quote: cleanedQuote,
      success: true
    });

  } catch (error) {
    console.error('Error extracting quote:', error);
    res.status(500).json({
      error: 'Failed to extract quote',
      details: error.message
    });
  }
}