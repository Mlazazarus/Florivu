import { useCallback, useEffect, useState } from 'react';
import { saveLocalProfile } from '../lib/localProfileApi';
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

function isDuplicateDisplayNameError(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message).toLowerCase()
      : String(error ?? '').toLowerCase();

  return (
    message.includes('duplicate key') ||
    message.includes('display name is already in use') ||
    (message.includes('display_name') && message.includes('unique'))
  );
}

function defaultDisplayName(
  userEmail: string | undefined,
  userId?: string,
  variant = 0,
) {
  const baseDisplayName = userEmail?.split('@')[0]?.trim() || 'PlantDex user';

  if (variant <= 0 || !userId) {
    return baseDisplayName;
  }

  const suffix = userId.slice(0, 6);
  return variant === 1 ? `${baseDisplayName}-${suffix}` : `${baseDisplayName}-${suffix}-${variant}`;
}

function createDefaultProfile(
  userId: string,
  userEmail: string | undefined,
  variant = 0,
): UserProfile {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    display_name: defaultDisplayName(userEmail, userId, variant),
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

    const persistDefaultProfile = async (
      variant = 0,
    ): Promise<{ profile: UserProfile; storageMode: 'supabase' | 'local' }> => {
      const candidateProfile = createDefaultProfile(userId, userEmail, variant);

      try {
        const { data: savedProfile, error: saveError } = await supabase
          .from('profiles')
          .upsert(candidateProfile, { onConflict: 'user_id' })
          .select()
          .single();

        if (saveError) {
          throw saveError;
        }

        return {
          profile: savedProfile as UserProfile,
          storageMode: 'supabase',
        };
      } catch (saveError: any) {
        if (shouldUseLocalProfileFallback(saveError)) {
          try {
            const localSavedProfile = await saveLocalProfile(candidateProfile);
            return {
              profile: localSavedProfile,
              storageMode: 'local',
            };
          } catch (localSaveError) {
            if (variant === 0 && isDuplicateDisplayNameError(localSaveError)) {
              return persistDefaultProfile(1);
            }

            throw localSaveError;
          }
        }

        if (variant === 0 && isDuplicateDisplayNameError(saveError)) {
          return persistDefaultProfile(1);
        }

        throw saveError;
      }
    };

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      if (data) {
        setProfile(data as UserProfile);
        setStorageMode('supabase');
        logInfo('Profile', 'Profile fetch complete.', {
          userId,
          hasProfile: true,
        });
      } else {
        const { profile: savedProfile, storageMode: nextStorageMode } =
          await persistDefaultProfile();

        setProfile(savedProfile);
        setStorageMode(nextStorageMode);
        logInfo('Profile', 'Default profile created.', {
          userId,
          displayName: savedProfile.display_name,
          storageMode: nextStorageMode,
        });
      }
    } catch (fetchError: any) {
      if (shouldUseLocalProfileFallback(fetchError)) {
        const { profile: localProfile, storageMode: nextStorageMode } =
          await persistDefaultProfile();
        setProfile(localProfile);
        setStorageMode(nextStorageMode);
        setError(null);
        logInfo('Profile', 'Profiles table missing. Using local profile fallback.', {
          userId,
          createdDefaultProfile: true,
          displayName: localProfile.display_name,
          storageMode: nextStorageMode,
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
      display_name: input.display_name.trim() || defaultDisplayName(userEmail, userId),
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

      const nextError = isDuplicateDisplayNameError(saveError)
        ? new Error('Display name is already in use. Choose another one.')
        : saveError instanceof Error
          ? saveError
          : new Error('Unknown error');
      setError(nextError.message);
      logError('Profile', 'Profile save failed.', saveError);
      throw nextError;
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
