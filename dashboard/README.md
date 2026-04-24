# KC Sales Dashboard UI

Plain HTML dashboard served by the Cloud Run dashboard service.

## Runtime expectations

- In Cloud Run, the page loads live data from `/data/live-data.js` or `/data/live-data.json`.
- Locally, `npm run local` serves the same UI dynamically.
- For fully static preview from disk, generate `dashboard/data/live-data.js` with `npm run dashboard:data` first.

## Main routes when served

- `/`
- `/data/live-data.json`
- `/data/live-data.js`
- `/api/refresh`
