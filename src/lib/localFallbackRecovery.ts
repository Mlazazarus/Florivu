import { normalizeAccountTier } from './accountTier';
import { fetchLocalCareTasks } from './localCareTasksApi';
import { fetchLocalObservations } from './localObservationApi';
import { fetchLocalProfile } from './localProfileApi';
import { logError, logInfo } from './logger';
import { supabase } from './supabase';
import { CareTaskSchedule, Observation, UserProfile } from '../types';

type StorageMode = 'supabase' | 'local';

export interface ProfileRecoveryResult {
  profile: UserProfile | null;
  recovered: boolean;
  storageMode: StorageMode;
}

export interface ObservationRecoveryResult {
  observations: Observation[];
  recoveredCount: number;
  storageMode: StorageMode;
}

export interface CareTaskRecoveryResult {
  careTasks: CareTaskSchedule[];
  recoveredCount: number;
  storageMode: StorageMode;
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

function normalizeObservationRecord(observation: Observation): Observation {
  return {
    ...observation,
    zip_code: observation.zip_code ?? null,
    is_favorite: Boolean(observation.is_favorite),
    is_house_plant: Boolean(observation.is_house_plant),
    catalog_plant_id: observation.catalog_plant_id ?? null,
    care_profile_id: observation.care_profile_id ?? null,
  };
}

function sortObservationsByCreatedAtDescending(
  left: Observation,
  right: Observation,
) {
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

function normalizeCareTaskRecord(task: CareTaskSchedule): CareTaskSchedule {
  return {
    ...task,
    last_completed_at: task.last_completed_at ?? null,
  };
}

function sortCareTasks(left: CareTaskSchedule, right: CareTaskSchedule) {
  const dueDelta =
    new Date(left.next_due_at).getTime() - new Date(right.next_due_at).getTime();
  if (dueDelta !== 0) {
    return dueDelta;
  }

  return left.sort_order - right.sort_order;
}

function isNonEmptyString(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}

function areStringArraysEqual(
  left: string[] | null | undefined,
  right: string[] | null | undefined,
) {
  const leftValues = Array.isArray(left) ? left : [];
  const rightValues = Array.isArray(right) ? right : [];

  if (leftValues.length !== rightValues.length) {
    return false;
  }

  return leftValues.every((value, index) => value === rightValues[index]);
}

function observationsDiffer(remote: Observation, local: Observation) {
  return (
    remote.photo_url !== local.photo_url ||
    remote.common_name !== local.common_name ||
    remote.scientific_name !== local.scientific_name ||
    remote.family !== local.family ||
    remote.genus !== local.genus ||
    remote.species !== local.species ||
    remote.confidence !== local.confidence ||
    remote.date_found !== local.date_found ||
    (remote.zip_code ?? null) !== (local.zip_code ?? null) ||
    (remote.notes ?? null) !== (local.notes ?? null) ||
    Boolean(remote.is_favorite) !== Boolean(local.is_favorite) ||
    Boolean(remote.is_house_plant) !== Boolean(local.is_house_plant) ||
    (remote.catalog_plant_id ?? null) !== (local.catalog_plant_id ?? null) ||
    (remote.care_profile_id ?? null) !== (local.care_profile_id ?? null) ||
    remote.created_at !== local.created_at
  );
}

function careTaskKey(task: CareTaskSchedule) {
  return `${task.observation_id}:${task.task_key}`;
}

function careTasksDiffer(remote: CareTaskSchedule, local: CareTaskSchedule) {
  return (
    remote.title !== local.title ||
    remote.instructions !== local.instructions ||
    remote.cadence_days !== local.cadence_days ||
    remote.sort_order !== local.sort_order ||
    remote.source !== local.source ||
    (remote.last_completed_at ?? null) !== (local.last_completed_at ?? null) ||
    remote.next_due_at !== local.next_due_at ||
    remote.created_at !== local.created_at ||
    remote.updated_at !== local.updated_at
  );
}

function toMillis(value: string | null | undefined) {
  return value ? Date.parse(value) : Number.NEGATIVE_INFINITY;
}

function chooseMoreRecentCareTask(
  remote: CareTaskSchedule,
  local: CareTaskSchedule,
) {
  const remoteUpdatedAt = toMillis(remote.updated_at);
  const localUpdatedAt = toMillis(local.updated_at);

  if (localUpdatedAt !== remoteUpdatedAt) {
    return localUpdatedAt > remoteUpdatedAt ? local : remote;
  }

  const remoteCompleted = toMillis(remote.last_completed_at ?? null);
  const localCompleted = toMillis(local.last_completed_at ?? null);
  if (localCompleted !== remoteCompleted) {
    return localCompleted > remoteCompleted ? local : remote;
  }

  return local;
}

function dedupeLocalCareTasks(tasks: CareTaskSchedule[]) {
  const dedupedTasks = new Map<string, CareTaskSchedule>();

  for (const task of tasks) {
    const normalizedTask = normalizeCareTaskRecord(task);
    const key = careTaskKey(normalizedTask);
    const existingTask = dedupedTasks.get(key);

    if (!existingTask) {
      dedupedTasks.set(key, normalizedTask);
      continue;
    }

    dedupedTasks.set(key, chooseMoreRecentCareTask(existingTask, normalizedTask));
  }

  return [...dedupedTasks.values()].sort(sortCareTasks);
}

function remoteProfileLooksDefault(
  profile: UserProfile,
  userId: string,
  userEmail: string | undefined,
) {
  const earnedAchievementCount = Array.isArray(profile.earned_achievement_ids)
    ? profile.earned_achievement_ids.length
    : 0;
  const displayName = profile.display_name.trim();
  const isGeneratedDisplayName =
    displayName === defaultDisplayName(userEmail, userId) ||
    displayName === defaultDisplayName(userEmail, userId, 1) ||
    /^.+-[a-f0-9]{6}(?:-\d+)?$/i.test(displayName);

  return (
    isGeneratedDisplayName &&
    !isNonEmptyString(profile.profile_photo_url) &&
    !isNonEmptyString(profile.home_zip_code) &&
    !isNonEmptyString(profile.marketplace_zip_code) &&
    !isNonEmptyString(profile.facebook_url) &&
    !isNonEmptyString(profile.facebook_user_id) &&
    !isNonEmptyString(profile.facebook_name) &&
    earnedAchievementCount === 0 &&
    !isNonEmptyString(profile.referred_by_user_id) &&
    !isNonEmptyString(profile.selected_avatar_border_id) &&
    !isNonEmptyString(profile.selected_profile_title_id) &&
    !isNonEmptyString(profile.featured_house_plant_observation_id) &&
    !isNonEmptyString(profile.featured_non_house_plant_observation_id) &&
    !(profile.care_alerts_enabled ?? false) &&
    !Boolean(profile.is_public)
  );
}

function normalizeUserProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    account_tier: normalizeAccountTier(profile.account_tier),
  };
}

