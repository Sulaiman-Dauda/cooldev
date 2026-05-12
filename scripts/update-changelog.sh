#!/usr/bin/env bash
set -euo pipefail

CHANGELOG_FILE="CHANGELOG.md"
CURRENT_REF=""
PREVIOUS_REF=""
VERSION=""
DRY_RUN=false

fail() { printf '\033[1;31m ✗\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }

usage() {
  cat <<'EOF'
Prepend a generated release section to CHANGELOG.md.

Usage:
  bash scripts/update-changelog.sh [options]

Options:
  --file <path>           Changelog file. Default: CHANGELOG.md
  --current-ref <ref>     Current git ref. Default: HEAD
  --previous-ref <ref>    Previous git ref. Auto-detected when omitted.
  --version <version>     Version label. Default: package.json version
  --dry-run               Print the generated changelog section only.
  --help                  Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) CHANGELOG_FILE="$2"; shift 2 ;;
    --current-ref) CURRENT_REF="$2"; shift 2 ;;
    --previous-ref) PREVIOUS_REF="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

VERSION="${VERSION:-$(node -e "console.log(JSON.parse(require('node:fs').readFileSync('package.json','utf8')).version)")}"
CURRENT_REF="${CURRENT_REF:-HEAD}"

SECTION_FILE=$(mktemp)
trap 'rm -f "$SECTION_FILE"' EXIT
GENERATE_ARGS=(
  --format changelog
  --current-ref "$CURRENT_REF"
  --version "$VERSION"
  --output "$SECTION_FILE"
)
if [[ -n "$PREVIOUS_REF" ]]; then
  GENERATE_ARGS+=(--previous-ref "$PREVIOUS_REF")
fi
bash scripts/generate-release-notes.sh "${GENERATE_ARGS[@]}"

if [[ "$DRY_RUN" == "true" ]]; then
  cat "$SECTION_FILE"
  exit 0
fi

HEADER="# Changelog\n\nGenerated from git history by scripts/update-changelog.sh.\n\n"
if [[ ! -f "$CHANGELOG_FILE" ]]; then
  printf "%b" "$HEADER" > "$CHANGELOG_FILE"
fi

grep -Fq "## v${VERSION} " "$CHANGELOG_FILE" && fail "CHANGELOG already contains v${VERSION}."

TMP_FILE=$(mktemp)
trap 'rm -f "$SECTION_FILE" "$TMP_FILE"' EXIT
{
  printf "%b" "$HEADER"
  cat "$SECTION_FILE"
  echo
  if [[ -f "$CHANGELOG_FILE" ]]; then
    awk 'NR>3 { print }' "$CHANGELOG_FILE"
  fi
} > "$TMP_FILE"

mv "$TMP_FILE" "$CHANGELOG_FILE"
ok "Updated $CHANGELOG_FILE"
