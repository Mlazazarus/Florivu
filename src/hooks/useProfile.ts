import { useCallback, useEffect, useState } from 'react';
import { fetchLocalProfile, saveLocalProfile } from '../lib/localProfileApi';
import { logError, logInfo } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../types';

function shouldUseLocalProfileFallback(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message).toLowerCase()
      : String(error ?? '').toLowerCase();

  return (
    message.includes("could not find the table 'public.profiles'") ||
    message.includes('schema cache') ||
    message.includes('relation "profiles" does not exist')
  );
}

function defaultDisplayName(userEmail: string | undefined) {
  if (!userEmail) {
    return 'PlantDex user';
  }

  return userEmail.split('@')[0] || 'PlantDex user';
}

function createDefaultProfile(userId: string, userEmail: string | undefined): UserProfile {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    display_name: defaultDisplayName(userEmail),
    profile_photo_url: null,
    home_zip_code: null,
    facebook_url: null,
    is_public: false,
    created_at: now,
    updated_at: now,
  };
}

export interface SaveProfileInput {
  display_name: string;
  profile_photo_url?: string | null;
  home_zip_code?: string | null;
  facebook_url?: string | null;
  is_public: boolean;
}

export function useProfile(userId: string | undefined, userEmail: string | undefined) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<'supabase' | 'local'>('supabase');

  useEffect(() => {
    if (userId) {
      return;
    }

    setProfile(null);
    setError(null);
    setStorageMode('supabase');
  }, [userId]);

  const fetchProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    logInfo('Profile', 'Fetching profile.', { userId });

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      setProfile((data as UserProfile | null) ?? createDefaultProfile(userId, userEmail));
      setStorageMode('supabase');
      logInfo('Profile', 'Profile fetch complete.', {
        userId,
        hasProfile: Boolean(data),
      });
    } catch (fetchError: any) {
      if (shouldUseLocalProfileFallback(fetchError)) {
        const localProfile = await fetchLocalProfile(userId);
        setProfile(localProfile ?? createDefaultProfile(userId, userEmail));
        setStorageMode('local');
        setError(null);
        logInfo('Profile', 'Profiles table missing. Using local profile fallback.', {
          userId,
          hasLocalProfile: Boolean(localProfile),
        });
      } else {
        setError(fetchError.message ?? 'Unknown error');
        logError('Profile', 'Profile fetch failed.', fetchError);
      }
    } finally {
      setLoading(false);
    }
  }, [userEmail, userId]);

  const saveProfile = async (input: SaveProfileInput): Promise<UserProfile> => {
    if (!userId) {
      throw new Error('No signed-in user.');
    }

    const existingProfile = profile ?? createDefaultProfile(userId, userEmail);
    const now = new Date().toISOString();
    const nextProfile: UserProfile = {
      ...existingProfile,
      user_id: userId,
      display_name: input.display_name.trim() || defaultDisplayName(userEmail),
      profile_photo_url: input.profile_photo_url ?? null,
      home_zip_code: input.home_zip_code?.trim() || null,
      facebook_url: input.facebook_url?.trim() || null,
      is_public: input.is_public,
      updated_at: now,
    };

    setSaving(true);
    setError(null);
    logInfo('Profile', 'Saving profile.', {
      userId,
      displayName: nextProfile.display_name,
      isPublic: nextProfile.is_public,
    });

    try {
      const { data, error: saveError } = await supabase
        .from('profiles')
        .upsert(nextProfile, { onConflict: 'user_id' })
        .select()
        .single();

      if (saveError) {
        throw saveError;
      }

      const savedProfile = data as UserProfile;
      setProfile(savedProfile);
      setStorageMode('supabase');
      logInfo('Profile', 'Profile saved.', { userId });
      return savedProfile;
    } catch (saveError) {
      if (shouldUseLocalProfileFallback(saveError)) {
        const savedProfile = await saveLocalProfile(nextProfile);
        setProfile(savedProfile);
        setStorageMode('local');
        logInfo('Profile', 'Profiles table missing. Saved profile locally instead.', {
          userId,
        });
        return savedProfile;
      }

      setError(saveError instanceof Error ? saveError.message : 'Unknown error');
      logError('Profile', 'Profile save failed.', saveError);
      throw saveError;
    } finally {
      setSaving(false);
    }
  };

  return {
    profile,
    loading,
    saving,
    error,
    storageMode,
    fetchProfile,
    saveProfile,
  };
}
