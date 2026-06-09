import { connect } from 'cloudflare:sockets';

import { getEnvValue, type AppEnv } from './runtime';

interface TransactionalEmailInput {
  fromEmail: string;
  fromName: string;
  html: string;
  subject: string;
  text: string;
  toEmail: string;
}

interface SmtpConfig {
  adminEmail: string;
  host: string;
  pass: string;
  port: number;
  senderName: string;
  user: string;
}

interface EmailProviderResult {
  configured: boolean;
  errorMessage?: string;
  provider: 'resend' | 'smtp' | 'none';
}

type SmtpSocket = ReturnType<typeof connect>;

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isAscii(value: string) {
  return /^[\x00-\x7F]*$/.test(value);
}

function toBase64(bytes: Uint8Array) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const byte1 = bytes[index] ?? 0;
    const byte2 = bytes[index + 1] ?? 0;
    const byte3 = bytes[index + 2] ?? 0;
    const chunk = (byte1 << 16) | (byte2 << 8) | byte3;

    output += alphabet[(chunk >> 18) & 63];
    output += alphabet[(chunk >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(chunk >> 6) & 63] : '=';
    output += index + 2 < bytes.length ? alphabet[chunk & 63] : '=';
  }

  return output;
}

function encodeBase64Utf8(value: string) {
  return toBase64(new TextEncoder().encode(value));
}

function wrapBase64Lines(value: string, width = 76) {
  const lines: string[] = [];
  for (let index = 0; index < value.length; index += width) {
    lines.push(value.slice(index, index + width));
  }
  return lines.join('\r\n');
}

function encodeHeaderWord(value: string) {
  return isAscii(value) ? value : `=?UTF-8?B?${encodeBase64Utf8(value)}?=`;
}

function escapeHeaderDisplayName(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatMailbox(name: string, email: string) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return email;
  }

  return `"${escapeHeaderDisplayName(trimmedName)}" <${email}>`;
}

function buildMimeMessage(input: TransactionalEmailInput) {
  const boundary = `florivu-${crypto.randomUUID()}`;
  const plainText = wrapBase64Lines(encodeBase64Utf8(input.text));
  const htmlText = wrapBase64Lines(encodeBase64Utf8(input.html));
  const lines = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@florivu.laztronics.workers.dev>`,
    `From: ${formatMailbox(input.fromName, input.fromEmail)}`,
    `To: ${input.toEmail}`,
    `Subject: ${encodeHeaderWord(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    plainText,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    htmlText,
    '',
    `--${boundary}--`,
    '',
  ];

  return lines.join('\r\n');
}

function dotStuffSmtpBody(body: string) {
  return body
    .replace(/\r?\n/g, '\r\n')
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

class SmtpSession {
  private buffer = '';
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private socket: SmtpSocket;
  private writer: WritableStreamDefaultWriter<Uint8Array>;

  constructor(socket: SmtpSocket) {
    this.socket = socket;
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }

  private async readLine(): Promise<string> {
    for (;;) {
      const newlineIndex = this.buffer.indexOf('\n');
      if (newlineIndex >= 0) {
        const line = this.buffer.slice(0, newlineIndex + 1);
        this.buffer = this.buffer.slice(newlineIndex + 1);
        return line.replace(/\r?\n$/, '');
      }

      const { done, value } = await this.reader.read();
      if (done) {
        if (this.buffer) {
          const remaining = this.buffer;
          this.buffer = '';
          return remaining;
        }

        throw new Error('SMTP server closed the connection unexpectedly.');
      }

      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }

  async readResponse() {
    const lines: string[] = [];
    let status = 0;

    for (;;) {
      const line = await this.readLine();
      lines.push(line);

      if (!/^\d{3}[- ]/.test(line)) {
        throw new Error(`Unexpected SMTP response: ${line}`);
      }

      status = Number(line.slice(0, 3));
      if (line.charAt(3) === ' ') {
        return {
          lines,
          message: lines.join('\n'),
          status,
        };
      }
    }
  }

  async sendCommand(command: string, expectedStatus: number | number[]) {
    await this.writer.write(this.encoder.encode(`${command}\r\n`));
    const response = await this.readResponse();
    const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];

    if (!expectedStatuses.includes(response.status)) {
      throw new Error(
        `SMTP command "${command}" expected ${expectedStatuses.join('/')} but received ${response.status}: ${response.message}`,
      );
    }

    return response;
  }

  async sendData(body: string) {
    await this.writer.write(this.encoder.encode(`${dotStuffSmtpBody(body)}\r\n.\r\n`));
    const response = await this.readResponse();
    if (response.status !== 250) {
      throw new Error(`SMTP DATA failed with ${response.status}: ${response.message}`);
    }
  }

  async startTls() {
    this.reader.releaseLock();
    this.writer.releaseLock();
    this.socket = this.socket.startTls();
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();
  }

  async close() {
    try {
      await this.sendCommand('QUIT', 221);
    } catch {
      this.socket.close();
      return;
    }

    this.socket.close();
  }
}

function getSmtpConfig(env: AppEnv): SmtpConfig | null {
  const host = getEnvValue(env, 'SMTP_HOST');
  const portValue = getEnvValue(env, 'SMTP_PORT');
  const user = getEnvValue(env, 'SMTP_USER');
  const pass = getEnvValue(env, 'SMTP_PASS');
  const adminEmail = getEnvValue(env, 'SMTP_ADMIN_EMAIL');
  const senderName = getEnvValue(env, 'SMTP_SENDER_NAME');

  if (!host || !portValue || !user || !pass) {
    return null;
  }

  const port = Number(portValue);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('SMTP_PORT must be a positive integer.');
  }

  return {
    adminEmail,
    host,
    pass,
    port,
    senderName,
    user,
  };
}

function getSmtpFailureMessage(config: SmtpConfig, error: unknown) {
  const errorMessage = toErrorMessage(error);

  if (config.host.trim().toLowerCase() === 'smtp.hostinger.com') {
    return 'SMTP delivery is unavailable from this Cloudflare Worker because smtp.hostinger.com resolves to Cloudflare IPs, and Workers cannot open outbound TCP sockets to Cloudflare IP ranges. Use Resend or another SMTP host that is not fronted by Cloudflare.';
  }

  if (errorMessage.includes('Stream was cancelled')) {
    return `SMTP delivery could not reach ${config.host} from this Cloudflare Worker. If that SMTP host is fronted by Cloudflare, Workers cannot open outbound TCP sockets to it.`;
  }

  return `SMTP delivery failed: ${errorMessage}`;
}

async function sendViaSmtp(config: SmtpConfig, input: TransactionalEmailInput) {
  const socket = connect(
    {
      hostname: config.host,
      port: config.port,
    },
    {
      secureTransport: config.port === 465 ? 'on' : 'starttls',
    },
  );
  const session = new SmtpSession(socket);
  let stage = 'connect';

  try {
    stage = 'greeting';
    const greeting = await session.readResponse();
    if (greeting.status !== 220) {
      throw new Error(`SMTP greeting failed with ${greeting.status}: ${greeting.message}`);
    }

    stage = 'ehlo';
    await session.sendCommand('EHLO florivu.laztronics.workers.dev', 250);

    if (config.port !== 465) {
      stage = 'starttls';
      await session.sendCommand('STARTTLS', 220);
      await session.startTls();
      stage = 'ehlo-after-starttls';
      await session.sendCommand('EHLO florivu.laztronics.workers.dev', 250);
    }

    stage = 'auth-login';
    await session.sendCommand('AUTH LOGIN', 334);
    stage = 'auth-username';
    await session.sendCommand(encodeBase64Utf8(config.user), 334);
    stage = 'auth-password';
    await session.sendCommand(encodeBase64Utf8(config.pass), 235);
    stage = 'mail-from';
    await session.sendCommand(`MAIL FROM:<${input.fromEmail}>`, 250);
    stage = 'rcpt-to';
    await session.sendCommand(`RCPT TO:<${input.toEmail}>`, [250, 251]);
    stage = 'data';
    await session.sendCommand('DATA', 354);
    stage = 'message-body';
    await session.sendData(buildMimeMessage(input));
    stage = 'done';
  } catch (error) {
    throw new Error(`SMTP ${stage} failed: ${toErrorMessage(error)}`);
  } finally {
    await session.close().catch(() => undefined);
  }
}

async function sendViaResend(env: AppEnv, input: TransactionalEmailInput) {
  const resendApiKey = getEnvValue(env, 'RESEND_API_KEY');
  if (!resendApiKey) {
    return false;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.fromEmail,
      html: input.html,
      subject: input.subject,
      text: input.text,
      to: [input.toEmail],
    }),
  });
  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`Resend email failed with ${response.status}: ${bodyText}`);
  }

  return true;
}

