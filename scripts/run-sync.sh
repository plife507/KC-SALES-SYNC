#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${LOG_DIR:-$PROJECT_DIR/logs}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.local}"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${SPREADSHEET_ID:?Missing SPREADSHEET_ID}"
if [[ -z "${JOBBER_ACCESS_TOKEN:-}" ]]; then
  : "${JOBBER_CLIENT_ID:?Missing JOBBER_CLIENT_ID}"
  : "${JOBBER_CLIENT_SECRET:?Missing JOBBER_CLIENT_SECRET}"
  : "${JOBBER_REFRESH_TOKEN:?Missing JOBBER_REFRESH_TOKEN}"
fi

export SHEET_TAB="${SHEET_TAB:-Draft Quote Sales Touch}"
export QUOTE_LIMIT="${QUOTE_LIMIT:-100}"
export QUOTE_PAGE_SIZE="${QUOTE_PAGE_SIZE:-5}"

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"

{
  echo "[$STAMP] starting sync"
  /usr/bin/npm run sync
  echo "[$STAMP] sync complete"
} >> "$LOG_DIR/sync.log" 2>&1
