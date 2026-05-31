import { createClient, type User } from '@supabase/supabase-js';

export interface AppEnv {
  [key: string]: string | undefined;
  CARE_ALERT_APP_URL?: string;
  CARE_ALERT_FROM_EMAIL?: string;
  EXPO_PUBLIC_PLANTNET_API_KEY?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
  PLANTNET_API_KEY?: string;
  RESEND_API_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  VITE_PLANTNET_API_KEY?: string;
  VITE_PUBLIC_APP_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_SERVICE_ROLE_KEY?: string;
  VITE_SUPABASE_URL?: string;
}

export interface PagesFunctionContext<Env extends AppEnv = AppEnv> {
  data?: unknown;
  env: Env;
  functionPath?: string;
  params: Record<string, string>;
  request: Request;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function errorResponse(
  status: number,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return jsonResponse({ message, ...extra }, { status });
}

export function getEnvValue(env: AppEnv, ...keys: string[]) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return '';
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization')?.trim() ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

function createSupabaseAuthClient(env: AppEnv) {
  const supabaseUrl = getEnvValue(env, 'EXPO_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL');
  const supabaseKey = getEnvValue(
    env,
    'SUPABASE_SERVICE_ROLE_KEY',
    'VITE_SUPABASE_SERVICE_ROLE_KEY',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  );

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createSupabaseAdminClient(env: AppEnv) {
  const supabaseUrl = getEnvValue(env, 'EXPO_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceRoleKey = getEnvValue(
    env,
    'SUPABASE_SERVICE_ROLE_KEY',
    'VITE_SUPABASE_SERVICE_ROLE_KEY',
  );

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireAuthenticatedUser(
  context: PagesFunctionContext<AppEnv>,
): Promise<{ user: User } | { response: Response }> {
  const accessToken = getBearerToken(context.request);
  if (!accessToken) {
    return { response: errorResponse(401, 'Missing bearer token.') };
  }

  const authClient = createSupabaseAuthClient(context.env);
  if (!authClient) {
    return {
      response: errorResponse(
        501,
        'Supabase auth configuration is missing on the server.',
      ),
    };
  }

  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) {
    return { response: errorResponse(401, 'Invalid or expired session token.') };
  }

  return { user: data.user };
}
