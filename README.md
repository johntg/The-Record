# The Record

A Vite-powered interface for tracking Church callings and releases.

## Project history

This project **originally used Google Apps Script + Google Sheets** as its backend. That legacy implementation is still included in the repository for reference and migration history.

The **current frontend** in `src/main.js` now talks **directly to Supabase**.

So the architecture has evolved like this:

- **Originally:** GitHub Pages + Apps Script + Google Sheets
- **Currently:** Vite frontend + Supabase

## Current stack

- Frontend: Vite + vanilla JavaScript
- Hosting: GitHub Pages / static hosting
- Data/API: Supabase
- Styling: plain CSS

## Legacy stack retained in repo

Older Apps Script code is still present here:

- `src/Code.gs`

That file reflects the earlier spreadsheet-backed version of the project, but it is **not the active runtime path** for the current frontend.

## Current app behavior

The live app uses Supabase for data access, including these tables:

- `callings`
- `members`
- `status_options`
- archive table configured via `VITE_ARCHIVE_TABLE` (defaults to `archive`)

Current app features include:

- sign-in using configured shared passwords
- create new callings and releases
- update assignments and workflow steps
- generate reports
- archive items by moving them from `callings` into the configured archive table

## Environment variables

Create a local `.env` file with values like these:

```env
VITE_BASE_PATH=/The-Record/

# Production database
VITE_SUPABASE_URL_PROD=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY_PROD=your_publishable_anon_key

# Training database (optional, for database toggle feature)
VITE_SUPABASE_URL_TRAINING=https://your-training-project.supabase.co
VITE_SUPABASE_ANON_KEY_TRAINING=your_training_publishable_anon_key

VITE_ARCHIVE_TABLE=archive
VITE_STAKE_PW=stake2026
VITE_ADMIN_PW=admin789
VITE_MEMBER_PROVISION_URL=https://your-secure-endpoint.example.com/provision-member
VITE_MEMBER_PROVISION_TOKEN=replace_with_shared_secret
```

For purely local development, you can also use:

```env
VITE_BASE_PATH=/
```

## Local development

### Install dependencies

```bash
npm install
```

### Start the dev server

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Automatic versioning

This project now supports two lightweight versioning helpers:

1. **Auto build metadata** (runs automatically before `npm run build`)
   - Generates `public/build-version.json`
   - Includes:
     - semantic version from `package.json`
     - auto build number (CI run number if available, otherwise UTC timestamp)
     - short git commit hash

2. **Semantic version bump shortcuts**

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

These update `package.json` version without creating a git tag (`--no-git-tag-version`).

### Preview the production build

```bash
npm run preview
```

## Deployment notes

This repo can be hosted as a static site, including on GitHub Pages.

If deploying through GitHub Actions or another CI system, make sure these environment variables are available at build time:

- `VITE_SUPABASE_URL_PROD`
- `VITE_SUPABASE_ANON_KEY_PROD`
- `VITE_SUPABASE_URL_TRAINING` (optional, for database toggle feature)
- `VITE_SUPABASE_ANON_KEY_TRAINING` (optional, for database toggle feature)
- `VITE_ARCHIVE_TABLE` (optional if using `archive`)
- `VITE_STAKE_PW`
- `VITE_ADMIN_PW`

## Supabase Row Level Security (RLS) setup

The app attempts to archive items by moving rows from the `callings` table to the `archive` table.

If you see an alert about "Archive table write is blocked by Supabase Row Level Security," it means the `archive` table doesn't have an `INSERT` policy enabled for your app's auth role.

**To enable row archiving:**

See [SUPABASE_RLS_SETUP.md](./SUPABASE_RLS_SETUP.md) for detailed steps to add an `INSERT` policy to the `archive` table.

Quick summary:

1. Open Supabase console → **SQL Editor**
2. Add an `INSERT` policy for authenticated users on the `archive` table
3. Test archiving in the app

If archiving still isn't working after adding the policy, check:

- The policy is on the correct table (`archive`)
- Your authentication role matches the policy condition
- You have SELECT access to the `archive` table (to see archived rows)

## Closed-group auth provisioning

This app uses a closed-group login model: an email address must exist in both `public.members` and Supabase `auth.users` before an OTP code should be sent.

See [SUPABASE_AUTH_PROVISIONING.md](./SUPABASE_AUTH_PROVISIONING.md) for the recommended admin workflow and long-term provisioning approach.

For local admin provisioning, the repo now includes:

- `npm run provision:member -- --email person@example.com --name "Person Name" --role stake`

This command uses the Supabase Admin API, so it requires a local `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

### Admin page full provisioning

The in-app Admin page now supports full provisioning for **new** members by calling a secure server-side endpoint.

That endpoint must:

1. create or confirm the user in `auth.users`
2. upsert the matching row in `public.members`

The frontend uses:

- `VITE_MEMBER_PROVISION_URL`
- `VITE_MEMBER_PROVISION_TOKEN`

An example Supabase Edge Function template is included at:

- `supabase/functions/provision-member/index.ts`

## Apps Script notes

The Apps Script code remains useful as:

- a record of the original architecture
- a reference for past spreadsheet-based workflows
- a fallback starting point if the project ever needs to reconnect to Google Sheets

However, the current frontend does **not** use:

- `google.script.run`
- Apps Script web app endpoints
- Google Sheets as its active datastore

## File guide

- `src/main.js` — current app UI and Supabase data access
- `src/style.css` — app styling
- `src/Code.gs` — legacy Apps Script backend from the original version
- `vite.config.js` — Vite configuration
- `.env.example` — example environment variables

## Summary

This repository started life as an Apps Script/Google Sheets project, and that history is still preserved here. The active app has since moved to Supabase, and this README now reflects both the **original architecture** and the **current one** without pretending the past never happened.
