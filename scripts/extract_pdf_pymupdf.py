#!/usr/bin/env python3
"""
PDF text extraction using PyMuPDF (fitz) with advanced text cleaning
This often produces cleaner text than pdfplumber for certain PDFs
"""

import sys
import json
import fitz  # PyMuPDF
from advanced_pdf_cleaner import clean_pdf_text_advanced
from clean_pdf_text import clean_pdf_text
import re

def extract_with_pymupdf(pdf_path):
    """Extract text from PDF using PyMuPDF with multiple methods"""
    try:
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        pages_data = []

        for page_num, page in enumerate(doc, start=1):
            # Method 1: Standard text extraction
            text = page.get_text()

            # Method 2: Try with blocks for better structure
            blocks = page.get_text("blocks")
            block_text = ""
            for block in blocks:
                if block[6] == 0:  # Text block (not image)
                    block_text += block[4] + "\n"

            # Method 3: Extract with better layout preservation
            layout_text = page.get_text("text", flags=fitz.TEXT_PRESERVE_LIGATURES | fitz.TEXT_PRESERVE_WHITESPACE)

            # Choose the best extraction (usually the one with most readable text)
            texts = [text, block_text, layout_text]
            best_text = max(texts, key=lambda t: len(re.findall(r'\b[a-zA-Z]+\b', t)))

            # Apply multiple levels of cleaning
            # First pass: basic cleaning from original cleaner
            cleaned_text = clean_pdf_text(best_text)

            # Second pass: advanced cleaning
            cleaned_text = clean_pdf_text_advanced(cleaned_text)

            pages_data.append({
                "page": page_num,
                "text": cleaned_text,
                "original_text": best_text,
                "char_count": len(cleaned_text),
                "original_char_count": len(best_text)
            })

            if page_num % 50 == 0 or page_num == total_pages:
                print(f"Processed {page_num}/{total_pages} pages", file=sys.stderr)

        doc.close()

        return {
            "success": True,
            "total_pages": total_pages,
            "pages": pages_data,
            "total_chars": sum(p["char_count"] for p in pages_data),
            "method": "pymupdf"
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"success": False, "error": "Usage: extract_pdf_pymupdf.py <pdf_file>"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    result = extract_with_pymupdf(pdf_path)
    print(json.dumps(result))