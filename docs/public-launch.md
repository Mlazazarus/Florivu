# Florivu Public Launch

## Recommended launch shape

Launch Florivu as a public PWA with a static frontend plus serverless `/api/*` routes. That gives you:

- a real public URL over HTTPS
- installability on iPhone and Android home screens
- a hosting shape that fits Cloudflare Workers static assets well
- a simple Codex workflow where you keep editing the same web codebase and push updates through Git

Florivu still depends on same-origin server routes for:

- `/api/plantnet/identify`
- `/api/reverse-geocode`
- `/api/zip-code-map`
- `/api/care-alerts/send-email`
- `/api/account/delete`

Florivu no longer depends on server-side `local-*` fallback routes. Local fallback persistence now lives in browser IndexedDB, while Supabase remains the real production datastore.

## Production checklist

Minimum required environment variables:

- `EXPO_PUBLIC_SUPABASE_URL` or `VITE_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_HCAPTCHA_SITE_KEY` or `VITE_HCAPTCHA_SITE_KEY`
- `PLANTNET_API_KEY`
- `VITE_PUBLIC_APP_URL`

Needed for specific features:

- `SUPABASE_SERVICE_ROLE_KEY` for account deletion
- `RESEND_API_KEY` and `CARE_ALERT_FROM_EMAIL` for care reminder emails
- `CARE_ALERT_APP_URL` if you want email links to point at a specific public origin

Before launch, apply `supabase/schema.sql` so the production database has the current Florivu tables and columns. The app has local fallbacks for missing tables, but that fallback is for resilience, not for a clean public rollout.

For protected account creation:

- create or reuse an hCaptcha site and add the Florivu public domain plus any Cloudflare preview domain you intend to test from
- in Supabase, open `Authentication > Bot and Abuse Protection`, enable CAPTCHA protection, choose `hCaptcha`, and paste the hCaptcha secret key
- in the Florivu app env vars, set the matching public site key as `EXPO_PUBLIC_HCAPTCHA_SITE_KEY`
- Florivu now requires a completed hCaptcha challenge before `signUp` will run

## Deploying

The repo still supports local preview:

```bash
npm ci
npm run build
npm run start
```

`npm run start` launches `vite preview` for local verification. For Cloudflare Workers, build from the repository root and deploy:

- static assets from `dist`
- API routes from `src/index.ts`, which maps the `/api/*` routes to the shared Cloudflare handlers under `functions`

The included `wrangler.toml` configures the Worker entrypoint plus static asset serving from `dist`.

If you prefer container deployment, use the included `Dockerfile`.

## Cloudflare

Create the Cloudflare Workers build from this repository, then provide these environment variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_HCAPTCHA_SITE_KEY`
- `PLANTNET_API_KEY`
- `VITE_PUBLIC_APP_URL`
- `SUPABASE_SERVICE_ROLE_KEY` if account deletion should work
- `RESEND_API_KEY` and `CARE_ALERT_FROM_EMAIL` if care reminder emails should work
- `CARE_ALERT_APP_URL` if email links should point to a specific public URL

The account deletion and care reminder email routes now expect the signed-in Supabase bearer token from the app, so those endpoints are no longer public-body-only actions.

## Phone-app strategy

Phase 1:

- deploy Florivu publicly as the PWA
- install it from the browser onto your phone home screen
- keep shipping updates by editing in Codex and pushing Git changes

Phase 2, only if you want app stores:

- wrap the same public Florivu app with Capacitor
- submit the Android build to Google Play
- submit the iOS build from a Mac/Xcode environment to the App Store

That keeps the product moving now without forcing a React Native rewrite or a store-packaging workflow before the public release exists.
