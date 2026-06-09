import { useCallback, useState } from 'react';
import {
  SaveLocalCareTaskInput,
  fetchLocalCareTasks,
  saveLocalCareTasks,
  updateLocalCareTask,
} from '../lib/localCareTasksApi';
import {
  calculateNextDueAt,
  getBundledCareTaskTemplates,
} from '../lib/careTasks';
import { recoverCareTasksFromSupabaseOrLocal } from '../lib/localFallbackRecovery';
import { logError, logInfo } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { CareTaskSchedule, Observation } from '../types';

function shouldUseLocalCareTaskFallback(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message).toLowerCase()
      : String(error ?? '').toLowerCase();

  return (
    message.includes("could not find the table 'public.care_task_schedules'") ||
    message.includes('relation "care_task_schedules" does not exist') ||
    message.includes('schema cache')
  );
}

function normalizeCareTask(task: CareTaskSchedule): CareTaskSchedule {
  return {
    ...task,
    last_completed_at: task.last_completed_at ?? null,
  };
}

function mergeTasks(
  existingTasks: CareTaskSchedule[],
  nextTasks: CareTaskSchedule[],
): CareTaskSchedule[] {
  const merged = new Map(existingTasks.map((task) => [task.id, task]));

  for (const task of nextTasks) {
    merged.set(task.id, task);
  }

  return [...merged.values()].sort((left, right) => {
    const dueDelta =
      new Date(left.next_due_at).getTime() - new Date(right.next_due_at).getTime();
    if (dueDelta !== 0) {
      return dueDelta;
    }

    return left.sort_order - right.sort_order;
  });
}

export function useCareSchedules(userId: string | undefined) {
  const [careTasks, setCareTasks] = useState<CareTaskSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [storageMode, setStorageMode] = useState<'supabase' | 'local'>('supabase');

  const fetchCareTasks = useCallback(async () => {
    if (!userId) {
      setCareTasks([]);
      setError(null);
      setInitialized(false);
      return;
    }

    setLoading(true);
    setError(null);
    logInfo('CareTasks', 'Fetching care tasks.', { userId });

    try {
      const recoveredCareTasks = await recoverCareTasksFromSupabaseOrLocal(userId);
      setCareTasks(recoveredCareTasks.careTasks.map(normalizeCareTask));
      setStorageMode(recoveredCareTasks.storageMode);
      logInfo(
        'CareTasks',
        recoveredCareTasks.recoveredCount > 0
          ? 'Recovered local care tasks into the Florivu account.'
          : recoveredCareTasks.storageMode === 'local'
            ? 'Using the local care schedule copy after recovery could not reach Supabase.'
            : 'Care task fetch complete.',
        {
          userId,
          count: recoveredCareTasks.careTasks.length,
          recoveredCount: recoveredCareTasks.recoveredCount,
          storageMode: recoveredCareTasks.storageMode,
        },
      );
    } catch (fetchError) {
      if (shouldUseLocalCareTaskFallback(fetchError)) {
        const localTasks = await fetchLocalCareTasks(userId);
        setCareTasks(localTasks.map(normalizeCareTask));
        setStorageMode('local');
      } else {
        setError(fetchError instanceof Error ? fetchError.message : 'Unknown error');
        logError('CareTasks', 'Care task fetch failed.', fetchError);
      }
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [userId]);

  const syncBundledCareTasks = useCallback(
    async (observations: Observation[]) => {
      if (!userId) {
        return [];
      }

      const missingTasks: SaveLocalCareTaskInput[] = [];
      const existingTaskKeySet = new Set(
        careTasks.map((task) => `${task.observation_id}:${task.task_key}`),
      );

      for (const observation of observations) {
        for (const template of getBundledCareTaskTemplates(observation)) {
          const compoundKey = `${observation.id}:${template.task_key}`;
          if (existingTaskKeySet.has(compoundKey)) {
            continue;
          }

          const createdAt = new Date().toISOString();
          missingTasks.push({
            observation_id: observation.id,
            user_id: userId,
            task_key: template.task_key,
            title: template.title,
            instructions: template.instructions,
            cadence_days: template.cadence_days,
            sort_order: template.sort_order,
            source: 'bundled',
            last_completed_at: null,
            next_due_at: calculateNextDueAt(createdAt, template.cadence_days),
          });
          existingTaskKeySet.add(compoundKey);
        }
      }

      if (missingTasks.length === 0) {
        return careTasks;
      }

      setSaving(true);
      setError(null);
      logInfo('CareTasks', 'Creating bundled care tasks.', {
        userId,
        count: missingTasks.length,
      });

      try {
        const insertedTasks = async () => {
          const { data, error: insertError } = await supabase
            .from('care_task_schedules')
            .insert(missingTasks)
            .select('*');

          if (insertError) {
            throw insertError;
          }

          return (data ?? []).map((task) => normalizeCareTask(task as CareTaskSchedule));
        };

        const createdTasks = await insertedTasks();
        setCareTasks((currentTasks) => mergeTasks(currentTasks, createdTasks));
        setStorageMode('supabase');
        return createdTasks;
      } catch (saveError) {
        if (shouldUseLocalCareTaskFallback(saveError)) {
          const createdTasks = await saveLocalCareTasks(missingTasks);
          const normalizedTasks = createdTasks.map(normalizeCareTask);
          setCareTasks((currentTasks) => mergeTasks(currentTasks, normalizedTasks));
          setStorageMode('local');
          return normalizedTasks;
        }

        setError(saveError instanceof Error ? saveError.message : 'Unknown error');
        logError('CareTasks', 'Bundled care task creation failed.', saveError);
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [careTasks, userId],
  );

  const completeCareTask = useCallback(
    async (task: CareTaskSchedule, completedAtIso: string) => {
      if (!userId) {
        throw new Error('No signed-in user.');
      }

      const updates = {
        last_completed_at: completedAtIso,
        next_due_at: calculateNextDueAt(completedAtIso, task.cadence_days),
      };

      setSaving(true);
      setError(null);

      try {
        const { data, error: updateError } = await supabase
          .from('care_task_schedules')
          .update(updates)
          .eq('id', task.id)
          .eq('user_id', userId)
          .select('*')
          .single();

        if (updateError) {
          throw updateError;
        }

        const updatedTask = normalizeCareTask(data as CareTaskSchedule);
        setCareTasks((currentTasks) =>
          mergeTasks(
            currentTasks.filter((currentTask) => currentTask.id !== updatedTask.id),
            [updatedTask],
          ),
        );
        setStorageMode('supabase');
        return updatedTask;
      } catch (updateError) {
        if (shouldUseLocalCareTaskFallback(updateError)) {
          const updatedTask = normalizeCareTask(
            await updateLocalCareTask(task.id, userId, updates),
          );
          setCareTasks((currentTasks) =>
            mergeTasks(
              currentTasks.filter((currentTask) => currentTask.id !== updatedTask.id),
              [updatedTask],
            ),
          );
          setStorageMode('local');
          return updatedTask;
        }

        setError(updateError instanceof Error ? updateError.message : 'Unknown error');
        logError('CareTasks', 'Care task completion failed.', updateError);
        throw updateError;
      } finally {
        setSaving(false);
      }
    },
    [userId],
  );

  return {
    careTasks,
    loading,
    saving,
    error,
    initialized,
    storageMode,
    fetchCareTasks,
    syncBundledCareTasks,
    completeCareTask,
  };
}