function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mergeRecoveredStringField(
  remoteValue: string | null | undefined,
  localValue: string | null | undefined,
  preferLocal: boolean,
) {
  const normalizedRemote = normalizeOptionalString(remoteValue);
  const normalizedLocal = normalizeOptionalString(localValue);

  if (normalizedLocal && (preferLocal || !normalizedRemote)) {
    return normalizedLocal;
  }

  return normalizedRemote;
}

function mergeRecoveredStringArrayField(
  remoteValue: string[] | null | undefined,
  localValue: string[] | null | undefined,
) {
  const mergedValues = new Set<string>();

  for (const value of Array.isArray(remoteValue) ? remoteValue : []) {
    const trimmed = value.trim();
    if (trimmed) {
      mergedValues.add(trimmed);
    }
  }

  for (const value of Array.isArray(localValue) ? localValue : []) {
    const trimmed = value.trim();
    if (trimmed) {
      mergedValues.add(trimmed);
    }
  }

  return [...mergedValues];
}

function mergeRecoveredBooleanField(
  remoteValue: boolean | undefined,
  localValue: boolean | undefined,
  preferLocal: boolean,
) {
  if (remoteValue === undefined) {
    return localValue ?? false;
  }

  if (preferLocal && localValue === true) {
    return true;
  }

  return remoteValue;
}

