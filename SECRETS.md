# KC sales sync + dashboard secret wiring

## Source of truth

Preferred canonical location:
- `~/.secrets/aya/kc-sales-sync.env`

## Shared Google secret bindings

- `SPREADSHEET_ID` -> `KC_SALES_SYNC_SPREADSHEET_ID:latest`
- `GOOGLE_CLIENT_ID` -> `KC_SALES_SYNC_GOOGLE_CLIENT_ID:latest`
- `GOOGLE_CLIENT_SECRET` -> `KC_SALES_SYNC_GOOGLE_CLIENT_SECRET:latest`
- `GOOGLE_REFRESH_TOKEN` -> `KC_SALES_SYNC_GOOGLE_REFRESH_TOKEN:latest`

## Sync service (`kc-sales-sync`)

Additional secrets:
- `JOBBER_ACCESS_TOKEN` -> `KC_SALES_SYNC_JOBBER_ACCESS_TOKEN:latest`
- `JOBBER_CLIENT_ID` -> `KC_SALES_SYNC_JOBBER_CLIENT_ID:latest`
- `JOBBER_CLIENT_SECRET` -> `KC_SALES_SYNC_JOBBER_CLIENT_SECRET:latest`
- `JOBBER_REFRESH_TOKEN` -> `KC_SALES_SYNC_JOBBER_REFRESH_TOKEN:latest`

Runtime refresh-token rotation:
- default write target: `projects/823212137840/secrets/KC_SALES_SYNC_JOBBER_REFRESH_TOKEN`
- override env: `JOBBER_REFRESH_TOKEN_SECRET`
- service account needs permission to add Secret Manager versions for `KC_SALES_SYNC_JOBBER_REFRESH_TOKEN`

Recommended env:
- `FUNCTION_TARGET=kcSalesSync`
- `FUNCTION_SOURCE=dist/function.js`
- `TZ=America/Los_Angeles`
- `ALLOW_DEBUG_COMMANDS=false`
- `ALLOW_LOCAL_SHEETS_FALLBACK=false`

## Dashboard service (`kc-sales-dashboard`)

Recommended env:
- `FUNCTION_TARGET=kcSalesDashboard`
- `FUNCTION_SOURCE=dist/dashboard-function.js`
- `DASHBOARD_SHEET_TAB=Draft Quote Sales Touch`
- `TZ=America/Los_Angeles`
- `ALLOW_DEBUG_COMMANDS=false`
- `ALLOW_LOCAL_SHEETS_FALLBACK=false`

## Local note

Local development may still use direct envs from `~/.secrets/aya/kc-sales-sync.env`.
Only local dev should rely on `gog`, and only when `ALLOW_LOCAL_SHEETS_FALLBACK=true`.
