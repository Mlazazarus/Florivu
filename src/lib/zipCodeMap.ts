import { ZipCodeMapLocation, ZipCodeMapResponse } from '../types';

function isZipCodeMapLocation(value: unknown): value is ZipCodeMapLocation {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.zipCode === 'string' &&
    typeof candidate.latitude === 'number' &&
    Number.isFinite(candidate.latitude) &&
    typeof candidate.longitude === 'number' &&
    Number.isFinite(candidate.longitude) &&
    typeof candidate.label === 'string'
  );
}

export function normalizeZipCodeForMap(zipCode: string | null | undefined) {
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

export async function fetchZipCodeMapLocations(zipCodes: string[]) {
  const normalizedZipCodes = Array.from(
    new Set(
      zipCodes
        .map((zipCode) => normalizeZipCodeForMap(zipCode))
        .filter((zipCode): zipCode is string => Boolean(zipCode)),
    ),
  );

  if (normalizedZipCodes.length === 0) {
    return { locations: [], unresolvedZipCodes: [] };
  }

  const query = new URLSearchParams({ zipCodes: normalizedZipCodes.join(',') });
  const response = await fetch(`/api/zip-code-map?${query.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`ZIP code map lookup failed with ${response.status}: ${bodyText}`);
  }

  const payload = (await response.json()) as Partial<ZipCodeMapResponse>;
  const locations = Array.isArray(payload.locations)
    ? payload.locations.filter((location): location is ZipCodeMapLocation =>
        isZipCodeMapLocation(location),
      )
    : [];
  const unresolvedZipCodes = Array.isArray(payload.unresolvedZipCodes)
    ? payload.unresolvedZipCodes.filter(
        (zipCode): zipCode is string => typeof zipCode === 'string' && Boolean(zipCode.trim()),
      )
    : [];

  return { locations, unresolvedZipCodes };
}
