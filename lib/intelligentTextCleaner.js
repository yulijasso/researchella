/**
 * Intelligent text cleaning for PDF extractions
 * Fixes common issues: concatenated words, split words, citation formatting
 */

class IntelligentTextCleaner {
  constructor() {
    // Common academic patterns that need fixing
    this.academicPatterns = [
      // Fix "Liuetal." -> "Liu et al."
      { pattern: /([A-Z][a-z]+)etal\./g, replacement: '$1 et al.' },
      // Fix "etal.2019" -> "et al., 2019"
      { pattern: /etal\.(\d{4})/g, replacement: 'et al., $1' },
      // Add period after year before capital letter
      { pattern: /(\d{4})([A-Z])/g, replacement: '$1. $2' },
      // Add space between lowercase and capital (but not in acronyms)
      { pattern: /([a-z])([A-Z])/g, replacement: '$1 $2' },
    ];

    // Common spacing issues in PDFs
    this.spacingPatterns = [
      // Remove spaces before punctuation
      { pattern: /\s+([.,;:!?\)])/g, replacement: '$1' },
      // Add space after punctuation if missing
      { pattern: /([.,;:!?])([A-Za-z])/g, replacement: '$1 $2' },
      // Fix spaces within common words
      { pattern: /\b(t|w|c|d|f|g|h|j|k|l|m|n|p|q|r|s|v|x|y|z)\s+([a-z]{2,})\b/gi, replacement: this.checkSingleLetterSplit.bind(this) },
    ];

    // Common terms that get split in PDFs
    this.commonTerms = {
      'dataset': /data\s+set/gi,
      'baseline': /base\s+line/gi,
      'network': /net\s+work/gi,
      'framework': /frame\s+work/gi,
      'benchmark': /bench\s+mark/gi,
      'performance': /perfor\s+mance/gi,
      'demonstrate': /demonst\s+rate/gi,
      'evaluation': /evalu\s+ation/gi,
      'experiment': /experi\s+ment/gi,
      'implementation': /implement\s+ation/gi,
      'optimization': /optimi\s+zation/gi,
      'association': /associ\s+ation/gi,
      'computational': /comput\s+ational/gi,
      'linguistics': /lingu\s+istics/gi,
    };

