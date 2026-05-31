import { CareTaskSchedule, Observation } from '../types';
import { supabase } from './supabase';

export interface CareAlertEmailDeliveryResult {
  configured: boolean;
  sent: boolean;
  message: string;
  previewText?: string;
}

export interface SendCareAlertEmailPayload {
  email: string;
  displayName: string;
  timeZone: string;
  tasks: CareTaskSchedule[];
  observationsById: Record<string, Observation>;
}

export async function sendCareAlertEmail(
  payload: SendCareAlertEmailPayload,
): Promise<CareAlertEmailDeliveryResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token?.trim();

  if (!accessToken) {
    throw new Error('You must be signed in to send care reminder emails.');
  }

  const response = await fetch('/api/care-alerts/send-email', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: payload.email,
      displayName: payload.displayName,
      timeZone: payload.timeZone,
      tasks: payload.tasks.map((task) => {
        const observation = payload.observationsById[task.observation_id];
        return {
          observationName: observation?.common_name ?? 'Saved plant',
          scientificName: observation?.scientific_name ?? '',
          taskTitle: task.title,
          instructions: task.instructions,
          cadenceDays: task.cadence_days,
          nextDueAt: task.next_due_at,
        };
      }),
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Care alert email API ${response.status}: ${bodyText}`);
  }

  return (await response.json()) as CareAlertEmailDeliveryResult;
}
