function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getInviteSenderLabel(senderName: string) {
  return senderName.trim() || 'A fellow plant collector';
}

export function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function maskEmailForLogs(value: string) {
  const trimmedValue = value.trim().toLowerCase();
  const atIndex = trimmedValue.indexOf('@');

  if (atIndex <= 0 || atIndex === trimmedValue.length - 1) {
    return 'redacted';
  }

  const localPart = trimmedValue.slice(0, atIndex);
  const domain = trimmedValue.slice(atIndex + 1);
  const localPrefix =
    localPart.length <= 2 ? `${localPart.charAt(0) || '*'}***` : `${localPart.slice(0, 2)}***`;

  return `${localPrefix}@${domain}`;
}

export function normalizeAbsoluteUrl(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '';
  }

  try {
    return new URL(trimmedValue).toString();
  } catch {
    return '';
  }
}

export function buildFriendInviteUrl(input: {
  appUrl: string;
  senderName: string;
  senderUserId: string;
}) {
  const normalizedAppUrl = normalizeAbsoluteUrl(input.appUrl);
  const normalizedSenderUserId = input.senderUserId.trim();

  if (!normalizedAppUrl || !normalizedSenderUserId) {
    return normalizedAppUrl;
  }

  const url = new URL(normalizedAppUrl);
  url.searchParams.set('invite', normalizedSenderUserId);
  url.searchParams.set('invite_name', getInviteSenderLabel(input.senderName));
  return url.toString();
}

export function getFriendInviteEmailSubject() {
  return 'Join me on Florivu';
}

export function buildFriendInvitePlainTextEmail(input: {
  inviteUrl: string;
  senderName: string;
}) {
  const senderLabel = getInviteSenderLabel(input.senderName);

  return [
    'Hi,',
    '',
    `${senderLabel} invited you to join Florivu.`,
    `Open Florivu here: ${input.inviteUrl}`,
    `Once you are in, add ${senderLabel} back on the Friends tab so you both connect.`,
    '',
    'See you in Florivu!',
  ].join('\n');
}

export function buildFriendInviteHtmlEmail(input: {
  inviteUrl: string;
  senderName: string;
}) {
  const senderLabel = escapeHtml(getInviteSenderLabel(input.senderName));
  const inviteUrl = escapeHtml(input.inviteUrl);

  return `
    <div style="font-family:Georgia,serif;background:#f4f7f1;padding:24px;color:#203529;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;padding:28px;border:1px solid #dbe6dc;">
        <p style="margin:0 0 8px;color:#5f7666;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">Florivu invite</p>
        <h1 style="margin:0 0 16px;font-size:28px;">Grow your Florivu circle</h1>
        <p style="margin:0 0 20px;color:#4d6355;line-height:1.6;">${senderLabel} invited you to join Florivu and connect on the Friends tab.</p>
        <p style="margin:0 0 20px;color:#4d6355;line-height:1.6;">Create your account from the link below, then add ${senderLabel} back so you both become connected friends.</p>
        <p style="margin:0;">
          <a href="${inviteUrl}" style="display:inline-block;padding:12px 16px;border-radius:999px;background:#2c6a4a;color:#ffffff;text-decoration:none;font-weight:700;">Open Florivu</a>
        </p>
        <p style="margin:20px 0 0;color:#728475;font-size:13px;line-height:1.5;">If the button does not open, copy this link into your browser:</p>
        <p style="margin:8px 0 0;color:#2c6a4a;font-size:13px;word-break:break-word;">${inviteUrl}</p>
      </div>
    </div>
  `;
}
