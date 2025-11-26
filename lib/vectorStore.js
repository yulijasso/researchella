import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { Document } from "@langchain/core/documents";

// Pinecone client instance
let pineconeClient = null;
let vectorStore = null;

// Initialize Pinecone client
async function initPinecone() {
  if (!pineconeClient) {
    // Check for required environment variables
    if (!process.env.PINECONE_API_KEY || process.env.PINECONE_API_KEY === 'your-pinecone-api-key-here') {
      console.warn('⚠️  Pinecone API key not configured. Using in-memory storage as fallback.');
      console.warn('To use Pinecone:');
      console.warn('1. Sign up at https://app.pinecone.io/');
      console.warn('2. Create an index named "papersage" with dimension 1536');
      console.warn('3. Add your API key to .env.local');

      // Fall back to memory storage
      const { MemoryVectorStore } = await import("@langchain/classic/vectorstores/memory");
      return null;
    }

    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
  }
  return pineconeClient;
}

export async function initializeVectorStore() {
  if (!vectorStore) {
    // Use text-embedding-3-large with dimension 1024 (truncated for existing index)
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "text-embedding-3-large",
      dimensions: 1024,
      batchSize: 100, // Process 100 chunks per API call instead of one-by-one
    });

    const pinecone = await initPinecone();

    if (!pinecone) {
      // Fallback to memory storage if Pinecone is not configured
      const { MemoryVectorStore } = await import("@langchain/classic/vectorstores/memory");
      console.log('Using in-memory vector store (temporary storage)');
      vectorStore = new MemoryVectorStore(embeddings);
    } else {
      try {
        const indexName = process.env.PINECONE_INDEX_NAME || "papersage";

        // Check if index exists
        const indexList = await pinecone.listIndexes();
        const existingIndex = indexList.indexes?.find(index => index.name === indexName);

        if (existingIndex) {
          // Check dimension of existing index
          const indexDescription = await pinecone.describeIndex(indexName);
          const currentDimension = indexDescription.dimension;

          if (currentDimension !== 1024) {
            console.log(`Existing index has dimension ${currentDimension}, but we need 1024.`);
            console.log(`Deleting old index and creating new one...`);

            // Delete the old index
            await pinecone.deleteIndex(indexName);

            // Wait a bit for deletion to complete
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Create new index with correct dimension
            console.log(`Creating new Pinecone index: ${indexName} with dimension 1024`);
            await pinecone.createIndex({
              name: indexName,
              dimension: 1024, // OpenAI text-embedding-3-large truncated
              metric: 'cosine',
              spec: {
                serverless: {
                  cloud: 'aws',
                  region: 'us-east-1'
                }
              }
            });

            // Wait for index to be ready
            console.log('Waiting for new index to be ready...');
            await new Promise(resolve => setTimeout(resolve, 15000));
          }
        } else {
          console.log(`Creating Pinecone index: ${indexName}`);
          // Create index with proper configuration
          await pinecone.createIndex({
            name: indexName,
            dimension: 1024, // OpenAI text-embedding-3-large truncated
            metric: 'cosine',
            spec: {
              serverless: {
                cloud: 'aws',
                region: 'us-east-1'
              }
            }
          });

          // Wait for index to be ready
          console.log('Waiting for index to be ready...');
          await new Promise(resolve => setTimeout(resolve, 10000));
        }

        const pineconeIndex = pinecone.Index(indexName);

        vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
          pineconeIndex,
          namespace: "papersage-docs", // Optional namespace for organization
        });

        console.log('✅ Pinecone vector store initialized successfully with dimension 1024');
      } catch (error) {
        console.error('Error initializing Pinecone:', error);
        console.log('Falling back to in-memory storage');

        // Fallback to memory storage
        const { MemoryVectorStore } = await import("@langchain/classic/vectorstores/memory");
        vectorStore = new MemoryVectorStore(embeddings);
      }
    }
  }
  return vectorStore;
}

export async function addDocumentsToStore(documents, sessionId = 'default', userId = null) {
  const store = await initializeVectorStore();

  // Pinecone has a 40KB metadata limit per vector
  // pageContent is stored in metadata, so we need to limit it
  const MAX_CONTENT_LENGTH = 30000; // ~30KB to leave room for other metadata

  // Convert to LangChain Document format with session ID AND user ID for double isolation
  const langchainDocs = documents.map(
    (doc) =>
      new Document({
        pageContent: doc.content.slice(0, MAX_CONTENT_LENGTH), // Truncate to fit Pinecone limits
        metadata: {
          ...doc.metadata,
          sessionId: sessionId,  // Tag document with session ID for isolation
          userId: userId,        // Tag document with user ID for user-level isolation
          timestamp: new Date().toISOString(),
        },
      })
  );

  await store.addDocuments(langchainDocs);

  console.log(`Added ${langchainDocs.length} documents to vector store for user: ${userId}, session: ${sessionId}`);
  return { success: true, count: langchainDocs.length };
}

