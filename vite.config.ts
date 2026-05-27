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
  created_at: string;
}

interface LocalProfileRecord {
  user_id: string;
  display_name: string;
  profile_photo_url?: string | null;
  home_zip_code?: string | null;
  facebook_url?: string | null;
  is_public: boolean;
  created_at: string;
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
    const boundary = `----PlantDexBoundary${Date.now().toString(16)}`;
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
          'User-Agent': 'PlantDex/1.0 (local reverse geocoding)',
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

function localObservationStorePlugin(): Plugin {
  const storePath = resolve(process.cwd(), '.local-data', 'observations.json');

  async function readObservations() {
    try {
      const contents = await readFile(storePath, 'utf8');
      const parsed = JSON.parse(contents);
      return Array.isArray(parsed) ? (parsed as LocalObservationRecord[]) : [];
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

  async function readJsonBody(req: IncomingMessage) {
    const request = new Request(`http://local${req.url ?? '/'}`, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: Readable.toWeb(req as never) as BodyInit,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    return (await request.json()) as Omit<LocalObservationRecord, 'id' | 'created_at'>;
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
        const observation = await readJsonBody(req);
        const storedObservation: LocalObservationRecord = {
          ...observation,
          id: randomUUID(),
          created_at: new Date().toISOString(),
        };
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

      if (req.method === 'DELETE' && requestUrl.pathname.startsWith('/api/local-observations/')) {
        const id = decodeURIComponent(
          requestUrl.pathname.slice('/api/local-observations/'.length),
        );
        const userId = requestUrl.searchParams.get('userId');
        const observations = await readObservations();
        const nextObservations = observations.filter(
          (observation) => !(observation.id === id && (!userId || observation.user_id === userId)),
        );

        if (nextObservations.length === observations.length) {
          res.statusCode = 404;
          res.end(JSON.stringify({ message: 'Observation not found.' }));
          return;
        }

        await writeObservations(nextObservations);
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
        const now = new Date().toISOString();
        const existingProfile = profiles.find((entry) => entry.user_id === profile.user_id);
        const storedProfile: LocalProfileRecord = {
          ...existingProfile,
          ...profile,
          created_at: existingProfile?.created_at ?? profile.created_at ?? now,
          updated_at: now,
        };
        const nextProfiles = profiles.filter((entry) => entry.user_id !== profile.user_id);
        nextProfiles.unshift(storedProfile);
        await writeProfiles(nextProfiles);

        console.info('[LocalProfileStore] Stored profile.', {
          userId: storedProfile.user_id,
          displayName: storedProfile.display_name,
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
    localObservationStorePlugin(),
    localProfileStorePlugin(),
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
