// Database helper functions - MongoDB with Supabase fallback
// MongoDB has no FK constraints so sessions are auto-created!

// Check if MongoDB is configured
const useMongoDb = !!process.env.MONGODB_URI;

// Dynamic imports to avoid loading unused database
let mongoLib = null;
let supabaseLib = null;
let supabaseServerLib = null;

async function getMongoLib() {
  if (!mongoLib) {
    mongoLib = await import('./mongodb.js');
  }
  return mongoLib;
}

async function getSupabaseLib() {
  if (!supabaseLib) {
    supabaseLib = await import('./supabase.js');
  }
  return supabaseLib;
}

async function getSupabaseServerLib() {
  if (!supabaseServerLib) {
    supabaseServerLib = await import('./supabaseServer.js');
  }
  return supabaseServerLib;
}

// Get the database client (for Supabase fallback)
export async function getDb() {
  if (useMongoDb) {
    return null; // MongoDB doesn't use a single client object
  }
  const { supabaseAdmin } = await getSupabaseServerLib();
  const { supabase } = await getSupabaseLib();
  return supabaseAdmin || supabase;
}

/**
 * Safely insert a file - MongoDB just works, no FK issues!
 */
export async function safeInsertFile(fileData) {
  if (useMongoDb) {
    const mongo = await getMongoLib();
    console.log(`📁 Using MongoDB for file insert: ${fileData.name}`);
    return await mongo.insertFile({
      sessionId: fileData.session_id || fileData.sessionId,
      userId: fileData.user_id || fileData.userId,
      name: fileData.name,
      type: fileData.type,
      chunks: fileData.chunks || 0,
      pages: fileData.pages,
      size: fileData.size,
      pdfData: fileData.pdf_data || fileData.pdfData,
    });
  }

  // Supabase fallback with session auto-creation
  const db = await getDb();
  const { session_id, user_id } = fileData;

  let { data, error } = await db
    .from('uploaded_files')
    .insert(fileData)
    .select()
    .single();

  // If foreign key error, create session and retry
  if (error && error.code === '23503') {
    console.log(`⚠️ Session ${session_id} doesn't exist, creating it...`);

    const { error: sessionError } = await db
      .from('sessions')
      .upsert({
        id: session_id,
        user_id: user_id,
        name: 'New Notebook',
        tutoring_mode: 'direct',
        message_count: 0,
      }, { onConflict: 'id' });

    if (sessionError) {
      console.error('Failed to create session:', sessionError);
      return { data: null, error: sessionError };
    }

    console.log(`✅ Created session ${session_id}, retrying file insert...`);

    const retryResult = await db
      .from('uploaded_files')
      .insert(fileData)
      .select()
      .single();

    data = retryResult.data;
    error = retryResult.error;
  }

  return { data, error };
}

/**
 * Ensure a session exists in the database
 */
export async function ensureSession(sessionId, userId, name = 'New Notebook') {
  if (useMongoDb) {
    const mongo = await getMongoLib();
    await mongo.getOrCreateSession(sessionId, userId, name);
    return true;
  }

  // Supabase fallback
  const db = await getDb();
  const { error } = await db
    .from('sessions')
    .upsert({
      id: sessionId,
      user_id: userId,
      name: name,
      tutoring_mode: 'direct',
      message_count: 0,
    }, { onConflict: 'id' });

  if (error) {
    console.error('Failed to ensure session:', error);
    return false;
  }

  return true;
}

/**
 * Get all sessions for a user
 */
export async function getUserSessions(userId) {
  if (useMongoDb) {
    const mongo = await getMongoLib();
    return await mongo.getUserSessions(userId);
  }

  const db = await getDb();
  const { data, error } = await db
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error getting sessions:', error);
    return [];
  }
  return data || [];
}

/**
 * Get files for a session
 */
export async function getSessionFiles(sessionId, userId) {
  if (useMongoDb) {
    const mongo = await getMongoLib();
    return await mongo.getSessionFiles(sessionId, userId);
  }

  const db = await getDb();
  const { data, error } = await db
    .from('uploaded_files')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error getting files:', error);
    return [];
  }
  return data || [];
}

/**
 * Get messages for a session
 */
export async function getSessionMessages(sessionId, userId) {
  if (useMongoDb) {
    const mongo = await getMongoLib();
    return await mongo.getSessionMessages(sessionId, userId);
  }

  const db = await getDb();
  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error getting messages:', error);
    return [];
  }
  return data || [];
}

/**
 * Insert a message
 */
export async function insertMessage(messageData) {
  if (useMongoDb) {
    const mongo = await getMongoLib();
    return await mongo.insertMessage({
      sessionId: messageData.session_id || messageData.sessionId,
      userId: messageData.user_id || messageData.userId,
      role: messageData.role,
      content: messageData.content,
      sources: messageData.sources,
    });
  }

  const db = await getDb();
  const { data, error } = await db
    .from('messages')
    .insert({
      session_id: messageData.session_id,
      user_id: messageData.user_id,
      role: messageData.role,
      content: messageData.content,
      sources: messageData.sources,
    })
    .select()
    .single();

  return { data, error };
}

/**
 * Update a session
 */
export async function updateSession(sessionId, userId, updates) {
  if (useMongoDb) {
    const mongo = await getMongoLib();
    return await mongo.updateSession(sessionId, userId, updates);
  }

  const db = await getDb();
  const { data, error } = await db
    .from('sessions')
    .update(updates)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select()
    .single();

  return { data, error };
}

/**
 * Delete a session and all related data
 */
export async function deleteSession(sessionId, userId) {
  if (useMongoDb) {
    const mongo = await getMongoLib();
    return await mongo.deleteSession(sessionId, userId);
  }

  const db = await getDb();

  // Delete files first
  await db.from('uploaded_files').delete().eq('session_id', sessionId).eq('user_id', userId);

  // Delete messages
  await db.from('messages').delete().eq('session_id', sessionId).eq('user_id', userId);

  // Delete session
  const { error } = await db.from('sessions').delete().eq('id', sessionId).eq('user_id', userId);

  return { error };
}

/**
 * Delete a file
 */
export async function deleteFile(fileId, userId) {
  if (useMongoDb) {
    const mongo = await getMongoLib();
    return await mongo.deleteFile(fileId, userId);
  }

  const db = await getDb();
  const { error } = await db
    .from('uploaded_files')
    .delete()
    .eq('id', fileId)
    .eq('user_id', userId);

  return { error };
}

// Export database choice for logging
export { useMongoDb };
