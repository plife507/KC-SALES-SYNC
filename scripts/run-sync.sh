#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${LOG_DIR:-$PROJECT_DIR/logs}"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

: "${SPREADSHEET_ID:?Missing SPREADSHEET_ID}"

export SHEET_TAB="${SHEET_TAB:-Draft Quote Sales Touch}"
export QUOTE_LIMIT="${QUOTE_LIMIT:-100}"
export QUOTE_PAGE_SIZE="${QUOTE_PAGE_SIZE:-10}"

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"

{
  echo "[$STAMP] starting sync"
  /usr/bin/npm run sync
  echo "[$STAMP] sync complete"
} >> "$LOG_DIR/sync.log" 2>&1
