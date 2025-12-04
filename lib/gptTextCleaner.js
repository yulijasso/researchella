/**
 * GPT-based text cleaning for citation text
 * Uses GPT-4o-mini for fast, accurate text cleanup
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Cache to avoid re-cleaning the same text
const cleaningCache = new Map();
const CACHE_MAX_SIZE = 500;

/**
 * Clean text using GPT-4o-mini
 * Fixes spacing issues, concatenated words, and formatting problems
 */
export async function cleanTextWithGPT(text) {
  if (!text || text.length < 20) return text;

  // Check cache first
  const cacheKey = text.substring(0, 100); // Use first 100 chars as key
  if (cleaningCache.has(cacheKey)) {
    return cleaningCache.get(cacheKey);
  }

  // Skip if text looks clean (has reasonable word lengths)
  const words = text.split(/\s+/);
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  if (avgWordLength < 12 && !text.match(/[a-z]{20,}/)) {
    return text; // Text looks fine, skip cleaning
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Fix all spacing and word concatenation issues in this PDF-extracted text. Make it readable English.

RULES:
1. Split words stuck together (e.g., "Notethatyou" → "Note that you")
2. Fix spaces within words (e.g., "Environ ment" → "Environment")
3. Remove hyphenation from line breaks (e.g., "ex-tracted" → "extracted")
4. Keep technical terms, citations, and numbers intact
5. Return ONLY the corrected text, no explanations

Text to fix:
${text}`
      }],
      temperature: 0,
      max_tokens: Math.min(text.length * 2, 2000),
    });

    const cleaned = response.choices[0].message.content.trim();

    // Update cache
    if (cleaningCache.size >= CACHE_MAX_SIZE) {
      // Remove oldest entries
      const keysToDelete = Array.from(cleaningCache.keys()).slice(0, 100);
      keysToDelete.forEach(k => cleaningCache.delete(k));
    }
    cleaningCache.set(cacheKey, cleaned);

    return cleaned;
  } catch (error) {
    console.error('GPT text cleaning error:', error.message);
    return text; // Return original on error
  }
}

/**
 * Clean multiple citation texts in parallel
 */
export async function cleanCitationsWithGPT(citations) {
  if (!citations || citations.length === 0) return citations;

  // Clean texts that look problematic
  const cleaningPromises = citations.map(async (citation) => {
    const text = citation.text || citation.content;
    if (!text) return citation;

    // Check if text needs cleaning
    if (text.match(/[a-z]{15,}/) || text.split(/\s+/).some(w => w.length > 20)) {
      const cleaned = await cleanTextWithGPT(text);
      return { ...citation, text: cleaned, content: cleaned };
    }
    return citation;
  });

  return Promise.all(cleaningPromises);
}

export default { cleanTextWithGPT, cleanCitationsWithGPT };
