# Supabase Auth SMTP For Florivu

Use this when Florivu account confirmation or password reset emails need to come from `florivu@laztronics.com`.

## Local env file

Put the SMTP secret in:

`C:\Users\poaop\Documents\Florivu\.env.supabase-auth.local`

This file is gitignored.

## Values prepared for Florivu

- `SMTP_ADMIN_EMAIL=florivu@laztronics.com`
- `SMTP_SENDER_NAME=Florivu`
- `SMTP_HOST=smtp.hostinger.com`
- `SMTP_PORT=587`
- `SMTP_USER=florivu@laztronics.com`
- `SMTP_PASS=` fill this in locally

## Supabase behavior

- `EXTERNAL_EMAIL_ENABLED=true`
- `MAILER_AUTOCONFIRM=false`
- `MAILER_SECURE_EMAIL_CHANGE_ENABLED=true`
- `SITE_URL=https://florivu.laztronics.workers.dev`
- `URI_ALLOW_LIST=https://florivu.laztronics.workers.dev/**,http://localhost:3000/**`

`MAILER_AUTOCONFIRM=false` keeps email confirmation on for new accounts.

The live Supabase project URL configuration must not stay on `http://localhost:3000`, or password reset and signup email flows can redirect to localhost instead of the hosted Florivu app.

If your email templates use `{{ .SiteURL }}` for confirmation or recovery links, switch them to `{{ .RedirectTo }}` so the `redirectTo` / `emailRedirectTo` value from the client is respected.

## Apply via API

If you have a Supabase access token, add it to `.env.supabase-auth.local` as:

`SUPABASE_ACCESS_TOKEN=...`

Then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\apply-supabase-auth-smtp.ps1
```

## Dashboard mapping

If you prefer the Supabase dashboard instead of the helper script, use the same values above in the Auth SMTP settings page and enter the mailbox password into the SMTP password field there.
