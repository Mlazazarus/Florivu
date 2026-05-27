import { OrganType, PlantNetResponse } from '../types';
import { logError, logInfo } from './logger';

export async function identifyPlant(
  file: File,
  organ: OrganType = 'auto',
): Promise<PlantNetResponse> {
  const form = new FormData();
  form.append('organ', organ);
  form.append('image', file, file.name);

  logInfo('PlantAPI', 'Submitting identify request to local proxy.', {
    endpoint: '/api/plantnet/identify',
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    organ,
  });

  let response: Response;

  try {
    response = await fetch('/api/plantnet/identify', {
      method: 'POST',
      body: form,
    });
  } catch (error) {
    logError('PlantAPI', 'Network failure while calling local identify proxy.', error);
    throw error;
  }

  if (!response.ok) {
    const bodyText = await response.text();
    logError('PlantAPI', 'Identify proxy request failed.', {
      status: response.status,
      bodyText,
    });

    if (response.status === 504) {
      throw new Error(
        `PlantNet took too long to respond. Try again, or use a smaller/clearer image if this keeps happening.`,
      );
    }

    throw new Error(`Identify API ${response.status}: ${bodyText}`);
  }

  const payload = (await response.json()) as PlantNetResponse;
  logInfo('PlantAPI', 'PlantNet request completed.', {
    bestMatch: payload.bestMatch,
    resultCount: payload.results.length,
  });
  return payload;
}
