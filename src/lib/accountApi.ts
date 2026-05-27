import { logError, logInfo } from './logger';

export async function deleteAccount(userId: string): Promise<void> {
  logInfo('AccountApi', 'Requesting account deletion.', { userId });

  const response = await fetch('/api/account/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    const error = new Error(`Account deletion failed with ${response.status}: ${bodyText}`);
    logError('AccountApi', 'Account deletion failed.', error);
    throw error;
  }

  logInfo('AccountApi', 'Account deletion request succeeded.', { userId });
}
