/**
 * Unit tests for citation extraction and PDF highlighting
 */

// Mock functions from the codebase
const normalizeText = (str) => {
  return str
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .trim();
};

const extractPhrases = (text) => {
  if (!text) return [];
  const phrases = text
    .split(/[.!?]\s+|\s{2,}/)
    .map(p => normalizeText(p))
    .filter(p => p.length >= 15);
  return phrases;
};

// Citation regex pattern (matches [cite:N], [CHUNK-N], etc.)
const extractCitations = (text) => {
  const citations = [];
  const patterns = [
    /\[cite:(\d+)\]/gi,
    /\[CHUNK-(\d+)\]/gi,
    /\[(\d+)\]/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      citations.push(parseInt(match[1]));
    }
  }
  return [...new Set(citations)];
};

describe('Citation Extraction', () => {
  test('extracts [cite:N] format', () => {
    const text = 'This is from the document [cite:1] and also here [cite:2].';
    expect(extractCitations(text)).toContain(1);
    expect(extractCitations(text)).toContain(2);
  });

  test('extracts [CHUNK-N] format', () => {
    const text = 'According to [CHUNK-3], the answer is yes.';
    expect(extractCitations(text)).toContain(3);
  });

  test('extracts [N] format', () => {
    const text = 'The study shows [1] that results improved [2].';
    expect(extractCitations(text)).toContain(1);
    expect(extractCitations(text)).toContain(2);
  });

  test('returns empty array for no citations', () => {
    const text = 'This text has no citations at all.';
    expect(extractCitations(text)).toEqual([]);
  });

  test('deduplicates citations', () => {
    const text = '[cite:1] mentioned here [cite:1] again.';
    const citations = extractCitations(text);
    expect(citations.filter(c => c === 1).length).toBe(1);
  });
});

describe('Text Normalization', () => {
  test('converts to lowercase', () => {
    expect(normalizeText('HELLO World')).toBe('hello world');
  });

  test('normalizes whitespace', () => {
    expect(normalizeText('hello   world')).toBe('hello world');
    expect(normalizeText('hello\n\nworld')).toBe('hello world');
  });

  test('normalizes quotes', () => {
    expect(normalizeText('"test"')).toBe('"test"');
    expect(normalizeText("it's")).toBe("it's");
  });

  test('trims whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });
});

describe('Search String Extraction', () => {
  const extractSearchStrings = (text) => {
    if (!text) return [];
    const normalized = normalizeText(text);
    const searches = [];
    const windowSizes = [80, 50, 30];
    for (const size of windowSizes) {
      if (normalized.length >= size) {
        searches.push(normalized.substring(0, size));
        if (normalized.length > size * 2) {
          const mid = Math.floor(normalized.length / 2);
          searches.push(normalized.substring(mid, mid + size));
        }
      }
    }
    return searches;
  };

  test('extracts multiple window sizes', () => {
    const text = 'This is a very long text that should generate multiple search strings for matching purposes in the PDF document.';
    const searches = extractSearchStrings(text);
    expect(searches.length).toBeGreaterThan(0);
  });

  test('returns empty for null/empty input', () => {
    expect(extractSearchStrings(null)).toEqual([]);
    expect(extractSearchStrings('')).toEqual([]);
  });

  test('handles short text', () => {
    const text = 'Short text here for testing.';
    const searches = extractSearchStrings(text);
    expect(searches.length).toBe(0); // Too short for 30 char minimum
  });

  test('extracts from start and middle for long text', () => {
    const text = 'A'.repeat(200);
    const searches = extractSearchStrings(text);
    expect(searches.length).toBeGreaterThan(2); // Should have start and middle for multiple sizes
  });
});

describe('Highlight Text Matching', () => {
  const findMatchInPage = (pageText, searchPhrase) => {
    const normalized = normalizeText(pageText);
    const phrase = normalizeText(searchPhrase);

    // Try progressively shorter substrings
    for (let len = Math.min(60, phrase.length); len >= 20; len -= 10) {
      const subPhrase = phrase.substring(0, len);
      const index = normalized.indexOf(subPhrase);
      if (index !== -1) {
        return { index, matchLength: len };
      }
    }
    return null;
  };

  test('finds exact match', () => {
    const pageText = 'The quick brown fox jumps over the lazy dog.';
    const search = 'the quick brown fox jumps over';
    const result = findMatchInPage(pageText, search);
    expect(result).not.toBeNull();
    expect(result.index).toBe(0);
  });

  test('finds partial match with long phrase', () => {
    const pageText = 'Introduction to machine learning and artificial intelligence concepts.';
    const search = 'introduction to machine learning and artificial intelligence concepts and more text here';
    const result = findMatchInPage(pageText, search);
    expect(result).not.toBeNull();
  });

  test('returns null for no match', () => {
    const pageText = 'This is about dogs and cats.';
    const search = 'quantum physics and relativity theory';
    const result = findMatchInPage(pageText, search);
    expect(result).toBeNull();
  });

  test('handles case insensitivity', () => {
    const pageText = 'MACHINE LEARNING IS POWERFUL';
    const search = 'machine learning is powerful';
    const result = findMatchInPage(pageText, search);
    expect(result).not.toBeNull();
  });
});

describe('Citation to Document Mapping', () => {
  const mockDocs = [
    { metadata: { source: 'doc1.pdf', page: 1 }, content: 'First document content' },
    { metadata: { source: 'doc2.pdf', page: 5 }, content: 'Second document content' },
    { metadata: { source: 'doc3.pdf', page: 10 }, content: 'Third document content' },
  ];

  test('citation index maps to correct document', () => {
    // Citation [cite:1] should map to index 0
    const citationNum = 1;
    const docIndex = citationNum - 1;
    expect(mockDocs[docIndex].metadata.source).toBe('doc1.pdf');
  });

  test('citation index out of bounds returns undefined', () => {
    const citationNum = 5;
    const docIndex = citationNum - 1;
    expect(mockDocs[docIndex]).toBeUndefined();
  });

  test('all citations have required metadata', () => {
    mockDocs.forEach(doc => {
      expect(doc.metadata).toBeDefined();
      expect(doc.metadata.source).toBeDefined();
      expect(doc.content).toBeDefined();
    });
  });
});
