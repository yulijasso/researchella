// Turso (cloud SQLite) database client
import { createClient } from '@libsql/client';

let db = null;

// Initialize the database connection
export function getDb() {
  if (!db) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      console.warn('TURSO_DATABASE_URL not set - Turso disabled');
      return null;
    }

    db = createClient({
      url,
      authToken,
    });

    console.log('Connected to Turso');
  }
  return db;
}

// Initialize tables (run once on first connection)
export async function initTables() {
  const db = getDb();
  if (!db) return;

  // Create sessions table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT DEFAULT 'New Notebook',
      tutoring_mode TEXT DEFAULT 'direct',
      message_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create files table (NO foreign key constraint!)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      chunks INTEGER DEFAULT 0,
      pages INTEGER,
      size INTEGER,
      pdf_data TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create messages table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_files_session ON files(session_id, user_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, user_id)`);

  console.log('Turso tables initialized');
}

// Session operations
export async function getOrCreateSession(sessionId, userId, name = 'New Notebook') {
  const db = getDb();
  if (!db) return null;

  // Try to get existing session
  const existing = await db.execute({
    sql: 'SELECT * FROM sessions WHERE id = ? AND user_id = ?',
    args: [sessionId, userId]
  });

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  // Create new session
  await db.execute({
    sql: `INSERT INTO sessions (id, user_id, name, tutoring_mode, message_count)
          VALUES (?, ?, ?, 'direct', 0)`,
    args: [sessionId, userId, name]
  });

  console.log(`Created session: ${sessionId}`);
  return { id: sessionId, user_id: userId, name, tutoring_mode: 'direct', message_count: 0 };
}

export async function getUserSessions(userId) {
  const db = getDb();
  if (!db) return [];

  const result = await db.execute({
    sql: 'SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC',
    args: [userId]
  });

  return result.rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    tutoring_mode: row.tutoring_mode,
    message_count: row.message_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function updateSession(sessionId, userId, updates) {
  const db = getDb();
  if (!db) return { error: 'No database' };

  const sets = [];
  const args = [];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    args.push(updates.name);
  }
  if (updates.tutoring_mode !== undefined) {
    sets.push('tutoring_mode = ?');
    args.push(updates.tutoring_mode);
  }
  if (updates.message_count !== undefined) {
    sets.push('message_count = ?');
    args.push(updates.message_count);
  }

  sets.push('updated_at = CURRENT_TIMESTAMP');
  args.push(sessionId, userId);

  await db.execute({
    sql: `UPDATE sessions SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
    args
  });

  return { data: { id: sessionId, ...updates }, error: null };
}

export async function deleteSession(sessionId, userId) {
  const db = getDb();
  if (!db) return { error: 'No database' };

  // Delete files, messages, then session
  await db.execute({ sql: 'DELETE FROM files WHERE session_id = ? AND user_id = ?', args: [sessionId, userId] });
  await db.execute({ sql: 'DELETE FROM messages WHERE session_id = ? AND user_id = ?', args: [sessionId, userId] });
  await db.execute({ sql: 'DELETE FROM sessions WHERE id = ? AND user_id = ?', args: [sessionId, userId] });

  return { error: null };
}

// File operations
export async function insertFile(fileData) {
  const db = getDb();
  if (!db) return { data: null, error: 'No database' };

  const sessionId = fileData.session_id || fileData.sessionId;
  const userId = fileData.user_id || fileData.userId;

  // Auto-create session if it doesn't exist (no FK constraint to worry about!)
  await getOrCreateSession(sessionId, userId);

  const result = await db.execute({
    sql: `INSERT INTO files (session_id, user_id, name, type, chunks, pages, size, pdf_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      sessionId,
      userId,
      fileData.name,
      fileData.type,
      fileData.chunks || 0,
      fileData.pages || null,
      fileData.size || null,
      fileData.pdf_data || fileData.pdfData || null
    ]
  });

  console.log(`Saved file to Turso: ${fileData.name}`);

  return {
    data: {
      id: Number(result.lastInsertRowid),
      session_id: sessionId,
      user_id: userId,
      name: fileData.name,
      type: fileData.type,
    },
    error: null
  };
}

export async function getSessionFiles(sessionId, userId) {
  const db = getDb();
  if (!db) return [];

  const result = await db.execute({
    sql: 'SELECT * FROM files WHERE session_id = ? AND user_id = ? ORDER BY created_at DESC',
    args: [sessionId, userId]
  });

  return result.rows.map(row => ({
    id: row.id,
    session_id: row.session_id,
    user_id: row.user_id,
    name: row.name,
    type: row.type,
    chunks: row.chunks,
    pages: row.pages,
    size: row.size,
    pdf_data: row.pdf_data,
    created_at: row.created_at,
  }));
}

export async function deleteFile(fileId, userId) {
  const db = getDb();
  if (!db) return { error: 'No database' };

  await db.execute({
    sql: 'DELETE FROM files WHERE id = ? AND user_id = ?',
    args: [fileId, userId]
  });

  return { error: null };
}

// Message operations
export async function insertMessage(messageData) {
  const db = getDb();
  if (!db) return { data: null, error: 'No database' };

  const sessionId = messageData.session_id || messageData.sessionId;
  const userId = messageData.user_id || messageData.userId;

  const result = await db.execute({
    sql: `INSERT INTO messages (session_id, user_id, role, content, sources)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      sessionId,
      userId,
      messageData.role,
      messageData.content,
      messageData.sources ? JSON.stringify(messageData.sources) : null
    ]
  });

  // Update session message count
  await db.execute({
    sql: 'UPDATE sessions SET message_count = message_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    args: [sessionId]
  });

  return {
    data: { id: Number(result.lastInsertRowid) },
    error: null
  };
}

export async function getSessionMessages(sessionId, userId) {
  const db = getDb();
  if (!db) return [];

  const result = await db.execute({
    sql: 'SELECT * FROM messages WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC',
    args: [sessionId, userId]
  });

  return result.rows.map(row => ({
    id: row.id,
    session_id: row.session_id,
    user_id: row.user_id,
    role: row.role,
    content: row.content,
    sources: row.sources ? JSON.parse(row.sources) : null,
    created_at: row.created_at,
  }));
}

export default {
  getDb,
  initTables,
  getOrCreateSession,
  getUserSessions,
  updateSession,
  deleteSession,
  insertFile,
  getSessionFiles,
  deleteFile,
  insertMessage,
  getSessionMessages,
};
