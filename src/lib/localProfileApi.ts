import { UserProfile } from '../types';
import {
  fetchLocalProfileFromStore,
  saveLocalProfileToStore,
} from './localFallbackStore';
import { logError, logInfo } from './logger';

export async function fetchLocalProfile(userId: string): Promise<UserProfile | null> {
  logInfo('LocalProfile', 'Fetching profile from local fallback store.', { userId });

  try {
    return await fetchLocalProfileFromStore(userId);
  } catch (error) {
    logError('LocalProfile', 'Failed to fetch local fallback profile.', error);
    throw error;
  }
}

export async function saveLocalProfile(profile: Omit<UserProfile, 'created_at' | 'updated_at'> & {
  created_at?: string;
}): Promise<UserProfile> {
  logInfo('LocalProfile', 'Saving profile to local fallback store.', {
    userId: profile.user_id,
    displayName: profile.display_name,
    hasProfilePhoto: Boolean(profile.profile_photo_url),
    homeZipCode: profile.home_zip_code ?? null,
    selectedAvatarBorderId: profile.selected_avatar_border_id ?? null,
    selectedProfileTitleId: profile.selected_profile_title_id ?? null,
  });

  try {
    return await saveLocalProfileToStore(profile);
  } catch (error) {
    logError('LocalProfile', 'Failed to save local fallback profile.', error);
    throw error;
  }
}
