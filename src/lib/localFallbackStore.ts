import {
  FREE_ACCOUNT_TIER,
  FREE_DISCOVERY_LIMIT_ERROR,
  countObservationsForUtcDay,
  getObservationDiscoveryDayKey,
  hasReachedFreeDiscoveryLimit,
  normalizeAccountTier,
} from './accountTier';
import { CareTaskSchedule, FriendProfile, Observation, UserProfile } from '../types';

const DB_NAME = 'florivu-local-fallback';
const DB_VERSION = 1;
const OBSERVATIONS_STORE = 'observations';
const PROFILES_STORE = 'profiles';
const CARE_TASKS_STORE = 'careTasks';
const FRIENDSHIPS_STORE = 'friendships';
const BY_USER_ID_INDEX = 'byUserId';
const BY_OBSERVATION_ID_INDEX = 'byObservationId';
const BY_FRIEND_USER_ID_INDEX = 'byFriendUserId';

interface LocalProfileRecord extends UserProfile {
  display_name_lower: string;
}

interface LocalFriendshipRecord {
  key: string;
  user_id: string;
  friend_user_id: string;
  created_at: string;
}

interface SaveLocalProfileInput extends Omit<UserProfile, 'created_at' | 'updated_at'> {
  created_at?: string;
}

interface SaveLocalCareTaskInput
  extends Omit<CareTaskSchedule, 'id' | 'created_at' | 'updated_at'> {}

type ObservationUpdate = Partial<
  Pick<Observation, 'zip_code' | 'is_favorite' | 'is_house_plant'>
>;

type CareTaskUpdate = Partial<
  Pick<
    CareTaskSchedule,
    'title' | 'instructions' | 'cadence_days' | 'sort_order' | 'last_completed_at' | 'next_due_at'
  >
>;

let dbPromise: Promise<IDBDatabase> | null = null;

function getIndexedDb() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available in this browser.');
  }

  return indexedDB;
}

function openLocalFallbackDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = getIndexedDb().open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(OBSERVATIONS_STORE)) {
        const observations = db.createObjectStore(OBSERVATIONS_STORE, { keyPath: 'id' });
        observations.createIndex(BY_USER_ID_INDEX, 'user_id', { unique: false });
      }

      if (!db.objectStoreNames.contains(PROFILES_STORE)) {
        db.createObjectStore(PROFILES_STORE, { keyPath: 'user_id' });
      }

      if (!db.objectStoreNames.contains(CARE_TASKS_STORE)) {
        const careTasks = db.createObjectStore(CARE_TASKS_STORE, { keyPath: 'id' });
        careTasks.createIndex(BY_USER_ID_INDEX, 'user_id', { unique: false });
        careTasks.createIndex(BY_OBSERVATION_ID_INDEX, 'observation_id', { unique: false });
      }

      if (!db.objectStoreNames.contains(FRIENDSHIPS_STORE)) {
        const friendships = db.createObjectStore(FRIENDSHIPS_STORE, { keyPath: 'key' });
        friendships.createIndex(BY_USER_ID_INDEX, 'user_id', { unique: false });
        friendships.createIndex(BY_FRIEND_USER_ID_INDEX, 'friend_user_id', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open the local Florivu store.'));
    request.onblocked = () => reject(new Error('The local Florivu store upgrade was blocked.'));
  });

  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('A local Florivu database request failed.'));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('A local Florivu transaction failed.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('A local Florivu transaction was aborted.'));
  });
}

function friendshipKey(userId: string, friendUserId: string) {
  return `${userId}::${friendUserId}`;
}

function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeStringArray(values: string[] | null | undefined) {
  const nextValues = Array.isArray(values)
    ? values
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  return Array.from(new Set(nextValues));
}

function normalizeObservationRecord(observation: Observation): Observation {
  return {
    ...observation,
    zip_code: normalizeOptionalString(observation.zip_code),
    is_favorite: Boolean(observation.is_favorite),
    is_house_plant: Boolean(observation.is_house_plant),
    catalog_plant_id: normalizeOptionalString(observation.catalog_plant_id),
    care_profile_id: normalizeOptionalString(observation.care_profile_id),
  };
}

