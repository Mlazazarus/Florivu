import { useCallback, useEffect, useRef, useState } from 'react';
import { FREE_ACCOUNT_TIER, normalizeAccountTier } from '../lib/accountTier';
import {
  AddFriendResult,
  acceptLocalFriendRequest,
  addLocalFriendByDisplayName,
  fetchLocalCompletedFriendReferralCount,
  fetchLocalFriends,
  fetchLocalIncomingFriendRequests,
  rejectLocalFriendRequest,
  searchLocalProfilesByDisplayName,
} from '../lib/localFriendsApi';
import { logError, logInfo } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { FriendProfile, UserProfile } from '../types';

interface FriendshipRow {
  user_id: string;
  friend_user_id: string;
}

interface FriendStatsRow {
  user_id: string;
  display_name: string;
  account_tier?: string | null;
  profile_photo_url?: string | null;
  home_zip_code?: string | null;
  marketplace_zip_code?: string | null;
  facebook_url?: string | null;
  facebook_user_id?: string | null;
  facebook_name?: string | null;
  facebook_connected_at?: string | null;
  earned_achievement_ids?: string[] | null;
  referred_by_user_id?: string | null;
  selected_avatar_border_id?: string | null;
  selected_profile_title_id?: string | null;
  featured_house_plant_observation_id?: string | null;
  featured_non_house_plant_observation_id?: string | null;
  is_public?: boolean | null;
  is_placeholder?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  observation_count?: number | string | null;
  species_count?: number | string | null;
}

function shouldUseLocalFriendsFallback(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message).toLowerCase()
      : String(error ?? '').toLowerCase();

  return (
    message.includes("could not find the table 'public.friendships'") ||
    message.includes("could not find the table 'public.profiles'") ||
    message.includes("could not find the table 'public.observations'") ||
    message.includes('relation "friendships" does not exist') ||
    message.includes('relation "profiles" does not exist') ||
    message.includes('relation "observations" does not exist') ||
    message.includes('schema cache') ||
    message.includes('find_profile_by_display_name') ||
    message.includes('search_profiles_by_display_name') ||
    message.includes('get_mutual_friend_stats') ||
    message.includes('get_completed_friend_referral_count') ||
    message.includes('reject_friend_request')
  );
}

function buildFallbackProfile(userId: string): UserProfile {
  const now = new Date().toISOString();

  return {
    user_id: userId,
    display_name: `Friend ${userId.slice(0, 8)}`,
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
    is_public: false,
    is_placeholder: true,
    created_at: now,
    updated_at: now,
  };
}

function buildFallbackFriendProfile(userId: string): FriendProfile {
  return {
    ...buildFallbackProfile(userId),
    observation_count: 0,
    species_count: 0,
  };
}

function sortProfilesAlphabetically<T extends { display_name: string }>(profiles: T[]) {
  return [...profiles].sort((left, right) =>
    left.display_name.localeCompare(right.display_name, undefined, { sensitivity: 'base' }),
  );
}

function sortFriendProfilesByStats<T extends FriendProfile>(profiles: T[]) {
  return [...profiles].sort((left, right) => {
    const speciesDelta = right.species_count - left.species_count;
    if (speciesDelta !== 0) {
      return speciesDelta;
    }

    const observationDelta = right.observation_count - left.observation_count;
    if (observationDelta !== 0) {
      return observationDelta;
    }

    return left.display_name.localeCompare(right.display_name, undefined, {
      sensitivity: 'base',
    });
  });
}

function toUserProfile(row: {
  user_id: string;
  display_name: string;
  account_tier?: string | null;
  profile_photo_url?: string | null;
  home_zip_code?: string | null;
  marketplace_zip_code?: string | null;
  facebook_url?: string | null;
  facebook_user_id?: string | null;
  facebook_name?: string | null;
  facebook_connected_at?: string | null;
  earned_achievement_ids?: string[] | null;
  referred_by_user_id?: string | null;
  selected_avatar_border_id?: string | null;
  selected_profile_title_id?: string | null;
  featured_house_plant_observation_id?: string | null;
  featured_non_house_plant_observation_id?: string | null;
  is_public?: boolean | null;
  is_placeholder?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}): UserProfile {
  const now = new Date().toISOString();

  return {
    user_id: row.user_id,
    display_name: row.display_name,
    account_tier: normalizeAccountTier(row.account_tier),
    profile_photo_url: row.profile_photo_url ?? null,
    home_zip_code: row.home_zip_code ?? null,
    marketplace_zip_code: row.marketplace_zip_code ?? null,
    facebook_url: row.facebook_url ?? null,
    facebook_user_id: row.facebook_user_id ?? null,
    facebook_name: row.facebook_name ?? null,
    facebook_connected_at: row.facebook_connected_at ?? null,
    earned_achievement_ids: row.earned_achievement_ids ?? [],
    referred_by_user_id: row.referred_by_user_id ?? null,
    selected_avatar_border_id: row.selected_avatar_border_id ?? null,
    selected_profile_title_id: row.selected_profile_title_id ?? null,
    featured_house_plant_observation_id: row.featured_house_plant_observation_id ?? null,
    featured_non_house_plant_observation_id:
      row.featured_non_house_plant_observation_id ?? null,
    is_public: row.is_public ?? false,
    is_placeholder: row.is_placeholder ?? false,
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
  };
}

