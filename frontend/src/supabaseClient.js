import { createClient } from '@supabase/supabase-js';

// Both values are public (the anon key only allows sign-in and Realtime; the tables are locked to the API).
export const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY must be set at build time.');
}

export const supabase = createClient(SUPABASE_URL || 'http://localhost:54321', SUPABASE_ANON_KEY || 'missing-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
