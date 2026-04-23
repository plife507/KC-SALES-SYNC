# KC-SALES-SYNC

Track sales-touch activity on Jobber draft quotes and sync the result into Google Sheets.

## Goal

Build a sheet-oriented sync that answers:
- which draft quotes exist
- who owns them
- when they were created
- when they were last updated
- when sales last touched them via notes
- who last touched them
- the full text of the latest note

## Prototype scope

Run as a Cloud Run source-deployed service using env-provided Jobber and Google credentials.
Local `gog` auth remains an optional fallback for development convenience, but it is disabled by default in Cloud Run.

## Current architecture

- `src/adapters/jobber.ts` — reads draft quotes and fully paginated quote notes from Jobber GraphQL
- `src/lib/touch.ts` — computes last-touch fields from quote notes
- `src/adapters/sheets.ts` — creates/updates a Google Sheet tab and applies managed formatting/rules
- `src/index.ts` — CLI entrypoint for sheet init and sync
- `src/function.ts` — Cloud Run HTTP entrypoint following the `kc-pp-sync` pattern
- `test/` — reducer and shaping tests

## Required env

- `SPREADSHEET_ID`
- `JOBBER_ACCESS_TOKEN` or the refresh-token trio below
- `JOBBER_CLIENT_ID`
- `JOBBER_CLIENT_SECRET`
- `JOBBER_REFRESH_TOKEN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

## Optional env

- `JOBBER_API_URL` default: `https://api.getjobber.com/api/graphql`
- `JOBBER_API_VERSION` default: `2025-04-16`
- `JOBBER_REQUEST_DELAY_MS` default: `400`
- `JOBBER_NOTES_PAGE_SIZE` default: `50`
- `SHEET_TAB` default: `DRAFT`
- `SHEET_TABS` optional comma-separated list of same-shape tabs to keep in sync with the same dataset
- `QUOTE_LIMIT` default: `100`
- `QUOTE_PAGE_SIZE` default: `10`
- `ALLOW_DEBUG_COMMANDS` default: `false`; required for `sample` in HTTP/CLI runtime
- `ALLOW_LOCAL_SHEETS_FALLBACK` default: `true` locally, `false` in Cloud Run
- `GOG_ACCOUNT`, `GOG_CREDENTIALS_PATH` for local `gog`-backed Sheets auth fallback only

## Commands

- `npm run sample`
- `npm run sync`
- `npm run sheet:init`
- `npm run build`
- `npm run typecheck`

## Deployment

Runs as a **Google Cloud Run** service using the same source-deploy pattern as `kc-pp-sync`.

Deploy:

```bash
gcloud run deploy kc-sales-sync \
  --source . \
  --region us-central1 \
  --project aya-gservicies \
  --no-allow-unauthenticated \
  --memory 512Mi \
  --cpu 0.1666 \
  --timeout 300 \
  --max-instances 1
```

Timezone/runtime note:

- Set `TZ=America/Los_Angeles`
- Sheet-facing timestamps are already formatted in Pacific time in code

Manual HTTP trigger shape:

```json
{ "command": "sync" }
```

Notes:
- `sync` writes the same output to every tab listed in `SHEET_TABS` when present.
- each sync appends a run record to the `Log` tab in the target spreadsheet.
- `sample` is for debug use and is blocked unless `ALLOW_DEBUG_COMMANDS=true`.

Optional body fields:

- `spreadsheetId`
- `tabName` (single-tab override; otherwise `SHEET_TABS` or `SHEET_TAB` is used)
- `limit`
- `pageSize`
- `title` for `sheet:init`

## Initial target columns

- Quote Number
- Quote Title
- Client Name
- Draft Created
- Last Updated
- Native Salesperson
- KC Sales Rep
- Lead Source
- Quote Status
- Last Note Created At
- Last Note Edited At
- Last Sales Touch At
- Last Sales Touch By
- Last Note Text
