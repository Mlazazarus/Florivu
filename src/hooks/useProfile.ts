import { useCallback, useEffect, useState } from 'react';
import { FREE_ACCOUNT_TIER, normalizeAccountTier } from '../lib/accountTier';
import { recoverProfileFromSupabaseOrLocal } from '../lib/localFallbackRecovery';
import { fetchLocalProfile, saveLocalProfile } from '../lib/localProfileApi';
import { logError, logInfo } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { AccountTier, UserProfile } from '../types';

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
  const baseDisplayName = userEmail?.split('@')[0]?.trim() || 'Florivu user';

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
    account_tier: FREE_ACCOUNT_TIER,
    profile_photo_url: null,
    home_zip_code: null,
    marketplace_zip_code: null,
    facebook_url: null,
    facebook_user_id: null,
    facebook_name: null,
    facebook_connected_at: null,
    earned_achievement_ids: [],
    referred_by_user_id: null,
    selected_avatar_border_id: null,
    selected_profile_title_id: null,
    featured_house_plant_observation_id: null,
    featured_non_house_plant_observation_id: null,
    care_alerts_enabled: false,
    care_alert_email: userEmail?.trim() || null,
    care_alert_timezone:
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        : 'UTC',
    care_alert_last_sent_at: null,
    is_public: false,
    created_at: now,
    updated_at: now,
  };
}

function normalizeUserProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    account_tier: normalizeAccountTier(profile.account_tier),
  };
}