function mergeRecoveredTimestampField(
  remoteValue: string | null | undefined,
  localValue: string | null | undefined,
  preferLocal: boolean,
) {
  const normalizedRemote = normalizeOptionalString(remoteValue);
  const normalizedLocal = normalizeOptionalString(localValue);

  if (!normalizedRemote) {
    return normalizedLocal;
  }

  if (!normalizedLocal) {
    return normalizedRemote;
  }

  return preferLocal && toMillis(normalizedLocal) >= toMillis(normalizedRemote)
    ? normalizedLocal
    : normalizedRemote;
}

export function mergeRecoveredProfile(
  remoteProfile: UserProfile | null,
  localProfile: UserProfile,
  userId: string,
  userEmail: string | undefined,
) {
  if (!remoteProfile) {
    return normalizeUserProfile(localProfile);
  }

  const preferLocal =
    toMillis(localProfile.updated_at) > toMillis(remoteProfile.updated_at) ||
    remoteProfileLooksDefault(remoteProfile, userId, userEmail);

  return normalizeUserProfile({
    ...remoteProfile,
    user_id: localProfile.user_id,
    display_name:
      mergeRecoveredStringField(remoteProfile.display_name, localProfile.display_name, preferLocal) ??
      remoteProfile.display_name,
    account_tier:
      remoteProfile.account_tier === 'plus' || localProfile.account_tier === 'plus'
        ? 'plus'
        : normalizeAccountTier(localProfile.account_tier ?? remoteProfile.account_tier),
    profile_photo_url: mergeRecoveredStringField(
      remoteProfile.profile_photo_url,
      localProfile.profile_photo_url,
      preferLocal,
    ),
    home_zip_code: mergeRecoveredStringField(
      remoteProfile.home_zip_code,
      localProfile.home_zip_code,
      preferLocal,
    ),
    marketplace_zip_code: mergeRecoveredStringField(
      remoteProfile.marketplace_zip_code,
      localProfile.marketplace_zip_code,
      preferLocal,
    ),
    facebook_url: mergeRecoveredStringField(
      remoteProfile.facebook_url,
      localProfile.facebook_url,
      preferLocal,
    ),
    facebook_user_id: mergeRecoveredStringField(
      remoteProfile.facebook_user_id,
      localProfile.facebook_user_id,
      preferLocal,
    ),
    facebook_name: mergeRecoveredStringField(
      remoteProfile.facebook_name,
      localProfile.facebook_name,
      preferLocal,
    ),
    facebook_connected_at: mergeRecoveredTimestampField(
      remoteProfile.facebook_connected_at,
      localProfile.facebook_connected_at,
      preferLocal,
    ),
    earned_achievement_ids: mergeRecoveredStringArrayField(
      remoteProfile.earned_achievement_ids,
      localProfile.earned_achievement_ids,
    ),
    referred_by_user_id: mergeRecoveredStringField(
      remoteProfile.referred_by_user_id,
      localProfile.referred_by_user_id,
      preferLocal,
    ),
    selected_avatar_border_id: mergeRecoveredStringField(
      remoteProfile.selected_avatar_border_id,
      localProfile.selected_avatar_border_id,
      preferLocal,
    ),
    selected_profile_title_id: mergeRecoveredStringField(
      remoteProfile.selected_profile_title_id,
      localProfile.selected_profile_title_id,
      preferLocal,
    ),
    featured_house_plant_observation_id: mergeRecoveredStringField(
      remoteProfile.featured_house_plant_observation_id,
      localProfile.featured_house_plant_observation_id,
      preferLocal,
    ),
    featured_non_house_plant_observation_id: mergeRecoveredStringField(
      remoteProfile.featured_non_house_plant_observation_id,
      localProfile.featured_non_house_plant_observation_id,
      preferLocal,
    ),
    care_alerts_enabled: mergeRecoveredBooleanField(
      remoteProfile.care_alerts_enabled,
      localProfile.care_alerts_enabled,
      preferLocal,
    ),
    care_alert_email: mergeRecoveredStringField(
      remoteProfile.care_alert_email,
      localProfile.care_alert_email,
      preferLocal,
    ),
    care_alert_timezone:
      mergeRecoveredStringField(
        remoteProfile.care_alert_timezone,
        localProfile.care_alert_timezone,
        preferLocal,
      ) ?? 'UTC',
    care_alert_last_sent_at: mergeRecoveredTimestampField(
      remoteProfile.care_alert_last_sent_at,
      localProfile.care_alert_last_sent_at,
      preferLocal,
    ),
    is_public: mergeRecoveredBooleanField(
      remoteProfile.is_public,
      localProfile.is_public,
      preferLocal,
    ),
    created_at: remoteProfile.created_at ?? localProfile.created_at,
    updated_at:
      toMillis(localProfile.updated_at) > toMillis(remoteProfile.updated_at)
        ? localProfile.updated_at
        : remoteProfile.updated_at,
  });
}