function normalizeStoredObservation(
  observation: Omit<Observation, 'id' | 'created_at'>,
): Observation {
  return normalizeObservationRecord({
    ...observation,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  });
}

function normalizeProfileRecord(
  profile: SaveLocalProfileInput,
  existingProfile?: LocalProfileRecord,
): LocalProfileRecord {
  const now = new Date().toISOString();
  const displayName = profile.display_name.trim();

  return {
    ...existingProfile,
    ...profile,
    user_id: profile.user_id,
    display_name: displayName,
    display_name_lower: displayName.toLowerCase(),
    account_tier: normalizeAccountTier(profile.account_tier ?? existingProfile?.account_tier),
    profile_photo_url: normalizeOptionalString(profile.profile_photo_url),
    home_zip_code: normalizeOptionalString(profile.home_zip_code),
    marketplace_zip_code: normalizeOptionalString(profile.marketplace_zip_code),
    facebook_url: normalizeOptionalString(profile.facebook_url),
    facebook_user_id: normalizeOptionalString(profile.facebook_user_id),
    facebook_name: normalizeOptionalString(profile.facebook_name),
    facebook_connected_at: normalizeOptionalString(profile.facebook_connected_at),
    earned_achievement_ids: normalizeStringArray(profile.earned_achievement_ids),
    referred_by_user_id: normalizeOptionalString(profile.referred_by_user_id),
    selected_avatar_border_id: normalizeOptionalString(profile.selected_avatar_border_id),
    selected_profile_title_id: normalizeOptionalString(profile.selected_profile_title_id),
    featured_house_plant_observation_id: normalizeOptionalString(
      profile.featured_house_plant_observation_id,
    ),
    featured_non_house_plant_observation_id: normalizeOptionalString(
      profile.featured_non_house_plant_observation_id,
    ),
    care_alerts_enabled:
      profile.care_alerts_enabled ?? existingProfile?.care_alerts_enabled ?? false,
    care_alert_email:
      normalizeOptionalString(profile.care_alert_email) ?? existingProfile?.care_alert_email ?? null,
    care_alert_timezone:
      normalizeOptionalString(profile.care_alert_timezone) ??
      existingProfile?.care_alert_timezone ??
      'UTC',
    care_alert_last_sent_at:
      normalizeOptionalString(profile.care_alert_last_sent_at) ??
      existingProfile?.care_alert_last_sent_at ??
      null,
    is_public: Boolean(profile.is_public),
    is_placeholder: Boolean(profile.is_placeholder ?? existingProfile?.is_placeholder ?? false),
    created_at: existingProfile?.created_at ?? profile.created_at ?? now,
    updated_at: now,
  };
}

function toUserProfile(record: LocalProfileRecord): UserProfile {
  const { display_name_lower: _, ...profile } = record;
  return {
    ...profile,
    account_tier: normalizeAccountTier(profile.account_tier),
  };
}

function normalizeCareTaskRecord(task: CareTaskSchedule): CareTaskSchedule {
  return {
    ...task,
    sort_order: Number.isFinite(task.sort_order) ? Math.round(task.sort_order) : 0,
    source: 'bundled',
    last_completed_at: task.last_completed_at ?? null,
  };
}

function normalizeStoredCareTask(task: SaveLocalCareTaskInput, createdAt: string): CareTaskSchedule {
  return normalizeCareTaskRecord({
    ...task,
    id: crypto.randomUUID(),
    created_at: createdAt,
    updated_at: createdAt,
    source: 'bundled',
    last_completed_at: task.last_completed_at ?? null,
  });
}

