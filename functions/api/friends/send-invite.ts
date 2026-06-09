import {
  buildFriendInviteHtmlEmail,
  buildFriendInvitePlainTextEmail,
  buildFriendInviteUrl,
  getFriendInviteEmailSubject,
  maskEmailForLogs,
  normalizeAbsoluteUrl,
  isValidEmailAddress,
} from '../../_shared/friendInviteEmail';
import {
  errorResponse,
  getEnvValue,
  jsonResponse,
  requireAuthenticatedUser,
  type AppEnv,
  type PagesFunctionContext,
} from '../../_shared/runtime';
import {
  getTransactionalEmailFailureMessage,
  getTransactionalEmailSetupMessage,
  sendTransactionalEmail,
} from '../../_shared/smtpEmail';

async function sendViaInviteRelay(input: {
  email: string;
  env: AppEnv;
  inviteUrl: string;
  senderName: string;
  senderUserId: string;
}) {
  const webhookUrl = getEnvValue(input.env, 'FRIEND_INVITE_WEBHOOK_URL');
  const webhookSecret = getEnvValue(input.env, 'FRIEND_INVITE_WEBHOOK_SECRET');

  if (!webhookUrl || !webhookSecret) {
    return null;
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Florivu-Invite-Secret': webhookSecret,
    },
    body: JSON.stringify({
      email: input.email,
      invite_url: input.inviteUrl,
      sender_name: input.senderName,
      sender_user_id: input.senderUserId,
    }),
  });
  const responseText = await response.text();
  let responsePayload: Record<string, unknown> = {};
  if (responseText) {
    try {
      responsePayload = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      responsePayload = {};
    }
  }
  const message =
    typeof responsePayload.message === 'string' && responsePayload.message.trim()
      ? responsePayload.message.trim()
      : `Friend invite relay failed with ${response.status}.`;

  if (!response.ok) {
    throw new Error(message);
  }

  return {
    configured: true,
    message,
    provider: 'php-relay' as const,
    sent: responsePayload.sent !== false,
  };
}

export async function onRequestPost(
  context: PagesFunctionContext<AppEnv>,
) {
  const auth = await requireAuthenticatedUser(context);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const body = (await context.request.json()) as {
      appUrl?: unknown;
      email?: unknown;
      senderName?: unknown;
    };
    const appUrl = typeof body.appUrl === 'string' ? body.appUrl.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const senderName = typeof body.senderName === 'string' ? body.senderName.trim() : '';
    const providedAppUrl = normalizeAbsoluteUrl(appUrl);

    if (!isValidEmailAddress(email)) {
      return errorResponse(400, 'Enter a valid email address to send an invite.');
    }

    const configuredAppUrl = getEnvValue(
      context.env,
      'VITE_PUBLIC_APP_URL',
      'CARE_ALERT_APP_URL',
    );
    const inviteUrl =
      buildFriendInviteUrl({
        appUrl: providedAppUrl || configuredAppUrl,
        senderName,
        senderUserId: auth.user.id,
      });

    if (!inviteUrl) {
      return errorResponse(
        400,
        'Invite link is not configured. Set VITE_PUBLIC_APP_URL before sending invites.',
      );
    }

    const previewText = buildFriendInvitePlainTextEmail({
      inviteUrl,
      senderName,
    });
    const maskedRecipient = maskEmailForLogs(email);

    console.info('[FriendInvite]', {
      hasConfiguredAppUrl: Boolean(providedAppUrl || configuredAppUrl),
      hasInviteRelay: Boolean(getEnvValue(context.env, 'FRIEND_INVITE_WEBHOOK_URL')),
      inviterUserId: auth.user.id,
      recipient: maskedRecipient,
    });

    const relayDelivery = await sendViaInviteRelay({
      email,
      env: context.env,
      inviteUrl,
      senderName,
      senderUserId: auth.user.id,
    });

    if (relayDelivery) {
      console.info('[FriendInvite] Invite email sent via relay.', {
        inviterUserId: auth.user.id,
        provider: relayDelivery.provider,
        recipient: maskedRecipient,
      });
      return jsonResponse({
        configured: true,
        sent: relayDelivery.sent,
        message: relayDelivery.message,
        previewText,
      });
    }

    const delivery = await sendTransactionalEmail(context.env, {
      fromEmailCandidates: [
        getEnvValue(context.env, 'FRIEND_INVITE_FROM_EMAIL'),
        getEnvValue(context.env, 'CARE_ALERT_FROM_EMAIL'),
        getEnvValue(context.env, 'SMTP_ADMIN_EMAIL'),
      ],
      fromNameCandidate: getEnvValue(context.env, 'SMTP_SENDER_NAME') || 'Florivu',
      html: buildFriendInviteHtmlEmail({
        inviteUrl,
        senderName,
      }),
      subject: getFriendInviteEmailSubject(),
      text: previewText,
      toEmail: email,
    });

    if (!delivery.configured) {
      console.warn('[FriendInvite] Email provider not configured.', {
        errorMessage: delivery.errorMessage ?? null,
        inviterUserId: auth.user.id,
        recipient: maskedRecipient,
      });
      return jsonResponse({
        configured: false,
        sent: false,
        message: delivery.errorMessage ?? getTransactionalEmailSetupMessage('Friend invite'),
        previewText,
      });
    }

    console.info('[FriendInvite] Invite email sent.', {
      inviterUserId: auth.user.id,
      provider: delivery.provider,
      recipient: maskedRecipient,
    });
    return jsonResponse({
      configured: true,
      sent: true,
      message: `Invite email sent to ${email}.`,
      previewText,
    });
  } catch (error) {
    console.error('[FriendInvite] Unexpected friend invite email failure.', error);
    return errorResponse(
      500,
      getTransactionalEmailFailureMessage('Friend invite', error),
    );
  }
}
