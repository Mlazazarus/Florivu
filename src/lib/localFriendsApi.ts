import { FriendProfile, UserProfile } from '../types';
import {
  acceptLocalFriendRequestInStore,
  addLocalFriendByDisplayNameInStore,
  fetchLocalCompletedFriendReferralCountFromStore,
  fetchLocalFriendsFromStore,
  fetchLocalIncomingFriendRequestsFromStore,
  rejectLocalFriendRequestInStore,
  searchLocalProfilesByDisplayNameInStore,
} from './localFallbackStore';
import { logError, logInfo } from './logger';

export interface AddFriendResult {
  alreadyAdded: boolean;
  friend: UserProfile;
  isMutual: boolean;
}

export async function fetchLocalFriends(userId: string): Promise<FriendProfile[]> {
  logInfo('LocalFriends', 'Fetching friends from local fallback store.', { userId });

  try {
    return await fetchLocalFriendsFromStore(userId);
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
    return await fetchLocalCompletedFriendReferralCountFromStore(userId);
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
    return await acceptLocalFriendRequestInStore(userId, friendUserId);
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
    return await fetchLocalIncomingFriendRequestsFromStore(userId);
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
    return await rejectLocalFriendRequestInStore(userId, friendUserId);
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
    return await searchLocalProfilesByDisplayNameInStore(userId, query);
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
    return await addLocalFriendByDisplayNameInStore(userId, displayName);
  } catch (error) {
    logError('LocalFriends', 'Failed to add local fallback friend.', error);
    throw error;
  }
}
