# Stake Callings

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
VITE_BASE_PATH=/DB-Stake-Callings/
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_anon_key
VITE_ARCHIVE_TABLE=archive
VITE_STAKE_PW=stake2026
VITE_ADMIN_PW=admin789
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

### Preview the production build

```bash
npm run preview
```

## Deployment notes

This repo can be hosted as a static site, including on GitHub Pages.

If deploying through GitHub Actions or another CI system, make sure these environment variables are available at build time:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
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
