import { onRequestPost as handleDeleteAccount } from '../functions/api/account/delete';
import { onRequestPost as handleSignUp } from '../functions/api/auth/sign-up';
import { onRequestPost as handleSendCareAlertEmail } from '../functions/api/care-alerts/send-email';
import { onRequestPost as handlePlantIdentify } from '../functions/api/plantnet/identify';
import { onRequestGet as handleReverseGeocode } from '../functions/api/reverse-geocode';
import { onRequestGet as handleZipCodeMap } from '../functions/api/zip-code-map';
import {
  errorResponse,
  type AppEnv,
  type PagesFunctionContext,
} from '../functions/_shared/runtime';

interface AssetFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface WorkerEnv extends AppEnv {
  ASSETS: AssetFetcher;
}

type WorkerContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type RouteHandler = (
  context: PagesFunctionContext<WorkerEnv>,
) => Promise<Response> | Response;

const routeHandlers: Record<string, Partial<Record<string, RouteHandler>>> = {
  '/api/account/delete': {
    POST: handleDeleteAccount,
  },
  '/api/auth/sign-up': {
    POST: handleSignUp,
  },
  '/api/care-alerts/send-email': {
    POST: handleSendCareAlertEmail,
  },
  '/api/plantnet/identify': {
    POST: handlePlantIdentify,
  },
  '/api/reverse-geocode': {
    GET: handleReverseGeocode,
  },
  '/api/zip-code-map': {
    GET: handleZipCodeMap,
  },
};

function buildFunctionContext(
  request: Request,
  env: WorkerEnv,
  context: WorkerContext,
): PagesFunctionContext<WorkerEnv> {
  return {
    env,
    params: {},
    request,
    waitUntil: (promise) => context.waitUntil(promise),
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv, context: WorkerContext) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const route = routeHandlers[url.pathname];

    if (route) {
      const handler = route[method];
      if (!handler) {
        return errorResponse(405, `Method ${method} is not allowed for ${url.pathname}.`);
      }

      return handler(buildFunctionContext(request, env, context));
    }

    if (url.pathname.startsWith('/api/')) {
      return errorResponse(404, `Unknown API route: ${url.pathname}`);
    }

    return env.ASSETS.fetch(request);
  },
};
