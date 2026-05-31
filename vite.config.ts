import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createClient } from '@supabase/supabase-js';

interface LocalObservationRecord {
  id: string;
  user_id: string;
  photo_url: string;
  common_name: string;
  scientific_name: string;
  family: string;
  genus: string;
  species: string;
  confidence: number;
  date_found: string;
  zip_code?: string | null;
  notes?: string;
  is_favorite: boolean;
  is_house_plant: boolean;
  catalog_plant_id?: string | null;
  care_profile_id?: string | null;
  created_at: string;
}

interface LocalProfileRecord {
  user_id: string;
  display_name: string;
  profile_photo_url?: string | null;
  home_zip_code?: string | null;
  marketplace_zip_code?: string | null;
  facebook_url?: string | null;
  facebook_user_id?: string | null;
  facebook_name?: string | null;
  facebook_connected_at?: string | null;
  earned_achievement_ids?: string[] | null;
  referred_by_user_id?: string | null;
  selected_avatar_border_id?: string | null;
  selected_profile_title_id?: string | null;
  featured_house_plant_observation_id?: string | null;
  featured_non_house_plant_observation_id?: string | null;
  care_alerts_enabled?: boolean;
  care_alert_email?: string | null;
  care_alert_timezone?: string | null;
  care_alert_last_sent_at?: string | null;
  is_public: boolean;
  is_placeholder?: boolean;
  created_at: string;
  updated_at: string;
}

interface LocalCareTaskScheduleRecord {
  id: string;
  observation_id: string;
  user_id: string;
  task_key: 'water' | 'rotate' | 'feed' | 'refresh-soil';
  title: string;
  instructions: string;
  cadence_days: number;
  sort_order: number;
  source: 'bundled';
  last_completed_at?: string | null;
  next_due_at: string;
  created_at: string;
  updated_at: string;
}

interface LocalFriendProfileRecord extends LocalProfileRecord {
  observation_count: number;
  species_count: number;
}

interface LocalFriendshipRecord {
  user_id: string;
  friend_user_id: string;
  created_at: string;
}

interface ZipCodeMapLocationRecord {
  zipCode: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  state?: string | null;
  countryCode?: string | null;
  label: string;
  updated_at: string;
}