function normalizeOptionalInputString(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

const LOCAL_PROFILE_MIRROR_ERROR =
  'Profile saved to your Florivu account, but the local device copy could not be refreshed.';
const LOCAL_PROFILE_FETCH_MIRROR_ERROR =
  'Profile loaded from your Florivu account, but the local device copy could not be refreshed.';

async function mirrorProfileToLocalStore(profile: UserProfile) {
  try {
    await saveLocalProfile(profile);
    return true;
  } catch (error) {
    logError('Profile', 'Failed to mirror profile to the local store.', error);
    return false;
  }
}

export interface SaveProfileInput {
  display_name: string;
  account_tier?: AccountTier;
  profile_photo_url?: string | null;
  home_zip_code?: string | null;
  marketplace_zip_code?: string | null;
  facebook_url?: string | null;
  facebook_user_id?: string | null;
  facebook_name?: string | null;
  facebook_connected_at?: string | null;
  earned_achievement_ids?: string[];
  referred_by_user_id?: string | null;
  selected_avatar_border_id?: string | null;
  selected_profile_title_id?: string | null;
  featured_house_plant_observation_id?: string | null;
  featured_non_house_plant_observation_id?: string | null;
  care_alerts_enabled?: boolean;
  care_alert_email?: string | null;
  care_alert_timezone?: string | null;
  care_alert_last_sent_at?: string | null;
  is_public: boolean;
}

export function buildProfileForSave(args: {
  existingProfile: UserProfile;
  input: SaveProfileInput;
  userId: string;
  userEmail: string | undefined;
  now?: string;
}): UserProfile {
  const { existingProfile, input, userId, userEmail } = args;
  const now = args.now ?? new Date().toISOString();
  const nextEarnedAchievementIds =
    input.earned_achievement_ids !== undefined
      ? Array.from(new Set(input.earned_achievement_ids))
      : existingProfile.earned_achievement_ids ?? [];
  const nextReferredByUserId =
    input.referred_by_user_id !== undefined
      ? input.referred_by_user_id?.trim() || null
      : existingProfile.referred_by_user_id ?? null;
  const nextSelectedAvatarBorderId =
    input.selected_avatar_border_id !== undefined
      ? input.selected_avatar_border_id
      : existingProfile.selected_avatar_border_id ?? null;
  const nextSelectedProfileTitleId =
    input.selected_profile_title_id !== undefined
      ? input.selected_profile_title_id
      : existingProfile.selected_profile_title_id ?? null;
  const nextFeaturedHousePlantObservationId =
    input.featured_house_plant_observation_id !== undefined
      ? input.featured_house_plant_observation_id?.trim() || null
      : existingProfile.featured_house_plant_observation_id ?? null;
  const nextFeaturedNonHousePlantObservationId =
    input.featured_non_house_plant_observation_id !== undefined
      ? input.featured_non_house_plant_observation_id?.trim() || null
      : existingProfile.featured_non_house_plant_observation_id ?? null;
  const nextAccountTier =
    input.account_tier !== undefined
      ? normalizeAccountTier(input.account_tier)
      : normalizeAccountTier(existingProfile.account_tier);
  const nextCareAlertsEnabled =
    input.care_alerts_enabled !== undefined
      ? input.care_alerts_enabled
      : existingProfile.care_alerts_enabled ?? false;
  const nextCareAlertEmail =
    input.care_alert_email !== undefined
      ? input.care_alert_email?.trim() || null
      : existingProfile.care_alert_email ?? (userEmail?.trim() || null);
  const nextCareAlertTimezone =
    input.care_alert_timezone !== undefined
      ? input.care_alert_timezone?.trim() || null
      : existingProfile.care_alert_timezone ??
        (typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
          : 'UTC');
  const nextCareAlertLastSentAt =
    input.care_alert_last_sent_at !== undefined
      ? input.care_alert_last_sent_at?.trim() || null
      : existingProfile.care_alert_last_sent_at ?? null;

  return {
    ...existingProfile,
    user_id: userId,
    display_name: input.display_name.trim() || defaultDisplayName(userEmail, userId),
    account_tier: nextAccountTier,
    profile_photo_url:
      input.profile_photo_url !== undefined
        ? input.profile_photo_url
        : existingProfile.profile_photo_url ?? null,
    home_zip_code:
      normalizeOptionalInputString(input.home_zip_code) !== undefined
        ? normalizeOptionalInputString(input.home_zip_code)
        : existingProfile.home_zip_code ?? null,
    marketplace_zip_code:
      normalizeOptionalInputString(input.marketplace_zip_code) !== undefined
        ? normalizeOptionalInputString(input.marketplace_zip_code)
        : existingProfile.marketplace_zip_code ?? null,
    facebook_url:
      normalizeOptionalInputString(input.facebook_url) !== undefined
        ? normalizeOptionalInputString(input.facebook_url)
        : existingProfile.facebook_url ?? null,
    facebook_user_id:
      normalizeOptionalInputString(input.facebook_user_id) !== undefined
        ? normalizeOptionalInputString(input.facebook_user_id)
        : existingProfile.facebook_user_id ?? null,
    facebook_name:
      normalizeOptionalInputString(input.facebook_name) !== undefined
        ? normalizeOptionalInputString(input.facebook_name)
        : existingProfile.facebook_name ?? null,
    facebook_connected_at:
      normalizeOptionalInputString(input.facebook_connected_at) !== undefined
        ? normalizeOptionalInputString(input.facebook_connected_at)
        : existingProfile.facebook_connected_at ?? null,
    earned_achievement_ids: nextEarnedAchievementIds,
    referred_by_user_id: nextReferredByUserId,
    selected_avatar_border_id: nextSelectedAvatarBorderId ?? null,
    selected_profile_title_id: nextSelectedProfileTitleId ?? null,
    featured_house_plant_observation_id: nextFeaturedHousePlantObservationId,
    featured_non_house_plant_observation_id: nextFeaturedNonHousePlantObservationId,
    care_alerts_enabled: nextCareAlertsEnabled,
    care_alert_email: nextCareAlertEmail,
    care_alert_timezone: nextCareAlertTimezone,
    care_alert_last_sent_at: nextCareAlertLastSentAt,
    is_public: input.is_public,
    updated_at: now,
  };
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

    const loadOrCreateLocalProfile = async (variant = 0): Promise<UserProfile> => {
      const existingLocalProfile = await fetchLocalProfile(userId);
      if (existingLocalProfile) {
        return existingLocalProfile;
      }

      const candidateProfile = createDefaultProfile(userId, userEmail, variant);

      try {
        return await saveLocalProfile(candidateProfile);
      } catch (localSaveError) {
        if (variant === 0 && isDuplicateDisplayNameError(localSaveError)) {
          return loadOrCreateLocalProfile(1);
        }

        throw localSaveError;
      }
    };

    const persistDefaultProfile = async (
      variant = 0,
    ): Promise<{
      profile: UserProfile;
      storageMode: 'supabase' | 'local';
      localMirrorHealthy: boolean;
    }> => {
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

        const normalizedSavedProfile = normalizeUserProfile(savedProfile as UserProfile);
        const mirroredLocally = await mirrorProfileToLocalStore(normalizedSavedProfile);

        return {
          profile: normalizedSavedProfile,
          storageMode: 'supabase',
          localMirrorHealthy: mirroredLocally,
        };
      } catch (saveError: any) {
        if (shouldUseLocalProfileFallback(saveError)) {
          const localSavedProfile = await loadOrCreateLocalProfile(variant);
          return {
            profile: localSavedProfile,
            storageMode: 'local',
            localMirrorHealthy: true,
          };
        }

        if (variant === 0 && isDuplicateDisplayNameError(saveError)) {
          return persistDefaultProfile(1);
        }

        throw saveError;
      }
    };

    try {
      const recoveredProfile = await recoverProfileFromSupabaseOrLocal(userId, userEmail);

      if (recoveredProfile.profile) {
        const mirroredLocally =
          recoveredProfile.storageMode === 'supabase'
            ? await mirrorProfileToLocalStore(recoveredProfile.profile)
            : true;

        setProfile(recoveredProfile.profile);
        setStorageMode(recoveredProfile.storageMode);
        setError(
          recoveredProfile.storageMode === 'supabase' && !mirroredLocally
            ? LOCAL_PROFILE_FETCH_MIRROR_ERROR
            : null,
        );
        logInfo(
          'Profile',
          recoveredProfile.recovered
            ? 'Recovered profile fields from local fallback data.'
            : recoveredProfile.storageMode === 'local'
              ? 'Using the local profile copy after recovery could not reach Supabase.'
              : 'Profile fetch complete.',
          {
            userId,
            hasProfile: true,
            mirroredLocally,
            storageMode: recoveredProfile.storageMode,
          },
        );
      } else {
        const {
          profile: savedProfile,
          storageMode: nextStorageMode,
          localMirrorHealthy,
        } = await persistDefaultProfile();

        setProfile(savedProfile);
        setStorageMode(nextStorageMode);
        setError(
          nextStorageMode === 'supabase' && !localMirrorHealthy
            ? LOCAL_PROFILE_MIRROR_ERROR
            : null,
        );
        logInfo('Profile', 'Default profile created.', {
          userId,
          displayName: savedProfile.display_name,
          storageMode: nextStorageMode,
          mirroredLocally: localMirrorHealthy,
        });
      }
    } catch (fetchError: any) {
      if (shouldUseLocalProfileFallback(fetchError)) {
        const localProfile = await loadOrCreateLocalProfile();
        setProfile(localProfile);
        setStorageMode('local');
        setError(null);
        logInfo('Profile', 'Profiles table missing. Using local profile fallback.', {
          userId,
          resolvedFromLocalStore: true,
          displayName: localProfile.display_name,
          storageMode: 'local',
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
    const nextProfile = buildProfileForSave({
      existingProfile,
      input,
      userId,
      userEmail,
    });
    const previousProfile = profile;

    setSaving(true);
    setError(null);
    setProfile(nextProfile);
    logInfo('Profile', 'Saving profile.', {
      userId,
      displayName: nextProfile.display_name,
      hasProfilePhoto: Boolean(nextProfile.profile_photo_url),
      homeZipCode: nextProfile.home_zip_code,
      isPublic: nextProfile.is_public,
      selectedAvatarBorderId: nextProfile.selected_avatar_border_id,
      selectedProfileTitleId: nextProfile.selected_profile_title_id,
      featuredHousePlantObservationId: nextProfile.featured_house_plant_observation_id,
      featuredNonHousePlantObservationId:
        nextProfile.featured_non_house_plant_observation_id,
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
      const normalizedSavedProfile = normalizeUserProfile(savedProfile);
      const mirroredLocally = await mirrorProfileToLocalStore(normalizedSavedProfile);
      setProfile(normalizedSavedProfile);
      setStorageMode('supabase');
      setError(mirroredLocally ? null : LOCAL_PROFILE_MIRROR_ERROR);
      logInfo('Profile', 'Profile saved.', { userId });
      return normalizedSavedProfile;
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

      setProfile(previousProfile ?? existingProfile);
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
