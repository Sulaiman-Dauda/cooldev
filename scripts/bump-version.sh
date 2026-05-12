#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
DRY_RUN=false
PREID="rc"
EXPLICIT_VERSION=""

fail() { printf '\033[1;31m ✗\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }

usage() {
  cat <<'EOF'
Bump the CoolDev package version without creating a git tag.

Usage:
  bash scripts/bump-version.sh <mode> [options]

Modes:
  patch
  minor
  major
  prerelease
  release
  set

Options:
  --preid <id>            Prerelease label. Default: rc
  --version <version>     Explicit version for set mode.
  --dry-run               Print the next version without changing files.
  --help                  Show this help.

Examples:
  bash scripts/bump-version.sh patch
  bash scripts/bump-version.sh prerelease --preid rc
  bash scripts/bump-version.sh set --version 1.0.0
EOF
}

[[ -n "$MODE" ]] || { usage; exit 1; }
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --preid) PREID="$2"; shift 2 ;;
    --version) EXPLICIT_VERSION="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

CURRENT_VERSION=$(node -e "console.log(JSON.parse(require('node:fs').readFileSync('package.json','utf8')).version)")
NEXT_VERSION_ARGS=("$MODE" --preid "$PREID" --current "$CURRENT_VERSION")
if [[ -n "$EXPLICIT_VERSION" ]]; then
  NEXT_VERSION_ARGS+=(--version "$EXPLICIT_VERSION")
fi
NEXT_VERSION=$(bash scripts/next-version.sh "${NEXT_VERSION_ARGS[@]}")

if [[ "$DRY_RUN" == "true" ]]; then
  info "Dry run complete"
  echo "Current: $CURRENT_VERSION"
  echo "Next:    $NEXT_VERSION"
  exit 0
fi

info "Bumping version from $CURRENT_VERSION to $NEXT_VERSION …"
npm version "$NEXT_VERSION" --no-git-tag-version >/dev/null
ok "Updated package.json and package-lock.json"
echo "$NEXT_VERSION"
