/**
 * Verbatim Quote Matching System
 * Finds exact matches of quoted text in PDF chunks
 */

/**
 * Find exact quote in chunks
 * @param {string} quote - The verbatim quote from citation
 * @param {Array} chunks - All retrieved chunks
 * @returns {Object} The matching chunk and position
 */
export function findExactQuote(quote, chunks) {
  // Normalize quote for searching (but keep original for display)
  const normalizedQuote = quote.trim();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const content = chunk.content || chunk;

    // Check for exact match
    if (content.includes(normalizedQuote)) {
      const position = content.indexOf(normalizedQuote);

      return {
        found: true,
        chunkIndex: i,
        chunkId: i + 1, // 1-indexed for display
        chunk: chunk,
        position: position,
        matchedText: normalizedQuote,
        confidence: 1.0, // Exact match = 100% confidence
        context: getQuoteContext(content, position, normalizedQuote.length)
      };
    }
  }

  // If exact match not found, try with normalized spacing
  const relaxedQuote = normalizedQuote.replace(/\s+/g, ' ');

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const content = (chunk.content || chunk).replace(/\s+/g, ' ');

    if (content.includes(relaxedQuote)) {
      const position = content.indexOf(relaxedQuote);

      return {
        found: true,
        chunkIndex: i,
        chunkId: i + 1,
        chunk: chunk,
        position: position,
        matchedText: relaxedQuote,
        confidence: 0.95, // Slightly lower confidence for normalized match
        context: getQuoteContext(content, position, relaxedQuote.length)
      };
    }
  }

  return {
    found: false,
    error: 'Quote not found in any chunk',
    quote: normalizedQuote
  };
}

/**
 * Get context around a quote
 * @param {string} text - Full text
 * @param {number} position - Start position of quote
 * @param {number} quoteLength - Length of the quote
 * @returns {Object} Context before and after the quote
 */
function getQuoteContext(text, position, quoteLength) {
  const contextLength = 50; // Characters before/after to include

  const before = text.substring(
    Math.max(0, position - contextLength),
    position
  ).trim();

  const after = text.substring(
    position + quoteLength,
    Math.min(text.length, position + quoteLength + contextLength)
  ).trim();

  return { before, after };
}

/**
 * Validate and correct citations using verbatim quotes
 * @param {Array} citations - Citations with quotes
 * @param {Array} chunks - All retrieved chunks
 * @returns {Array} Corrected citations
 */
export function validateCitationsWithQuotes(citations, chunks) {
  return citations.map(citation => {
    // If no quote provided, can't validate
    if (!citation.quote) {
      return {
        ...citation,
        validated: false,
        reason: 'No quote provided'
      };
    }

    // Find where this quote actually appears
    const match = findExactQuote(citation.quote, chunks);

    if (match.found) {
      // Check if cited chunk matches actual chunk
      const citedCorrectly = citation.chunkId === match.chunkId;

      return {
        ...citation,
        validated: true,
        correctChunkId: match.chunkId,
        actualChunk: match.chunk,
        citedCorrectly,
        confidence: match.confidence,
        context: match.context,
        // If wrong chunk cited, note the correction
        correction: citedCorrectly ? null :
          `Quote found in CHUNK-${match.chunkId}, not CHUNK-${citation.chunkId}`
      };
    }

    return {
      ...citation,
      validated: false,
      reason: 'Quote not found in chunks',
      quote: citation.quote
    };
  });
}

/**
 * Extract all verbatim quotes from LLM response
 * @param {string} response - The LLM response
 * @returns {Array} Array of quotes with their citations
 */
export function extractVerbatimQuotes(response) {
  const quotes = [];
  const pattern = /\[CHUNK-(\d+):"([^"]+)"\]/g;
  let match;

  while ((match = pattern.exec(response)) !== null) {
    quotes.push({
      fullCitation: match[0],
      chunkId: parseInt(match[1]),
      quote: match[2],
      position: match.index
    });
  }

  return quotes;
}

/**
 * Create a quote-to-line mapping
 * @param {string} quote - Verbatim quote
 * @param {Array} lineIndex - Line index from PDF
 * @returns {Object} Line numbers where quote appears
 */
export function mapQuoteToLines(quote, lineIndex) {
  const normalizedQuote = quote.toLowerCase().replace(/\s+/g, ' ');

  // Build full text from lines
  let fullText = '';
  const lineMap = [];

  lineIndex.forEach(line => {
    const startPos = fullText.length;
    fullText += line.text + '\n';
    lineMap.push({
      ...line,
      startPos,
      endPos: fullText.length
    });
  });

  const normalizedText = fullText.toLowerCase().replace(/\s+/g, ' ');
  const quotePos = normalizedText.indexOf(normalizedQuote);

  if (quotePos === -1) {
    return { found: false };
  }

  // Find which lines the quote spans
  let startLine = null;
  let endLine = null;

  for (const line of lineMap) {
    if (line.startPos <= quotePos && quotePos < line.endPos) {
      startLine = line.lineNumber;
    }
    if (line.startPos <= quotePos + normalizedQuote.length &&
        quotePos + normalizedQuote.length <= line.endPos) {
      endLine = line.lineNumber;
    }
  }

  return {
    found: true,
    startLine: startLine || 1,
    endLine: endLine || startLine || 1,
    pageNumber: lineIndex[0]?.pageNumber || 1,
    quote: quote
  };
}

/**
 * Enhanced citation with verbatim matching
 * @param {string} llmResponse - The LLM response
 * @param {Array} chunks - Retrieved chunks
 * @returns {Object} Enhanced citation data
 */
export function enhanceCitationsWithVerbatim(llmResponse, chunks) {
  // Extract all verbatim quotes
  const quotes = extractVerbatimQuotes(llmResponse);

  // Validate each quote
  const validatedQuotes = quotes.map(q => {
    const match = findExactQuote(q.quote, chunks);
    return {
      ...q,
      ...match
    };
  });

  // Create final citation mapping
  const citations = {};
  validatedQuotes.forEach(vq => {
    if (vq.found) {
      citations[vq.chunkId] = {
        id: vq.chunkId,
        quote: vq.quote,
        chunk: vq.chunk,
        confidence: vq.confidence,
        context: vq.context
      };
    }
  });

  return {
    citations,
    validatedQuotes,
    totalQuotes: quotes.length,
    foundQuotes: validatedQuotes.filter(q => q.found).length
  };
}