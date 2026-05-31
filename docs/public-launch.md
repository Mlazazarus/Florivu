# Florivu Public Launch

## Recommended launch shape

Launch Florivu first as a public PWA backed by the existing Node server. That gives you:

- a real public URL over HTTPS
- installability on iPhone and Android home screens
- a simple Codex workflow where you keep editing the same web codebase and push updates through Git

This is the fastest path because Florivu is not a static-only app today. It depends on same-origin server routes such as:

- `/api/plantnet/identify`
- `/api/reverse-geocode`
- `/api/zip-code-map`
- `/api/care-alerts/send-email`
- `/api/account/delete`

Florivu also includes local file-backed fallback routes under `.local-data`. Those are useful during development, but a public launch should treat Supabase as the primary datastore and should not rely on local fallback persistence for production data durability.

## Production checklist

Minimum required environment variables:

- `EXPO_PUBLIC_SUPABASE_URL` or `VITE_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`
- `PLANTNET_API_KEY`
- `VITE_PUBLIC_APP_URL`

Needed for specific features:

- `SUPABASE_SERVICE_ROLE_KEY` for account deletion
- `RESEND_API_KEY` and `CARE_ALERT_FROM_EMAIL` for care reminder emails
- `CARE_ALERT_APP_URL` if you want email links to point at a specific public origin

Before launch, apply `supabase/schema.sql` so the production database has the current Florivu tables and columns. The app has local fallbacks for missing tables, but that fallback is for resilience, not for a clean public rollout.

## Deploying

The repo now supports a production start path:

```bash
npm ci
npm run build
npm run start
```

`npm run start` launches `vite preview` with the same preview middleware Florivu already uses for its `/api/*` routes. On hosts such as Render, Railway, or Fly.io, deploy from the repository root, set the environment variables above, and let the platform provide `PORT`.

If you prefer container deployment, use the included `Dockerfile`.

## Repo visibility

Florivu can stay in a private repository and still deploy publicly on Render. The code does not need to be public for users to access the app.

Render just needs access to the private GitHub repository that contains this standalone Florivu project.

## GitHub handoff

Create an empty private GitHub repository named `Mlazazarus/Florivu`, then push this standalone repo:

```bash
git push -u origin main
```

## Render

The repository root can include a `render.yaml` Blueprint so Render can create the service with the correct build and start commands.

Create the Render service from this repository, then provide these environment variables when prompted:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `PLANTNET_API_KEY`
- `VITE_PUBLIC_APP_URL`
- `SUPABASE_SERVICE_ROLE_KEY` if account deletion should work
- `RESEND_API_KEY` and `CARE_ALERT_FROM_EMAIL` if care reminder emails should work
- `CARE_ALERT_APP_URL` if email links should point to a specific public URL

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
