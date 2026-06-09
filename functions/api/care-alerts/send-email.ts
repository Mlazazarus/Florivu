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

interface CareAlertTaskPayload {
  cadenceDays: number;
  instructions: string;
  nextDueAt: string;
  observationName: string;
  scientificName: string;
  taskTitle: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDueDate(iso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      dateStyle: 'medium',
    }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(iso));
  }
}

function buildPlainTextEmail(input: {
  displayName: string;
  email: string;
  publicAppUrl: string;
  tasks: CareAlertTaskPayload[];
  timeZone: string;
}) {
  const greetingName = input.displayName.trim() || input.email.trim();
  const lines = [
    `Hi ${greetingName},`,
    '',
    'These Florivu care reminders are ready:',
    '',
    ...input.tasks.flatMap((task, index) => [
      `${index + 1}. ${task.observationName} - ${task.taskTitle}`,
      `   Due: ${formatDueDate(task.nextDueAt, input.timeZone)}`,
      `   Repeat every ${task.cadenceDays} day${task.cadenceDays === 1 ? '' : 's'}`,
      `   ${task.instructions}`,
      task.scientificName ? `   ${task.scientificName}` : '',
      '',
    ]),
    input.publicAppUrl ? `Open Florivu: ${input.publicAppUrl}` : '',
    'When you finish one of these steps in Florivu, the next reminder date will roll forward automatically.',
  ];

  return lines.filter(Boolean).join('\n');
}

function buildHtmlEmail(input: {
  displayName: string;
  email: string;
  publicAppUrl: string;
  tasks: CareAlertTaskPayload[];
  timeZone: string;
}) {
  const greetingName = escapeHtml(input.displayName.trim() || input.email.trim());
  const taskItems = input.tasks
    .map((task) => {
      const scientificName = task.scientificName
        ? `<div style="color:#617364;font-size:13px;">${escapeHtml(task.scientificName)}</div>`
        : '';
      return `
        <li style="margin:0 0 16px;padding:16px;border:1px solid #d9e4d9;border-radius:14px;background:#fbfdf9;">
          <div style="font-size:16px;font-weight:700;color:#1f3528;">${escapeHtml(task.observationName)} - ${escapeHtml(task.taskTitle)}</div>
          ${scientificName}
          <div style="margin-top:8px;color:#395742;font-size:14px;">Due ${escapeHtml(formatDueDate(task.nextDueAt, input.timeZone))} - every ${task.cadenceDays} day${task.cadenceDays === 1 ? '' : 's'}</div>
          <p style="margin:10px 0 0;color:#4f6356;font-size:14px;line-height:1.55;">${escapeHtml(task.instructions)}</p>
        </li>
      `;
    })
    .join('');
  const openAppLink = input.publicAppUrl
    ? `<p style="margin-top:20px;"><a href="${escapeHtml(input.publicAppUrl)}" style="display:inline-block;padding:12px 16px;border-radius:999px;background:#2c6a4a;color:#ffffff;text-decoration:none;font-weight:700;">Open Florivu</a></p>`
    : '';

  return `
    <div style="font-family:Georgia,serif;background:#f4f7f1;padding:24px;color:#203529;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;padding:28px;border:1px solid #dbe6dc;">
        <p style="margin:0 0 8px;color:#5f7666;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">Florivu care alerts</p>
        <h1 style="margin:0 0 16px;font-size:28px;">Hi ${greetingName}</h1>
        <p style="margin:0 0 20px;color:#4d6355;line-height:1.6;">These plant care reminders are ready. Mark a task complete in Florivu after you finish it and the next reminder date will roll forward automatically.</p>
        <ol style="margin:0;padding:0;list-style:none;">${taskItems}</ol>
        ${openAppLink}
      </div>
    </div>
  `;
}

function parseTasks(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (task): task is CareAlertTaskPayload =>
      Boolean(task) &&
      typeof (task as Record<string, unknown>).observationName === 'string' &&
      typeof (task as Record<string, unknown>).taskTitle === 'string' &&
      typeof (task as Record<string, unknown>).instructions === 'string' &&
      typeof (task as Record<string, unknown>).cadenceDays === 'number' &&
      typeof (task as Record<string, unknown>).nextDueAt === 'string',
  );
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
      displayName?: unknown;
      email?: unknown;
      tasks?: unknown;
      timeZone?: unknown;
    };
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const timeZone = typeof body.timeZone === 'string' ? body.timeZone.trim() || 'UTC' : 'UTC';
    const tasks = parseTasks(body.tasks);
    const publicAppUrl = getEnvValue(
      context.env,
      'VITE_PUBLIC_APP_URL',
      'CARE_ALERT_APP_URL',
    );

    if (!email || tasks.length === 0) {
      return errorResponse(400, 'email and at least one care task are required.');
    }

    const previewText = buildPlainTextEmail({
      email,
      displayName,
      publicAppUrl,
      tasks,
      timeZone,
    });
    const delivery = await sendTransactionalEmail(context.env, {
      fromEmailCandidates: [
        getEnvValue(context.env, 'CARE_ALERT_FROM_EMAIL'),
        getEnvValue(context.env, 'SMTP_ADMIN_EMAIL'),
      ],
      fromNameCandidate: getEnvValue(context.env, 'SMTP_SENDER_NAME') || 'Florivu',
      html: buildHtmlEmail({
        email,
        displayName,
        publicAppUrl,
        tasks,
        timeZone,
      }),
      subject: `Florivu care reminders for ${formatDueDate(new Date().toISOString(), timeZone)}`,
      text: previewText,
      toEmail: email,
    });

    if (!delivery.configured) {
      return jsonResponse({
        configured: false,
        sent: false,
        message: delivery.errorMessage ?? getTransactionalEmailSetupMessage('Care alert'),
        previewText,
      });
    }

    return jsonResponse({
      configured: true,
      sent: true,
      message: `Care reminder email sent to ${email}.`,
      previewText,
    });
  } catch (error) {
    return errorResponse(
      500,
      getTransactionalEmailFailureMessage('Care alert', error),
    );
  }
}
