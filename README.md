# KC Sales Sync + Dashboard

This repo contains **two separate Cloud Run services**:

1. **Backend sync service** → `kc-sales-sync`
2. **Frontend dashboard service** → `kc-sales-dashboard`

## How the deploys are split

Both services deploy from the **same repo**, but they use different runtime entrypoints:

- **Sync backend**
  - `FUNCTION_TARGET=kcSalesSync`
  - `FUNCTION_SOURCE=dist/function.js`
- **Dashboard frontend/API**
  - `FUNCTION_TARGET=kcSalesDashboard`
  - `FUNCTION_SOURCE=dist/dashboard-function.js`

That is the split: same codebase, different Cloud Run service names, different Functions Framework targets.

---

## Service 1 — Backend sheet sync (`kc-sales-sync`)

Purpose:
- read draft quotes + notes from Jobber
- compute touch state
- write the synced result into the Google Sheet
- maintain the Log tab

### Backend required env

- `SPREADSHEET_ID`
- `JOBBER_ACCESS_TOKEN` or refresh-token trio:
  - `JOBBER_CLIENT_ID`
  - `JOBBER_CLIENT_SECRET`
  - `JOBBER_REFRESH_TOKEN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

### Backend optional env

- `SHEET_TAB` default: `Draft Quote Sales Touch`
- `SHEET_TABS` optional comma-separated same-shape tabs
- `QUOTE_LIMIT` default: `100`
- `QUOTE_PAGE_SIZE` default: `5`
- `JOBBER_REFRESH_TOKEN_SECRET` default: `projects/823212137840/secrets/KC_SALES_SYNC_JOBBER_REFRESH_TOKEN`
- `ALLOW_DEBUG_COMMANDS` default: `false`
- `ALLOW_LOCAL_SHEETS_FALLBACK` default: `true` locally, `false` in Cloud Run
- `TZ=America/Los_Angeles`

If Jobber rotates the refresh token, the sync service writes a new Secret Manager version best-effort. The Cloud Run service account needs permission to add versions to `JOBBER_REFRESH_TOKEN`.

### Deploy backend sync

```bash
gcloud run deploy kc-sales-sync \
  --source . \
  --region us-central1 \
  --project aya-gservicies \
  --no-allow-unauthenticated \
  --memory 512Mi \
  --cpu 0.1666 \
  --timeout 300 \
  --max-instances 1 \
  --set-env-vars FUNCTION_TARGET=kcSalesSync,FUNCTION_SOURCE=dist/function.js,TZ=America/Los_Angeles,ALLOW_DEBUG_COMMANDS=false,ALLOW_LOCAL_SHEETS_FALLBACK=false,SHEET_TAB="Draft Quote Sales Touch",JOBBER_REFRESH_TOKEN_SECRET=projects/823212137840/secrets/KC_SALES_SYNC_JOBBER_REFRESH_TOKEN \
  --set-secrets SPREADSHEET_ID=KC_SALES_SYNC_SPREADSHEET_ID:latest,JOBBER_ACCESS_TOKEN=KC_SALES_SYNC_JOBBER_ACCESS_TOKEN:latest,JOBBER_CLIENT_ID=KC_SALES_SYNC_JOBBER_CLIENT_ID:latest,JOBBER_CLIENT_SECRET=KC_SALES_SYNC_JOBBER_CLIENT_SECRET:latest,JOBBER_REFRESH_TOKEN=KC_SALES_SYNC_JOBBER_REFRESH_TOKEN:latest,GOOGLE_CLIENT_ID=KC_SALES_SYNC_GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=KC_SALES_SYNC_GOOGLE_CLIENT_SECRET:latest,GOOGLE_REFRESH_TOKEN=KC_SALES_SYNC_GOOGLE_REFRESH_TOKEN:latest
```

### Backend local commands

```bash
npm run build
npm run local:sync
npm run sync
npm run sheet:init
```

---

## Service 2 — Dashboard frontend (`kc-sales-dashboard`)

Purpose:
- serve the dashboard UI
- read synced quote data from the sales sheet
- expose refresh/data routes for the dashboard

Important:
- the dashboard currently reads from the **Google Sheet**, not directly from Jobber
- flow is: **Jobber → kc-sales-sync → Google Sheet → dashboard**
- current accepted posture: the dashboard is public to anyone with the link

### Dashboard required env

- `SPREADSHEET_ID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

### Dashboard optional env

- `DASHBOARD_SHEET_TAB` default: `Draft Quote Sales Touch`
- `ALLOW_LOCAL_SHEETS_FALLBACK` default: `true` locally, `false` in Cloud Run
- `TZ=America/Los_Angeles`

### Deploy dashboard

```bash
gcloud run deploy kc-sales-dashboard \
  --source . \
  --region us-central1 \
  --project aya-gservicies \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 0.1666 \
  --timeout 300 \
  --max-instances 1 \
  --set-env-vars FUNCTION_TARGET=kcSalesDashboard,FUNCTION_SOURCE=dist/dashboard-function.js,TZ=America/Los_Angeles,DASHBOARD_SHEET_TAB="Draft Quote Sales Touch",ALLOW_DEBUG_COMMANDS=false,ALLOW_LOCAL_SHEETS_FALLBACK=false \
  --set-secrets SPREADSHEET_ID=KC_SALES_SYNC_SPREADSHEET_ID:latest,GOOGLE_CLIENT_ID=KC_SALES_SYNC_GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=KC_SALES_SYNC_GOOGLE_CLIENT_SECRET:latest,GOOGLE_REFRESH_TOKEN=KC_SALES_SYNC_GOOGLE_REFRESH_TOKEN:latest
```

### Dashboard routes

- `GET /`
- `GET /data/live-data.json`
- `GET /data/live-data.js`
- `POST /api/refresh`
- `GET /healthz`

### Dashboard local commands

```bash
npm run build
npm run local:dashboard
npm run dashboard:data
```

---

## Helpful local service switching

Default shared start script uses the sync backend unless you override it:

```bash
FUNCTION_TARGET=kcSalesDashboard FUNCTION_SOURCE=dist/dashboard-function.js npm start
```

or

```bash
FUNCTION_TARGET=kcSalesSync FUNCTION_SOURCE=dist/function.js npm start
```

---

## Files added for dashboard

- `src/dashboard.ts`
- `src/dashboard-function.ts`
- `dashboard/index.html`
- `dashboard/README.md`
- built dist artifacts for dashboard entrypoints

## Notes

- `dashboard/data/` is generated and ignored.
- Cloud Run should not rely on `gog`; keep `ALLOW_LOCAL_SHEETS_FALLBACK=false` there.
- The backend sync remains the writer to the sheet. The dashboard is currently a reader of the synced sheet state.
