import { CareTaskSchedule } from '../types';
import { logError, logInfo } from './logger';

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Local care task API ${response.status}: ${bodyText}`);
  }

  return (await response.json()) as T;
}

export interface SaveLocalCareTaskInput
  extends Omit<CareTaskSchedule, 'id' | 'created_at' | 'updated_at'> {}

export async function fetchLocalCareTasks(userId: string): Promise<CareTaskSchedule[]> {
  logInfo('LocalCareTasks', 'Fetching care tasks from local fallback store.', { userId });

  try {
    const response = await fetch(`/api/local-care-tasks?userId=${encodeURIComponent(userId)}`);
    return await parseJsonResponse<CareTaskSchedule[]>(response);
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
    const response = await fetch('/api/local-care-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tasks),
    });
    return await parseJsonResponse<CareTaskSchedule[]>(response);
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
    const response = await fetch(
      `/api/local-care-tasks/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      },
    );
    return await parseJsonResponse<CareTaskSchedule>(response);
  } catch (error) {
    logError('LocalCareTasks', 'Failed to update local fallback care task.', error);
    throw error;
  }
}
