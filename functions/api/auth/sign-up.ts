import { createClient } from '@supabase/supabase-js';
import {
  errorResponse,
  getEnvValue,
  jsonResponse,
  type AppEnv,
  type PagesFunctionContext,
} from '../../_shared/runtime';

interface SignUpRequestBody {
  captchaToken?: string | null;
  email?: string | null;
  emailRedirectTo?: string | null;
  password?: string | null;
  referredByUserId?: string | null;
}

interface HCaptchaVerificationResult {
  success?: boolean;
  hostname?: string;
  challenge_ts?: string;
  'error-codes'?: string[];
}

function getRemoteIp(request: Request) {
  const forwarded = request.headers.get('CF-Connecting-IP')?.trim();
  if (forwarded) {
    return forwarded;
  }

  const fallbackForwardedFor = request.headers.get('X-Forwarded-For')?.trim() ?? '';
  return fallbackForwardedFor.split(',')[0]?.trim() ?? '';
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function createSupabaseSignupClient(env: AppEnv) {
  const supabaseUrl = getEnvValue(env, 'EXPO_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL');
  const publishableKey = getEnvValue(
    env,
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  );

  if (!supabaseUrl || !publishableKey) {
    return null;
  }

  return createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function verifyHCaptcha(
  secret: string,
  token: string,
  remoteIp: string,
): Promise<HCaptchaVerificationResult | null> {
  const formBody = new URLSearchParams({
    response: token,
    secret,
  });

  if (remoteIp) {
    formBody.set('remoteip', remoteIp);
  }

  const response = await fetch('https://api.hcaptcha.com/siteverify', {
    body: formBody.toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as HCaptchaVerificationResult;
}

export async function onRequestPost(context: PagesFunctionContext<AppEnv>) {
  const hcaptchaSecret = getEnvValue(
    context.env,
    'HCAPTCHA_SECRET',
    'HCAPTCHA_SECRET_KEY',
    'VITE_HCAPTCHA_SECRET',
  );
  if (!hcaptchaSecret) {
    return errorResponse(501, 'hCaptcha secret is not configured on the server.');
  }

  let requestBody: SignUpRequestBody;
  try {
    requestBody = (await context.request.json()) as SignUpRequestBody;
  } catch {
    return errorResponse(400, 'Request body must be valid JSON.');
  }

  const email = normalizeOptionalString(requestBody.email);
  const password = normalizeOptionalString(requestBody.password);
  const captchaToken = normalizeOptionalString(requestBody.captchaToken);
  const emailRedirectTo = normalizeOptionalString(requestBody.emailRedirectTo);
  const referredByUserId = normalizeOptionalString(requestBody.referredByUserId) || null;

  if (!email || !password) {
    return errorResponse(400, 'Email and password are required.');
  }

  if (!captchaToken) {
    return errorResponse(400, 'Complete the hCaptcha challenge before creating your account.');
  }

  const verification = await verifyHCaptcha(
    hcaptchaSecret,
    captchaToken,
    getRemoteIp(context.request),
  );
  if (!verification?.success) {
    return errorResponse(400, 'hCaptcha verification failed.', {
      errorCodes: verification?.['error-codes'] ?? [],
    });
  }

  const supabase = createSupabaseSignupClient(context.env);
  if (!supabase) {
    return errorResponse(501, 'Supabase signup configuration is missing on the server.');
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: referredByUserId
        ? {
            referred_by_user_id: referredByUserId,
          }
        : undefined,
      emailRedirectTo: emailRedirectTo || undefined,
    },
  });

  if (error) {
    return errorResponse(error.status ?? 400, error.message);
  }

  return jsonResponse(data);
}
