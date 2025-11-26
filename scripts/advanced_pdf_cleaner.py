#!/usr/bin/env python3
"""
Advanced PDF text cleaning with multiple methods:
1. Dictionary-based word validation
2. N-gram analysis for word boundaries
3. Context-aware splitting
4. Multiple extraction method comparison
"""

import re
import sys
import json
import wordninja
import warnings
warnings.filterwarnings("ignore")

try:
    import enchant
    ENCHANT_AVAILABLE = True
    en_dict = enchant.Dict("en_US")
except:
    ENCHANT_AVAILABLE = False
    en_dict = None

class AdvancedPDFCleaner:
    def __init__(self):
        # Common English words for validation
        self.common_words = set([
            'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
            'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
            'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
            'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
            'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go',
            'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
            'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them',
            'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
            'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
            'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
            'give', 'day', 'most', 'us', 'are', 'was', 'were', 'been', 'has', 'had',
            'is', 'am', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
            'must', 'can', 'shall', 'being', 'having',
            # Additional common academic/technical words
            'understanding', 'performance', 'confusion', 'methods', 'models', 'studies',
            'existing', 'candidate', 'answers', 'improve', 'overall', 'ranking', 'queries',
            'generated', 'similar', 'expected', 'answer', 'focus', 'enhancing', 'text',
            'fail', 'resolve', 'many', 'since', 'however', 'between', 'different', 'approach',
            'system', 'method', 'results', 'paper', 'proposed', 'based', 'using', 'research'
        ])

        # Words that commonly appear concatenated
        self.common_concatenations = {
            'onto': ['on', 'to'],
            'into': ['in', 'to'],
            'cannot': ['can', 'not'],
            'within': ['with', 'in'],
            'without': ['with', 'out'],
            'upon': ['up', 'on'],
            'throughout': ['through', 'out'],
            'however': ['how', 'ever'],
            'therefore': ['there', 'fore'],
            'moreover': ['more', 'over'],
            'furthermore': ['further', 'more'],
            'nevertheless': ['never', 'the', 'less'],
            'nonetheless': ['none', 'the', 'less']
        }

    def is_valid_word(self, word):
        """Check if a word is valid using multiple methods"""
        if len(word) <= 1:
            return word in ['a', 'i', 'I', 'A']

        # Check common words first (fastest)
        if word.lower() in self.common_words:
            return True

        # Check with enchant dictionary if available
        if ENCHANT_AVAILABLE and en_dict:
            return en_dict.check(word) or en_dict.check(word.lower())

        # Basic heuristic: has vowels and reasonable length
        vowels = set('aeiouAEIOU')
        has_vowel = any(c in vowels for c in word)
        reasonable_length = 2 <= len(word) <= 20

        return has_vowel and reasonable_length

    def split_concatenated_aggressive(self, word):
        """Aggressively split concatenated words"""
        if len(word) <= 4:
            return [word]

        # First check if the word itself is valid - don't split valid words!
        if self.is_valid_word(word):
            return [word]

        # First check if it's a known compound word that should stay together
        if word.lower() in self.common_concatenations:
            return [word]

        # Try to find common word patterns within the word
        best_split = None
        best_score = 0

        # Method 1: Look for common word boundaries (but only if the original word is invalid)
        for i in range(2, len(word) - 1):
            left = word[:i]
            right = word[i:]

            # Check if both parts could be words
            left_valid = self.is_valid_word(left)
            right_valid = self.is_valid_word(right)

            if left_valid and right_valid:
                score = len(left) + len(right)
                # Prefer splits where both words are common
                if left.lower() in self.common_words:
                    score += 10
                if right.lower() in self.common_words:
                    score += 10

                if score > best_score:
                    best_score = score
                    best_split = [left, right]

        # Method 2: Look for specific patterns
        patterns_to_split = [
            # Word + common ending word
            (r'(\w+)(the|of|to|in|on|at|by|for|with|from|and|or|but|are|is|was|were)$', r'\1 \2'),
            # Common starting word + word
            (r'^(the|of|to|in|on|at|by|for|with|from|and|or|but)(\w+)', r'\1 \2'),
            # Word ending in 'ing' + common word
            (r'(\w+ing)(the|of|to|in|on|at|by|for|with|from)', r'\1 \2'),
            # Word ending in 'ed' + common word
            (r'(\w+ed)(the|of|to|in|on|at|by|for|with|from)', r'\1 \2'),
            # Word ending in 's' + common word
            (r'(\w+s)(the|of|to|in|on|at|by|for|with|from|are)', r'\1 \2'),
        ]

        for pattern, replacement in patterns_to_split:
            if re.match(pattern, word, re.IGNORECASE):
                result = re.sub(pattern, replacement, word, flags=re.IGNORECASE)
                if ' ' in result:
                    parts = result.split()
                    if all(self.is_valid_word(p) for p in parts):
                        return parts

        # Method 3: Use wordninja as fallback
        if best_split:
            return best_split

        # Try wordninja
        ninja_split = wordninja.split(word.lower())
        if len(ninja_split) > 1 and all(len(w) > 1 for w in ninja_split):
            # Preserve original capitalization for first word
            if word[0].isupper():
                ninja_split[0] = ninja_split[0].capitalize()
            return ninja_split

        return [word]

    def fix_word_boundaries(self, text):
        """Fix word boundaries using multiple methods"""
        words = text.split()
        fixed_words = []

        for word in words:
            # Always check if the word is already valid first
            if self.is_valid_word(word):
                fixed_words.append(word)
                continue

            # Only try to split if the word is NOT valid and looks concatenated
            # Check for obvious concatenation patterns
            if any(pattern in word.lower() for pattern in ['theof', 'ofthe', 'tothe', 'andthe', 'ingthe', 'edthe']):
                split_words = self.split_concatenated_aggressive(word)
                fixed_words.extend(split_words)
            elif len(word) > 15 and not self.is_valid_word(word):
                # Very long invalid words might be concatenated
                split_words = self.split_concatenated_aggressive(word)
                fixed_words.extend(split_words)
            else:
                fixed_words.append(word)

        return ' '.join(fixed_words)

    def fix_common_patterns(self, text):
        """Fix very specific common patterns"""
        # Words that should NOT be split even if they end with common words
        exceptions = ['confusion', 'fusion', 'version', 'tension', 'mission', 'session',
                     'passion', 'fashion', 'vision', 'decision', 'division', 'revision',
                     'occasion', 'explosion', 'conclusion', 'extension', 'dimension',
                     'information', 'organization', 'administration', 'demonstration']

        def should_split(word, ending):
            # Don't split if the whole word is in exceptions
            if word.lower() in exceptions:
                return False
            # Don't split if removing the ending doesn't leave a valid word
            prefix = word[:-len(ending)]
            if len(prefix) < 2:
                return False
            # Only split if the prefix is a valid word
            return self.is_valid_word(prefix)

        patterns = [
            # Fix specific issues from the example
            (r'\b(\w+)on\b', lambda m: m.group(1) + ' on' if should_split(m.group(0), 'on') else m.group(0)),
            (r'\b(\w+)of\b', lambda m: m.group(1) + ' of' if should_split(m.group(0), 'of') else m.group(0)),
            (r'\b(\w+)to\b', lambda m: m.group(1) + ' to' if should_split(m.group(0), 'to') else m.group(0)),
            (r'\b(\w+)the\b', lambda m: m.group(1) + ' the' if should_split(m.group(0), 'the') else m.group(0)),
            (r'\b(\w+)for\b', lambda m: m.group(1) + ' for' if should_split(m.group(0), 'for') else m.group(0)),
            (r'\b(\w+)and\b', lambda m: m.group(1) + ' and' if should_split(m.group(0), 'and') else m.group(0)),
            (r'\b(\w+)or\b', lambda m: m.group(1) + ' or' if should_split(m.group(0), 'or') else m.group(0)),
            (r'\b(\w+)are\b', lambda m: m.group(1) + ' are' if should_split(m.group(0), 'are') else m.group(0)),
            (r'\b(\w+)is\b', lambda m: m.group(1) + ' is' if should_split(m.group(0), 'is') else m.group(0)),
        ]

        for pattern, replacement in patterns:
            text = re.sub(pattern, replacement, text)

        return text

    def clean_text(self, text):
        """Main cleaning function"""
        if not text:
            return text

        # Step 1: Fix common patterns first
        text = self.fix_common_patterns(text)

        # Step 2: Fix word boundaries
        text = self.fix_word_boundaries(text)

        # Step 3: Clean up spacing
        text = re.sub(r'\s+', ' ', text)

        # Step 4: Fix punctuation spacing
        text = re.sub(r'\s+([.,;:!?\)])', r'\1', text)
        text = re.sub(r'([.,;:!?])([A-Za-z])', r'\1 \2', text)

        return text.strip()

def clean_pdf_text_advanced(text):
    """Main entry point for advanced text cleaning"""
    cleaner = AdvancedPDFCleaner()
    return cleaner.clean_text(text)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"success": False, "error": "Usage: advanced_pdf_cleaner.py <text>"}))
        sys.exit(1)

    input_text = sys.argv[1]

    try:
        cleaned_text = clean_pdf_text_advanced(input_text)
        result = {
            "success": True,
            "original_length": len(input_text),
            "cleaned_length": len(cleaned_text),
            "cleaned_text": cleaned_text
        }
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)