async function fetchRemoteObservations(userId: string) {
  const { data, error } = await supabase
    .from('observations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((observation) => normalizeObservationRecord(observation as Observation));
}

async function fetchRemoteCareTasks(userId: string) {
  const { data, error } = await supabase
    .from('care_task_schedules')
    .select('*')
    .eq('user_id', userId)
    .order('next_due_at', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((task) => normalizeCareTaskRecord(task as CareTaskSchedule));
}

export async function recoverProfileFromSupabaseOrLocal(
  userId: string,
  userEmail: string | undefined,
): Promise<ProfileRecoveryResult> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const remoteProfile = data ? normalizeUserProfile(data as UserProfile) : null;

  let localProfile: UserProfile | null = null;
  try {
    localProfile = await fetchLocalProfile(userId);
  } catch (localProfileError) {
    logError('ProfileRecovery', 'Failed to read local fallback profile.', localProfileError);
  }

  if (!localProfile) {
    return {
      profile: remoteProfile,
      recovered: false,
      storageMode: 'supabase',
    };
  }

  const shouldRecoverProfile =
    !remoteProfile ||
    toMillis(localProfile.updated_at) > toMillis(remoteProfile.updated_at) ||
    remoteProfileLooksDefault(remoteProfile, userId, userEmail);

  if (!shouldRecoverProfile) {
    return {
      profile: remoteProfile,
      recovered: false,
      storageMode: 'supabase',
    };
  }

  const profileToRestore = mergeRecoveredProfile(
    remoteProfile,
    localProfile,
    userId,
    userEmail,
  );

  try {
    const { data: savedProfile, error: saveError } = await supabase
      .from('profiles')
      .upsert(profileToRestore, { onConflict: 'user_id' })
      .select()
      .single();

    if (saveError) {
      throw saveError;
    }

    logInfo('ProfileRecovery', 'Recovered profile fields from local fallback data.', {
      userId,
      displayName: profileToRestore.display_name,
    });

    return {
      profile: normalizeUserProfile(savedProfile as UserProfile),
      recovered: true,
      storageMode: 'supabase',
    };
  } catch (saveError) {
    logError('ProfileRecovery', 'Failed to recover local profile into Supabase.', saveError);
    return {
      profile: localProfile,
      recovered: false,
      storageMode: 'local',
    };
  }
}

export async function recoverObservationsFromSupabaseOrLocal(
  userId: string,
): Promise<ObservationRecoveryResult> {
  const remoteObservations = await fetchRemoteObservations(userId);

  let localObservations: Observation[] = [];
  try {
    localObservations = (await fetchLocalObservations(userId)).map(normalizeObservationRecord);
  } catch (localObservationError) {
    logError(
      'ObservationRecovery',
      'Failed to read local fallback observations.',
      localObservationError,
    );
    return {
      observations: remoteObservations,
      recoveredCount: 0,
      storageMode: 'supabase',
    };
  }

  const remoteObservationMap = new Map(
    remoteObservations.map((observation) => [observation.id, observation]),
  );
  const observationsToRecover = localObservations.filter((localObservation) => {
    const remoteObservation = remoteObservationMap.get(localObservation.id);
    return !remoteObservation || observationsDiffer(remoteObservation, localObservation);
  });

  if (observationsToRecover.length === 0) {
    return {
      observations: remoteObservations,
      recoveredCount: 0,
      storageMode: 'supabase',
    };
  }

  try {
    const { error } = await supabase
      .from('observations')
      .upsert(observationsToRecover, { onConflict: 'id' });

    if (error) {
      throw error;
    }

    logInfo('ObservationRecovery', 'Recovered observations from local fallback data.', {
      userId,
      recoveredCount: observationsToRecover.length,
    });

    return {
      observations: await fetchRemoteObservations(userId),
      recoveredCount: observationsToRecover.length,
      storageMode: 'supabase',
    };
  } catch (saveError) {
    logError(
      'ObservationRecovery',
      'Failed to recover local observations into Supabase.',
      saveError,
    );

    const fallbackObservations = new Map(
      remoteObservations.map((observation) => [observation.id, observation]),
    );
    for (const localObservation of localObservations) {
      fallbackObservations.set(localObservation.id, localObservation);
    }

    return {
      observations: [...fallbackObservations.values()].sort(sortObservationsByCreatedAtDescending),
      recoveredCount: observationsToRecover.length,
      storageMode: 'local',
    };
  }
}

export async function recoverCareTasksFromSupabaseOrLocal(
  userId: string,
): Promise<CareTaskRecoveryResult> {
  await recoverObservationsFromSupabaseOrLocal(userId);
  const remoteCareTasks = await fetchRemoteCareTasks(userId);

  let localCareTasks: CareTaskSchedule[] = [];
  try {
    localCareTasks = dedupeLocalCareTasks(await fetchLocalCareTasks(userId));
  } catch (localCareTaskError) {
    logError('CareTaskRecovery', 'Failed to read local fallback care tasks.', localCareTaskError);
    return {
      careTasks: remoteCareTasks,
      recoveredCount: 0,
      storageMode: 'supabase',
    };
  }

  const remoteCareTaskMap = new Map(
    remoteCareTasks.map((task) => [careTaskKey(task), task]),
  );
  const careTasksToRecover = localCareTasks.filter((localTask) => {
    const remoteTask = remoteCareTaskMap.get(careTaskKey(localTask));
    if (!remoteTask) {
      return true;
    }

    if (!careTasksDiffer(remoteTask, localTask)) {
      return false;
    }

    return chooseMoreRecentCareTask(remoteTask, localTask) === localTask;
  });

  if (careTasksToRecover.length === 0) {
    return {
      careTasks: remoteCareTasks,
      recoveredCount: 0,
      storageMode: 'supabase',
    };
  }

  try {
    const { error } = await supabase
      .from('care_task_schedules')
      .upsert(careTasksToRecover, { onConflict: 'observation_id,task_key' });

    if (error) {
      throw error;
    }

    logInfo('CareTaskRecovery', 'Recovered care tasks from local fallback data.', {
      userId,
      recoveredCount: careTasksToRecover.length,
    });

    return {
      careTasks: await fetchRemoteCareTasks(userId),
      recoveredCount: careTasksToRecover.length,
      storageMode: 'supabase',
    };
  } catch (saveError) {
    logError('CareTaskRecovery', 'Failed to recover local care tasks into Supabase.', saveError);

    const fallbackCareTaskMap = new Map(
      remoteCareTasks.map((task) => [careTaskKey(task), task]),
    );

    for (const localTask of localCareTasks) {
      const existingTask = fallbackCareTaskMap.get(careTaskKey(localTask));
      fallbackCareTaskMap.set(
        careTaskKey(localTask),
        existingTask ? chooseMoreRecentCareTask(existingTask, localTask) : localTask,
      );
    }

    return {
      careTasks: [...fallbackCareTaskMap.values()].sort(sortCareTasks),
      recoveredCount: careTasksToRecover.length,
      storageMode: 'local',
    };
  }
}
