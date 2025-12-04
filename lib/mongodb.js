import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.warn('⚠️ MONGODB_URI not defined - MongoDB features will be disabled');
}

// Global cache for the connection
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectToDatabase() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not defined');
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log('✅ Connected to MongoDB');
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

// Session Schema
const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  name: { type: String, default: 'New Notebook' },
  tutoringMode: { type: String, default: 'direct' },
  messageCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// File Schema
const fileSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, required: true }, // pdf, youtube, url, text, image, google-drive
  chunks: { type: Number, default: 0 },
  pages: { type: Number },
  size: { type: Number },
  pdfData: { type: String }, // base64 for viewing
  createdAt: { type: Date, default: Date.now },
});

// Message Schema
const messageSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  role: { type: String, required: true }, // user, assistant
  content: { type: String, required: true },
  sources: { type: mongoose.Schema.Types.Mixed }, // JSON array of sources
  createdAt: { type: Date, default: Date.now },
});

// Vector Schema (for RAG - using MongoDB Atlas Vector Search)
const vectorSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  content: { type: String, required: true },
  embedding: { type: [Number], required: true }, // 1536 dimensions for OpenAI embeddings
  metadata: {
    source: String,
    type: String,
    url: String,
    author: String,
    videoId: String,
    description: String,
    chunkIndex: Number,
    totalChunks: Number,
    pageNumber: Number,
  },
  createdAt: { type: Date, default: Date.now },
});

// Create indexes for vector search (needs to be done in Atlas UI or via Atlas API)
// vectorSchema.index({ embedding: '2dsphere' }); // This is placeholder - actual vector index is created in Atlas

// Models - check if already defined to avoid OverwriteModelError in dev
export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
export const File = mongoose.models.File || mongoose.model('File', fileSchema);
export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);
export const Vector = mongoose.models.Vector || mongoose.model('Vector', vectorSchema);

// Helper functions that match the Supabase patterns

export async function getOrCreateSession(sessionId, userId, name = 'New Notebook') {
  await connectToDatabase();

  let session = await Session.findOne({ sessionId, userId });

  if (!session) {
    session = await Session.create({
      sessionId,
      userId,
      name,
      tutoringMode: 'direct',
      messageCount: 0,
    });
    console.log(`📝 Created new session: ${sessionId}`);
  }

  return session;
}

export async function insertFile(fileData) {
  await connectToDatabase();

  // Ensure session exists first (auto-create if needed)
  await getOrCreateSession(fileData.sessionId, fileData.userId);

  const file = await File.create({
    sessionId: fileData.sessionId || fileData.session_id,
    userId: fileData.userId || fileData.user_id,
    name: fileData.name,
    type: fileData.type,
    chunks: fileData.chunks || 0,
    pages: fileData.pages,
    size: fileData.size,
    pdfData: fileData.pdfData || fileData.pdf_data,
  });

  console.log(`📁 Saved file to MongoDB: ${fileData.name}`);

  return { data: { id: file._id.toString(), ...file.toObject() }, error: null };
}

export async function getSessionFiles(sessionId, userId) {
  await connectToDatabase();

  const files = await File.find({ sessionId, userId }).sort({ createdAt: -1 });

  return files.map(f => ({
    id: f._id.toString(),
    session_id: f.sessionId,
    user_id: f.userId,
    name: f.name,
    type: f.type,
    chunks: f.chunks,
    pages: f.pages,
    size: f.size,
    pdf_data: f.pdfData,
    created_at: f.createdAt,
  }));
}

export async function deleteFile(fileId, userId) {
  await connectToDatabase();

  const result = await File.deleteOne({ _id: fileId, userId });
  return { error: result.deletedCount === 0 ? { message: 'File not found' } : null };
}

export async function getSessionMessages(sessionId, userId) {
  await connectToDatabase();

  const messages = await Message.find({ sessionId, userId }).sort({ createdAt: 1 });

  return messages.map(m => ({
    id: m._id.toString(),
    session_id: m.sessionId,
    user_id: m.userId,
    role: m.role,
    content: m.content,
    sources: m.sources,
    created_at: m.createdAt,
  }));
}

