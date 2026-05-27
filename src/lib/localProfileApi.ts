import { UserProfile } from '../types';
import { logError, logInfo } from './logger';

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Local profile API ${response.status}: ${bodyText}`);
  }

  return (await response.json()) as T;
}

export async function fetchLocalProfile(userId: string): Promise<UserProfile | null> {
  logInfo('LocalProfile', 'Fetching profile from local fallback store.', { userId });

  try {
    const response = await fetch(`/api/local-profile?userId=${encodeURIComponent(userId)}`);
    return await parseJsonResponse<UserProfile | null>(response);
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
  });

  try {
    const response = await fetch('/api/local-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    return await parseJsonResponse<UserProfile>(response);
  } catch (error) {
    logError('LocalProfile', 'Failed to save local fallback profile.', error);
    throw error;
  }
}
