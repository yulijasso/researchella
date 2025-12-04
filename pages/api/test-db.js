import { supabase } from '../../lib/supabase';
import { supabaseAdmin } from '../../lib/supabaseServer';
import { getAuth } from '@clerk/nextjs/server';

export default async function handler(req, res) {
  const { userId } = getAuth(req);

  const results = {
    timestamp: new Date().toISOString(),
    userId: userId || 'not authenticated',
    supabaseAdmin: supabaseAdmin ? 'AVAILABLE' : 'NULL (service key missing)',
    tests: []
  };

  const db = supabaseAdmin || supabase;
  const clientType = supabaseAdmin ? 'supabaseAdmin' : 'supabase (anon)';

  // Test 1: Can we connect at all?
  try {
    const { data, error } = await db.from('sessions').select('count').limit(1);
    results.tests.push({
      test: 'Basic connection',
      client: clientType,
      success: !error,
      error: error?.message || null
    });
  } catch (e) {
    results.tests.push({
      test: 'Basic connection',
      client: clientType,
      success: false,
      error: e.message
    });
  }

  // Test 2: Can we read sessions for this user?
  if (userId) {
    try {
      const { data, error } = await db
        .from('sessions')
        .select('id, name')
        .eq('user_id', userId)
        .limit(5);
      results.tests.push({
        test: 'Read user sessions',
        client: clientType,
        success: !error,
        count: data?.length || 0,
        error: error?.message || null
      });
    } catch (e) {
      results.tests.push({
        test: 'Read user sessions',
        client: clientType,
        success: false,
        error: e.message
      });
    }
  }

  // Test 3: Can we read uploaded_files?
  if (userId) {
    try {
      const { data, error } = await db
        .from('uploaded_files')
        .select('id, name, session_id')
        .eq('user_id', userId)
        .limit(5);
      results.tests.push({
        test: 'Read user files',
        client: clientType,
        success: !error,
        count: data?.length || 0,
        files: data?.map(f => ({ id: f.id, name: f.name, session: f.session_id })) || [],
        error: error?.message || null
      });
    } catch (e) {
      results.tests.push({
        test: 'Read user files',
        client: clientType,
        success: false,
        error: e.message
      });
    }
  }

  // Test 4: Try inserting a test file (then delete it)
  if (userId) {
    const testSessionId = 'test-' + Date.now();

    // First create a test session
    try {
      const { data: sessionData, error: sessionError } = await db
        .from('sessions')
        .insert({ id: testSessionId, user_id: userId, name: 'DB Test Session' })
        .select()
        .single();

      if (sessionError) {
        results.tests.push({
          test: 'Insert test session',
          client: clientType,
          success: false,
          error: sessionError.message,
          code: sessionError.code
        });
      } else {
        results.tests.push({
          test: 'Insert test session',
          client: clientType,
          success: true,
          sessionId: sessionData?.id
        });

        // Now try inserting a file
        const { data: fileData, error: fileError } = await db
          .from('uploaded_files')
          .insert({
            session_id: testSessionId,
            user_id: userId,
            name: 'test-file.pdf',
            type: 'pdf',
            chunks: 1
          })
          .select()
          .single();

        if (fileError) {
          results.tests.push({
            test: 'Insert test file',
            client: clientType,
            success: false,
            error: fileError.message,
            code: fileError.code
          });
        } else {
          results.tests.push({
            test: 'Insert test file',
            client: clientType,
            success: true,
            fileId: fileData?.id
          });

          // Clean up - delete test file
          await db.from('uploaded_files').delete().eq('id', fileData.id);
        }

        // Clean up - delete test session
        await db.from('sessions').delete().eq('id', testSessionId);
      }
    } catch (e) {
      results.tests.push({
        test: 'Insert test',
        client: clientType,
        success: false,
        error: e.message
      });
    }
  }

  return res.status(200).json(results);
}
