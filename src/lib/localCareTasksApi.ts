import { CareTaskSchedule } from '../types';
import {
  fetchLocalCareTasksFromStore,
  saveLocalCareTasksToStore,
  updateLocalCareTaskInStore,
} from './localFallbackStore';
import { logError, logInfo } from './logger';

export interface SaveLocalCareTaskInput
  extends Omit<CareTaskSchedule, 'id' | 'created_at' | 'updated_at'> {}

export async function fetchLocalCareTasks(userId: string): Promise<CareTaskSchedule[]> {
  logInfo('LocalCareTasks', 'Fetching care tasks from local fallback store.', { userId });

  try {
    return await fetchLocalCareTasksFromStore(userId);
  } catch (error) {
    logError('LocalCareTasks', 'Failed to fetch local fallback care tasks.', error);
    throw error;
  }
}

export async function saveLocalCareTasks(
  tasks: SaveLocalCareTaskInput[],
): Promise<CareTaskSchedule[]> {
  logInfo('LocalCareTasks', 'Saving care tasks to local fallback store.', {
    count: tasks.length,
  });

  try {
    return await saveLocalCareTasksToStore(tasks);
  } catch (error) {
    logError('LocalCareTasks', 'Failed to save local fallback care tasks.', error);
    throw error;
  }
}

export async function updateLocalCareTask(
  id: string,
  userId: string,
  updates: Partial<
    Pick<
      CareTaskSchedule,
      'title' | 'instructions' | 'cadence_days' | 'sort_order' | 'last_completed_at' | 'next_due_at'
    >
  >,
): Promise<CareTaskSchedule> {
  logInfo('LocalCareTasks', 'Updating care task in local fallback store.', {
    id,
    userId,
  });

  try {
    return await updateLocalCareTaskInStore(id, userId, updates);
  } catch (error) {
    logError('LocalCareTasks', 'Failed to update local fallback care task.', error);
    throw error;
  }
}
