import { useState } from 'react';
import { describeCareCadence, isCareTaskDue } from '../lib/careTasks';
import { CareTaskKey, CareTaskSchedule, Observation } from '../types';

const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
});

type VisibleCareTaskKey = Exclude<CareTaskKey, 'rotate'>;

const taskColumnLabels: Record<VisibleCareTaskKey, string> = {
  water: 'Water',
  feed: 'Feed',
  'refresh-soil': 'Soil',
};

const orderedTaskKeys: VisibleCareTaskKey[] = ['water', 'feed', 'refresh-soil'];

interface CareTrackingPanelProps {
  observations: Observation[];
  careTasks: CareTaskSchedule[];
  loading: boolean;
  saving: boolean;
  storageMode: 'supabase' | 'local';
  onCompleteTask: (
    observation: Observation,
    task: CareTaskSchedule,
    completedOn: string,
  ) => Promise<void>;
  onOpenObservation: (observation: Observation) => void;
}

interface CareTrackingRow {
  observation: Observation;
  dueCount: number;
  nextDueAt: string | null;
  tasksByKey: Partial<Record<CareTaskKey, CareTaskSchedule>>;
}

function buildRows(
  observations: Observation[],
  careTasks: CareTaskSchedule[],
): CareTrackingRow[] {
  const tasksByObservationId = new Map<string, CareTaskSchedule[]>();

  for (const task of careTasks) {
    const existingTasks = tasksByObservationId.get(task.observation_id) ?? [];
    existingTasks.push(task);
    tasksByObservationId.set(task.observation_id, existingTasks);
  }

  return observations
    .filter((observation) => observation.is_house_plant)
    .map((observation) => {
      const tasks = [...(tasksByObservationId.get(observation.id) ?? [])].sort((left, right) => {
        const dueDelta =
          new Date(left.next_due_at).getTime() - new Date(right.next_due_at).getTime();
        if (dueDelta !== 0) {
          return dueDelta;
        }

        return left.sort_order - right.sort_order;
      });
      const tasksByKey = Object.fromEntries(
        tasks.map((task) => [task.task_key, task]),
      ) as Partial<Record<CareTaskKey, CareTaskSchedule>>;

      return {
        observation,
        dueCount: tasks.filter((task) => isCareTaskDue(task)).length,
        nextDueAt: tasks[0]?.next_due_at ?? null,
        tasksByKey,
      };
    })
    .sort((left, right) => {
      if (left.dueCount !== right.dueCount) {
        return right.dueCount - left.dueCount;
      }

      if (left.nextDueAt && right.nextDueAt) {
        const dueDelta =
          new Date(left.nextDueAt).getTime() - new Date(right.nextDueAt).getTime();
        if (dueDelta !== 0) {
          return dueDelta;
        }
      } else if (left.nextDueAt) {
        return -1;
      } else if (right.nextDueAt) {
        return 1;
      }

      return left.observation.common_name.localeCompare(right.observation.common_name, undefined, {
        sensitivity: 'base',
      });
    });
}

