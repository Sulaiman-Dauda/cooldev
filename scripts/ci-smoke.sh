#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3010}"
HOST="${HOST:-127.0.0.1}"
WITH_BUILD=false
LOG_FILE="${LOG_FILE:-/tmp/cooldev-ci-smoke.log}"

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }
fail()  { printf '\033[1;31m ✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Start the built CoolDev server locally and run the fresh-server smoke test
against it without Docker-specific checks.

Usage:
  bash scripts/ci-smoke.sh [options]

Options:
  --with-build          Run npm run build before starting the server.
  --port <n>            Port for the local smoke server. Default: 3010
  --host <host>         Host for the local smoke server. Default: 127.0.0.1
  --log-file <path>     Server log path. Default: /tmp/cooldev-ci-smoke.log
  --help                Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-build) WITH_BUILD=true; shift ;;
    --port) PORT="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --log-file) LOG_FILE="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

if [[ "$WITH_BUILD" == "true" ]]; then
  info "Building CoolDev …"
  npm run build
fi

[[ -f dist/server/index.js ]] || fail "dist/server/index.js is missing. Run npm run build first or pass --with-build."
[[ -f dist/client/index.html ]] || fail "dist/client/index.html is missing. Run npm run build first or pass --with-build."

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

info "Starting the built CoolDev server on http://${HOST}:${PORT} …"
PORT="$PORT" HOST="$HOST" NODE_ENV=production node dist/server/index.js >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://${HOST}:${PORT}/api/healthz" >/dev/null 2>&1; then
    ok "CoolDev server is reachable"
    bash scripts/fresh-server-smoke-test.sh \
      --bootstrap-url "http://${HOST}:${PORT}" \
      --no-docker-checks
    exit 0
  fi
  sleep 1
done

warn_message="The built server did not become healthy in time."
echo "$warn_message" >&2
if [[ -f "$LOG_FILE" ]]; then
  echo "--- ${LOG_FILE} ---" >&2
  cat "$LOG_FILE" >&2
fi
fail "$warn_message"
