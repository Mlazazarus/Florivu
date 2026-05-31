import { Observation } from '../types';
import {
  deleteLocalObservationFromStore,
  fetchLocalObservationsFromStore,
  saveLocalObservationToStore,
  updateLocalObservationInStore,
} from './localFallbackStore';
import { logError, logInfo } from './logger';

export async function fetchLocalObservations(userId: string): Promise<Observation[]> {
  logInfo('LocalCollection', 'Fetching observations from local fallback store.', { userId });

  try {
    return await fetchLocalObservationsFromStore(userId);
  } catch (error) {
    logError('LocalCollection', 'Failed to fetch local fallback observations.', error);
    throw error;
  }
}

export async function saveLocalObservation(
  observation: Omit<Observation, 'id' | 'created_at'>,
): Promise<Observation> {
  logInfo('LocalCollection', 'Saving observation to local fallback store.', {
    userId: observation.user_id,
    species: observation.species,
  });

  try {
    return await saveLocalObservationToStore(observation);
  } catch (error) {
    logError('LocalCollection', 'Failed to save local fallback observation.', error);
    throw error;
  }
}

export async function updateLocalObservation(
  id: string,
  userId: string,
  updates: Partial<Pick<Observation, 'zip_code' | 'is_favorite' | 'is_house_plant'>>,
): Promise<Observation> {
  logInfo('LocalCollection', 'Updating observation in local fallback store.', {
    id,
    userId,
  });

  try {
    return await updateLocalObservationInStore(id, userId, updates);
  } catch (error) {
    logError('LocalCollection', 'Failed to update local fallback observation.', error);
    throw error;
  }
}

export async function deleteLocalObservation(id: string, userId: string): Promise<void> {
  logInfo('LocalCollection', 'Deleting observation from local fallback store.', {
    id,
    userId,
  });

  try {
    await deleteLocalObservationFromStore(id, userId);
  } catch (error) {
    logError('LocalCollection', 'Failed to delete local fallback observation.', error);
    throw error;
  }
}
