export function logInfo(scope: string, message: string, detail?: unknown) {
  void scope;
  void message;
  void detail;
}

export function logWarn(scope: string, message: string, detail?: unknown) {
  if (detail === undefined) {
    console.warn(`[${scope}] ${message}`);
    return;
  }

  console.warn(`[${scope}] ${message}`, detail);
}

export function logError(scope: string, message: string, detail?: unknown) {
  if (detail === undefined) {
    console.error(`[${scope}] ${message}`);
    return;
  }

  console.error(`[${scope}] ${message}`, detail);
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