export async function insertMessage(messageData) {
  await connectToDatabase();

  const message = await Message.create({
    sessionId: messageData.sessionId || messageData.session_id,
    userId: messageData.userId || messageData.user_id,
    role: messageData.role,
    content: messageData.content,
    sources: messageData.sources,
  });

  // Update session message count
  await Session.updateOne(
    { sessionId: messageData.sessionId || messageData.session_id },
    { $inc: { messageCount: 1 }, updatedAt: new Date() }
  );

  return { data: { id: message._id.toString() }, error: null };
}

export async function getUserSessions(userId) {
  await connectToDatabase();

  const sessions = await Session.find({ userId }).sort({ updatedAt: -1 });

  return sessions.map(s => ({
    id: s.sessionId,
    user_id: s.userId,
    name: s.name,
    tutoring_mode: s.tutoringMode,
    message_count: s.messageCount,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  }));
}

export async function updateSession(sessionId, userId, updates) {
  await connectToDatabase();

  const updateData = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.tutoring_mode !== undefined) updateData.tutoringMode = updates.tutoring_mode;
  if (updates.message_count !== undefined) updateData.messageCount = updates.message_count;
  updateData.updatedAt = new Date();

  const session = await Session.findOneAndUpdate(
    { sessionId, userId },
    updateData,
    { new: true }
  );

  return { data: session, error: session ? null : { message: 'Session not found' } };
}

export async function deleteSession(sessionId, userId) {
  await connectToDatabase();

  // Delete session, files, messages, and vectors
  await Promise.all([
    Session.deleteOne({ sessionId, userId }),
    File.deleteMany({ sessionId, userId }),
    Message.deleteMany({ sessionId, userId }),
    Vector.deleteMany({ sessionId, userId }),
  ]);

  return { error: null };
}

// Vector operations for RAG
export async function addVectors(vectors, sessionId, userId) {
  await connectToDatabase();

  const docs = vectors.map(v => ({
    sessionId,
    userId,
    content: v.content,
    embedding: v.embedding,
    metadata: v.metadata || {},
  }));

  await Vector.insertMany(docs);
  console.log(`🔢 Added ${vectors.length} vectors for session ${sessionId}`);
}

export async function searchVectors(queryEmbedding, sessionId, userId, limit = 5) {
  await connectToDatabase();

  // For MongoDB Atlas Vector Search, you need to create a vector search index first
  // This uses $vectorSearch aggregation pipeline
  // Fallback to basic cosine similarity if vector search index isn't set up

  try {
    // Try Atlas Vector Search first
    const results = await Vector.aggregate([
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: limit * 10,
          limit: limit,
          filter: {
            $and: [
              { sessionId: { $eq: sessionId } },
              { userId: { $eq: userId } }
            ]
          }
        }
      },
      {
        $project: {
          content: 1,
          metadata: 1,
          score: { $meta: 'vectorSearchScore' }
        }
      }
    ]);

    return results;
  } catch (e) {
    console.log('⚠️ Atlas Vector Search not available, using fallback');

    // Fallback: Get all vectors for session and compute similarity in JS
    const vectors = await Vector.find({ sessionId, userId }).lean();

    // Compute cosine similarity
    const withScores = vectors.map(v => ({
      ...v,
      score: cosineSimilarity(queryEmbedding, v.embedding)
    }));

    // Sort by score and return top results
    withScores.sort((a, b) => b.score - a.score);

    return withScores.slice(0, limit).map(v => ({
      content: v.content,
      metadata: v.metadata,
      score: v.score,
    }));
  }
}

export async function deleteVectorsBySource(source, sessionId, userId) {
  await connectToDatabase();

  await Vector.deleteMany({
    sessionId,
    userId,
    'metadata.source': source,
  });
}

// Helper: Cosine similarity
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export default {
  connectToDatabase,
  Session,
  File,
  Message,
  Vector,
  getOrCreateSession,
  insertFile,
  getSessionFiles,
  deleteFile,
  getSessionMessages,
  insertMessage,
  getUserSessions,
  updateSession,
  deleteSession,
  addVectors,
  searchVectors,
  deleteVectorsBySource,
};
