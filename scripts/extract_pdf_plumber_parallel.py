#!/usr/bin/env python3
"""
Parallel PDF text extraction using pdfplumber with intelligent text cleaning
Processes multiple pages simultaneously for maximum speed
"""

import sys
import json
import pdfplumber
from clean_pdf_text import clean_pdf_text
from concurrent.futures import ProcessPoolExecutor, as_completed
from multiprocessing import cpu_count
import time
from functools import partial

def process_single_page(page_data):
    """Process a single page (used for parallel processing)"""
    page_num, page_content, with_tables = page_data

    try:
        # Extract text
        text = page_content.get('text', '') or ""

        # Extract tables if requested
        table_text = ""
        if with_tables and page_content.get('tables'):
            for table in page_content.get('tables', []):
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

        return {
            "page": page_num,
            "text": cleaned_text,
            "original_text": full_text,
            "char_count": len(cleaned_text),
            "original_char_count": len(full_text),
            "success": True
        }
    except Exception as e:
        return {
            "page": page_num,
            "text": "",
            "error": str(e),
            "success": False
        }

def extract_page_content(pdf_path, page_num):
    """Extract content from a specific page"""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            if page_num <= len(pdf.pages):
                page = pdf.pages[page_num - 1]
                return {
                    'text': page.extract_text(),
                    'tables': page.extract_tables()
                }
    except Exception as e:
        return {'text': '', 'tables': [], 'error': str(e)}

def extract_pdf_text_parallel(pdf_path, extract_tables=True):
    """Extract text from PDF using parallel processing"""
    try:
        start_time = time.time()

        # First, get the number of pages
        with pdfplumber.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)

            # For small PDFs (<10 pages), use sequential processing
            if total_pages < 10:
                pages_data = []

                for page_num, page in enumerate(pdf.pages, start=1):
                    page_content = {
                        'text': page.extract_text(),
                        'tables': page.extract_tables() if extract_tables else []
                    }
                    result = process_single_page((page_num, page_content, extract_tables))
                    pages_data.append(result)

                elapsed_time = time.time() - start_time

                return {
                    "success": True,
                    "total_pages": total_pages,
                    "pages": pages_data,
                    "total_chars": sum(p["char_count"] for p in pages_data if p.get("success", False)),
                    "processing_time": round(elapsed_time, 2),
                    "method": "sequential"
                }

        # For larger PDFs, extract page data first
        page_contents = []

        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                page_contents.append({
                    'text': page.extract_text(),
                    'tables': page.extract_tables() if extract_tables else []
                })

                # Only show progress for very large documents
                if page_num % 100 == 0:
                    print(f"Progress: {page_num}/{total_pages}", file=sys.stderr)

        # Prepare data for parallel processing
        page_data_list = [(i+1, content, extract_tables) for i, content in enumerate(page_contents)]

        # Determine optimal number of workers
        num_workers = min(cpu_count(), total_pages, 8)  # Cap at 8 workers to avoid overhead

        # Process pages in parallel
        pages_data = []
        processed_count = 0

        with ProcessPoolExecutor(max_workers=num_workers) as executor:
            # Submit all pages for processing
            futures = {executor.submit(process_single_page, page_data): page_data[0]
                      for page_data in page_data_list}

            # Collect results as they complete
            for future in as_completed(futures):
                page_num = futures[future]
                try:
                    result = future.result(timeout=30)  # 30 second timeout per page
                    pages_data.append(result)
                    processed_count += 1

                    # Progress indicator - only for large batches
                    if processed_count % 50 == 0 or processed_count == total_pages:
                        elapsed = time.time() - start_time
                        rate = processed_count / elapsed if elapsed > 0 else 0
                        print(f"Progress: {processed_count}/{total_pages} ({rate:.1f} p/s)", file=sys.stderr)

                except Exception as e:
                    # Don't print individual errors to avoid buffer overflow
                    pages_data.append({
                        "page": page_num,
                        "text": "",
                        "error": str(e),
                        "success": False
                    })

        # Sort pages by page number
        pages_data.sort(key=lambda x: x["page"])

        # Calculate statistics
        elapsed_time = time.time() - start_time
        successful_pages = sum(1 for p in pages_data if p.get("success", False))
        total_chars = sum(p["char_count"] for p in pages_data if p.get("success", False))

        return {
            "success": True,
            "total_pages": total_pages,
            "successful_pages": successful_pages,
            "pages": pages_data,
            "total_chars": total_chars,
            "processing_time": round(elapsed_time, 2),
            "pages_per_second": round(total_pages / elapsed_time, 2) if elapsed_time > 0 else 0,
            "method": "parallel",
            "workers": num_workers
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: extract_pdf_plumber_parallel.py <pdf_file> [extract_tables]"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    extract_tables = True if len(sys.argv) < 3 else sys.argv[2].lower() == 'true'

    result = extract_pdf_text_parallel(pdf_path, extract_tables)
    print(json.dumps(result))