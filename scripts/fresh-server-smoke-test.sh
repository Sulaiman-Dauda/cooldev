#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_URL="${BOOTSTRAP_URL:-}"
SECURE_URL="${SECURE_URL:-}"
CONTAINER_NAME="${CONTAINER_NAME:-cooldev}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-8}"
NO_DOCKER_CHECKS=false
INSECURE_HTTPS=false

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m !\033[0m %s\n' "$*"; }
fail()  { printf '\033[1;31m ✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
CoolDev fresh-server smoke test

Usage:
  bash scripts/fresh-server-smoke-test.sh [options]

Options:
  --bootstrap-url <url>     Bootstrap URL to verify.
                            Default: http://<server-ip>:3001
  --secure-url <url>        Optional secure domain URL to verify.
  --container <name>        CoolDev container name. Default: cooldev
  --timeout <seconds>       Curl timeout in seconds. Default: 8
  --no-docker-checks        Skip local Docker/container checks.
  --insecure-https          Allow insecure HTTPS when checking --secure-url.
  --help                    Show this help.

Examples:
  bash scripts/fresh-server-smoke-test.sh
  bash scripts/fresh-server-smoke-test.sh --bootstrap-url http://203.0.113.10:3001
  bash scripts/fresh-server-smoke-test.sh \
    --bootstrap-url http://203.0.113.10:3001 \
    --secure-url https://cooldev.example.com
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bootstrap-url) BOOTSTRAP_URL="$2"; shift 2 ;;
    --secure-url) SECURE_URL="$2"; shift 2 ;;
    --container) CONTAINER_NAME="$2"; shift 2 ;;
    --timeout) TIMEOUT_SECONDS="$2"; shift 2 ;;
    --no-docker-checks) NO_DOCKER_CHECKS=true; shift ;;
    --insecure-https) INSECURE_HTTPS=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

resolve_default_bootstrap_url() {
  if [[ -n "$BOOTSTRAP_URL" ]]; then
    return
  fi

  local server_ip
  server_ip=$(hostname -I | awk '{print $1}')
  [[ -n "$server_ip" ]] || fail "Could not determine the server IP address automatically. Use --bootstrap-url."
  BOOTSTRAP_URL="http://${server_ip}:3001"
}

require_local_tools() {
  command -v curl >/dev/null 2>&1 || fail "curl is required for the smoke test."
  command -v grep >/dev/null 2>&1 || fail "grep is required for the smoke test."

  if [[ "$NO_DOCKER_CHECKS" == "false" ]]; then
    command -v docker >/dev/null 2>&1 || fail "docker is required unless you pass --no-docker-checks."
  fi
}

check_cooldev_container() {
  info "Checking the local CoolDev container …"

  docker info >/dev/null 2>&1 || fail "Docker is not available on this server."
  docker ps --format '{{.Names}}' | grep -Fx "$CONTAINER_NAME" >/dev/null \
    || fail "Container '${CONTAINER_NAME}' is not running."

  ok "CoolDev container is running"
}

check_runtime_mounts() {
  info "Checking runtime mounts …"

  local mounts
  mounts=$(docker inspect "$CONTAINER_NAME" --format '{{range .Mounts}}{{println .Destination}}{{end}}')

  grep -Fx '/var/lib/cooldev' <<<"$mounts" >/dev/null \
    || fail "The CoolDev data mount is missing inside the container."
  grep -Fx '/var/run/docker.sock' <<<"$mounts" >/dev/null \
    || fail "The Docker socket mount is missing inside the container."
  grep -Fx '/var/lib/cooldev/platform-proxy' <<<"$mounts" >/dev/null \
    || fail "The managed proxy config mount is missing inside the container."

  ok "Runtime mounts look correct"
}

check_runtime_files() {
  info "Checking runtime files …"

  local retries=10
  while [[ $retries -gt 0 ]]; do
    if [[ -f /var/lib/cooldev/cooldev-config.json && -f /var/lib/cooldev/state.json ]]; then
      ok "Runtime files exist"
      return 0
    fi

    sleep 2
    retries=$((retries - 1))
  done

  [[ -f /var/lib/cooldev/cooldev-config.json ]] \
    || fail "/var/lib/cooldev/cooldev-config.json is missing."
  [[ -f /var/lib/cooldev/state.json ]] \
    || fail "/var/lib/cooldev/state.json is missing."
}

check_bootstrap_health() {
  info "Checking bootstrap API health at ${BOOTSTRAP_URL} …"

  local headers_file body_file
  headers_file=$(mktemp)
  body_file=$(mktemp)

  curl -fsS --max-time "$TIMEOUT_SECONDS" -D "$headers_file" -o "$body_file" \
    "${BOOTSTRAP_URL%/}/api/healthz" >/dev/null \
    || fail "Bootstrap health check failed at ${BOOTSTRAP_URL}/api/healthz"

  grep -q '"status":"ok"' "$body_file" \
    || fail "Bootstrap health response did not contain {\"status\":\"ok\"}."
  grep -qi '^Set-Cookie: cooldev_csrf=' "$headers_file" \
    || fail "Bootstrap health response did not set the CSRF cookie."

  rm -f "$headers_file" "$body_file"
  ok "Bootstrap API health is good"
}

check_bootstrap_ui() {
  info "Checking the bootstrap UI shell …"

  local body
  body=$(curl -fsS --max-time "$TIMEOUT_SECONDS" "${BOOTSTRAP_URL%/}/simple") \
    || fail "Could not load the CoolDev app shell from ${BOOTSTRAP_URL}/simple"

  grep -q 'CoolDev' <<<"$body" || fail "The CoolDev UI shell did not render the product name."
  grep -qi '<html' <<<"$body" || fail "The CoolDev UI shell did not return an HTML document."

  ok "Bootstrap UI shell is reachable"
}

check_secure_domain() {
  [[ -n "$SECURE_URL" ]] || return 0

  info "Checking secure domain access at ${SECURE_URL} …"

  local curl_args=( -fsS --max-time "$TIMEOUT_SECONDS" )
  if [[ "$INSECURE_HTTPS" == "true" ]]; then
    curl_args+=( -k )
  fi

  local body
  body=$(curl "${curl_args[@]}" "${SECURE_URL%/}/api/healthz") \
    || fail "Secure-domain health check failed at ${SECURE_URL}/api/healthz"

  grep -q '"status":"ok"' <<<"$body" \
    || fail "Secure-domain health response did not contain {\"status\":\"ok\"}."

  ok "Secure-domain API health is good"
}

print_summary() {
  echo
  echo "Smoke test passed:"
  echo "- Bootstrap URL: ${BOOTSTRAP_URL}"
  if [[ -n "$SECURE_URL" ]]; then
    echo "- Secure domain: ${SECURE_URL}"
  fi
  if [[ "$NO_DOCKER_CHECKS" == "false" ]]; then
    echo "- Container: ${CONTAINER_NAME}"
  fi
  echo
}

resolve_default_bootstrap_url
require_local_tools

if [[ "$NO_DOCKER_CHECKS" == "false" ]]; then
  check_cooldev_container
  check_runtime_mounts
  check_runtime_files
fi

check_bootstrap_health
check_bootstrap_ui
check_secure_domain
print_summary
