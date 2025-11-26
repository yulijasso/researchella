#!/usr/bin/env python3
"""
Intelligent PDF text cleaning module
Fixes common PDF extraction issues: concatenated words, split words, citation formatting
"""

import sys
import json
import re
import wordninja
import warnings
warnings.filterwarnings("ignore")

class PDFTextCleaner:
    def __init__(self):
        # Common academic abbreviations and patterns
        self.academic_patterns = [
            (r'([A-Z][a-z]+)etal\.', r'\1 et al.'),  # Fix "Liuetal." -> "Liu et al."
            (r'etal\.(\d{4})', r'et al., \1'),  # Fix "etal.2019" -> "et al., 2019"
            (r'(\d{4})([A-Z])', r'\1. \2'),  # Add period after year before capital
            (r'([a-z])([A-Z])', r'\1 \2'),  # Add space between lowercase and capital
        ]

        # Common problematic patterns in PDFs
        self.spacing_patterns = [
            # Remove spaces before punctuation
            (r'\s+([.,;:!?\)])', r'\1'),
            # Add space after punctuation if missing
            (r'([.,;:!?])([A-Za-z])', r'\1 \2'),
            # Fix hyphenated line breaks (common in PDFs)
            (r'(\w+)-\s*\n\s*(\w+)', self._fix_hyphenation),
            # Fix spaces within common words
            (r'\b(a|an|the|is|are|was|were|be|been|have|has|had|do|does|did|will|would|could|should|may|might|must|can|shall)\s+([a-z]{1,3})\b', self._fix_split_word),
        ]

        # Common academic terms that get split
        self.common_terms = {
            'dataset': ['data', 'set'],
            'baseline': ['base', 'line'],
            'network': ['net', 'work'],
            'framework': ['frame', 'work'],
            'benchmark': ['bench', 'mark'],
            'algorithm': ['algo', 'rithm'],
            'performance': ['perfor', 'mance'],
            'demonstrate': ['demonst', 'rate'],
            'evaluation': ['evalu', 'ation'],
            'experiment': ['experi', 'ment'],
            'implementation': ['implement', 'ation'],
            'optimization': ['optimi', 'zation'],
        }

    def _fix_hyphenation(self, match):
        """Fix hyphenation at line breaks"""
        part1 = match.group(1)
        part2 = match.group(2)
        combined = part1 + part2

        # Check if combined word makes sense
        if self._is_likely_word(combined.lower()):
            return combined
        return f"{part1}-{part2}"

    def _fix_split_word(self, match):
        """Fix incorrectly split common words"""
        word1 = match.group(1)
        word2 = match.group(2)

        # Check if they should be combined
        combined = word1 + word2
        if combined in ['and', 'the', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'does', 'did', 'will', 'would', 'could', 'should', 'might', 'must', 'can', 'shall']:
            return combined

        return match.group(0)

    def _is_likely_word(self, text):
        """Check if text is likely a valid word"""
        # Simple heuristic: check if it has vowels and reasonable length
        vowels = set('aeiouAEIOU')
        if len(text) < 2 or len(text) > 20:
            return False
        return any(c in vowels for c in text)

    def fix_concatenated_words(self, text):
        """Split concatenated words using wordninja"""
        words = text.split()
        fixed_words = []

        for word in words:
            # Check for camelCase or PascalCase (common in technical text)
            if re.match(r'^[a-z]+[A-Z]', word) or re.match(r'^[A-Z][a-z]+[A-Z]', word):
                # Preserve camelCase/PascalCase unless it's likely concatenated
                # Check for common patterns like "resultson", "effectivenessof"
                if re.search(r'(results?on|effectiveness?of|experiments?on|methods?for|approaches?to|systems?for|models?for|techniques?for)', word, re.IGNORECASE):
                    split_words = wordninja.split(word.lower())
                    if len(split_words) > 1 and all(len(w) > 1 for w in split_words):
                        if word[0].isupper():
                            split_words[0] = split_words[0].capitalize()
                        fixed_words.extend(split_words)
                        continue
                fixed_words.append(word)
                continue

            # More aggressive splitting for concatenated words
            # Split words that are too long OR have common patterns
            if (len(word) > 12 and word.isalpha()) or re.search(r'(on|of|for|to|with|from|by|at|in)[A-Z]', word):
                split_words = wordninja.split(word.lower())
                if len(split_words) > 1:
                    # Check if split makes sense
                    if all(len(w) > 1 for w in split_words):
                        # Preserve original capitalization for first word
                        if word[0].isupper():
                            split_words[0] = split_words[0].capitalize()
                        fixed_words.extend(split_words)
                        continue

            # Check for specific patterns where common words are concatenated
            # Handle both prepositions and articles concatenated with other words
            # Check if word ends with a common word that shouldn't be split
            exceptions = ['confusion', 'fusion', 'version', 'tension', 'mission', 'session',
                         'passion', 'fashion', 'vision', 'decision', 'division', 'revision',
                         'occasion', 'explosion', 'conclusion', 'extension', 'dimension',
                         'motion', 'action', 'fiction', 'section', 'portion', 'option',
                         'nation', 'station', 'creation', 'relation', 'operation', 'generation',
                         'information', 'education', 'population', 'organization', 'administration']

            if any(word.lower().endswith(exc) for exc in exceptions):
                fixed_words.append(word)
                continue

            patterns = [
                # Common prepositions at end of word (but not part of valid words)
                (r'(\w{3,})(on)$', r'\1 \2'),  # "resultson" -> "results on"
                (r'(\w{3,})(of)$', r'\1 \2'),  # "effectivenessof" -> "effectiveness of"
                (r'(\w{3,})(for)$', r'\1 \2'),
                (r'(\w{3,})(to)$', r'\1 \2'),
                (r'(\w{3,})(with)$', r'\1 \2'),
                (r'(\w{3,})(from)$', r'\1 \2'),
                (r'(\w{3,})(by)$', r'\1 \2'),
                (r'(\w{3,})(at)$', r'\1 \2'),
                (r'(\w{3,})(in)$', r'\1 \2'),
                (r'(\w{3,})(and)$', r'\1 \2'),
                (r'(\w{3,})(or)$', r'\1 \2'),
                (r'(\w{3,})(are)$', r'\1 \2'),  # "answersare" -> "answers are"
                (r'(\w{3,})(is)$', r'\1 \2'),
                (r'(\w{3,})(was)$', r'\1 \2'),
                (r'(\w{3,})(were)$', r'\1 \2'),

                # Words concatenated with "the" (very common)
                (r'(\w{2,})(the)\b', r'\1 \2'),  # "improvethe" -> "improve the"
                (r'(\w{2,})(a)(\s|$)', r'\1 \2\3'),  # "havea" -> "have a"
                (r'(\w{2,})(an)(\s|$)', r'\1 \2\3'),  # "havean" -> "have an"

                # Prepositions before capital letters or digits
                (r'(\w+)(on)([A-Z]|\d)', r'\1 \2 \3'),
                (r'(\w+)(of)([A-Z]|\d)', r'\1 \2 \3'),
                (r'(\w+)(for)([A-Z]|\d)', r'\1 \2 \3'),
                (r'(\w+)(to)([A-Z]|\d)', r'\1 \2 \3'),
                (r'(\w+)(with)([A-Z]|\d)', r'\1 \2 \3'),
                (r'(\w+)(from)([A-Z]|\d)', r'\1 \2 \3'),
                (r'(\w+)(by)([A-Z]|\d)', r'\1 \2 \3'),
                (r'(\w+)(at)([A-Z]|\d)', r'\1 \2 \3'),
                (r'(\w+)(in)([A-Z]|\d)', r'\1 \2 \3'),
                (r'(\w+)(and)([A-Z]|\d)', r'\1 \2 \3'),
                (r'(\w+)(or)([A-Z]|\d)', r'\1 \2 \3'),
                (r'(\w+)(the)([A-Z]|\d)', r'\1 \2 \3'),

                # Common verbs/words concatenated
                (r'(\w{3,})(ing)(the)\b', r'\1ing \3'),  # "enhancingthe" -> "enhancing the"
                (r'(\w{3,})(ed)(the)\b', r'\1ed \3'),  # "focusedthe" -> "focused the"
                (r'(\w{3,})(es)(to)\b', r'\1es \3'),  # "answersto" -> "answers to"
                (r'(\w{3,})(s)(to)\b', r'\1s \3'),  # "focusto" -> "focus to"
                (r'(\w{3,})(s)(on)\b', r'\1s \3'),  # "focuson" -> "focus on"
                (r'(\w{3,})(s)(of)\b', r'\1s \3'),  # "studiesof" -> "studies of"
                (r'(\w{3,})(s)(or)\b', r'\1s \3'),  # "queriesor" -> "queries or"
                (r'(\w{3,})(s)(are)\b', r'\1s \3'),  # "answersare" -> "answers are"
            ]

            modified = False
            for pattern, replacement in patterns:
                if re.search(pattern, word):
                    word = re.sub(pattern, replacement, word)
                    modified = True
                    break

            if modified:
                fixed_words.extend(word.split())
            else:
                fixed_words.append(word)

        return ' '.join(fixed_words)

    def fix_split_words(self, text):
        """Fix words that have been incorrectly split"""
        # Fix common academic terms
        for correct, parts in self.common_terms.items():
            pattern = r'\b' + r'\s+'.join(parts) + r'\b'
            text = re.sub(pattern, correct, text, flags=re.IGNORECASE)

        # Fix single letter splits (common in PDFs)
        # e.g., "t he" -> "the", "w ith" -> "with"
        text = re.sub(r'\b([a-z])\s+([a-z]{2,})\b', self._check_single_letter_split, text)

        return text

    def _check_single_letter_split(self, match):
        """Check if single letter should be combined with following word"""
        letter = match.group(1)
        rest = match.group(2)
        combined = letter + rest

        # Common words that get split
        common_words = {'the', 'with', 'this', 'that', 'what', 'when', 'where', 'which', 'while', 'their', 'there', 'these', 'those', 'they', 'them', 'then', 'than', 'thus'}

        if combined.lower() in common_words:
            return combined

        return match.group(0)

    def apply_academic_patterns(self, text):
        """Apply academic-specific patterns"""
        for pattern, replacement in self.academic_patterns:
            text = re.sub(pattern, replacement, text)
        return text

    def apply_spacing_patterns(self, text):
        """Fix general spacing issues"""
        for pattern, replacement in self.spacing_patterns:
            if callable(replacement):
                text = re.sub(pattern, replacement, text)
            else:
                text = re.sub(pattern, replacement, text)
        return text

    def clean_text(self, text):
        """Main cleaning function"""
        if not text:
            return text

        # Step 1: Fix concatenated words
        text = self.fix_concatenated_words(text)

        # Step 2: Fix split words
        text = self.fix_split_words(text)

        # Step 3: Apply academic patterns
        text = self.apply_academic_patterns(text)

        # Step 4: Apply spacing patterns
        text = self.apply_spacing_patterns(text)

        # Step 5: Clean up multiple spaces
        text = re.sub(r'\s+', ' ', text)

        # Step 6: Fix sentence boundaries
        text = re.sub(r'([.!?])\s*([A-Z])', r'\1 \2', text)

        return text.strip()

def clean_pdf_text(text):
    """Main entry point for text cleaning"""
    cleaner = PDFTextCleaner()
    return cleaner.clean_text(text)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"success": False, "error": "Usage: clean_pdf_text.py <text>"}))
        sys.exit(1)

    input_text = sys.argv[1]

    try:
        cleaned_text = clean_pdf_text(input_text)
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