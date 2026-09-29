#!/usr/bin/env bash
# Runs each end-to-end suite against its own throwaway database, so one suite's
# rows can never skew another's totals. Everything is dropped afterwards.
#
#   ./scripts/api-test.sh
#   DATABASE_URL=postgres://postgres:secret@localhost:5432/uzoni ./scripts/api-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] && set -a && . ./.env && set +a
BASE_URL="${DATABASE_URL:-postgres://postgres@localhost:5432/uzoni}"
PORT_BASE="${TEST_PORT:-5199}"

strip_query="${BASE_URL%%\?*}"
query=""
[ "$strip_query" != "$BASE_URL" ] && query="?${BASE_URL#*\?}"
ADMIN_URL="${strip_query%/*}/postgres${query}"

DBS=()
PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  sleep 0.3
  for db in "${DBS[@]:-}"; do
    psql "$ADMIN_URL" -q -c "drop database if exists ${db};" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

run_suite() {
  local suite="$1" offset="$2"
  local db="uzoni_test_$$_${offset}"
  local port=$((PORT_BASE + offset))
  local url="${strip_query%/*}/${db}${query}"

  echo ""
  echo "── $(basename "$suite") ──────────────────────────────────────────"

  psql "$ADMIN_URL" -q -c "create database ${db};"
  DBS+=("$db")
  DATABASE_URL="$url" node server/migrate.js > /dev/null

  DATABASE_URL="$url" PORT="$port" node server/index.js > /dev/null 2>&1 &
  PIDS+=($!)

  for _ in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:${port}/api/health" > /dev/null; then break; fi
    sleep 0.25
  done

  BASE="http://127.0.0.1:${port}" node "$suite"
}

run_suite scripts/api.test.mjs 0
run_suite scripts/insights.test.mjs 1
run_suite scripts/advisor.test.mjs 2
