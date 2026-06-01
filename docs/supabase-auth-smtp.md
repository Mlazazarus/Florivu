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

`MAILER_AUTOCONFIRM=false` keeps email confirmation on for new accounts.

## Apply via API

If you have a Supabase access token, add it to `.env.supabase-auth.local` as:

`SUPABASE_ACCESS_TOKEN=...`

Then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\apply-supabase-auth-smtp.ps1
```

## Dashboard mapping

If you prefer the Supabase dashboard instead of the helper script, use the same values above in the Auth SMTP settings page and enter the mailbox password into the SMTP password field there.