function plantNetProxyPlugin(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey =
    env.PLANTNET_API_KEY ??
    env.EXPO_PUBLIC_PLANTNET_API_KEY ??
    env.VITE_PLANTNET_API_KEY ??
    '';
  const baseUrl = 'https://my-api.plantnet.org/v2';
  const upstreamTimeoutMs = 120000;

  const sendPlantNetRequest = async (image: File, organ: string) => {
    const boundary = `----FlorivuBoundary${Date.now().toString(16)}`;
    const fileBuffer = Buffer.from(await image.arrayBuffer());
    const bodyParts = [
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="organs"\r\n\r\n${organ}\r\n`,
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="${image.name}"\r\n` +
          `Content-Type: ${image.type || 'application/octet-stream'}\r\n\r\n`,
      ),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ];
    const body = Buffer.concat(bodyParts);

    const path =
      `/v2/identify/all` +
      `?api-key=${encodeURIComponent(apiKey)}&nb-results=5&lang=en&include-related-images=false`;

    const startedAt = Date.now();
    return new Promise<{ status: number; bodyText: string }>((resolve, reject) => {
      const upstreamRequest = httpsRequest(
        {
          hostname: 'my-api.plantnet.org',
          method: 'POST',
          path,
          headers: {
            Accept: 'application/json',
            'Content-Length': String(body.length),
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
        },
        (upstreamResponse) => {
          const responseBuffers: Buffer[] = [];
          upstreamResponse.on('data', (chunk) => {
            responseBuffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          upstreamResponse.on('end', () => {
            resolve({
              status: upstreamResponse.statusCode ?? 502,
              bodyText: Buffer.concat(responseBuffers).toString('utf8'),
            });
          });
        },
      );

      upstreamRequest.on('error', reject);
      upstreamRequest.setTimeout(upstreamTimeoutMs, () => {
        upstreamRequest.destroy(
          new Error(
            `PlantNet upstream request timed out after ${Date.now() - startedAt}ms.`,
          ),
        );
      });
      upstreamRequest.write(body);
      upstreamRequest.end();
    });
  };

  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    if (req.method !== 'POST' || req.url !== '/api/plantnet/identify') {
      next();
      return;
    }

    res.setHeader('Content-Type', 'application/json');

    if (!apiKey) {
      console.error('[PlantNetProxy] Missing PLANTNET_API_KEY configuration.');
      res.statusCode = 500;
      res.end(JSON.stringify({ message: 'PLANTNET_API_KEY is not configured on the server.' }));
      return;
    }

    try {
      const request = new Request(`http://local${req.url}`, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: Readable.toWeb(req as never) as BodyInit,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' });

      const formData = await request.formData();
      const image = formData.get('image');
      const organ = String(formData.get('organ') ?? 'auto');

      if (!(image instanceof File)) {
        console.warn('[PlantNetProxy] Request missing image file.');
        res.statusCode = 400;
        res.end(JSON.stringify({ message: 'Missing image file upload.' }));
        return;
      }

      console.info('[PlantNetProxy] Forwarding identify request.', {
        fileName: image.name,
        fileType: image.type,
        fileSize: image.size,
        organ,
        timeoutMs: upstreamTimeoutMs,
      });

      const { status, bodyText } = await sendPlantNetRequest(image, organ);
      console.info('[PlantNetProxy] Upstream response received.', {
        status,
        bytes: bodyText.length,
      });

      res.statusCode = status;
      res.end(bodyText);
    } catch (error) {
      console.error('[PlantNetProxy] Proxy request failed.', error);
      res.statusCode = 504;
      res.end(
        JSON.stringify({
          message:
            error instanceof Error
              ? error.message
              : 'Unexpected proxy failure.',
        }),
      );
    }
  };

  return {
    name: 'plantnet-proxy',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

function reverseGeocodePlugin(): Plugin {
  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const requestUrl = new URL(req.url ?? '/', 'http://local');

    if (req.method !== 'GET' || requestUrl.pathname !== '/api/reverse-geocode') {
      next();
      return;
    }

    res.setHeader('Content-Type', 'application/json');

    const latitude = Number(requestUrl.searchParams.get('latitude'));
    const longitude = Number(requestUrl.searchParams.get('longitude'));

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      res.statusCode = 400;
      res.end(JSON.stringify({ message: 'latitude and longitude query parameters are required.' }));
      return;
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
          'User-Agent': 'Florivu/1.0 (local reverse geocoding)',
        },
      });
      const responseText = await upstreamResponse.text();

      if (!upstreamResponse.ok) {
        console.error('[ReverseGeocode] Upstream request failed.', {
          status: upstreamResponse.status,
          body: responseText,
        });
        res.statusCode = 502;
        res.end(JSON.stringify({ message: 'Reverse geocoding failed.' }));
        return;
      }

      const payload = JSON.parse(responseText) as { address?: { postcode?: unknown } };
      const zipCode =
        typeof payload.address?.postcode === 'string' && payload.address.postcode.trim()
          ? payload.address.postcode.trim()
          : null;

      console.info('[ReverseGeocode] Reverse geocoding complete.', {
        latitude,
        longitude,
        zipCode,
      });

      res.statusCode = 200;
      res.end(JSON.stringify({ zipCode }));
    } catch (error) {
      console.error('[ReverseGeocode] Request failed.', error);
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          message:
            error instanceof Error ? error.message : 'Unexpected reverse geocoding failure.',
        }),
      );
    }
  };

  return {
    name: 'reverse-geocode-proxy',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

function zipCodeMapPlugin(): Plugin {
  const cachePath = resolve(process.cwd(), '.local-data', 'zip-code-map-cache.json');

  function normalizeZipCode(zipCode: string | null) {
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

  function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  function isZipCodeMapLocationRecord(value: unknown): value is ZipCodeMapLocationRecord {
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
      typeof candidate.label === 'string' &&
      typeof candidate.updated_at === 'string'
    );
  }

  async function readCache() {
    try {
      const contents = await readFile(cachePath, 'utf8');
      const parsed = JSON.parse(contents);

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {} as Record<string, ZipCodeMapLocationRecord>;
      }

      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(([, value]) =>
          isZipCodeMapLocationRecord(value),
        ),
      ) as Record<string, ZipCodeMapLocationRecord>;
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return {} as Record<string, ZipCodeMapLocationRecord>;
      }

      throw error;
    }
  }

  async function writeCache(cache: Record<string, ZipCodeMapLocationRecord>) {
    await mkdir(resolve(process.cwd(), '.local-data'), { recursive: true });
    await writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  }

  async function fetchZipCodeLookup(url: URL) {
    const upstreamResponse = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Florivu/1.0 (local ZIP code map lookup)',
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
  ) {
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
      updated_at: new Date().toISOString(),
    } satisfies ZipCodeMapLocationRecord;
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

  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const requestUrl = new URL(req.url ?? '/', 'http://local');

    if (req.method !== 'GET' || requestUrl.pathname !== '/api/zip-code-map') {
      next();
      return;
    }

    res.setHeader('Content-Type', 'application/json');

    try {
      const zipCodes = Array.from(
        new Set(
          (requestUrl.searchParams.get('zipCodes') ?? '')
            .split(',')
            .map((zipCode) => normalizeZipCode(zipCode))
            .filter((zipCode): zipCode is string => Boolean(zipCode)),
        ),
      ).slice(0, 100);

      if (zipCodes.length === 0) {
        res.statusCode = 200;
        res.end(JSON.stringify({ locations: [], unresolvedZipCodes: [] }));
        return;
      }

      const cache = await readCache();
      const locations: ZipCodeMapLocationRecord[] = [];
      const unresolvedZipCodes: string[] = [];
      let cacheChanged = false;

      for (const zipCode of zipCodes) {
        const cachedLocation = cache[zipCode];
        if (cachedLocation) {
          locations.push(cachedLocation);
          continue;
        }

        try {
          const lookedUpLocation = await lookupZipCode(zipCode);
          if (!lookedUpLocation) {
            unresolvedZipCodes.push(zipCode);
            continue;
          }

          cache[zipCode] = lookedUpLocation;
          locations.push(lookedUpLocation);
          cacheChanged = true;
        } catch (lookupError) {
          console.warn('[ZipCodeMap] ZIP lookup failed.', {
            zipCode,
            message: lookupError instanceof Error ? lookupError.message : String(lookupError),
          });
          unresolvedZipCodes.push(zipCode);
        }
      }

      if (cacheChanged) {
        await writeCache(cache);
      }

      console.info('[ZipCodeMap] ZIP code map lookup complete.', {
        requested: zipCodes.length,
        resolved: locations.length,
        unresolved: unresolvedZipCodes.length,
      });

      res.statusCode = 200;
      res.end(JSON.stringify({ locations, unresolvedZipCodes }));
    } catch (error) {
      console.error('[ZipCodeMap] Request failed.', error);
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          message: error instanceof Error ? error.message : 'Unexpected ZIP code map failure.',
        }),
      );
    }
  };

  return {
    name: 'zip-code-map',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

function localObservationStorePlugin(): Plugin {
  const storePath = resolve(process.cwd(), '.local-data', 'observations.json');
  const careTaskStorePath = resolve(process.cwd(), '.local-data', 'care-task-schedules.json');

  function normalizeObservationRecord(observation: LocalObservationRecord): LocalObservationRecord {
    return {
      ...observation,
      zip_code: observation.zip_code ?? null,
      is_favorite: Boolean(observation.is_favorite),
      is_house_plant: Boolean(observation.is_house_plant),
      catalog_plant_id: observation.catalog_plant_id ?? null,
      care_profile_id: observation.care_profile_id ?? null,
    };
  }

  async function readObservations() {
    try {
      const contents = await readFile(storePath, 'utf8');
      const parsed = JSON.parse(contents);
      return Array.isArray(parsed)
        ? (parsed as LocalObservationRecord[]).map((observation) => normalizeObservationRecord(observation))
        : [];
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  async function writeObservations(observations: LocalObservationRecord[]) {
    await mkdir(resolve(process.cwd(), '.local-data'), { recursive: true });
    await writeFile(storePath, JSON.stringify(observations, null, 2), 'utf8');
  }

  async function readCareTasks() {
    try {
      const contents = await readFile(careTaskStorePath, 'utf8');
      const parsed = JSON.parse(contents);
      return Array.isArray(parsed) ? (parsed as LocalCareTaskScheduleRecord[]) : [];
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  async function writeCareTasks(tasks: LocalCareTaskScheduleRecord[]) {
    await mkdir(resolve(process.cwd(), '.local-data'), { recursive: true });
    await writeFile(careTaskStorePath, JSON.stringify(tasks, null, 2), 'utf8');
  }

  async function readJsonBody(req: IncomingMessage) {
    const request = new Request(`http://local${req.url ?? '/'}`, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: Readable.toWeb(req as never) as BodyInit,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    return (await request.json()) as Record<string, unknown>;
  }

  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const requestUrl = new URL(req.url ?? '/', 'http://local');

    if (!requestUrl.pathname.startsWith('/api/local-observations')) {
      next();
      return;
    }

    res.setHeader('Content-Type', 'application/json');

    try {
      if (req.method === 'GET' && requestUrl.pathname === '/api/local-observations') {
        const userId = requestUrl.searchParams.get('userId');
        const observations = await readObservations();
        const filteredObservations = userId
          ? observations.filter((observation) => observation.user_id === userId)
          : observations;

        console.info('[LocalObservationStore] Returning observations.', {
          requestedUserId: userId,
          count: filteredObservations.length,
        });
        res.statusCode = 200;
        res.end(JSON.stringify(filteredObservations));
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/local-observations') {
        const observation = await readJsonBody(req) as Omit<LocalObservationRecord, 'id' | 'created_at'>;
        const storedObservation = normalizeObservationRecord({
          ...observation,
          id: randomUUID(),
          created_at: new Date().toISOString(),
        });
        const observations = await readObservations();
        observations.unshift(storedObservation);
        await writeObservations(observations);

        console.info('[LocalObservationStore] Stored observation.', {
          id: storedObservation.id,
          userId: storedObservation.user_id,
          species: storedObservation.species,
        });
        res.statusCode = 201;
        res.end(JSON.stringify(storedObservation));
        return;
      }

      if (req.method === 'PATCH' && requestUrl.pathname.startsWith('/api/local-observations/')) {
        const id = decodeURIComponent(
          requestUrl.pathname.slice('/api/local-observations/'.length),
        );
        const userId = requestUrl.searchParams.get('userId');
        const body = await readJsonBody(req) as {
          zip_code?: unknown;
          is_favorite?: unknown;
          is_house_plant?: unknown;
        };
        const hasZipCode = Object.prototype.hasOwnProperty.call(body, 'zip_code');
        const hasFavorite = Object.prototype.hasOwnProperty.call(body, 'is_favorite');
        const hasHousePlant = Object.prototype.hasOwnProperty.call(body, 'is_house_plant');

        if (!userId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'userId query parameter is required.' }));
          return;
        }

        if (!hasZipCode && !hasFavorite && !hasHousePlant) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'At least one editable observation field is required.' }));
          return;
        }

        if (hasZipCode && typeof body.zip_code !== 'string' && body.zip_code !== null) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'zip_code must be a string or null.' }));
          return;
        }

        if (hasFavorite && typeof body.is_favorite !== 'boolean') {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'is_favorite must be a boolean.' }));
          return;
        }

        if (hasHousePlant && typeof body.is_house_plant !== 'boolean') {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'is_house_plant must be a boolean.' }));
          return;
        }

        const observations = await readObservations();
        const nextObservations = observations.map((observation) => {
          if (observation.id !== id || observation.user_id !== userId) {
            return observation;
          }

          const nextZipCode = hasZipCode
            ? typeof body.zip_code === 'string'
              ? body.zip_code.trim() || null
              : null
            : observation.zip_code ?? null;
          const nextFavorite = hasFavorite ? body.is_favorite as boolean : observation.is_favorite;
          const nextHousePlant = hasHousePlant
            ? body.is_house_plant as boolean
            : observation.is_house_plant;

          return {
            ...observation,
            zip_code: nextZipCode,
            is_favorite: nextFavorite,
            is_house_plant: nextHousePlant,
          };
        });

        const finalUpdatedObservation = nextObservations.find(
          (observation) => observation.id === id && observation.user_id === userId,
        );

        if (!finalUpdatedObservation) {
          res.statusCode = 404;
          res.end(JSON.stringify({ message: 'Observation not found.' }));
          return;
        }

        await writeObservations(nextObservations);
        console.info('[LocalObservationStore] Updated observation.', {
          id,
          userId,
          zipCode: finalUpdatedObservation.zip_code ?? null,
          isFavorite: finalUpdatedObservation.is_favorite,
          isHousePlant: finalUpdatedObservation.is_house_plant,
        });
        res.statusCode = 200;
        res.end(JSON.stringify(finalUpdatedObservation));
        return;
      }

      if (req.method === 'DELETE' && requestUrl.pathname.startsWith('/api/local-observations/')) {
        const id = decodeURIComponent(
          requestUrl.pathname.slice('/api/local-observations/'.length),
        );
        const userId = requestUrl.searchParams.get('userId');
        const observations = await readObservations();
        const careTasks = await readCareTasks();
        const nextObservations = observations.filter(
          (observation) => !(observation.id === id && (!userId || observation.user_id === userId)),
        );

        if (nextObservations.length === observations.length) {
          res.statusCode = 404;
          res.end(JSON.stringify({ message: 'Observation not found.' }));
          return;
        }

        await writeObservations(nextObservations);
        await writeCareTasks(
          careTasks.filter(
            (task) => !(task.observation_id === id && (!userId || task.user_id === userId)),
          ),
        );
        console.info('[LocalObservationStore] Deleted observation.', { id, userId });
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
    } catch (error) {
      console.error('[LocalObservationStore] Request failed.', error);
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          message: error instanceof Error ? error.message : 'Unexpected local store error.',
        }),
      );
    }
  };

  return {
    name: 'local-observation-store',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

function localProfileStorePlugin(): Plugin {
  const storePath = resolve(process.cwd(), '.local-data', 'profiles.json');
  const friendshipStorePath = resolve(process.cwd(), '.local-data', 'friendships.json');

  async function readProfiles() {
    try {
      const contents = await readFile(storePath, 'utf8');
      const parsed = JSON.parse(contents);
      return Array.isArray(parsed) ? (parsed as LocalProfileRecord[]) : [];
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  async function writeProfiles(profiles: LocalProfileRecord[]) {
    await mkdir(resolve(process.cwd(), '.local-data'), { recursive: true });
    await writeFile(storePath, JSON.stringify(profiles, null, 2), 'utf8');
  }

  async function readFriendships() {
    try {
      const contents = await readFile(friendshipStorePath, 'utf8');
      const parsed = JSON.parse(contents);
      return Array.isArray(parsed) ? (parsed as LocalFriendshipRecord[]) : [];
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  async function writeFriendships(friendships: LocalFriendshipRecord[]) {
    await mkdir(resolve(process.cwd(), '.local-data'), { recursive: true });
    await writeFile(friendshipStorePath, JSON.stringify(friendships, null, 2), 'utf8');
  }

  async function readJsonBody(req: IncomingMessage) {
    const request = new Request(`http://local${req.url ?? '/'}`, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: Readable.toWeb(req as never) as BodyInit,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    return (await request.json()) as Omit<LocalProfileRecord, 'updated_at'> & {
      created_at?: string;
    };
  }

  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const requestUrl = new URL(req.url ?? '/', 'http://local');

    if (!requestUrl.pathname.startsWith('/api/local-profile')) {
      next();
      return;
    }

    res.setHeader('Content-Type', 'application/json');

    try {
      if (req.method === 'GET' && requestUrl.pathname === '/api/local-profile') {
        const userId = requestUrl.searchParams.get('userId');
        if (!userId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'userId query parameter is required.' }));
          return;
        }

        const profiles = await readProfiles();
        const profile = profiles.find((entry) => entry.user_id === userId) ?? null;
        console.info('[LocalProfileStore] Returning profile.', {
          userId,
          found: Boolean(profile),
        });
        res.statusCode = 200;
        res.end(JSON.stringify(profile));
        return;
      }

      if (req.method === 'PUT' && requestUrl.pathname === '/api/local-profile') {
        const profile = await readJsonBody(req);
        const profiles = await readProfiles();
        const normalizedDisplayName = profile.display_name.trim();

        if (!normalizedDisplayName) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'display_name is required.' }));
          return;
        }

        const duplicateProfile = profiles.find(
          (entry) =>
            entry.user_id !== profile.user_id &&
            entry.display_name.trim().toLowerCase() === normalizedDisplayName.toLowerCase(),
        );

        if (duplicateProfile) {
          res.statusCode = 409;
          res.end(JSON.stringify({ message: 'Display name is already in use.' }));
          return;
        }

        const now = new Date().toISOString();
        const existingProfile = profiles.find((entry) => entry.user_id === profile.user_id);
        const storedProfile: LocalProfileRecord = {
          ...existingProfile,
          ...profile,
          display_name: normalizedDisplayName,
          care_alerts_enabled: profile.care_alerts_enabled ?? existingProfile?.care_alerts_enabled ?? false,
          care_alert_email:
            profile.care_alert_email ??
            existingProfile?.care_alert_email ??
            null,
          care_alert_timezone:
            profile.care_alert_timezone ??
            existingProfile?.care_alert_timezone ??
            'UTC',
          care_alert_last_sent_at:
            profile.care_alert_last_sent_at ??
            existingProfile?.care_alert_last_sent_at ??
            null,
          created_at: existingProfile?.created_at ?? profile.created_at ?? now,
          updated_at: now,
        };
        const nextProfiles = profiles.filter((entry) => entry.user_id !== profile.user_id);
        nextProfiles.unshift(storedProfile);
        await writeProfiles(nextProfiles);

        if (
          storedProfile.referred_by_user_id &&
          storedProfile.referred_by_user_id !== storedProfile.user_id
        ) {
          const friendships = await readFriendships();
          const hasInviteEdge = friendships.some(
            (entry) =>
              entry.user_id === storedProfile.referred_by_user_id &&
              entry.friend_user_id === storedProfile.user_id,
          );

          if (!hasInviteEdge) {
            friendships.push({
              user_id: storedProfile.referred_by_user_id,
              friend_user_id: storedProfile.user_id,
              created_at: now,
            });
            await writeFriendships(friendships);
          }
        }

        console.info('[LocalProfileStore] Stored profile.', {
          userId: storedProfile.user_id,
          displayName: storedProfile.display_name,
          hasProfilePhoto: Boolean(storedProfile.profile_photo_url),
          homeZipCode: storedProfile.home_zip_code ?? null,
          selectedAvatarBorderId: storedProfile.selected_avatar_border_id ?? null,
          selectedProfileTitleId: storedProfile.selected_profile_title_id ?? null,
        });
        res.statusCode = 200;
        res.end(JSON.stringify(storedProfile));
        return;
      }

      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
    } catch (error) {
      console.error('[LocalProfileStore] Request failed.', error);
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          message: error instanceof Error ? error.message : 'Unexpected local profile store error.',
        }),
      );
    }
  };

  return {
    name: 'local-profile-store',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

function localCareTaskStorePlugin(): Plugin {
  const storePath = resolve(process.cwd(), '.local-data', 'care-task-schedules.json');

  function normalizeTaskRecord(task: LocalCareTaskScheduleRecord): LocalCareTaskScheduleRecord {
    return {
      ...task,
      sort_order: Number.isFinite(task.sort_order) ? task.sort_order : 0,
      source: 'bundled',
      last_completed_at: task.last_completed_at ?? null,
    };
  }

  async function readTasks() {
    try {
      const contents = await readFile(storePath, 'utf8');
      const parsed = JSON.parse(contents);
      return Array.isArray(parsed)
        ? (parsed as LocalCareTaskScheduleRecord[]).map((task) => normalizeTaskRecord(task))
        : [];
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  async function writeTasks(tasks: LocalCareTaskScheduleRecord[]) {
    await mkdir(resolve(process.cwd(), '.local-data'), { recursive: true });
    await writeFile(storePath, JSON.stringify(tasks, null, 2), 'utf8');
  }

  async function readJsonBody(req: IncomingMessage) {
    const request = new Request(`http://local${req.url ?? '/'}`, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: Readable.toWeb(req as never) as BodyInit,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    return (await request.json()) as unknown;
  }

  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const requestUrl = new URL(req.url ?? '/', 'http://local');

    if (!requestUrl.pathname.startsWith('/api/local-care-tasks')) {
      next();
      return;
    }

    res.setHeader('Content-Type', 'application/json');

    try {
      if (req.method === 'GET' && requestUrl.pathname === '/api/local-care-tasks') {
        const userId = requestUrl.searchParams.get('userId');
        if (!userId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'userId query parameter is required.' }));
          return;
        }

        const tasks = (await readTasks())
          .filter((task) => task.user_id === userId)
          .sort((left, right) => {
            const dueDelta =
              new Date(left.next_due_at).getTime() - new Date(right.next_due_at).getTime();
            if (dueDelta !== 0) {
              return dueDelta;
            }

            return left.sort_order - right.sort_order;
          });

        res.statusCode = 200;
        res.end(JSON.stringify(tasks));
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/local-care-tasks') {
        const body = await readJsonBody(req);
        const inputTasks = Array.isArray(body) ? body : [];

        if (inputTasks.length === 0) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'An array of care tasks is required.' }));
          return;
        }

        const now = new Date().toISOString();
        const tasks = await readTasks();
        const storedTasks = inputTasks.map((task) => {
          const record = task as Omit<
            LocalCareTaskScheduleRecord,
            'id' | 'created_at' | 'updated_at'
          >;

          return normalizeTaskRecord({
            ...record,
            id: randomUUID(),
            created_at: now,
            updated_at: now,
          });
        });

        tasks.unshift(...storedTasks);
        await writeTasks(tasks);
        res.statusCode = 201;
        res.end(JSON.stringify(storedTasks));
        return;
      }

      if (req.method === 'PATCH' && requestUrl.pathname.startsWith('/api/local-care-tasks/')) {
        const id = decodeURIComponent(requestUrl.pathname.slice('/api/local-care-tasks/'.length));
        const userId = requestUrl.searchParams.get('userId');
        const body = (await readJsonBody(req)) as Record<string, unknown>;

        if (!userId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'userId query parameter is required.' }));
          return;
        }

        const tasks = await readTasks();
        let updatedTask: LocalCareTaskScheduleRecord | null = null;
        const nextTasks = tasks.map((task) => {
          if (task.id !== id || task.user_id !== userId) {
            return task;
          }

          updatedTask = normalizeTaskRecord({
            ...task,
            title: typeof body.title === 'string' ? body.title.trim() || task.title : task.title,
            instructions:
              typeof body.instructions === 'string'
                ? body.instructions.trim() || task.instructions
                : task.instructions,
            cadence_days:
              typeof body.cadence_days === 'number' && Number.isFinite(body.cadence_days)
                ? Math.max(1, Math.round(body.cadence_days))
                : task.cadence_days,
            sort_order:
              typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
                ? Math.round(body.sort_order)
                : task.sort_order,
            last_completed_at:
              typeof body.last_completed_at === 'string' || body.last_completed_at === null
                ? (body.last_completed_at as string | null)
                : task.last_completed_at ?? null,
            next_due_at:
              typeof body.next_due_at === 'string' ? body.next_due_at : task.next_due_at,
            updated_at: new Date().toISOString(),
          });
          return updatedTask;
        });

        if (!updatedTask) {
          res.statusCode = 404;
          res.end(JSON.stringify({ message: 'Care task not found.' }));
          return;
        }

        await writeTasks(nextTasks);
        res.statusCode = 200;
        res.end(JSON.stringify(updatedTask));
        return;
      }

      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
    } catch (error) {
      console.error('[LocalCareTaskStore] Request failed.', error);
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          message:
            error instanceof Error ? error.message : 'Unexpected local care task store error.',
        }),
      );
    }
  };

  return {
    name: 'local-care-task-store',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

function careAlertEmailPlugin(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '');
  const resendApiKey = env.RESEND_API_KEY ?? '';
  const fromEmail = env.CARE_ALERT_FROM_EMAIL ?? '';
  const publicAppUrl = env.VITE_PUBLIC_APP_URL ?? env.CARE_ALERT_APP_URL ?? '';

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDueDate(iso: string, timeZone: string) {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone || 'UTC',
        dateStyle: 'medium',
      }).format(new Date(iso));
    } catch {
      return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(iso));
    }
  }

  function buildPlainTextEmail(input: {
    displayName: string;
    email: string;
    timeZone: string;
    tasks: Array<{
      observationName: string;
      scientificName: string;
      taskTitle: string;
      instructions: string;
      cadenceDays: number;
      nextDueAt: string;
    }>;
  }) {
    const greetingName = input.displayName.trim() || input.email.trim();
    const lines = [
      `Hi ${greetingName},`,
      '',
      'These Florivu care reminders are ready:',
      '',
      ...input.tasks.flatMap((task, index) => [
        `${index + 1}. ${task.observationName} - ${task.taskTitle}`,
        `   Due: ${formatDueDate(task.nextDueAt, input.timeZone)}`,
        `   Repeat every ${task.cadenceDays} day${task.cadenceDays === 1 ? '' : 's'}`,
        `   ${task.instructions}`,
        task.scientificName ? `   ${task.scientificName}` : '',
        '',
      ]),
      publicAppUrl ? `Open Florivu: ${publicAppUrl}` : '',
      'When you finish one of these steps in Florivu, the next reminder date will roll forward automatically.',
    ];

    return lines.filter(Boolean).join('\n');
  }

  function buildHtmlEmail(input: {
    displayName: string;
    email: string;
    timeZone: string;
    tasks: Array<{
      observationName: string;
      scientificName: string;
      taskTitle: string;
      instructions: string;
      cadenceDays: number;
      nextDueAt: string;
    }>;
  }) {
    const greetingName = escapeHtml(input.displayName.trim() || input.email.trim());
    const taskItems = input.tasks
      .map((task) => {
        const scientificName = task.scientificName
          ? `<div style="color:#617364;font-size:13px;">${escapeHtml(task.scientificName)}</div>`
          : '';
        return `
          <li style="margin:0 0 16px;padding:16px;border:1px solid #d9e4d9;border-radius:14px;background:#fbfdf9;">
            <div style="font-size:16px;font-weight:700;color:#1f3528;">${escapeHtml(task.observationName)} · ${escapeHtml(task.taskTitle)}</div>
            ${scientificName}
            <div style="margin-top:8px;color:#395742;font-size:14px;">Due ${escapeHtml(formatDueDate(task.nextDueAt, input.timeZone))} · every ${task.cadenceDays} day${task.cadenceDays === 1 ? '' : 's'}</div>
            <p style="margin:10px 0 0;color:#4f6356;font-size:14px;line-height:1.55;">${escapeHtml(task.instructions)}</p>
          </li>
        `;
      })
      .join('');
    const openAppLink = publicAppUrl
      ? `<p style="margin-top:20px;"><a href="${escapeHtml(publicAppUrl)}" style="display:inline-block;padding:12px 16px;border-radius:999px;background:#2c6a4a;color:#ffffff;text-decoration:none;font-weight:700;">Open Florivu</a></p>`
      : '';

    return `
      <div style="font-family:Georgia,serif;background:#f4f7f1;padding:24px;color:#203529;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;padding:28px;border:1px solid #dbe6dc;">
          <p style="margin:0 0 8px;color:#5f7666;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">Florivu care alerts</p>
          <h1 style="margin:0 0 16px;font-size:28px;">Hi ${greetingName}</h1>
          <p style="margin:0 0 20px;color:#4d6355;line-height:1.6;">These plant care reminders are ready. Mark a task complete in Florivu after you finish it and the next reminder date will roll forward automatically.</p>
          <ol style="margin:0;padding:0;list-style:none;">${taskItems}</ol>
          ${openAppLink}
        </div>
      </div>
    `;
  }

  async function sendWithResend(input: {
    email: string;
    displayName: string;
    timeZone: string;
    tasks: Array<{
      observationName: string;
      scientificName: string;
      taskTitle: string;
      instructions: string;
      cadenceDays: number;
      nextDueAt: string;
    }>;
  }) {
    const todayLabel = formatDueDate(new Date().toISOString(), input.timeZone);
    const subject = `Florivu care reminders for ${todayLabel}`;
    const text = buildPlainTextEmail(input);
    const html = buildHtmlEmail(input);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [input.email],
        subject,
        text,
        html,
      }),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Resend email failed with ${response.status}: ${bodyText}`);
    }

    return {
      subject,
      previewText: text,
      responseBody: bodyText,
    };
  }

  async function readJsonBody(req: IncomingMessage) {
    const request = new Request(`http://local${req.url ?? '/'}`, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: Readable.toWeb(req as never) as BodyInit,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    return (await request.json()) as {
      email?: unknown;
      displayName?: unknown;
      timeZone?: unknown;
      tasks?: unknown;
    };
  }

  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const requestUrl = new URL(req.url ?? '/', 'http://local');

    if (req.method !== 'POST' || requestUrl.pathname !== '/api/care-alerts/send-email') {
      next();
      return;
    }

    res.setHeader('Content-Type', 'application/json');

    try {
      const body = await readJsonBody(req);
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      const timeZone = typeof body.timeZone === 'string' ? body.timeZone.trim() || 'UTC' : 'UTC';
      const tasks = Array.isArray(body.tasks)
        ? body.tasks.filter(
            (task): task is {
              observationName: string;
              scientificName: string;
              taskTitle: string;
              instructions: string;
              cadenceDays: number;
              nextDueAt: string;
            } =>
              Boolean(task) &&
              typeof (task as Record<string, unknown>).observationName === 'string' &&
              typeof (task as Record<string, unknown>).taskTitle === 'string' &&
              typeof (task as Record<string, unknown>).instructions === 'string' &&
              typeof (task as Record<string, unknown>).cadenceDays === 'number' &&
              typeof (task as Record<string, unknown>).nextDueAt === 'string',
          )
        : [];

      if (!email || tasks.length === 0) {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: 'email and at least one care task are required.' }));
        return;
      }

      const previewText = buildPlainTextEmail({
        email,
        displayName,
        timeZone,
        tasks,
      });

      if (!resendApiKey || !fromEmail) {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            configured: false,
            sent: false,
            message:
              'Care alert email provider is not configured. Set RESEND_API_KEY and CARE_ALERT_FROM_EMAIL to enable delivery.',
            previewText,
          }),
        );
        return;
      }

      await sendWithResend({
        email,
        displayName,
        timeZone,
        tasks,
      });

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          configured: true,
          sent: true,
          message: `Care reminder email sent to ${email}.`,
          previewText,
        }),
      );
    } catch (error) {
      console.error('[CareAlertEmail] Request failed.', error);
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          message:
            error instanceof Error ? error.message : 'Unexpected care alert email failure.',
        }),
      );
    }
  };

  return {
    name: 'care-alert-email',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

function localFriendsStorePlugin(): Plugin {
  const friendshipStorePath = resolve(process.cwd(), '.local-data', 'friendships.json');
  const profileStorePath = resolve(process.cwd(), '.local-data', 'profiles.json');
  const observationStorePath = resolve(process.cwd(), '.local-data', 'observations.json');

  function rankProfilesByDisplayName(
    profiles: LocalProfileRecord[],
    userId: string,
    query: string,
  ) {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    return profiles
      .filter((profile) => {
        if (profile.user_id === userId) {
          return false;
        }

        return profile.display_name.trim().toLowerCase().includes(normalizedQuery);
      })
      .sort((left, right) => {
        const leftName = left.display_name.trim().toLowerCase();
        const rightName = right.display_name.trim().toLowerCase();
        const leftIndex = leftName.indexOf(normalizedQuery);
        const rightIndex = rightName.indexOf(normalizedQuery);
        const leftPrefixRank = leftIndex === 0 ? 0 : 1;
        const rightPrefixRank = rightIndex === 0 ? 0 : 1;
        const leftLengthDelta = Math.abs(leftName.length - normalizedQuery.length);
        const rightLengthDelta = Math.abs(rightName.length - normalizedQuery.length);

        return (
          leftPrefixRank - rightPrefixRank ||
          leftIndex - rightIndex ||
          leftLengthDelta - rightLengthDelta ||
          left.display_name.localeCompare(right.display_name, undefined, {
            sensitivity: 'base',
          })
        );
      })
      .slice(0, 5);
  }

  function sortProfilesAlphabetically(profiles: LocalProfileRecord[]) {
    return [...profiles].sort((left, right) =>
      left.display_name.localeCompare(right.display_name, undefined, { sensitivity: 'base' }),
    );
  }

  function sortFriendsByStats(profiles: LocalFriendProfileRecord[]) {
    return [...profiles].sort((left, right) => {
      const speciesDelta = right.species_count - left.species_count;
      if (speciesDelta !== 0) {
        return speciesDelta;
      }

      const observationDelta = right.observation_count - left.observation_count;
      if (observationDelta !== 0) {
        return observationDelta;
      }

      return left.display_name.localeCompare(right.display_name, undefined, {
        sensitivity: 'base',
      });
    });
  }

  function buildFallbackProfile(userId: string): LocalProfileRecord {
    const now = new Date().toISOString();

    return {
      user_id: userId,
      display_name: `Friend ${userId.slice(0, 8)}`,
      profile_photo_url: null,
      home_zip_code: null,
      marketplace_zip_code: null,
      facebook_url: null,
      facebook_user_id: null,
      facebook_name: null,
      facebook_connected_at: null,
      earned_achievement_ids: [],
      referred_by_user_id: null,
      selected_avatar_border_id: null,
      selected_profile_title_id: null,
      featured_house_plant_observation_id: null,
      featured_non_house_plant_observation_id: null,
      care_alerts_enabled: false,
      care_alert_email: null,
      care_alert_timezone: 'UTC',
      care_alert_last_sent_at: null,
      is_public: false,
      is_placeholder: true,
      created_at: now,
      updated_at: now,
    };
  }

  async function loadLocalFriendLists(userId: string) {
    const [friendships, profiles, observations] = await Promise.all([
      readLocalArray<LocalFriendshipRecord>(friendshipStorePath),
      readLocalArray<LocalProfileRecord>(profileStorePath),
      readLocalArray<LocalObservationRecord>(observationStorePath),
    ]);

    const outgoingIds = new Set(
      friendships
        .filter((friendship) => friendship.user_id === userId)
        .map((friendship) => friendship.friend_user_id),
    );
    const incomingIds = Array.from(
      new Set(
        friendships
          .filter((friendship) => friendship.friend_user_id === userId)
          .map((friendship) => friendship.user_id),
      ),
    );
    const mutualIds = incomingIds.filter((friendId) => outgoingIds.has(friendId));
    const incomingRequestIds = incomingIds.filter((friendId) => !outgoingIds.has(friendId));

    const profileMap = new Map(profiles.map((profile) => [profile.user_id, profile]));
    const observationStats = new Map<
      string,
      { observationCount: number; speciesKeys: Set<string> }
    >();

    for (const observation of observations) {
      const entry = observationStats.get(observation.user_id) ?? {
        observationCount: 0,
        speciesKeys: new Set<string>(),
      };
      entry.observationCount += 1;
      const speciesKey = (observation.species?.trim() || observation.scientific_name.trim())
        .toLowerCase();
      if (speciesKey) {
        entry.speciesKeys.add(speciesKey);
      }
      observationStats.set(observation.user_id, entry);
    }

    const toProfile = (friendId: string) => profileMap.get(friendId) ?? buildFallbackProfile(friendId);
    const toFriendProfile = (friendId: string): LocalFriendProfileRecord => {
      const profile = toProfile(friendId);
      const stats = observationStats.get(friendId);

      return {
        ...profile,
        observation_count: stats?.observationCount ?? 0,
        species_count: stats?.speciesKeys.size ?? 0,
      };
    };

    return {
      mutualFriends: sortFriendsByStats(mutualIds.map(toFriendProfile)),
      incomingRequests: sortProfilesAlphabetically(incomingRequestIds.map(toProfile)),
      completedReferralCount: profiles.filter(
        (profile) =>
          profile.referred_by_user_id === userId && mutualIds.includes(profile.user_id),
      ).length,
    };
  }

  async function readLocalArray<T>(filePath: string): Promise<T[]> {
    try {
      const contents = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(contents);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  async function writeLocalArray<T>(filePath: string, records: T[]) {
    await mkdir(resolve(process.cwd(), '.local-data'), { recursive: true });
    await writeFile(filePath, JSON.stringify(records, null, 2), 'utf8');
  }

  async function readJsonBody(req: IncomingMessage) {
    const request = new Request(`http://local${req.url ?? '/'}`, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: Readable.toWeb(req as never) as BodyInit,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    return (await request.json()) as {
      userId?: unknown;
      displayName?: unknown;
      friendUserId?: unknown;
    };
  }

  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const requestUrl = new URL(req.url ?? '/', 'http://local');

    if (!requestUrl.pathname.startsWith('/api/local-friends')) {
      next();
      return;
    }

    res.setHeader('Content-Type', 'application/json');

    try {
      if (req.method === 'GET' && requestUrl.pathname === '/api/local-friends/search') {
        const userId = requestUrl.searchParams.get('userId');
        const query = requestUrl.searchParams.get('query')?.trim() ?? '';

        if (!userId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'userId query parameter is required.' }));
          return;
        }

        const profiles = await readLocalArray<LocalProfileRecord>(profileStorePath);
        const matches = rankProfilesByDisplayName(profiles, userId, query);

        console.info('[LocalFriendsStore] Returning search matches.', {
          userId,
          query,
          count: matches.length,
        });
        res.statusCode = 200;
        res.end(JSON.stringify(matches));
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/local-friends') {
        const userId = requestUrl.searchParams.get('userId');
        if (!userId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'userId query parameter is required.' }));
          return;
        }

        const { mutualFriends } = await loadLocalFriendLists(userId);

        console.info('[LocalFriendsStore] Returning mutual friends.', {
          userId,
          count: mutualFriends.length,
        });
        res.statusCode = 200;
        res.end(JSON.stringify(mutualFriends));
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/local-friends/incoming') {
        const userId = requestUrl.searchParams.get('userId');
        if (!userId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'userId query parameter is required.' }));
          return;
        }

        const { incomingRequests } = await loadLocalFriendLists(userId);

        console.info('[LocalFriendsStore] Returning incoming friend requests.', {
          userId,
          count: incomingRequests.length,
        });
        res.statusCode = 200;
        res.end(JSON.stringify(incomingRequests));
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/local-friends/referrals/count') {
        const userId = requestUrl.searchParams.get('userId');
        if (!userId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'userId query parameter is required.' }));
          return;
        }

        const { completedReferralCount } = await loadLocalFriendLists(userId);

        console.info('[LocalFriendsStore] Returning completed referral count.', {
          userId,
          completedReferralCount,
        });
        res.statusCode = 200;
        res.end(JSON.stringify({ count: completedReferralCount }));
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/local-friends/accept') {
        const body = await readJsonBody(req);
        const userId = typeof body.userId === 'string' ? body.userId : '';
        const friendUserId = typeof body.friendUserId === 'string' ? body.friendUserId : '';

        if (!userId || !friendUserId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'userId and friendUserId are required.' }));
          return;
        }

        const [friendships, profiles] = await Promise.all([
          readLocalArray<LocalFriendshipRecord>(friendshipStorePath),
          readLocalArray<LocalProfileRecord>(profileStorePath),
        ]);

        const targetProfile =
          profiles.find((profile) => profile.user_id === friendUserId) ?? buildFallbackProfile(friendUserId);
        const alreadyAdded = friendships.some(
          (friendship) =>
            friendship.user_id === userId && friendship.friend_user_id === friendUserId,
        );

        if (!alreadyAdded) {
          friendships.push({
            user_id: userId,
            friend_user_id: friendUserId,
            created_at: new Date().toISOString(),
          });
          await writeLocalArray(friendshipStorePath, friendships);
        }

        const isMutual = friendships.some(
          (friendship) =>
            friendship.user_id === friendUserId && friendship.friend_user_id === userId,
        );

        console.info('[LocalFriendsStore] Accepted friend request.', {
          userId,
          friendUserId,
          alreadyAdded,
          isMutual,
        });
        res.statusCode = 200;
        res.end(JSON.stringify({ alreadyAdded, friend: targetProfile, isMutual }));
        return;
      }

      if (req.method === 'DELETE' && requestUrl.pathname === '/api/local-friends/request') {
        const userId = requestUrl.searchParams.get('userId');
        const friendUserId = requestUrl.searchParams.get('friendUserId');

        if (!userId || !friendUserId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'userId and friendUserId are required.' }));
          return;
        }

        const friendships = await readLocalArray<LocalFriendshipRecord>(friendshipStorePath);
        const nextFriendships = friendships.filter(
          (friendship) =>
            !(
              friendship.user_id === friendUserId &&
              friendship.friend_user_id === userId
            ),
        );

        if (nextFriendships.length === friendships.length) {
          res.statusCode = 404;
          res.end(JSON.stringify({ message: 'Friend request not found.' }));
          return;
        }

        await writeLocalArray(friendshipStorePath, nextFriendships);
        console.info('[LocalFriendsStore] Rejected friend request.', {
          userId,
          friendUserId,
        });
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/local-friends') {
        const body = await readJsonBody(req);
        const userId = typeof body.userId === 'string' ? body.userId : '';
        const displayName =
          typeof body.displayName === 'string' ? body.displayName.trim() : '';

        if (!userId || !displayName) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'userId and displayName are required.' }));
          return;
        }

        const [friendships, profiles] = await Promise.all([
          readLocalArray<LocalFriendshipRecord>(friendshipStorePath),
          readLocalArray<LocalProfileRecord>(profileStorePath),
        ]);

        const targetProfile =
          profiles.find(
            (profile) =>
              profile.display_name.trim().toLowerCase() === displayName.toLowerCase(),
          ) ?? null;

        if (!targetProfile) {
          res.statusCode = 404;
          res.end(JSON.stringify({ message: 'No user found with that display name.' }));
          return;
        }

        if (targetProfile.user_id === userId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'You cannot add yourself as a friend.' }));
          return;
        }

        const alreadyAdded = friendships.some(
          (friendship) =>
            friendship.user_id === userId &&
            friendship.friend_user_id === targetProfile.user_id,
        );

        if (!alreadyAdded) {
          friendships.push({
            user_id: userId,
            friend_user_id: targetProfile.user_id,
            created_at: new Date().toISOString(),
          });
          await writeLocalArray(friendshipStorePath, friendships);
        }

        const isMutual = friendships.some(
          (friendship) =>
            friendship.user_id === targetProfile.user_id &&
            friendship.friend_user_id === userId,
        );

        console.info('[LocalFriendsStore] Added friend by display name.', {
          userId,
          friendUserId: targetProfile.user_id,
          alreadyAdded,
          isMutual,
        });
        res.statusCode = 200;
        res.end(JSON.stringify({ alreadyAdded, friend: targetProfile, isMutual }));
        return;
      }

      res.statusCode = 405;
      res.end(JSON.stringify({ message: 'Method not allowed.' }));
    } catch (error) {
      console.error('[LocalFriendsStore] Request failed.', error);
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          message: error instanceof Error ? error.message : 'Unexpected local friends store error.',
        }),
      );
    }
  };

  return {
    name: 'local-friends-store',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

function accountAdminPlugin(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl =
    env.EXPO_PUBLIC_SUPABASE_URL ??
    env.VITE_SUPABASE_URL ??
    '';
  const serviceRoleKey =
    env.SUPABASE_SERVICE_ROLE_KEY ??
    env.VITE_SUPABASE_SERVICE_ROLE_KEY ??
    '';

  const adminClient =
    supabaseUrl && serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        })
      : null;

  const observationStorePath = resolve(process.cwd(), '.local-data', 'observations.json');
  const profileStorePath = resolve(process.cwd(), '.local-data', 'profiles.json');
  const friendshipStorePath = resolve(process.cwd(), '.local-data', 'friendships.json');
  const careTaskStorePath = resolve(process.cwd(), '.local-data', 'care-task-schedules.json');

  async function readLocalArray<T>(filePath: string): Promise<T[]> {
    try {
      const contents = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(contents);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  async function writeLocalArray<T>(filePath: string, records: T[]) {
    await mkdir(resolve(process.cwd(), '.local-data'), { recursive: true });
    await writeFile(filePath, JSON.stringify(records, null, 2), 'utf8');
  }

  async function readJsonBody(req: IncomingMessage) {
    const request = new Request(`http://local${req.url ?? '/'}`, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: Readable.toWeb(req as never) as BodyInit,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    return (await request.json()) as { userId?: unknown };
  }

  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const requestUrl = new URL(req.url ?? '/', 'http://local');

    if (req.method !== 'POST' || requestUrl.pathname !== '/api/account/delete') {
      next();
      return;
    }

    res.setHeader('Content-Type', 'application/json');

    try {
      const body = await readJsonBody(req);
      const userId = typeof body.userId === 'string' ? body.userId : '';

      if (!userId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: 'userId is required.' }));
        return;
      }

      if (!adminClient) {
        res.statusCode = 501;
        res.end(
          JSON.stringify({
            message:
              'Account deletion requires SUPABASE_SERVICE_ROLE_KEY on the local server.',
          }),
        );
        return;
      }

      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) {
        throw error;
      }

      const localObservations = await readLocalArray<LocalObservationRecord>(observationStorePath);
      await writeLocalArray(
        observationStorePath,
        localObservations.filter((record) => record.user_id !== userId),
      );

      const localProfiles = await readLocalArray<LocalProfileRecord>(profileStorePath);
      await writeLocalArray(
        profileStorePath,
        localProfiles.filter((record) => record.user_id !== userId),
      );

      const localFriendships = await readLocalArray<LocalFriendshipRecord>(friendshipStorePath);
      await writeLocalArray(
        friendshipStorePath,
        localFriendships.filter(
          (record) => record.user_id !== userId && record.friend_user_id !== userId,
        ),
      );

      const localCareTasks = await readLocalArray<LocalCareTaskScheduleRecord>(careTaskStorePath);
      await writeLocalArray(
        careTaskStorePath,
        localCareTasks.filter((record) => record.user_id !== userId),
      );

      console.info('[AccountAdmin] Deleted account.', { userId });
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      console.error('[AccountAdmin] Request failed.', error);
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          message: error instanceof Error ? error.message : 'Unexpected account deletion failure.',
        }),
      );
    }
  };

  return {
    name: 'account-admin',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    plantNetProxyPlugin(mode),
    reverseGeocodePlugin(),
    zipCodeMapPlugin(),
    careAlertEmailPlugin(mode),
    accountAdminPlugin(mode),
  ],
  envPrefix: ['VITE_', 'EXPO_PUBLIC_'],
  server: {
    host: '0.0.0.0',
    port: 8081,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
}));