function toFriendProfile(row: FriendStatsRow): FriendProfile {
  const userProfile = toUserProfile(row);
  const observationCount = Number(row.observation_count ?? 0);
  const speciesCount = Number(row.species_count ?? 0);

  return {
    ...userProfile,
    is_placeholder: row.is_placeholder ?? userProfile.is_placeholder ?? false,
    observation_count: Number.isFinite(observationCount) ? observationCount : 0,
    species_count: Number.isFinite(speciesCount) ? speciesCount : 0,
  };
}

function mergeFriendProfile(friend: FriendProfile, profile: UserProfile | undefined) {
  if (!profile) {
    return friend;
  }

  return {
    ...friend,
    ...profile,
    earned_achievement_ids: profile.earned_achievement_ids ?? friend.earned_achievement_ids ?? [],
    selected_avatar_border_id:
      profile.selected_avatar_border_id ?? friend.selected_avatar_border_id ?? null,
    selected_profile_title_id:
      profile.selected_profile_title_id ?? friend.selected_profile_title_id ?? null,
    observation_count: friend.observation_count,
    species_count: friend.species_count,
    is_placeholder: friend.is_placeholder ?? profile.is_placeholder ?? false,
  };
}

export function useFriends(userId: string | undefined) {
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<UserProfile[]>([]);
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [responding, setResponding] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<'supabase' | 'local'>('supabase');
  const [completedReferralCount, setCompletedReferralCount] = useState(0);
  const latestSearchRequestRef = useRef(0);

  useEffect(() => {
    if (userId) {
      return;
    }

    setFriends([]);
    setIncomingRequests([]);
    setSearchResults([]);
    setError(null);
    setSearching(false);
    setResponding(false);
    setCompletedReferralCount(0);
    setStorageMode('supabase');
  }, [userId]);

  const fetchFriends = useCallback(async () => {
    if (!userId) {
      setFriends([]);
      setIncomingRequests([]);
      setCompletedReferralCount(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    logInfo('Friends', 'Fetching mutual friends.', { userId });

    try {
      const [mutualFriendsResponse, incomingResponse, referralCountResponse] = await Promise.all([
        supabase.rpc('get_mutual_friend_stats'),
        supabase.from('friendships').select('user_id').eq('friend_user_id', userId),
        supabase.rpc('get_completed_friend_referral_count'),
      ]);

      if (mutualFriendsResponse.error) {
        throw mutualFriendsResponse.error;
      }

      if (incomingResponse.error) {
        throw incomingResponse.error;
      }

      if (referralCountResponse.error) {
        throw referralCountResponse.error;
      }

      const incomingIds = Array.from(
        new Set(
          ((incomingResponse.data ?? []) as Pick<FriendshipRow, 'user_id'>[]).map(
            (row) => row.user_id,
          ),
        ),
      );
      const nextCompletedReferralCount = Number(referralCountResponse.data ?? 0);
      const mutualFriends = ((mutualFriendsResponse.data ?? []) as FriendStatsRow[]).map((row) =>
        toFriendProfile(row),
      );
      const mutualIds = new Set(mutualFriends.map((friend) => friend.user_id));
      const incomingOnlyIds = incomingIds.filter((candidateId) => !mutualIds.has(candidateId));
      const profileIds = Array.from(new Set([...mutualIds, ...incomingOnlyIds]));

      const profileMap = new Map<string, UserProfile>();
      if (profileIds.length > 0) {
        const { data: profileRows, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .in('user_id', profileIds);

        if (profileError) {
          throw profileError;
        }

        for (const friendProfile of (profileRows ?? []) as FriendStatsRow[]) {
          profileMap.set(friendProfile.user_id, toUserProfile(friendProfile));
        }
      }

      const toProfile = (friendId: string) =>
        profileMap.get(friendId) ?? buildFallbackProfile(friendId);

      const incomingFriendRequests = sortProfilesAlphabetically(
        incomingOnlyIds.map(toProfile),
      );

      const resolvedMutualFriends = sortFriendProfilesByStats(
        mutualFriends.map((friend) => mergeFriendProfile(friend, profileMap.get(friend.user_id))),
      );

      setFriends(resolvedMutualFriends);
      setIncomingRequests(incomingFriendRequests);
      setCompletedReferralCount(
        Number.isFinite(nextCompletedReferralCount) ? nextCompletedReferralCount : 0,
      );
        setStorageMode('supabase');
        logInfo('Friends', 'Friend lists fetch complete.', {
          userId,
          count: resolvedMutualFriends.length,
          incomingCount: incomingFriendRequests.length,
          completedReferralCount: nextCompletedReferralCount,
        });
    } catch (fetchError: any) {
      if (shouldUseLocalFriendsFallback(fetchError)) {
        const [localFriends, localIncomingRequests, localCompletedReferralCount] =
          await Promise.all([
            fetchLocalFriends(userId),
            fetchLocalIncomingFriendRequests(userId),
            fetchLocalCompletedFriendReferralCount(userId),
          ]);
        const sortedFriends = sortFriendProfilesByStats(
          localFriends.map((friend) => toFriendProfile(friend as FriendStatsRow)),
        );
        const sortedIncomingRequests = sortProfilesAlphabetically(localIncomingRequests);
        setFriends(sortedFriends);
        setIncomingRequests(sortedIncomingRequests);
        setCompletedReferralCount(localCompletedReferralCount);
        setStorageMode('local');
        setError(null);
        logInfo('Friends', 'Using local fallback friend store.', {
          userId,
          count: sortedFriends.length,
          incomingCount: sortedIncomingRequests.length,
          completedReferralCount: localCompletedReferralCount,
        });
      } else {
        setError(fetchError.message ?? 'Unknown error');
        logError('Friends', 'Friend fetch failed.', fetchError);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const searchProfilesByDisplayName = useCallback(
    async (query: string) => {
      const requestId = latestSearchRequestRef.current + 1;
      latestSearchRequestRef.current = requestId;

      if (!userId) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);
      setError(null);
      logInfo('Friends', 'Searching profiles by partial display name.', {
        userId,
        query: normalizedQuery,
      });

      try {
        const { data: lookupRows, error: lookupError } = await supabase.rpc(
          'search_profiles_by_display_name',
          {
            result_limit: 5,
            target_query: normalizedQuery,
          },
        );

        if (lookupError) {
          throw lookupError;
        }

        const nextResults = Array.isArray(lookupRows)
          ? lookupRows.map((row) =>
              toUserProfile(row as Partial<UserProfile> & { user_id: string; display_name: string }),
            )
          : [];
        if (latestSearchRequestRef.current === requestId) {
          setSearchResults(nextResults);
          setStorageMode('supabase');
        }
      } catch (searchError) {
        if (shouldUseLocalFriendsFallback(searchError)) {
          const localResults = await searchLocalProfilesByDisplayName(userId, normalizedQuery);
          if (latestSearchRequestRef.current === requestId) {
            setSearchResults(localResults);
            setStorageMode('local');
          }
          return;
        }

        if (latestSearchRequestRef.current === requestId) {
          setError(searchError instanceof Error ? searchError.message : 'Unknown error');
          logError('Friends', 'Profile search failed.', searchError);
        }

        throw searchError;
      } finally {
        if (latestSearchRequestRef.current === requestId) {
          setSearching(false);
        }
      }
    },
    [userId],
  );

  const addFriendByDisplayName = useCallback(
    async (displayName: string): Promise<AddFriendResult> => {
      if (!userId) {
        throw new Error('Sign in before adding friends.');
      }

      const normalizedDisplayName = displayName.trim();
      if (!normalizedDisplayName) {
        throw new Error('Enter a display name to add a friend.');
      }

      setAdding(true);
      setError(null);
      logInfo('Friends', 'Adding friend by display name.', {
        userId,
        displayName: normalizedDisplayName,
      });

      try {
        const { data: lookupRows, error: lookupError } = await supabase.rpc(
          'find_profile_by_display_name',
          { target_display_name: normalizedDisplayName },
        );

        if (lookupError) {
          throw lookupError;
        }

        const matchedRow = Array.isArray(lookupRows)
          ? ((lookupRows[0] as Partial<UserProfile> & { user_id: string; display_name: string }) ??
            null)
          : null;

        if (!matchedRow) {
          throw new Error('No user found with that display name.');
        }

        const friend = toUserProfile(matchedRow);
        if (friend.user_id === userId) {
          throw new Error('You cannot add yourself as a friend.');
        }

        const { data: existingRow, error: existingError } = await supabase
          .from('friendships')
          .select('user_id')
          .eq('user_id', userId)
          .eq('friend_user_id', friend.user_id)
          .maybeSingle();

        if (existingError) {
          throw existingError;
        }

        const alreadyAdded = Boolean(existingRow);

        if (!alreadyAdded) {
          const { error: insertError } = await supabase.from('friendships').insert({
            user_id: userId,
            friend_user_id: friend.user_id,
          });

          if (insertError) {
            throw insertError;
          }
        }

        const { data: reverseRow, error: reverseError } = await supabase
          .from('friendships')
          .select('user_id')
          .eq('user_id', friend.user_id)
          .eq('friend_user_id', userId)
          .maybeSingle();

        if (reverseError) {
          throw reverseError;
        }

        const result = {
          alreadyAdded,
          friend,
          isMutual: Boolean(reverseRow),
        };

        await fetchFriends();
        logInfo('Friends', 'Friend add completed.', {
          userId,
          friendUserId: friend.user_id,
          alreadyAdded: result.alreadyAdded,
          isMutual: result.isMutual,
        });
        return result;
      } catch (addError) {
        if (shouldUseLocalFriendsFallback(addError)) {
          const result = await addLocalFriendByDisplayName(userId, normalizedDisplayName);
          await fetchFriends();
          return result;
        }

        setError(addError instanceof Error ? addError.message : 'Unknown error');
        logError('Friends', 'Add friend failed.', addError);
        throw addError;
      } finally {
        setAdding(false);
      }
    },
    [fetchFriends, userId],
  );

  const acceptFriendRequest = useCallback(
    async (request: UserProfile): Promise<AddFriendResult> => {
      if (!userId) {
        throw new Error('Sign in before adding friends.');
      }

      if (!request.user_id) {
        throw new Error('Missing friend request user id.');
      }

      setResponding(true);
      setError(null);
      logInfo('Friends', 'Accepting friend request.', {
        userId,
        friendUserId: request.user_id,
      });

      try {
        const { data: existingRow, error: existingError } = await supabase
          .from('friendships')
          .select('user_id')
          .eq('user_id', userId)
          .eq('friend_user_id', request.user_id)
          .maybeSingle();

        if (existingError) {
          throw existingError;
        }

        const alreadyAdded = Boolean(existingRow);

        if (!alreadyAdded) {
          const { error: insertError } = await supabase.from('friendships').insert({
            user_id: userId,
            friend_user_id: request.user_id,
          });

          if (insertError) {
            throw insertError;
          }
        }

        const { data: reverseRow, error: reverseError } = await supabase
          .from('friendships')
          .select('user_id')
          .eq('user_id', request.user_id)
          .eq('friend_user_id', userId)
          .maybeSingle();

        if (reverseError) {
          throw reverseError;
        }

        const result = {
          alreadyAdded,
          friend: request,
          isMutual: Boolean(reverseRow),
        };

        await fetchFriends();
        logInfo('Friends', 'Friend request accepted.', {
          userId,
          friendUserId: request.user_id,
          alreadyAdded: result.alreadyAdded,
          isMutual: result.isMutual,
        });
        return result;
      } catch (acceptError) {
        if (shouldUseLocalFriendsFallback(acceptError)) {
          const result = await acceptLocalFriendRequest(userId, request.user_id);
          await fetchFriends();
          return result;
        }

        setError(acceptError instanceof Error ? acceptError.message : 'Unknown error');
        logError('Friends', 'Accept friend request failed.', acceptError);
        throw acceptError;
      } finally {
        setResponding(false);
      }
    },
    [fetchFriends, userId],
  );

  const rejectFriendRequest = useCallback(
    async (friendUserId: string) => {
      if (!userId) {
        throw new Error('Sign in before rejecting friends.');
      }

      if (!friendUserId) {
        throw new Error('Missing friend request user id.');
      }

      setResponding(true);
      setError(null);
      logInfo('Friends', 'Rejecting friend request.', {
        userId,
        friendUserId,
      });

      try {
        const { error: rejectError } = await supabase.rpc('reject_friend_request', {
          requester_user_id: friendUserId,
        });

        if (rejectError) {
          throw rejectError;
        }

        await fetchFriends();
        logInfo('Friends', 'Friend request rejected.', {
          userId,
          friendUserId,
        });
      } catch (rejectError) {
        if (shouldUseLocalFriendsFallback(rejectError)) {
          await rejectLocalFriendRequest(userId, friendUserId);
          await fetchFriends();
          return;
        }

        setError(rejectError instanceof Error ? rejectError.message : 'Unknown error');
        logError('Friends', 'Reject friend request failed.', rejectError);
        throw rejectError;
      } finally {
        setResponding(false);
      }
    },
    [fetchFriends, userId],
  );

  return {
    friends,
    incomingRequests,
    searchResults,
    loading,
    adding,
    responding,
    searching,
    error,
    storageMode,
    completedReferralCount,
    fetchFriends,
    searchProfilesByDisplayName,
    addFriendByDisplayName,
    acceptFriendRequest,
    rejectFriendRequest,
  };
}
