# Researchella

A NotebookLM-style AI research assistant that lets you upload documents and have intelligent conversations with your research materials.

## Features

### Document Sources
- **PDF Upload** - Upload and process PDF documents with OCR support
- **Image Upload** - Analyze images with GPT-4 Vision
- **Text Input** - Add plain text notes directly
- **Web Scraping** - Import content from any webpage
- **YouTube** - Extract transcripts from YouTube videos
- **Google Drive** - Import files directly from Google Drive
- **OneDrive** - Import files from Microsoft OneDrive

### AI-Powered Generation
- **Chat** - Conversational RAG-powered Q&A with citations
- **Quiz Generator** - Auto-generate quizzes from your documents
- **Flashcards** - Create study flashcards
- **Podcast** - Generate audio overviews of your content
- **Research Report** - Comprehensive document summaries
- **Mind Map** - Visual concept mapping
- **Video Overview** - Generate video summaries

### Additional Features
- Multi-session support with persistent history
- Semantic citation extraction with verbatim quotes
- User authentication via Clerk
- Rate limiting with Upstash Redis

## Tech Stack

- **Framework:** Next.js 16 (Pages Router)
- **UI:** Chakra UI
- **Auth:** Clerk
- **Vector Store:** Pinecone
- **LLM:** OpenAI GPT-4o
- **Database:** Turso (SQLite)
- **Rate Limiting:** Upstash Redis

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- Python 3 (for PDF processing)

### Installation

```bash
# Clone the repository
git clone https://github.com/yulijasso/researchella.git
cd researchella

# Install dependencies
npm install

# Set up Python virtual environment (for PDF processing)
python3 -m venv venv
source venv/bin/activate
pip install pdfplumber pymupdf
```

### Environment Variables

Create a `.env.local` file with the following:

```env
# OpenAI API
OPENAI_API_KEY=your-openai-key

# Pinecone Vector Store
PINECONE_API_KEY=your-pinecone-key
PINECONE_INDEX_NAME=your-index-name
PINECONE_ENVIRONMENT=your-environment

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your-clerk-publishable-key
CLERK_SECRET_KEY=your-clerk-secret-key

# Turso Database
TURSO_DATABASE_URL=your-turso-url
TURSO_AUTH_TOKEN=your-turso-token

# Rate Limiting (optional)
UPSTASH_REDIS_REST_URL=your-upstash-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-token

# Google Integration (optional)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
NEXT_PUBLIC_GOOGLE_API_KEY=your-google-api-key
GOOGLE_SEARCH_API_KEY=your-search-api-key
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id
```

### Running the App

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## API Rate Limits

| Endpoint | Limit |
|----------|-------|
| Chat | 20 requests/min |
| Upload | 50 requests/min |
| Generate (quiz, flashcards, etc.) | 5 requests/min |
| Web scraping | 15 requests/min |
| Default | 60 requests/min |

Rate limiting is optional - disabled if Upstash credentials are not configured.

## Project Structure

```
├── pages/
│   ├── api/           # API routes
│   │   ├── chat.js    # Main chat endpoint
│   │   ├── upload.js  # File upload processing
│   │   └── generate-* # Content generation endpoints
│   ├── index.js       # Landing page
│   ├── chat.js        # Chat interface
│   └── sessions.js    # Session management
├── components/        # React components
├── lib/              # Utility modules
│   ├── vectorStore.js
│   ├── rateLimit.js
│   └── dbHelpers.js
└── contexts/         # React contexts
```

## License

MIT
