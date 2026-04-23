# Phase 0 — Contract and Scaffold

## Goal
Freeze scope, runtime choice, and project structure for the draft-quote sales-touch sync.

## Scope
In scope:
- standalone project scaffold
- TODO + phases control surface
- local TypeScript runtime
- Jobber read adapter contract
- Google Sheets writer contract
- test harness for reduction logic

Out of scope:
- dedicated new Jobber app credentials
- deployment
- production scheduling

## Status
complete

## Tasks
- [x] Create project folder
- [x] Create TODO and phases
- [x] Add package/runtime scaffold
- [x] Define initial sheet contract
- [x] Define prototype boundaries

## Gates
- [x] Project control surface exists
- [x] Runtime choice is explicit
- [x] Phase boundaries are explicit

## Pass Criteria
Phase passes when the repo is scaffolded enough to begin implementation without guessing folder or runtime shape.

## Evidence
- `package.json`, `tsconfig.json`, `.gitignore` created
- `README.md`, `TODO.md`, and phase docs aligned to the prototype plan
- Runtime chosen: standalone TypeScript CLI
- Prototype secret posture chosen: existing Jobber auth + local `gog` Sheets lane
