# Phase 1 — Core Implementation

## Goal
Implement a local prototype that reads draft quotes + notes from Jobber and produces sheet-ready rows.

## Scope
In scope:
- Jobber query adapter using existing local auth/env
- quote note reducer for last-sales-touch logic
- Google Sheets adapter using existing ADC auth
- CLI entrypoint
- tests for row shaping and touch resolution

Out of scope:
- cron automation
- full historical backfill polishing
- deployment packaging

## Status
complete

## Tasks
- [x] Implement Jobber adapter
- [x] Implement touch reducer
- [x] Implement Sheets adapter
- [x] Implement CLI commands
- [x] Add tests

## Gates
- [x] Draft quotes fetch live
- [x] Note touch reduction tested
- [x] Sheet init works
- [x] Sync writes at least one verified sample row

## Evidence
- live sample fetch works via `npm run sample`
- tests pass: 3/3
- `npm run sheet:init` created a live spreadsheet
- `SPREADSHEET_ID=<id> QUOTE_LIMIT=10 npm run sync` wrote and read back rows successfully

## Notes
- Full 100-quote fetch exceeds Jobber throttle budget in one query and must be batched/paginated in the next pass.
