// Line tracking utilities for precise PDF-to-response mapping

/**
 * Create a line index from text content
 * @param {string} text - The full text content
 * @param {string} source - Source file name
 * @param {number} pageNumber - Page number in PDF
 */
export function createLineIndex(text, source, pageNumber = 1) {
  const lines = text.split('\n');
  const lineIndex = [];
  let charOffset = 0;

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const lineLength = line.length + 1; // +1 for newline character

    lineIndex.push({
      lineNumber,
      pageNumber,
      source,
      text: line,
      charStart: charOffset,
      charEnd: charOffset + lineLength,
      normalizedText: line.toLowerCase().replace(/\s+/g, ' ').trim()
    });

    charOffset += lineLength;
  });

  return lineIndex;
}

/**
 * Find which lines a text chunk spans
 * @param {string} chunkText - The chunk text
 * @param {Array} lineIndex - The line index
 */
export function findChunkLineSpan(chunkText, lineIndex) {
  const normalizedChunk = chunkText.toLowerCase().replace(/\s+/g, ' ').trim();

  let bestMatch = {
    startLine: null,
    endLine: null,
    confidence: 0
  };

  // Try to find exact match first
  for (let i = 0; i < lineIndex.length; i++) {
    let accumulated = '';
    let matchStart = i;

    for (let j = i; j < lineIndex.length; j++) {
      accumulated += lineIndex[j].normalizedText + ' ';
      const normalizedAccum = accumulated.trim();

      if (normalizedAccum.includes(normalizedChunk) || normalizedChunk.includes(normalizedAccum)) {
        const overlap = Math.min(normalizedChunk.length, normalizedAccum.length);
        const confidence = overlap / normalizedChunk.length;

        if (confidence > bestMatch.confidence) {
          bestMatch = {
            startLine: lineIndex[matchStart].lineNumber,
            endLine: lineIndex[j].lineNumber,
            pageNumber: lineIndex[matchStart].pageNumber,
            confidence
          };
        }

        if (confidence > 0.9) break; // Good enough match
      }

      // Stop if we've gone too far
      if (normalizedAccum.length > normalizedChunk.length * 1.5) break;
    }
  }

  return bestMatch;
}

/**
 * Match an LLM response sentence to PDF lines
 * @param {string} sentence - A sentence from the LLM response
 * @param {Array} lineIndices - Array of line indices from all chunks
 */
export function matchSentenceToLines(sentence, lineIndices) {
  const normalizedSentence = sentence.toLowerCase().replace(/\s+/g, ' ').trim();

  // Extract key phrases (3+ word sequences)
  const phrases = [];
  const words = normalizedSentence.split(' ');
  for (let i = 0; i <= words.length - 3; i++) {
    phrases.push(words.slice(i, i + 3).join(' '));
  }

  let bestMatch = null;
  let bestScore = 0;

  // Search through all line indices
  lineIndices.forEach(lineIndex => {
    lineIndex.forEach(line => {
      let score = 0;

      // Check how many key phrases appear in this line
      phrases.forEach(phrase => {
        if (line.normalizedText.includes(phrase)) {
          score += phrase.split(' ').length; // Weight by phrase length
        }
      });

      // Bonus for exact sentence match
      if (line.normalizedText.includes(normalizedSentence)) {
        score += 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          lineNumber: line.lineNumber,
          pageNumber: line.pageNumber,
          source: line.source,
          text: line.text,
          confidence: score / (phrases.length * 3) // Normalize score
        };
      }
    });
  });

  return bestMatch;
}

/**
 * Create a mapping between LLM response and PDF lines
 * @param {string} llmResponse - The full LLM response
 * @param {Array} retrievedDocs - The chunks used to generate the response
 */
export function createResponseLineMapping(llmResponse, retrievedDocs) {
  // Split response into sentences
  const sentences = llmResponse
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 10);

  const mapping = [];

  sentences.forEach(sentence => {
    // Extract citation if present
    const citationMatch = sentence.match(/\[CHUNK-(\d+)(?::[^\]]+)?\]/);

    if (citationMatch) {
      const chunkId = parseInt(citationMatch[1]);
      const chunk = retrievedDocs[chunkId - 1];

      if (chunk && chunk.metadata) {
        mapping.push({
          sentence: sentence.replace(/\[CHUNK-\d+[^\]]*\]/g, '').trim(),
          citation: citationMatch[0],
          source: chunk.metadata.source,
          page: chunk.metadata.page,
          startLine: chunk.metadata.startLine || null,
          endLine: chunk.metadata.endLine || null,
          chunkContent: chunk.content
        });
      }
    }
  });

  return mapping;
}

/**
 * Enhanced chunk creation with line tracking
 */
export function createChunksWithLineTracking(text, source, pageNumber = 1) {
  const lineIndex = createLineIndex(text, source, pageNumber);
  const chunks = [];

  const chunkSize = 200;
  const overlap = 100;

  for (let i = 0; i < text.length; i += (chunkSize - overlap)) {
    const chunkText = text.substring(i, i + chunkSize);

    if (chunkText.trim().length > 20) {
      const lineSpan = findChunkLineSpan(chunkText, lineIndex);

      chunks.push({
        content: chunkText,
        metadata: {
          source,
          page: pageNumber,
          type: 'document',
          startLine: lineSpan.startLine,
          endLine: lineSpan.endLine,
          lineSpan: `Lines ${lineSpan.startLine}-${lineSpan.endLine}`,
          lineConfidence: lineSpan.confidence
        }
      });
    }
  }

  return { chunks, lineIndex };
}