function compareCareTasks(left: CareTaskSchedule, right: CareTaskSchedule) {
  const dueDelta = new Date(left.next_due_at).getTime() - new Date(right.next_due_at).getTime();
  if (dueDelta !== 0) {
    return dueDelta;
  }

  return left.sort_order - right.sort_order;
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
    care_alerts_enabled: false,
    care_alert_email: null,
    care_alert_timezone: 'UTC',
    care_alert_last_sent_at: null,
    is_public: false,
    is_placeholder: true,
    created_at: now,
    updated_at: now,
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

function rankProfilesByDisplayName(
  profiles: LocalProfileRecord[],
  userId: string,
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return profiles
    .filter((profile) => {
      if (profile.user_id === userId) {
        return false;
      }

      return profile.display_name_lower.includes(normalizedQuery);
    })
    .sort((left, right) => {
      const leftIndex = left.display_name_lower.indexOf(normalizedQuery);
      const rightIndex = right.display_name_lower.indexOf(normalizedQuery);
      const leftPrefixRank = leftIndex === 0 ? 0 : 1;
      const rightPrefixRank = rightIndex === 0 ? 0 : 1;
      const leftLengthDelta = Math.abs(left.display_name_lower.length - normalizedQuery.length);
      const rightLengthDelta = Math.abs(right.display_name_lower.length - normalizedQuery.length);

      return (
        leftPrefixRank - rightPrefixRank ||
        leftIndex - rightIndex ||
        leftLengthDelta - rightLengthDelta ||
        left.display_name.localeCompare(right.display_name, undefined, {
          sensitivity: 'base',
        })
      );
    })
    .slice(0, 5)
    .map((profile) => toUserProfile(profile));
}

async function getAllProfiles(transaction: IDBTransaction) {
  return (await requestToPromise(
    transaction.objectStore(PROFILES_STORE).getAll(),
  )) as LocalProfileRecord[];
}

async function getAllFriendships(transaction: IDBTransaction) {
  return (await requestToPromise(
    transaction.objectStore(FRIENDSHIPS_STORE).getAll(),
  )) as LocalFriendshipRecord[];
}

async function getAllObservations(transaction: IDBTransaction) {
  return (await requestToPromise(
    transaction.objectStore(OBSERVATIONS_STORE).getAll(),
  )) as Observation[];
}

async function getLocalFriendLists(userId: string) {
  const db = await openLocalFallbackDb();
  const transaction = db.transaction(
    [FRIENDSHIPS_STORE, PROFILES_STORE, OBSERVATIONS_STORE],
    'readonly',
  );
  const [friendships, profiles, observations] = await Promise.all([
    getAllFriendships(transaction),
    getAllProfiles(transaction),
    getAllObservations(transaction),
  ]);

  const outgoingIds = new Set(
    friendships
      .filter((friendship) => friendship.user_id === userId)
      .map((friendship) => friendship.friend_user_id),
  );
  const incomingIds = Array.from(
    new Set(
      friendships
        .filter((friendship) => friendship.friend_user_id === userId)
        .map((friendship) => friendship.user_id),
    ),
  );
  const mutualIds = incomingIds.filter((friendId) => outgoingIds.has(friendId));
  const incomingRequestIds = incomingIds.filter((friendId) => !outgoingIds.has(friendId));

  const profileMap = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const observationStats = new Map<string, { observationCount: number; speciesKeys: Set<string> }>();

  for (const observation of observations) {
    const entry = observationStats.get(observation.user_id) ?? {
      observationCount: 0,
      speciesKeys: new Set<string>(),
    };
    entry.observationCount += 1;
    const speciesKey = (observation.species?.trim() || observation.scientific_name.trim()).toLowerCase();
    if (speciesKey) {
      entry.speciesKeys.add(speciesKey);
    }
    observationStats.set(observation.user_id, entry);
  }

  const toProfile = (friendId: string) => toUserProfile(profileMap.get(friendId) ?? normalizeProfileRecord(buildFallbackProfile(friendId)));
  const toFriendProfile = (friendId: string): FriendProfile => {
    const profile = toProfile(friendId);
    const stats = observationStats.get(friendId);

    return {
      ...profile,
      observation_count: stats?.observationCount ?? 0,
      species_count: stats?.speciesKeys.size ?? 0,
    };
  };

  return {
    mutualFriends: sortFriendProfilesByStats(mutualIds.map(toFriendProfile)),
    incomingRequests: sortProfilesAlphabetically(incomingRequestIds.map(toProfile)),
    completedReferralCount: profiles.filter(
      (profile) => profile.referred_by_user_id === userId && mutualIds.includes(profile.user_id),
    ).length,
  };
}

export async function fetchLocalObservationsFromStore(userId: string): Promise<Observation[]> {
  const db = await openLocalFallbackDb();
  const transaction = db.transaction(OBSERVATIONS_STORE, 'readonly');
  const store = transaction.objectStore(OBSERVATIONS_STORE);
  const observations = (await requestToPromise(
    store.index(BY_USER_ID_INDEX).getAll(IDBKeyRange.only(userId)),
  )) as Observation[];

  return observations
    .map((observation) => normalizeObservationRecord(observation))
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );
}

