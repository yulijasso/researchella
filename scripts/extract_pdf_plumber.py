#!/usr/bin/env python3
"""
PDF text extraction using pdfplumber with intelligent text cleaning
Extracts text page by page and fixes common PDF extraction issues
"""

import sys
import json
import pdfplumber
from clean_pdf_text import clean_pdf_text

def extract_pdf_text(pdf_path):
    """Extract text from PDF page by page using pdfplumber"""
    try:
        pages_data = []

        with pdfplumber.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)

            for page_num, page in enumerate(pdf.pages, start=1):
                # Extract text from page
                text = page.extract_text() or ""

                # Extract tables if any
                tables = page.extract_tables()

                # Convert tables to text format
                table_text = ""
                if tables:
                    for table in tables:
                        for row in table:
                            if row:
                                table_text += " | ".join(str(cell) if cell else "" for cell in row) + "\n"
                        table_text += "\n"

                # Combine text and tables
                full_text = text
                if table_text:
                    full_text += "\n\n" + table_text

                # Apply intelligent text cleaning
                cleaned_text = clean_pdf_text(full_text)

                pages_data.append({
                    "page": page_num,
                    "text": cleaned_text,
                    "original_text": full_text,
                    "char_count": len(cleaned_text),
                    "original_char_count": len(full_text)
                })

                # Progress indicator
                if page_num % 10 == 0 or page_num == total_pages:
                    print(f"Processed {page_num}/{total_pages} pages", file=sys.stderr)

        return {
            "success": True,
            "total_pages": total_pages,
            "pages": pages_data,
            "total_chars": sum(p["char_count"] for p in pages_data)
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"success": False, "error": "Usage: extract_pdf_plumber.py <pdf_file>"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    result = extract_pdf_text(pdf_path)
    print(json.dumps(result))
