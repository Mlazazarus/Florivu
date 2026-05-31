import type { ZipCodeMapLocation } from '../../src/types';

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeZipCode(zipCode: string | null | undefined) {
  const trimmed = zipCode?.trim();
  if (!trimmed) {
    return null;
  }

  const usZipCodeMatch = trimmed.match(/^(\d{5})(?:-\d{4})?$/);
  if (usZipCodeMatch) {
    return usZipCodeMatch[1];
  }

  return trimmed;
}

async function fetchZipCodeLookup(url: URL) {
  const upstreamResponse = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Florivu/1.0 (Cloudflare ZIP code map lookup)',
    },
  });
  const responseText = await upstreamResponse.text();

  if (!upstreamResponse.ok) {
    throw new Error(`ZIP code lookup failed with ${upstreamResponse.status}: ${responseText}`);
  }

  return JSON.parse(responseText) as Array<{
    lat?: unknown;
    lon?: unknown;
    display_name?: unknown;
    address?: {
      city?: unknown;
      town?: unknown;
      village?: unknown;
      hamlet?: unknown;
      municipality?: unknown;
      county?: unknown;
      state?: unknown;
      postcode?: unknown;
      country_code?: unknown;
    };
  }>;
}

function toLocationRecord(
  zipCode: string,
  payload: Array<{
    lat?: unknown;
    lon?: unknown;
    display_name?: unknown;
    address?: {
      city?: unknown;
      town?: unknown;
      village?: unknown;
      hamlet?: unknown;
      municipality?: unknown;
      county?: unknown;
      state?: unknown;
      postcode?: unknown;
      country_code?: unknown;
    };
  }>,
): ZipCodeMapLocation | null {
  const firstResult = payload[0];
  if (!firstResult) {
    return null;
  }

  const latitude = Number(firstResult.lat);
  const longitude = Number(firstResult.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const city =
    normalizeOptionalString(firstResult.address?.city) ??
    normalizeOptionalString(firstResult.address?.town) ??
    normalizeOptionalString(firstResult.address?.village) ??
    normalizeOptionalString(firstResult.address?.hamlet) ??
    normalizeOptionalString(firstResult.address?.municipality) ??
    normalizeOptionalString(firstResult.address?.county);
  const state = normalizeOptionalString(firstResult.address?.state);
  const displayName = normalizeOptionalString(firstResult.display_name);

  return {
    zipCode,
    latitude,
    longitude,
    city,
    state,
    countryCode: normalizeOptionalString(firstResult.address?.country_code),
    label: city && state ? `${city}, ${state}` : displayName ?? `ZIP ${zipCode}`,
  };
}

async function lookupZipCode(zipCode: string) {
  const searchRequests: URL[] = [];
  const isUsZipCode = /^\d{5}$/.test(zipCode);

  if (isUsZipCode) {
    const postalLookupUrl = new URL('https://nominatim.openstreetmap.org/search');
    postalLookupUrl.searchParams.set('format', 'jsonv2');
    postalLookupUrl.searchParams.set('postalcode', zipCode);
    postalLookupUrl.searchParams.set('countrycodes', 'us,pr,vi,gu,mp,as');
    postalLookupUrl.searchParams.set('addressdetails', '1');
    postalLookupUrl.searchParams.set('limit', '1');
    searchRequests.push(postalLookupUrl);

    const textLookupUrl = new URL('https://nominatim.openstreetmap.org/search');
    textLookupUrl.searchParams.set('format', 'jsonv2');
    textLookupUrl.searchParams.set('q', `${zipCode}, United States`);
    textLookupUrl.searchParams.set('addressdetails', '1');
    textLookupUrl.searchParams.set('limit', '1');
    searchRequests.push(textLookupUrl);
  } else {
    const genericLookupUrl = new URL('https://nominatim.openstreetmap.org/search');
    genericLookupUrl.searchParams.set('format', 'jsonv2');
    genericLookupUrl.searchParams.set('q', zipCode);
    genericLookupUrl.searchParams.set('addressdetails', '1');
    genericLookupUrl.searchParams.set('limit', '1');
    searchRequests.push(genericLookupUrl);
  }

  for (const requestUrl of searchRequests) {
    const payload = await fetchZipCodeLookup(requestUrl);
    const location = toLocationRecord(zipCode, payload);
    if (location) {
      return location;
    }
  }

  return null;
}

export async function lookupZipCodeLocations(zipCodes: string[]) {
  const normalizedZipCodes = Array.from(
    new Set(
      zipCodes
        .map((zipCode) => normalizeZipCode(zipCode))
        .filter((zipCode): zipCode is string => Boolean(zipCode)),
    ),
  ).slice(0, 100);

  if (normalizedZipCodes.length === 0) {
    return { locations: [], unresolvedZipCodes: [] };
  }

  const locations: ZipCodeMapLocation[] = [];
  const unresolvedZipCodes: string[] = [];

  for (const zipCode of normalizedZipCodes) {
    try {
      const lookedUpLocation = await lookupZipCode(zipCode);
      if (!lookedUpLocation) {
        unresolvedZipCodes.push(zipCode);
        continue;
      }

      locations.push(lookedUpLocation);
    } catch {
      unresolvedZipCodes.push(zipCode);
    }
  }

  return { locations, unresolvedZipCodes };
}