export async function saveLocalObservationToStore(
  observation: Omit<Observation, 'id' | 'created_at'>,
): Promise<Observation> {
  const storedObservation = normalizeStoredObservation(observation);
  const db = await openLocalFallbackDb();
  const transaction = db.transaction([OBSERVATIONS_STORE, PROFILES_STORE], 'readwrite');
  const observationStore = transaction.objectStore(OBSERVATIONS_STORE);
  const profileStore = transaction.objectStore(PROFILES_STORE);
  const [storedProfile, existingObservations] = await Promise.all([
    requestToPromise(profileStore.get(storedObservation.user_id)) as Promise<
      LocalProfileRecord | undefined
    >,
    requestToPromise(
      observationStore.index(BY_USER_ID_INDEX).getAll(IDBKeyRange.only(storedObservation.user_id)),
    ) as Promise<Observation[]>,
  ]);
  const accountTier = normalizeAccountTier(storedProfile?.account_tier);

  if (accountTier !== 'plus') {
    const discoveryDayKey = getObservationDiscoveryDayKey(storedObservation);
    const discoveryCount = countObservationsForUtcDay(existingObservations, discoveryDayKey);

    if (hasReachedFreeDiscoveryLimit(discoveryCount)) {
      transaction.abort();
      throw new Error(FREE_DISCOVERY_LIMIT_ERROR);
    }
  }

  observationStore.put(storedObservation);
  await transactionToPromise(transaction);
  return storedObservation;
}

export async function updateLocalObservationInStore(
  id: string,
  userId: string,
  updates: ObservationUpdate,
): Promise<Observation> {
  const hasZipCode = Object.prototype.hasOwnProperty.call(updates, 'zip_code');
  const hasFavorite = Object.prototype.hasOwnProperty.call(updates, 'is_favorite');
  const hasHousePlant = Object.prototype.hasOwnProperty.call(updates, 'is_house_plant');

  if (!hasZipCode && !hasFavorite && !hasHousePlant) {
    throw new Error('At least one editable observation field is required.');
  }

  if (hasZipCode && typeof updates.zip_code !== 'string' && updates.zip_code !== null) {
    throw new Error('zip_code must be a string or null.');
  }

  if (hasFavorite && typeof updates.is_favorite !== 'boolean') {
    throw new Error('is_favorite must be a boolean.');
  }

  if (hasHousePlant && typeof updates.is_house_plant !== 'boolean') {
    throw new Error('is_house_plant must be a boolean.');
  }

  const db = await openLocalFallbackDb();
  const transaction = db.transaction(OBSERVATIONS_STORE, 'readwrite');
  const store = transaction.objectStore(OBSERVATIONS_STORE);
  const existingObservation = (await requestToPromise(store.get(id))) as Observation | undefined;

  if (!existingObservation || existingObservation.user_id !== userId) {
    transaction.abort();
    throw new Error('Observation not found.');
  }

  const updatedObservation = normalizeObservationRecord({
    ...existingObservation,
    zip_code: hasZipCode
      ? typeof updates.zip_code === 'string'
        ? updates.zip_code.trim() || null
        : null
      : existingObservation.zip_code ?? null,
    is_favorite: hasFavorite ? Boolean(updates.is_favorite) : existingObservation.is_favorite,
    is_house_plant: hasHousePlant
      ? Boolean(updates.is_house_plant)
      : existingObservation.is_house_plant,
  });

  store.put(updatedObservation);
  await transactionToPromise(transaction);
  return updatedObservation;
}

