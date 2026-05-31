import {
  errorResponse,
  jsonResponse,
  type AppEnv,
  type PagesFunctionContext,
} from '../_shared/runtime';

export async function onRequestGet({
  request,
}: PagesFunctionContext<AppEnv>) {
  const requestUrl = new URL(request.url);
  const latitude = Number(requestUrl.searchParams.get('latitude'));
  const longitude = Number(requestUrl.searchParams.get('longitude'));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return errorResponse(400, 'latitude and longitude query parameters are required.');
  }

  try {
    const upstreamUrl = new URL('https://nominatim.openstreetmap.org/reverse');
    upstreamUrl.searchParams.set('format', 'jsonv2');
    upstreamUrl.searchParams.set('lat', latitude.toString());
    upstreamUrl.searchParams.set('lon', longitude.toString());
    upstreamUrl.searchParams.set('zoom', '18');
    upstreamUrl.searchParams.set('addressdetails', '1');

    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Florivu/1.0 (Cloudflare reverse geocoding)',
      },
    });
    const responseText = await upstreamResponse.text();

    if (!upstreamResponse.ok) {
      return errorResponse(502, 'Reverse geocoding failed.');
    }

    const payload = JSON.parse(responseText) as { address?: { postcode?: unknown } };
    const zipCode =
      typeof payload.address?.postcode === 'string' && payload.address.postcode.trim()
        ? payload.address.postcode.trim()
        : null;

    return jsonResponse({ zipCode });
  } catch (error) {
    return errorResponse(
      500,
      error instanceof Error ? error.message : 'Unexpected reverse geocoding failure.',
    );
  }
}
