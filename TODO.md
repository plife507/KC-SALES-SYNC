# TODO

## Phase 0 — Contract and scaffold
- [x] Create project folder
- [x] Create TODO and phases
- [x] Choose runtime scaffold
- [x] Lock initial sheet contract

## Phase 1 — Discovery and field mapping
- [x] Confirm draft quote query shape
- [x] Confirm quote note author/editor fields live
- [x] Define source-of-truth logic for "last sales touch" (latest note activity = max(lastEditedAt, createdAt))
- [x] Define output sheet columns
- [x] Create initial extraction script

## Phase 2 — Sheet sync prototype
- [x] Pick sheet target
- [x] Build draft quote fetcher
- [x] Build note-touch reducer
- [x] Build sheet writer
- [x] Emit verified sample rows
- [x] Validate via live sheet write/readback
- [x] Batch/paginate live fetch to stay under Jobber throttle budget for full draft set
- [x] Install 30-minute cron runner for ongoing syncs
- [x] Add quote/client hyperlinks and KC-style sheet formatting
- [x] Make runtime env-driven for direct Jobber API + Google auth
- [x] Fetch fully paginated quote notes for authoritative last-touch values
- [x] Scope conditional formatting ownership and apply coloring only to column L
- [x] Remove sensitive readback payloads from scheduled sync logs
- [x] Add Cloud Run entrypoint following the `kc-pp-sync` deploy pattern

## Phase 3 — Refactor hardening
- [x] Support syncing the same dataset into multiple same-shape sales tabs
- [x] Tighten cloud/debug runtime behavior so debug/sample is opt-in
- [x] Disable local `gog` Sheets fallback by default in Cloud Run
- [x] Make no-note comment writes idempotent/safer
- [x] Verify live conditional-format scope on quote `110976`

## Phase 4 — Review hardening backlog
- [x] Accepted for now: keep `kc-sales-dashboard` public to anyone with the link (`--allow-unauthenticated`), despite quote/client/note-derived data exposure.
- [ ] Accepted for now: keep `/api/refresh` spreadsheet/tab request-body overrides as-is. This is intentionally deferred unless dashboard auth posture changes.
- [x] Persist rotated Jobber refresh tokens durably using a best-effort Secret Manager add-version path, so Cloud Run cold starts do not fall back to a stale `JOBBER_REFRESH_TOKEN`.
- [x] Update `scripts/run-sync.sh` defaults to match current repo defaults: `SHEET_TAB="Draft Quote Sales Touch"` and `QUOTE_PAGE_SIZE=5`.
- [x] Remove the dashboard `CARD_ROW_LIMIT=200` slice so metrics and rendered rows use the same dataset.

## Current status
- Repo created
- TypeScript scaffold created
- Live schema confirms draft quote notes + author/editor fields are exposed
- Local tests pass (3/3)
- Live sample fetch works
- Live sheet write/readback works for a 10-quote prototype batch
- Full sync now uses batched pagination to stay under Jobber throttle budget
- 30-minute cron runner is installed
- Hyperlink + KC-style formatting pass is complete
- Runtime now uses direct Jobber API + Google auth with optional local `gog` fallback
- Cloud Run entrypoint now follows the `kc-pp-sync` source-deploy pattern
- Conditional aging colors now apply only to column L
- Sync output is summary-only to avoid logging note payloads
- Same-shape multi-tab sync is now env-driven via `SHEET_TABS`
- Debug/sample access is now explicitly gated
- Live check on quote `110976` confirms only column L is colored
- Sync runs now append to a `Log` tab in the sheet for run history