export async function deleteLocalObservationFromStore(id: string, userId: string): Promise<void> {
  const db = await openLocalFallbackDb();
  const transaction = db.transaction([OBSERVATIONS_STORE, CARE_TASKS_STORE], 'readwrite');
  const observationStore = transaction.objectStore(OBSERVATIONS_STORE);
  const careTaskStore = transaction.objectStore(CARE_TASKS_STORE);
  const observation = (await requestToPromise(observationStore.get(id))) as Observation | undefined;

  if (!observation || observation.user_id !== userId) {
    transaction.abort();
    throw new Error('Observation not found.');
  }

  observationStore.delete(id);
  const careTasks = (await requestToPromise(
    careTaskStore.index(BY_OBSERVATION_ID_INDEX).getAll(IDBKeyRange.only(id)),
  )) as CareTaskSchedule[];
  for (const task of careTasks) {
    if (task.user_id === userId) {
      careTaskStore.delete(task.id);
    }
  }

  await transactionToPromise(transaction);
}

export async function fetchLocalProfileFromStore(userId: string): Promise<UserProfile | null> {
  const db = await openLocalFallbackDb();
  const transaction = db.transaction(PROFILES_STORE, 'readonly');
  const record = (await requestToPromise(
    transaction.objectStore(PROFILES_STORE).get(userId),
  )) as LocalProfileRecord | undefined;

  return record ? toUserProfile(record) : null;
}

export async function saveLocalProfileToStore(profile: SaveLocalProfileInput): Promise<UserProfile> {
  const displayName = profile.display_name.trim();
  if (!displayName) {
    throw new Error('display_name is required.');
  }

  const db = await openLocalFallbackDb();
  const transaction = db.transaction([PROFILES_STORE, FRIENDSHIPS_STORE], 'readwrite');
  const profileStore = transaction.objectStore(PROFILES_STORE);
  const friendshipStore = transaction.objectStore(FRIENDSHIPS_STORE);
  const profiles = await getAllProfiles(transaction);
  const existingProfile =
    profiles.find((entry) => entry.user_id === profile.user_id) ?? undefined;
  const duplicateProfile = profiles.find(
    (entry) =>
      entry.user_id !== profile.user_id &&
      entry.display_name.trim().toLowerCase() === displayName.toLowerCase(),
  );

  if (duplicateProfile) {
    transaction.abort();
    throw new Error('Display name is already in use.');
  }

  const storedProfile = normalizeProfileRecord(profile, existingProfile);
  profileStore.put(storedProfile);

  if (
    storedProfile.referred_by_user_id &&
    storedProfile.referred_by_user_id !== storedProfile.user_id
  ) {
    const incomingEdgeKey = friendshipKey(
      storedProfile.referred_by_user_id,
      storedProfile.user_id,
    );
    const existingEdge = (await requestToPromise(
      friendshipStore.get(incomingEdgeKey),
    )) as LocalFriendshipRecord | undefined;

    if (!existingEdge) {
      friendshipStore.put({
        key: incomingEdgeKey,
        user_id: storedProfile.referred_by_user_id,
        friend_user_id: storedProfile.user_id,
        created_at: new Date().toISOString(),
      });
    }
  }

  await transactionToPromise(transaction);
  return toUserProfile(storedProfile);
}

export async function fetchLocalCareTasksFromStore(
  userId: string,
): Promise<CareTaskSchedule[]> {
  const db = await openLocalFallbackDb();
  const transaction = db.transaction(CARE_TASKS_STORE, 'readonly');
  const tasks = (await requestToPromise(
    transaction.objectStore(CARE_TASKS_STORE).index(BY_USER_ID_INDEX).getAll(IDBKeyRange.only(userId)),
  )) as CareTaskSchedule[];

  return tasks.map(normalizeCareTaskRecord).sort(compareCareTasks);
}

export async function saveLocalCareTasksToStore(
  tasks: SaveLocalCareTaskInput[],
): Promise<CareTaskSchedule[]> {
  if (tasks.length === 0) {
    throw new Error('An array of care tasks is required.');
  }

  const createdAt = new Date().toISOString();
  const storedTasks = tasks.map((task) => normalizeStoredCareTask(task, createdAt));
  const db = await openLocalFallbackDb();
  const transaction = db.transaction(CARE_TASKS_STORE, 'readwrite');
  const store = transaction.objectStore(CARE_TASKS_STORE);

  for (const task of storedTasks) {
    store.put(task);
  }

  await transactionToPromise(transaction);
  return storedTasks;
}

