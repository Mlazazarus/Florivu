import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  import.meta.env.EXPO_PUBLIC_SUPABASE_URL ??
  import.meta.env.VITE_SUPABASE_URL ??
  '';

const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  '';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.warn('[Supabase] Missing env vars - auth and DB will not work.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
