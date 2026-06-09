import { supabase } from './supabase';

export interface FriendInviteEmailDeliveryResult {
  configured: boolean;
  sent: boolean;
  message: string;
  previewText?: string;
}

function extractMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const message = Reflect.get(payload, 'message');
  return typeof message === 'string' && message.trim() ? message.trim() : null;
}

export async function sendFriendInviteEmail(payload: {
  appUrl: string;
  email: string;
  senderName: string;
  senderUserId: string;
}): Promise<FriendInviteEmailDeliveryResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token?.trim();

  if (!accessToken) {
    throw new Error('You must be signed in to send invite emails.');
  }

  const response = await fetch('/api/friends/send-invite', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      appUrl: payload.appUrl,
      email: payload.email,
      senderName: payload.senderName,
      senderUserId: payload.senderUserId,
    }),
  });

  if (!response.ok) {
    const responsePayload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    const message =
      extractMessage(responsePayload) ?? `Friend invite email API ${response.status} failed.`;
    throw new Error(message);
  }

  return (await response.json()) as FriendInviteEmailDeliveryResult;
}
