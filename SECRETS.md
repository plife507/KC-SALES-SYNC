# kc-sales-sync local secret wiring

## Source of truth

Preferred canonical location:
- `~/.secrets/aya/kc-sales-sync.env`

## Repo contract

- `.env.example` documents expected variables
- local `.env.local` may exist for runtime convenience
- repo is not the source of truth for live credentials

## Approved wiring methods

- symlink `.env.local` -> `~/.secrets/aya/kc-sales-sync.env`
- generated/copied local `.env.local`
- Cloud Run deploy tooling may inject the same variables outside git

## Rule

Any change to runtime env expectations should update `.env.example` and this note.

## Pacific-time default

For Cloud Run and local ops, set:

- `TZ=America/Los_Angeles`
