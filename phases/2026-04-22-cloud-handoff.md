# KC Sales Sync Cloud Handoff

## Current State

- Repo: `KC-SALES-SYNC`
- Service: `kc-sales-sync`
- GCP project: `aya-gservicies`
- Region: `us-central1`
- Comparable service/pattern: `kc-pp-sync`

## Confirmed Findings

- Cloud Run service `kc-sales-sync` exists.
- Revisions `kc-sales-sync-00001-hjr` and `kc-sales-sync-00002-8hf` both failed startup.
- The real startup failure was not the region or secret bindings.
- The failure came from `src/index.ts` running its CLI `main()` on import.
- Cloud Run imports `dist/function.js`, which imports `index.js`.
- Because `main()` executed at import time, the container exited with:
  - `Unknown command: --target=kcSalesSync`

## Source Fix Applied

- `src/index.ts` now guards `main()` behind a direct-run check.
- That means the CLI path runs only when invoked directly, not when Functions Framework imports the module.

## Local Validation

- `npm run typecheck` passes.
- After rebuilding `dist`, importing `dist/function.js` succeeds and exports `kcSalesSync`.

## Secret / Runtime State

- Shared Jobber runtime secret in use for now:
  - `JOBBER_ACCESS_TOKEN`
- Service-specific spreadsheet secret already created:
  - `KC_SALES_SYNC_SPREADSHEET_ID`
- New spreadsheet already created:
  - sheet name: `kc-sales-sync`
  - `SPREADSHEET_ID`: `1HxyT_kTT9838SG9THl71rHH8EF-esU2fiYYEz8ttq-s`
- Missing service-specific Google auth secrets still need to be created:
  - `KC_SALES_SYNC_GOOGLE_CLIENT_ID`
  - `KC_SALES_SYNC_GOOGLE_CLIENT_SECRET`
  - `KC_SALES_SYNC_GOOGLE_REFRESH_TOKEN`

## Service Account

- `kc-sales-sync` and `kc-pp-sync` both use:
  - `823212137840-compute@developer.gserviceaccount.com`
- That service account already has:
  - `roles/secretmanager.secretAccessor`

## Recommended Next Step

1. Create the three Google auth secrets for `kc-sales-sync`.
2. Rebuild `dist`.
3. Redeploy `kc-sales-sync` with:
   - `gcloud run deploy kc-sales-sync --source .`
   - secret bindings for Jobber, spreadsheet ID, and Google auth
   - non-secret env vars for tab name, paging, API URL/version, and `TZ=America/Los_Angeles`
4. Verify:
   - new revision is ready
   - traffic points to it
   - POST sync works
   - logs show no startup/auth/runtime failure
   - safe sheet write is visible in the new spreadsheet
