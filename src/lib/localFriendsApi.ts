import { FriendProfile, UserProfile } from '../types';
import { logError, logInfo } from './logger';

export interface AddFriendResult {
  alreadyAdded: boolean;
  friend: UserProfile;
  isMutual: boolean;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Local friends API ${response.status}: ${bodyText}`);
  }

  return (await response.json()) as T;
}

export async function fetchLocalFriends(userId: string): Promise<FriendProfile[]> {
  logInfo('LocalFriends', 'Fetching friends from local fallback store.', { userId });

  try {
    const response = await fetch(`/api/local-friends?userId=${encodeURIComponent(userId)}`);
    return await parseJsonResponse<FriendProfile[]>(response);
  } catch (error) {
    logError('LocalFriends', 'Failed to fetch local fallback friends.', error);
    throw error;
  }
}

export async function fetchLocalCompletedFriendReferralCount(userId: string): Promise<number> {
  logInfo('LocalFriends', 'Fetching completed friend referral count from local fallback store.', {
    userId,
  });

  try {
    const response = await fetch(
      `/api/local-friends/referrals/count?userId=${encodeURIComponent(userId)}`,
    );
    const payload = await parseJsonResponse<{ count?: number }>(response);
    return Number(payload.count ?? 0);
  } catch (error) {
    logError('LocalFriends', 'Failed to fetch local fallback completed referral count.', error);
    throw error;
  }
}

export async function acceptLocalFriendRequest(
  userId: string,
  friendUserId: string,
): Promise<AddFriendResult> {
  logInfo('LocalFriends', 'Accepting friend request in local fallback store.', {
    userId,
    friendUserId,
  });

  try {
    const response = await fetch('/api/local-friends/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, friendUserId }),
    });
    return await parseJsonResponse<AddFriendResult>(response);
  } catch (error) {
    logError('LocalFriends', 'Failed to accept local fallback friend request.', error);
    throw error;
  }
}

export async function fetchLocalIncomingFriendRequests(userId: string): Promise<UserProfile[]> {
  logInfo('LocalFriends', 'Fetching incoming friend requests from local fallback store.', {
    userId,
  });

  try {
    const response = await fetch(`/api/local-friends/incoming?userId=${encodeURIComponent(userId)}`);
    return await parseJsonResponse<UserProfile[]>(response);
  } catch (error) {
    logError('LocalFriends', 'Failed to fetch local fallback incoming friend requests.', error);
    throw error;
  }
}

export async function rejectLocalFriendRequest(
  userId: string,
  friendUserId: string,
): Promise<{ ok: boolean }> {
  logInfo('LocalFriends', 'Rejecting friend request in local fallback store.', {
    userId,
    friendUserId,
  });

  try {
    const searchParams = new URLSearchParams({ userId, friendUserId });
    const response = await fetch(`/api/local-friends/request?${searchParams.toString()}`, {
      method: 'DELETE',
    });
    return await parseJsonResponse<{ ok: boolean }>(response);
  } catch (error) {
    logError('LocalFriends', 'Failed to reject local fallback friend request.', error);
    throw error;
  }
}

export async function searchLocalProfilesByDisplayName(
  userId: string,
  query: string,
): Promise<UserProfile[]> {
  logInfo('LocalFriends', 'Searching local profiles by display name.', { userId, query });

  try {
    const searchParams = new URLSearchParams({
      userId,
      query,
    });
    const response = await fetch(`/api/local-friends/search?${searchParams.toString()}`);
    return await parseJsonResponse<UserProfile[]>(response);
  } catch (error) {
    logError('LocalFriends', 'Failed to search local profiles.', error);
    throw error;
  }
}

export async function addLocalFriendByDisplayName(
  userId: string,
  displayName: string,
): Promise<AddFriendResult> {
  logInfo('LocalFriends', 'Adding friend by display name in local fallback store.', {
    userId,
    displayName,
  });

  try {
    const response = await fetch('/api/local-friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, displayName }),
    });
    return await parseJsonResponse<AddFriendResult>(response);
  } catch (error) {
    logError('LocalFriends', 'Failed to add local fallback friend.', error);
    throw error;
  }
}
