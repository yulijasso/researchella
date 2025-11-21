import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Server-side admin client (bypasses RLS) - only use when needed
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// Create server client for API routes (uses cookies)
export function createSupabaseServerClient(req, res) {
  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name) {
          return req.cookies[name];
        },
        set(name, value, options) {
          res.setHeader('Set-Cookie', `${name}=${value}; Path=/; ${options.maxAge ? `Max-Age=${options.maxAge};` : ''} HttpOnly; SameSite=Lax; Secure`);
        },
        remove(name, options) {
          res.setHeader('Set-Cookie', `${name}=; Path=/; Max-Age=0`);
        },
      },
    }
  );
}

// Get authenticated user from API route
export async function getAuthUser(req, res) {
  const supabase = createSupabaseServerClient(req, res);

  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return { user: null, error: error?.message || 'Not authenticated' };
    }

    return { user, error: null };
  } catch (error) {
    return { user: null, error: error.message };
  }
}