export async function searchDocuments(query, k = 3, sessionId = 'default', userId = null, sources = null) {
  const store = await initializeVectorStore();

  try {
    // Use session-specific AND user-specific filtering for double isolation
    const sourcesInfo = sources ? ` (sources: ${sources.join(', ')})` : '';
    console.log(`🔍 Searching for documents - User: ${userId}, Session: ${sessionId}${sourcesInfo}`);

    // CRITICAL: Use Pinecone's native metadata filtering with BOTH userId AND sessionId
    // This prevents cross-user AND cross-session contamination at the database level
    const filter = {
      sessionId: sessionId // Pinecone metadata filter - ONLY this session
    };

    // Add userId filter if provided (for authenticated users)
    if (userId) {
      filter.userId = userId; // Double protection: user-level isolation
    }

    // Add source filter if @mentions were used
    if (sources && sources.length > 0) {
      // Pinecone supports $in operator for filtering by multiple values
      if (sources.length === 1) {
        filter.source = sources[0];
      } else {
        filter.source = { $in: sources };
      }
      console.log(`🎯 Filtering by source(s): ${sources.join(', ')}`);
    }

    const results = await store.similaritySearchWithScore(query, k * 2, filter);

    console.log(`📊 Pinecone returned ${results.length} results for user ${userId}, session ${sessionId}`);

    // Log each result for debugging
    results.forEach(([doc, score], idx) => {
      console.log(`  [${idx + 1}] User: ${doc.metadata.userId}, Session: ${doc.metadata.sessionId}, Source: ${doc.metadata.source}, Score: ${score.toFixed(4)}`);
    });

    // Additional JavaScript-side validation (belt and suspenders approach)
    const validatedResults = results
      .filter(([doc, score]) => {
        // Double-check sessionId matches (should already be filtered by Pinecone)
        if (doc.metadata.sessionId !== sessionId) {
          console.error(`❌ CRITICAL: Document leaked from session ${doc.metadata.sessionId}! Source: ${doc.metadata.source}`);
          return false;
        }
        // Triple-check userId matches (if userId is provided)
        if (userId && doc.metadata.userId !== userId) {
          console.error(`❌ CRITICAL: Document leaked from user ${doc.metadata.userId}! Source: ${doc.metadata.source}`);
          return false;
        }
        // Only keep reasonably similar results (increased threshold for better recall)
        return score < 0.85;
      })
      .sort((a, b) => a[1] - b[1]) // Sort by score (lower is better)
      .slice(0, k) // Take top k results
      .map(([doc, score]) => ({
        content: doc.pageContent,
        metadata: {
          ...doc.metadata,
          similarityScore: score // Include score for debugging
        },
      }));

    if (validatedResults.length === 0) {
      console.log(`⚠️  No documents found for user ${userId}, session ${sessionId}. Upload documents first.`);
      return [];
    }

    console.log(`✅ Found ${validatedResults.length} relevant documents for user ${userId}, session ${sessionId}`);
    return validatedResults;
  } catch (error) {
    console.error('Error searching documents:', error);
    return [];
  }
}

export async function clearVectorStore() {
  // For Pinecone, we would need to delete all vectors in the namespace
  // For now, we'll just reset the local reference
  const pinecone = await initPinecone();

  if (pinecone) {
    try {
      const indexName = process.env.PINECONE_INDEX_NAME || "papersage";
      const pineconeIndex = pinecone.Index(indexName);

      // Delete all vectors in the namespace
      await pineconeIndex.namespace("papersage-docs").deleteAll();
      console.log('Cleared all documents from Pinecone');
    } catch (error) {
      console.error('Error clearing Pinecone:', error);
    }
  }

  vectorStore = null;
  return { success: true };
}

// Get statistics about the vector store
export async function getVectorStoreStats() {
  const pinecone = await initPinecone();

  if (pinecone) {
    try {
      const indexName = process.env.PINECONE_INDEX_NAME || "papersage";
      const pineconeIndex = pinecone.Index(indexName);

      const stats = await pineconeIndex.describeIndexStats();
      return {
        type: 'pinecone',
        totalVectors: stats.totalVectorCount || 0,
        namespaces: stats.namespaces || {},
      };
    } catch (error) {
      console.error('Error getting Pinecone stats:', error);
    }
  }

  return {
    type: 'memory',
    message: 'Using in-memory storage (temporary)',
  };
}

// Delete all vectors for a specific session
export async function deleteSessionVectors(userId, sessionId) {
  const pinecone = await initPinecone();

  if (!pinecone) {
    console.log('Using in-memory storage - vectors will be cleared on restart');
    return { success: true, message: 'In-memory storage - no persistent data to delete' };
  }

  try {
    const indexName = process.env.PINECONE_INDEX_NAME || "papersage";
    const pineconeIndex = pinecone.Index(indexName);

    console.log(`🗑️  Deleting all vectors for user ${userId}, session ${sessionId}`);

    // Delete vectors by metadata filter
    await pineconeIndex.deleteMany({
      filter: {
        userId: userId,
        sessionId: sessionId
      }
    });

    console.log(`✅ Successfully deleted all vectors for session ${sessionId}`);
    return { success: true, message: 'Session vectors deleted from Pinecone' };
  } catch (error) {
    console.error('Error deleting session vectors:', error);
    throw error;
  }
}