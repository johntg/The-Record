# Stake Callings

A Vite-powered PWA-style interface for tracking Church callings and releases from a Google Spreadsheet.
TO BE UPDATED sson

The app is designed to be hosted on **GitHub Pages** and to use **Google Apps Script** as its API layer for reading from and writing to the spreadsheet.

## Stack

- Frontend: Vite + vanilla JavaScript
- Hosting: GitHub Pages project site
- Backend/API: Google Apps Script Web App
- Data store: Google Sheets

## Project site target

This repository is configured for the GitHub Pages project site:

- Repo: `johntg/stake-callings`
- Site URL: `https://johntg.github.io/stake-callings/`

The Vite base path is controlled through environment variables and defaults to the project-site path in `.env.example`.

## Spreadsheet layout

The current `Callings` sheet is expected to use this exact column order:

- **A** — Timestamp / ID
- **B** — Type
- **C** — Name
- **D** — Position
- **E** — Unit
- **F** — SP Approved
- **G** — SHC Sustained
- **H** — I/V Assigned
- **I** — I/V Complete
- **J** — Prev-Release
- **K** — SusAssigned
- **L** — SusUnit
- **M** — SA-Assign
- **N** — SA Done
- **O** — Status

Notes:

- Column **A** timestamp acts as the row ID for updates.
- The `Units` sheet is expected to contain unit names in column A, starting on row 2.

## Current API behavior

The Apps Script API currently supports:

### `GET ?action=initialData`

Returns JSON with:

- `success`
- `units`
- `callings`
- `error` when applicable

### `POST action=saveCalling`

Accepts form-style fields:

- `type`
- `name`
- `position`
- `unit`

This appends a new row to `Callings` using the confirmed schema.

### `POST action=toggleApproval`

Accepts:

- `id`
- `colIndex`
- `isChecked`

This toggles a timestamp in a chosen workflow column.

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Create your local environment file

A local `.env` file should contain:

```env
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
VITE_BASE_PATH=/stake-callings/
```

For purely local development you can also set:

```env
VITE_BASE_PATH=/
```

if you want the site to behave like a root-hosted app locally.

### 3. Start the dev server

```bash
npm run dev
```

### 4. Production build

```bash
npm run build
```

### 5. Preview the production build

```bash
npm run preview
```

## Google Apps Script setup

The Apps Script source lives in:

- `src/resources/Code.gs`

### Create or update the Apps Script project

1. Open your Apps Script project.
2. Copy in the contents of `src/resources/Code.gs`.
3. Make sure the spreadsheet ID in `CONFIG.SS_ID` is correct.
4. Confirm the sheet names match:
   - `Callings`
   - `Units`

### Deploy as a Web App

In Apps Script:

1. Go to **Deploy → New deployment**
2. Choose **Web app**
3. Set **Execute as** to **Me**
4. Set access to the audience you want to allow
5. Deploy and copy the `/exec` URL

Use that `/exec` URL for `VITE_APPS_SCRIPT_URL`.

## GitHub Pages deployment

This repository includes a GitHub Actions workflow:

- `.github/workflows/deploy.yml`

It builds and deploys the site to GitHub Pages on pushes to `main`.

### GitHub setup steps

1. Push this repository to GitHub.
2. In the repo settings, open **Pages**.
3. Set the source to **GitHub Actions**.
4. In **Settings → Secrets and variables → Actions**, add:
   - `VITE_APPS_SCRIPT_URL`

5. Set that secret to your deployed Apps Script `/exec` URL.

Once pushed to `main`, the workflow will publish the site to:

- `https://johntg.github.io/stake-callings/`

## Important architecture note

This project is intentionally using:

- **GitHub Pages** for the frontend
- **Apps Script Web App** for the backend API

That means:

- `google.script.run` is **not used** by the deployed frontend
- the frontend talks to Apps Script using `fetch()`
- the app uses environment variables for the Apps Script endpoint and Pages base path

## Known caveats

Google Apps Script can be finicky when called from a separately hosted frontend.
If requests fail, check these first:

- the Apps Script Web App is deployed, not just saved
- you are using the `/exec` URL, not an editor/testing URL
- the deployment permissions allow the intended audience
- the GitHub Actions secret `VITE_APPS_SCRIPT_URL` is set correctly
- the spreadsheet ID and sheet names in `Code.gs` are correct

## Current UI status

The current frontend includes:

- mobile-friendly card layout
- floating add button
- modal form for new entries
- GitHub Pages-compatible API wiring

The visual design is based on the updated prototype files in `src/resources/`.

## Likely next enhancements

- show more workflow columns on each card
- add toggle controls for approval/status fields in the Vite frontend
- improve filtering and sorting
- add manifest/service-worker support for full PWA installability

## File guide

- `src/main.js` — app UI, fetch logic, modal behavior
- `src/style.css` — app styling
- `src/resources/Code.gs` — Apps Script API backend
- `vite.config.js` — GitHub Pages base-path support
- `.github/workflows/deploy.yml` — automated Pages deployment
- `.env.example` — required environment variables

change to force push
