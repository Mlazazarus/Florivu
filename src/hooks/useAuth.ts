import { useState, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { logError, logInfo } from '../lib/logger';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    logInfo('Auth', 'Loading initial session.');
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      logInfo('Auth', 'Initial session loaded.', { hasSession: Boolean(session) });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      logInfo('Auth', 'Auth state changed.', {
        event: _e,
        hasSession: Boolean(session),
        userEmail: session?.user?.email ?? null,
      });
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn  = async (email: string, password: string) => {
    logInfo('Auth', 'Attempting sign in.', { email });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      logError('Auth', 'Sign in failed.', error);
      throw error;
    }
    logInfo('Auth', 'Sign in succeeded.', { email });
  };
  const signUp  = async (email: string, password: string) => {
    logInfo('Auth', 'Attempting sign up.', { email });
    const options =
      typeof window === 'undefined' ? undefined : { emailRedirectTo: window.location.origin };
    const { error } = await supabase.auth.signUp({ email, password, options });
    if (error) {
      logError('Auth', 'Sign up failed.', error);
      throw error;
    }
    logInfo('Auth', 'Sign up succeeded.', { email });
  };
  const signOut = async () => {
    logInfo('Auth', 'Attempting sign out.');
    const { error } = await supabase.auth.signOut();
    if (error) {
      logError('Auth', 'Sign out failed.', error);
      throw error;
    }
    logInfo('Auth', 'Sign out succeeded.');
  };

  return { session, user, loading, signIn, signUp, signOut };
}