    // Common words that should not be split
    this.commonWords = new Set([
      'the', 'with', 'this', 'that', 'what', 'when', 'where', 'which', 'while',
      'their', 'there', 'these', 'those', 'they', 'them', 'then', 'than', 'thus',
      'can', 'will', 'would', 'could', 'should', 'might', 'must', 'shall',
      'have', 'has', 'had', 'does', 'did', 'are', 'was', 'were', 'been',
    ]);
  }

  checkSingleLetterSplit(match, letter, rest) {
    const combined = letter.toLowerCase() + rest.toLowerCase();
    if (this.commonWords.has(combined)) {
      // Preserve original capitalization
      if (match[0] === match[0].toUpperCase()) {
        return combined.charAt(0).toUpperCase() + combined.slice(1);
      }
      return combined;
    }
    return match;
  }

  // Dictionary of common English words for segmentation
  getWordDictionary() {
    if (!this._wordDict) {
      this._wordDict = new Set([
        // Common short words
        'a', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is', 'it',
        'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we',
        // 3-letter words
        'all', 'and', 'any', 'are', 'but', 'can', 'did', 'end', 'for', 'get', 'got',
        'had', 'has', 'her', 'him', 'his', 'how', 'its', 'let', 'may', 'new', 'not',
        'now', 'off', 'old', 'one', 'our', 'out', 'own', 'put', 'say', 'see', 'she',
        'the', 'too', 'two', 'use', 'was', 'way', 'who', 'why', 'yes', 'yet', 'you',
        // 4-letter words
        'also', 'back', 'been', 'both', 'call', 'come', 'code', 'data', 'does', 'done',
        'down', 'each', 'even', 'find', 'from', 'give', 'good', 'half', 'have', 'help',
        'here', 'high', 'into', 'just', 'keep', 'know', 'last', 'left', 'like', 'long',
        'look', 'made', 'make', 'many', 'more', 'most', 'much', 'must', 'need', 'next',
        'note', 'only', 'over', 'part', 'same', 'said', 'show', 'side', 'some', 'such',
        'take', 'tell', 'text', 'than', 'that', 'them', 'then', 'this', 'time', 'turn',
        'upon', 'used', 'very', 'want', 'well', 'were', 'what', 'when', 'will', 'with',
        'word', 'work', 'year', 'your',
        // 5-letter words
        'about', 'above', 'after', 'again', 'being', 'below', 'could', 'every', 'first',
        'found', 'great', 'group', 'input', 'large', 'later', 'learn', 'level', 'might',
        'model', 'never', 'often', 'order', 'other', 'point', 'right', 'shall', 'since',
        'small', 'state', 'still', 'study', 'their', 'there', 'these', 'thing', 'think',
        'those', 'three', 'under', 'using', 'value', 'where', 'which', 'while', 'world',
        'would', 'write', 'young',
        // 6-letter words
        'almost', 'always', 'answer', 'become', 'before', 'better', 'change', 'course',
        'during', 'either', 'enough', 'figure', 'follow', 'having', 'little', 'making',
        'method', 'number', 'output', 'people', 'result', 'should', 'simple', 'system',
        'taking', 'things', 'though', 'toward', 'within', 'writer',
        // 7+ letter words
        'writing', 'project', 'another', 'because', 'between', 'chapter', 'develop',
        'example', 'however', 'include', 'problem', 'process', 'provide', 'section',
        'through', 'without', 'working', 'approach', 'different', 'important',
        // Additional common words
        'results', 'shows', 'method', 'works', 'consider', 'carefully', 'actually',
        'probably', 'certainly', 'perhaps', 'already', 'whether', 'itself', 'himself',
        'herself', 'themselves', 'anything', 'everything', 'something', 'nothing',
        'anyone', 'everyone', 'someone', 'someone', 'paper', 'papers', 'research',
        'analysis', 'based', 'using', 'show', 'work', 'best', 'test', 'case', 'least'
      ]);
    }
    return this._wordDict;
  }

  // Dynamic programming word segmentation - STRICT dictionary-only
  segmentWords(text) {
    const dict = this.getWordDictionary();
    const n = text.length;

    // dp[i] = { words: [], score: number } - best segmentation ending at position i
    const dp = new Array(n + 1).fill(null);
    dp[0] = { words: [], score: 0, dictWords: 0 };

    for (let i = 1; i <= n; i++) {
      for (let j = Math.max(0, i - 15); j < i; j++) { // Max word length of 15
        const word = text.slice(j, i);

        // STRICT: Only accept dictionary words (2+ chars)
        if (!dict.has(word)) continue;

        if (dp[j] !== null) {
          // Score: prefer more dictionary words and longer words
          const newScore = dp[j].score + word.length * 10 + 50; // Bonus for each dict word
          const newDictWords = dp[j].dictWords + 1;

          if (dp[i] === null || newScore > dp[i].score ||
              (newScore === dp[i].score && newDictWords > dp[i].dictWords)) {
            dp[i] = {
              words: [...dp[j].words, word],
              score: newScore,
              dictWords: newDictWords
            };
          }
        }
      }
    }

    // If we found a valid segmentation with multiple dictionary words
    if (dp[n] && dp[n].words.length > 1 && dp[n].dictWords >= 2) {
      return dp[n].words.join(' ');
    }

    // Fallback: return original
    return text;
  }

  fixConcatenatedWords(text) {
    // Split camelCase that shouldn't be (except for known terms)
    text = text.replace(/([a-z])([A-Z])/g, (match, lower, upper) => {
      // Preserve known camelCase terms (like RoBERTa, BERT, etc.)
      const word = match;
      if (/^(RoBERTa|BERT|GPT|LSTM|CNN|RNN|NLP|API|URL|JSON|XML|HTML|CSS|JS)/.test(word)) {
        return match;
      }
      return lower + ' ' + upper;
    });

    // Use dynamic programming word segmentation for long concatenated strings
    // Lowered threshold to 9 chars to catch more cases like "workswell"
    text = text.replace(/\b([a-zA-Z]{9,})\b/g, (match) => {
      // Skip known technical terms
      if (/^(implementation|administration|representation|transportation|communication|documentation|functionality|understanding|approximately|infrastructure|characteristics|recommendations|acknowledgements|responsibilities|accomplishments|internationalization)s?$/i.test(match)) {
        return match;
      }

      const segmented = this.segmentWords(match.toLowerCase());

      // Only use segmentation if it found multiple words
      if (segmented.includes(' ')) {
        // Preserve original capitalization for first letter
        if (match[0] === match[0].toUpperCase()) {
          return segmented.charAt(0).toUpperCase() + segmented.slice(1);
        }
        return segmented;
      }
      return match;
    });

    // Fix words with concatenated prepositions and common words
    // e.g., "resultson" -> "results on", "effectivenessof" -> "effectiveness of"
    text = text.replace(/\b(\w{3,})(on|of|for|to|with|from|by|at|in|and|or|are|is|was|were)\b/gi, (match, word, prep) => {
      // Check if this is a valid English word (common exceptions)
      const combined = word + prep;
      const exceptions = ['button', 'cotton', 'person', 'reason', 'season', 'prison', 'nation',
                         'station', 'position', 'condition', 'tradition', 'definition', 'attention',
                         'information', 'education', 'population', 'generation', 'operation',
                         'organization', 'administration', 'demonstration', 'consideration',
                         'communication', 'transportation', 'representation', 'implementation',
                         'motion', 'action', 'fiction', 'section', 'portion', 'option'];

      if (exceptions.some(ex => combined.toLowerCase().endsWith(ex))) {
        return match;
      }

      return word + ' ' + prep;
    });

    // Fix words concatenated with "the"
    text = text.replace(/(\w{2,})(the)(\w)/gi, '$1 $2 $3');

    // Fix common patterns with "to", "on", "of" after plurals
    text = text.replace(/(\w+s)(to|on|of|or|are)(\s|[A-Z]|$)/g, '$1 $2$3');

    // Fix patterns where preposition is followed by capital letter
    text = text.replace(/(\w+)(on|of|for|to|with|from|by|at|in|and|or|the)([A-Z])/g, '$1 $2 $3');

    // Fix very long words that are likely concatenated (reduced threshold)
    text = text.replace(/\b([a-zA-Z]{15,})\b/g, (match) => {
      // Skip known technical terms and exceptions
      if (/^(implementation|administration|representation|transportation|communication)s?$/i.test(match)) {
        return match;
      }
      // Try to intelligently split based on common patterns
      return match
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([a-zA-Z])(and|or|the|with|from|into|over|under)([a-zA-Z])/g, '$1 $2 $3');
    });

    return text;
  }

  fixSplitWords(text) {
    // Fix common academic terms that get split
    for (const [correct, pattern] of Object.entries(this.commonTerms)) {
      text = text.replace(pattern, correct);
    }

    return text;
  }

  fixHyphenation(text) {
    // Fix hyphenation at line breaks (common in PDFs)
    text = text.replace(/(\w+)-\s*\n\s*(\w+)/g, (match, part1, part2) => {
      const combined = part1 + part2;
      // Check if the combined word is likely valid
      if (combined.length <= 15 && /^[a-zA-Z]+$/.test(combined)) {
        return combined;
      }
      return `${part1}-${part2}`;
    });

    // Remove soft hyphens
    text = text.replace(/\u00AD/g, '');

    return text;
  }

  applyPatterns(text, patterns) {
    for (const { pattern, replacement } of patterns) {
      if (typeof replacement === 'function') {
        text = text.replace(pattern, replacement);
      } else {
        text = text.replace(pattern, replacement);
      }
    }
    return text;
  }

  cleanText(text) {
    if (!text) return text;

    // Step 1: Fix hyphenation issues
    text = this.fixHyphenation(text);

    // Step 2: Fix concatenated words
    text = this.fixConcatenatedWords(text);

    // Step 3: Fix split words
    text = this.fixSplitWords(text);

    // Step 4: Apply academic patterns
    text = this.applyPatterns(text, this.academicPatterns);

    // Step 5: Apply spacing patterns
    text = this.applyPatterns(text, this.spacingPatterns);

    // Step 6: Fix sentence boundaries
    text = text.replace(/([.!?])\s*([A-Z])/g, '$1 $2');

    // Step 7: Clean up multiple spaces
    text = text.replace(/\s+/g, ' ');

    // Step 8: Fix specific known issues
    text = text
      // Fix "Ro BERTa" -> "RoBERTa"
      .replace(/Ro\s+BERTa/gi, 'RoBERTa')
      // Fix space before 's (possessive)
      .replace(/\s+'s/g, "'s")
      // Fix space before n't
      .replace(/\s+n't/g, "n't")
      // Fix common ML terms
      .replace(/machine\s+learning/gi, 'machine learning')
      .replace(/deep\s+learning/gi, 'deep learning')
      .replace(/neural\s+network/gi, 'neural network')
      // Ensure space after period
      .replace(/\.([A-Z])/g, '. $1');

    return text.trim();
  }
}

// Export for use in Node.js
module.exports = { IntelligentTextCleaner };

// Export a simple function for easy use
module.exports.cleanPDFText = function(text) {
  const cleaner = new IntelligentTextCleaner();
  return cleaner.cleanText(text);
};