export async function updateLocalCareTaskInStore(
  id: string,
  userId: string,
  updates: CareTaskUpdate,
): Promise<CareTaskSchedule> {
  const db = await openLocalFallbackDb();
  const transaction = db.transaction(CARE_TASKS_STORE, 'readwrite');
  const store = transaction.objectStore(CARE_TASKS_STORE);
  const existingTask = (await requestToPromise(store.get(id))) as CareTaskSchedule | undefined;

  if (!existingTask || existingTask.user_id !== userId) {
    transaction.abort();
    throw new Error('Care task not found.');
  }

  const updatedTask = normalizeCareTaskRecord({
    ...existingTask,
    title:
      typeof updates.title === 'string' ? updates.title.trim() || existingTask.title : existingTask.title,
    instructions:
      typeof updates.instructions === 'string'
        ? updates.instructions.trim() || existingTask.instructions
        : existingTask.instructions,
    cadence_days:
      typeof updates.cadence_days === 'number' && Number.isFinite(updates.cadence_days)
        ? Math.max(1, Math.round(updates.cadence_days))
        : existingTask.cadence_days,
    sort_order:
      typeof updates.sort_order === 'number' && Number.isFinite(updates.sort_order)
        ? Math.round(updates.sort_order)
        : existingTask.sort_order,
    last_completed_at:
      typeof updates.last_completed_at === 'string' || updates.last_completed_at === null
        ? updates.last_completed_at
        : existingTask.last_completed_at ?? null,
    next_due_at: typeof updates.next_due_at === 'string' ? updates.next_due_at : existingTask.next_due_at,
    updated_at: new Date().toISOString(),
  });

  store.put(updatedTask);
  await transactionToPromise(transaction);
  return updatedTask;
}

export async function fetchLocalFriendsFromStore(userId: string): Promise<FriendProfile[]> {
  const { mutualFriends } = await getLocalFriendLists(userId);
  return mutualFriends;
}

export async function fetchLocalIncomingFriendRequestsFromStore(
  userId: string,
): Promise<UserProfile[]> {
  const { incomingRequests } = await getLocalFriendLists(userId);
  return incomingRequests;
}

export async function fetchLocalCompletedFriendReferralCountFromStore(
  userId: string,
): Promise<number> {
  const { completedReferralCount } = await getLocalFriendLists(userId);
  return completedReferralCount;
}

export async function searchLocalProfilesByDisplayNameInStore(
  userId: string,
  query: string,
): Promise<UserProfile[]> {
  const db = await openLocalFallbackDb();
  const transaction = db.transaction(PROFILES_STORE, 'readonly');
  const profiles = await getAllProfiles(transaction);
  return rankProfilesByDisplayName(profiles, userId, query);
}

export async function addLocalFriendByDisplayNameInStore(
  userId: string,
  displayName: string,
): Promise<{ alreadyAdded: boolean; friend: UserProfile; isMutual: boolean }> {
  const normalizedDisplayName = displayName.trim();
  if (!normalizedDisplayName) {
    throw new Error('userId and displayName are required.');
  }

  const db = await openLocalFallbackDb();
  const transaction = db.transaction([FRIENDSHIPS_STORE, PROFILES_STORE], 'readwrite');
  const profileStore = transaction.objectStore(PROFILES_STORE);
  const friendshipStore = transaction.objectStore(FRIENDSHIPS_STORE);
  const profiles = (await requestToPromise(profileStore.getAll())) as LocalProfileRecord[];
  const targetProfile =
    profiles.find(
      (profile) => profile.display_name.trim().toLowerCase() === normalizedDisplayName.toLowerCase(),
    ) ?? null;

  if (!targetProfile) {
    transaction.abort();
    throw new Error('No user found with that display name.');
  }

  if (targetProfile.user_id === userId) {
    transaction.abort();
    throw new Error('You cannot add yourself as a friend.');
  }

  const edgeKey = friendshipKey(userId, targetProfile.user_id);
  const reverseKey = friendshipKey(targetProfile.user_id, userId);
  const [existingEdge, reverseEdge] = await Promise.all([
    requestToPromise(friendshipStore.get(edgeKey)) as Promise<LocalFriendshipRecord | undefined>,
    requestToPromise(friendshipStore.get(reverseKey)) as Promise<LocalFriendshipRecord | undefined>,
  ]);

  if (!existingEdge) {
    friendshipStore.put({
      key: edgeKey,
      user_id: userId,
      friend_user_id: targetProfile.user_id,
      created_at: new Date().toISOString(),
    });
  }

  await transactionToPromise(transaction);
  return {
    alreadyAdded: Boolean(existingEdge),
    friend: toUserProfile(targetProfile),
    isMutual: Boolean(reverseEdge),
  };
}

