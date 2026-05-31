import {
  errorResponse,
  jsonResponse,
  type AppEnv,
  type PagesFunctionContext,
} from '../_shared/runtime';
import { lookupZipCodeLocations } from '../_shared/zipCodeMap';

export async function onRequestGet({
  request,
}: PagesFunctionContext<AppEnv>) {
  try {
    const requestUrl = new URL(request.url);
    const zipCodes = (requestUrl.searchParams.get('zipCodes') ?? '').split(',');
    const payload = await lookupZipCodeLocations(zipCodes);
    return jsonResponse(payload);
  } catch (error) {
    return errorResponse(
      500,
      error instanceof Error ? error.message : 'Unexpected ZIP code map failure.',
    );
  }
}
