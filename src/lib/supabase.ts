import { createClient } from '@supabase/supabase-js';
import { logInfo, logWarn } from './logger';

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
  logWarn('Supabase', 'Missing env vars. Auth and database access will not work.', {
    hasUrl: Boolean(SUPABASE_URL),
    hasPublishableKey: Boolean(SUPABASE_PUBLISHABLE_KEY),
  });
} else {
  logInfo('Supabase', 'Supabase client configured.', {
    url: SUPABASE_URL,
  });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
