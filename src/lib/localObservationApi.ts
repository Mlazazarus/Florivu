import { Observation } from '../types';
import { logError, logInfo } from './logger';

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Local collection API ${response.status}: ${bodyText}`);
  }

  return (await response.json()) as T;
}

export async function fetchLocalObservations(userId: string): Promise<Observation[]> {
  logInfo('LocalCollection', 'Fetching observations from local fallback store.', { userId });

  try {
    const response = await fetch(`/api/local-observations?userId=${encodeURIComponent(userId)}`);
    return await parseJsonResponse<Observation[]>(response);
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
    const response = await fetch('/api/local-observations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(observation),
    });
    return await parseJsonResponse<Observation>(response);
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
    const response = await fetch(
      `/api/local-observations/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      },
    );
    return await parseJsonResponse<Observation>(response);
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
    const response = await fetch(
      `/api/local-observations/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    );
    await parseJsonResponse<{ ok: true }>(response);
  } catch (error) {
    logError('LocalCollection', 'Failed to delete local fallback observation.', error);
    throw error;
  }
}
