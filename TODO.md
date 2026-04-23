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
