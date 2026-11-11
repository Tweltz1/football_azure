import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// The shared hobby-app Supabase project. The anon key is public (row level security protects the
// data); the GitHub build passes it in as EXPO_PUBLIC_SUPABASE_ANON_KEY.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://nkwedlskhnojseeroezm.supabase.co';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const cloudConfigured = anonKey.length > 0;

export const supabase = createClient(url, anonKey || 'missing-anon-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

/** Google sign-in comes back here (tools/setup_accounts.py adds it to Supabase's allowed list). */
export const AUTH_REDIRECT = 'groceryrunner://auth';
