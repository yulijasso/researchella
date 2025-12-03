#!/usr/bin/env python3
"""
ECS Fargate PDF Processor
Downloads files from S3, extracts text, and stores in Pinecone/Supabase
"""

import os
import sys
import json
import boto3
import tempfile
import pdfplumber
from pinecone import Pinecone
from openai import OpenAI
from supabase import create_client
from concurrent.futures import ThreadPoolExecutor
import time

# Environment variables
FILE_ID = os.environ.get('FILE_ID')
S3_KEY = os.environ.get('S3_KEY')
S3_BUCKET = os.environ.get('S3_BUCKET')
USER_ID = os.environ.get('USER_ID')
SESSION_ID = os.environ.get('SESSION_ID')
FILE_NAME = os.environ.get('FILE_NAME')
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
PINECONE_API_KEY = os.environ.get('PINECONE_API_KEY')
PINECONE_INDEX_NAME = os.environ.get('PINECONE_INDEX_NAME', 'papersage')

# Initialize clients
s3 = boto3.client('s3')
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
openai_client = OpenAI(api_key=OPENAI_API_KEY)
pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index(PINECONE_INDEX_NAME)


def update_status(status, error_message=None, chunks_count=None):
    """Update processing status in Supabase"""
    update_data = {
        'status': status,
        'updated_at': 'now()',
    }
    if error_message:
        update_data['error_message'] = error_message
    if chunks_count is not None:
        update_data['chunks_count'] = chunks_count
    if status in ['completed', 'failed']:
        update_data['completed_at'] = 'now()'

    supabase.table('file_processing').update(update_data).eq('id', FILE_ID).execute()
    print(f"Status updated: {status}")


def extract_text_from_pdf(file_path):
    """Extract text from PDF using pdfplumber"""
    print(f"Extracting text from PDF: {file_path}")
    all_text = []

    with pdfplumber.open(file_path) as pdf:
        total_pages = len(pdf.pages)
        print(f"Total pages: {total_pages}")

        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""

            # Also extract tables
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if row:
                        text += " | ".join(str(cell) if cell else "" for cell in row) + "\n"

            if text.strip():
                all_text.append({
                    'page': i + 1,
                    'text': text.strip()
                })

            if (i + 1) % 50 == 0:
                print(f"Processed {i + 1}/{total_pages} pages")

    return all_text


def chunk_text(pages_data, chunk_size=500, overlap=100):
    """Split text into chunks with overlap"""
    chunks = []

    for page_data in pages_data:
        text = page_data['text']
        page_num = page_data['page']

        # Split on sentence boundaries
        sentences = text.replace('\n', ' ').split('. ')
        current_chunk = ""

        for sentence in sentences:
            if len(current_chunk) + len(sentence) > chunk_size and current_chunk:
                chunks.append({
                    'content': current_chunk.strip(),
                    'page': page_num,
                })
                # Keep overlap
                words = current_chunk.split()
                current_chunk = ' '.join(words[-20:]) + ' ' + sentence
            else:
                current_chunk += sentence + '. '

        if current_chunk.strip():
            chunks.append({
                'content': current_chunk.strip(),
                'page': page_num,
            })

    return chunks


def get_embeddings(texts, batch_size=100):
    """Get embeddings for texts using OpenAI"""
    all_embeddings = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        response = openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=batch
        )
        embeddings = [e.embedding for e in response.data]
        all_embeddings.extend(embeddings)
        print(f"Generated embeddings: {len(all_embeddings)}/{len(texts)}")

    return all_embeddings


def store_in_pinecone(chunks, embeddings):
    """Store chunks with embeddings in Pinecone"""
    vectors = []

    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        vector_id = f"{SESSION_ID}_{USER_ID}_{FILE_ID}_{i}"
        vectors.append({
            'id': vector_id,
            'values': embedding,
            'metadata': {
                'content': chunk['content'][:1000],  # Pinecone metadata limit
                'source': FILE_NAME,
                'page': chunk['page'],
                'sessionId': SESSION_ID,
                'userId': USER_ID,
                'fileId': FILE_ID,
            }
        })

    # Upsert in batches
    batch_size = 100
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i:i + batch_size]
        index.upsert(vectors=batch, namespace=SESSION_ID)
        print(f"Upserted to Pinecone: {min(i + batch_size, len(vectors))}/{len(vectors)}")

    return len(vectors)


def save_to_uploaded_files(chunks_count):
    """Save file record to uploaded_files table"""
    supabase.table('uploaded_files').insert({
        'user_id': USER_ID,
        'session_id': SESSION_ID,
        'name': FILE_NAME,
        'type': 'pdf',
        'chunks': chunks_count,
        'processing_id': FILE_ID,
    }).execute()
    print(f"Saved to uploaded_files: {FILE_NAME}")


def main():
    print("=" * 50)
    print("ECS Fargate PDF Processor Starting")
    print(f"File ID: {FILE_ID}")
    print(f"File Name: {FILE_NAME}")
    print(f"S3 Key: {S3_KEY}")
    print("=" * 50)

    try:
        update_status('downloading')

        # Download file from S3
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
            tmp_path = tmp_file.name
            print(f"Downloading from S3: s3://{S3_BUCKET}/{S3_KEY}")
            s3.download_file(S3_BUCKET, S3_KEY, tmp_path)
            print(f"Downloaded to: {tmp_path}")

        update_status('extracting')

        # Extract text
        pages_data = extract_text_from_pdf(tmp_path)
        print(f"Extracted text from {len(pages_data)} pages")

        if not pages_data:
            raise Exception("No text could be extracted from the PDF")

        update_status('chunking')

        # Chunk text
        chunks = chunk_text(pages_data)
        print(f"Created {len(chunks)} chunks")

        update_status('embedding')

        # Get embeddings
        texts = [c['content'] for c in chunks]
        embeddings = get_embeddings(texts)

        update_status('storing')

        # Store in Pinecone
        chunks_count = store_in_pinecone(chunks, embeddings)

        # Save to uploaded_files
        save_to_uploaded_files(chunks_count)

        # Clean up S3 file (optional - keep for debugging)
        # s3.delete_object(Bucket=S3_BUCKET, Key=S3_KEY)

        # Clean up temp file
        os.unlink(tmp_path)

        update_status('completed', chunks_count=chunks_count)

        print("=" * 50)
        print("Processing completed successfully!")
        print(f"Total chunks: {chunks_count}")
        print("=" * 50)

    except Exception as e:
        print(f"ERROR: {str(e)}")
        update_status('failed', error_message=str(e))
        sys.exit(1)


if __name__ == '__main__':
    main()