export async function sendTransactionalEmail(
  env: AppEnv,
  input: Omit<TransactionalEmailInput, 'fromEmail' | 'fromName'> & {
    fromEmailCandidates: Array<string | undefined>;
    fromNameCandidate?: string;
  },
): Promise<EmailProviderResult> {
  const fromEmail =
    input.fromEmailCandidates
      .map((value) => value?.trim() || '')
      .find(Boolean) || '';

  const smtpConfig = getSmtpConfig(env);
  const fromName = input.fromNameCandidate?.trim() || smtpConfig?.senderName || '';

  if (smtpConfig && fromEmail) {
    try {
      await sendViaSmtp(smtpConfig, {
        fromEmail,
        fromName,
        html: input.html,
        subject: input.subject,
        text: input.text,
        toEmail: input.toEmail,
      });

      return {
        configured: true,
        provider: 'smtp',
      };
    } catch (smtpError) {
      try {
        const sentViaResend = await sendViaResend(env, {
          fromEmail,
          fromName,
          html: input.html,
          subject: input.subject,
          text: input.text,
          toEmail: input.toEmail,
        });

        if (sentViaResend) {
          return {
            configured: true,
            provider: 'resend',
          };
        }
      } catch {
        // Fall through to the SMTP error message below when no HTTP provider succeeds.
      }

      return {
        configured: false,
        errorMessage: getSmtpFailureMessage(smtpConfig, smtpError),
        provider: 'none',
      };
    }
  }

  if (fromEmail) {
    const sentViaResend = await sendViaResend(env, {
      fromEmail,
      fromName,
      html: input.html,
      subject: input.subject,
      text: input.text,
      toEmail: input.toEmail,
    });

    if (sentViaResend) {
      return {
        configured: true,
        provider: 'resend',
      };
    }
  }

  return {
    configured: false,
    provider: 'none',
  };
}

export function getTransactionalEmailSetupMessage(featureLabel: string) {
  return `${featureLabel} email provider is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_ADMIN_EMAIL on the worker, or configure RESEND_API_KEY plus a sender email.`;
}

export function getTransactionalEmailFailureMessage(featureLabel: string, error: unknown) {
  return `${featureLabel} email failed: ${toErrorMessage(error)}`;
}