export async function acceptLocalFriendRequestInStore(
  userId: string,
  friendUserId: string,
): Promise<{ alreadyAdded: boolean; friend: UserProfile; isMutual: boolean }> {
  const db = await openLocalFallbackDb();
  const transaction = db.transaction([FRIENDSHIPS_STORE, PROFILES_STORE], 'readwrite');
  const profileStore = transaction.objectStore(PROFILES_STORE);
  const friendshipStore = transaction.objectStore(FRIENDSHIPS_STORE);
  const targetProfile =
    ((await requestToPromise(profileStore.get(friendUserId))) as LocalProfileRecord | undefined) ??
    normalizeProfileRecord(buildFallbackProfile(friendUserId));
  const edgeKey = friendshipKey(userId, friendUserId);
  const reverseKey = friendshipKey(friendUserId, userId);
  const [existingEdge, reverseEdge] = await Promise.all([
    requestToPromise(friendshipStore.get(edgeKey)) as Promise<LocalFriendshipRecord | undefined>,
    requestToPromise(friendshipStore.get(reverseKey)) as Promise<LocalFriendshipRecord | undefined>,
  ]);

  if (!existingEdge) {
    friendshipStore.put({
      key: edgeKey,
      user_id: userId,
      friend_user_id: friendUserId,
      created_at: new Date().toISOString(),
    });
  }

  await transactionToPromise(transaction);
  return {
    alreadyAdded: Boolean(existingEdge),
    friend: toUserProfile(targetProfile),
    isMutual: Boolean(reverseEdge),
  };
}

export async function rejectLocalFriendRequestInStore(
  userId: string,
  friendUserId: string,
): Promise<{ ok: boolean }> {
  const db = await openLocalFallbackDb();
  const transaction = db.transaction(FRIENDSHIPS_STORE, 'readwrite');
  const store = transaction.objectStore(FRIENDSHIPS_STORE);
  const reverseKey = friendshipKey(friendUserId, userId);
  const reverseEdge = (await requestToPromise(store.get(reverseKey))) as LocalFriendshipRecord | undefined;

  if (!reverseEdge) {
    transaction.abort();
    throw new Error('Friend request not found.');
  }

  store.delete(reverseKey);
  await transactionToPromise(transaction);
  return { ok: true };
}

export async function purgeLocalFallbackDataForUser(userId: string): Promise<void> {
  const db = await openLocalFallbackDb();
  const transaction = db.transaction(
    [OBSERVATIONS_STORE, PROFILES_STORE, CARE_TASKS_STORE, FRIENDSHIPS_STORE],
    'readwrite',
  );
  const observationStore = transaction.objectStore(OBSERVATIONS_STORE);
  const profileStore = transaction.objectStore(PROFILES_STORE);
  const careTaskStore = transaction.objectStore(CARE_TASKS_STORE);
  const friendshipStore = transaction.objectStore(FRIENDSHIPS_STORE);
  const [observations, careTasks, friendships] = await Promise.all([
    requestToPromise(observationStore.index(BY_USER_ID_INDEX).getAll(IDBKeyRange.only(userId))) as Promise<Observation[]>,
    requestToPromise(careTaskStore.index(BY_USER_ID_INDEX).getAll(IDBKeyRange.only(userId))) as Promise<CareTaskSchedule[]>,
    getAllFriendships(transaction),
  ]);

  for (const observation of observations) {
    observationStore.delete(observation.id);
  }

  profileStore.delete(userId);

  for (const task of careTasks) {
    careTaskStore.delete(task.id);
  }

  for (const friendship of friendships) {
    if (friendship.user_id === userId || friendship.friend_user_id === userId) {
      friendshipStore.delete(friendship.key);
    }
  }

  await transactionToPromise(transaction);
}
