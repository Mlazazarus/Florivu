import { purgeLocalFallbackDataForUser } from './localFallbackStore';
import { logError, logInfo } from './logger';
import { supabase } from './supabase';

export async function deleteAccount(userId: string): Promise<void> {
  logInfo('AccountApi', 'Requesting account deletion.', { userId });

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token?.trim();

  if (!accessToken) {
    throw new Error('You must be signed in to delete your account.');
  }

  const response = await fetch('/api/account/delete', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    const error = new Error(`Account deletion failed with ${response.status}: ${bodyText}`);
    logError('AccountApi', 'Account deletion failed.', error);
    throw error;
  }

  try {
    await purgeLocalFallbackDataForUser(userId);
  } catch (error) {
    logError('AccountApi', 'Account deletion succeeded, but local fallback cleanup failed.', error);
  }

  logInfo('AccountApi', 'Account deletion request succeeded.', { userId });
}