export default function CareTrackingPanel({
  observations,
  careTasks,
  loading,
  saving,
  storageMode,
  onCompleteTask,
  onOpenObservation,
}: CareTrackingPanelProps) {
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const rows = buildRows(observations, careTasks);
  const housePlantCount = rows.length;
  const dueTaskCount = careTasks.filter((task) => isCareTaskDue(task)).length;
  const duePlantCount = rows.filter((row) => row.dueCount > 0).length;

  const handleCompleteTask = async (observation: Observation, task: CareTaskSchedule) => {
    setCompletingTaskId(task.id);

    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = `${today.getMonth() + 1}`.padStart(2, '0');
      const day = `${today.getDate()}`.padStart(2, '0');
      await onCompleteTask(observation, task, `${year}-${month}-${day}`);
    } finally {
      setCompletingTaskId(null);
    }
  };

  if (loading && housePlantCount === 0) {
    return (
      <div className="panel">
        <div className="empty-state">
          <strong>Loading care tracking...</strong>
        </div>
      </div>
    );
  }

  if (housePlantCount === 0) {
    return (
      <div className="panel">
        <div className="empty-state">
          <strong>No house plants to track yet.</strong>
          <span>
            Mark plants as house plants in My Plants and Florivu will build a care schedule for
            them here.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="care-tracking-layout">
      <div className="care-tracking-summary">
        <div className="settings-card">
          <span>House plants</span>
          <strong>{housePlantCount}</strong>
          <p>Every row in this tracker is one saved house plant.</p>
        </div>
        <div className="settings-card">
          <span>Plants needing care</span>
          <strong>{duePlantCount}</strong>
          <p>These plants have at least one task due now.</p>
        </div>
        <div className="settings-card">
          <span>Due tasks</span>
          <strong>{dueTaskCount}</strong>
          <p>Use Done today to roll the next reminder forward immediately.</p>
        </div>
        <div className="settings-card">
          <span>Storage mode</span>
          <strong>{storageMode === 'local' ? 'This device' : 'Florivu account'}</strong>
          <p>
            {saving
              ? 'Saving care updates now.'
              : 'Open a plant to log a different date or review the full care notes.'}
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Care tracking</p>
            <h2>See what each house plant needs next</h2>
          </div>
        </div>

        <div className="care-tracking-table-wrap">
          <table className="care-tracking-table">
            <thead>
              <tr>
                <th scope="col">Plant</th>
                <th scope="col">Due now</th>
                <th scope="col">Next up</th>
                {orderedTaskKeys.map((taskKey) => (
                  <th key={taskKey} scope="col">
                    {taskColumnLabels[taskKey]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.observation.id}>
                  <td>
                    <button
                      className="care-tracking-plant"
                      onClick={() => onOpenObservation(row.observation)}
                      type="button"
                    >
                      <img
                        alt={row.observation.common_name}
                        src={row.observation.photo_url}
                      />
                      <span className="care-tracking-plant__copy">
                        <strong>{row.observation.common_name}</strong>
                        <span>{row.observation.scientific_name}</span>
                      </span>
                    </button>
                  </td>
                  <td>
                    <div className="care-tracking-count">
                      <strong>{row.dueCount}</strong>
                      <span>{row.dueCount === 1 ? 'task due' : 'tasks due'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="care-tracking-next">
                      <strong>
                        {row.nextDueAt
                          ? fullDateFormatter.format(new Date(row.nextDueAt))
                          : 'Pending'}
                      </strong>
                      <span>
                        {row.nextDueAt
                          ? row.dueCount > 0
                            ? 'Needs attention'
                            : 'Upcoming'
                          : 'Schedules syncing'}
                      </span>
                    </div>
                  </td>
                  {orderedTaskKeys.map((taskKey) => {
                    const task = row.tasksByKey[taskKey];

                    if (!task) {
                      return (
                        <td key={taskKey}>
                          <div className="care-task-table-card care-task-table-card--muted">
                            <strong>Generating...</strong>
                            <span>Bundled schedule will appear here.</span>
                          </div>
                        </td>
                      );
                    }

                    const due = isCareTaskDue(task);
                    const completing = completingTaskId === task.id;

                    return (
                      <td key={task.id}>
                        <div className="care-task-table-card">
                          <span
                            className={
                              due
                                ? 'care-task-table-card__status care-task-table-card__status--due'
                                : 'care-task-table-card__status'
                            }
                          >
                            {due ? 'Due now' : 'Next due'}
                          </span>
                          <strong>{fullDateFormatter.format(new Date(task.next_due_at))}</strong>
                          <span>{describeCareCadence(task.cadence_days)}</span>
                          <button
                            className="ghost-link"
                            disabled={Boolean(completingTaskId)}
                            onClick={() => void handleCompleteTask(row.observation, task)}
                            type="button"
                          >
                            {completing ? 'Saving...' : 'Done today'}
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
