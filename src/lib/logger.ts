export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  detail?: string;
}

const MAX_LOG_ENTRIES = 40;
const entries: LogEntry[] = [];
const listeners = new Set<(entries: LogEntry[]) => void>();

function notifyListeners() {
  const snapshot = [...entries];
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function stringifyDetail(detail: unknown) {
  if (detail === undefined) {
    return undefined;
  }

  if (typeof detail === 'string') {
    return detail;
  }

  if (detail instanceof Error) {
    return `${detail.name}: ${detail.message}`;
  }

  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

function pushEntry(level: LogLevel, scope: string, message: string, detail?: unknown) {
  const entry: LogEntry = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    detail: stringifyDetail(detail),
  };

  entries.unshift(entry);
  if (entries.length > MAX_LOG_ENTRIES) {
    entries.length = MAX_LOG_ENTRIES;
  }

  const consoleMethod =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  consoleMethod(`[${scope}] ${message}`, detail ?? '');
  notifyListeners();
}

export function logInfo(scope: string, message: string, detail?: unknown) {
  pushEntry('info', scope, message, detail);
}

export function logWarn(scope: string, message: string, detail?: unknown) {
  pushEntry('warn', scope, message, detail);
}

export function logError(scope: string, message: string, detail?: unknown) {
  pushEntry('error', scope, message, detail);
}

export function subscribeToLogs(listener: (entries: LogEntry[]) => void) {
  listener([...entries]);
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }

  return 'Something went wrong.';
}
