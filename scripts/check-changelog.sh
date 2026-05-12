#!/usr/bin/env bash
set -euo pipefail

RANGE=""
FROM_REF=""
TO_REF=""
CHANGELOG_FILE="CHANGELOG.md"
PACKAGE_FILE="package.json"

fail() { printf '\033[1;31m ✗\033[0m %s\n' "$*" >&2; exit 1; }
ok()   { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }

usage() {
  cat <<'EOF'
Check whether CHANGELOG.md was updated when the package version changed.

Usage:
  bash scripts/check-changelog.sh [options]

Options:
  --range <ref..ref>      Explicit git revision range.
  --from <ref>            Base ref.
  --to <ref>              Head ref.
  --file <path>           Changelog file. Default: CHANGELOG.md
  --package <path>        Package file. Default: package.json
  --help                  Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --range) RANGE="$2"; shift 2 ;;
    --from) FROM_REF="$2"; shift 2 ;;
    --to) TO_REF="$2"; shift 2 ;;
    --file) CHANGELOG_FILE="$2"; shift 2 ;;
    --package) PACKAGE_FILE="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

command -v git >/dev/null 2>&1 || fail "git is required."
command -v node >/dev/null 2>&1 || fail "node is required."

if [[ -z "$RANGE" ]]; then
  if [[ -n "$FROM_REF" && -n "$TO_REF" ]]; then
    RANGE="${FROM_REF}..${TO_REF}"
  else
    fail "Provide --range or both --from and --to."
  fi
fi

if [[ -z "$FROM_REF" || -z "$TO_REF" ]]; then
  FROM_REF="${RANGE%%..*}"
  TO_REF="${RANGE##*..}"
fi

changed_files=$(git diff --name-only "$RANGE")
if ! grep -Fxq "$PACKAGE_FILE" <<<"$changed_files"; then
  ok "${PACKAGE_FILE} did not change in ${RANGE}; changelog gating not required"
  exit 0
fi

base_version=$(git show "${FROM_REF}:${PACKAGE_FILE}" 2>/dev/null | node -e "const fs=require('node:fs'); const raw=fs.readFileSync(0,'utf8'); console.log(JSON.parse(raw).version)") || fail "Could not read ${PACKAGE_FILE} from ${FROM_REF}."
head_version=$(git show "${TO_REF}:${PACKAGE_FILE}" 2>/dev/null | node -e "const fs=require('node:fs'); const raw=fs.readFileSync(0,'utf8'); console.log(JSON.parse(raw).version)") || fail "Could not read ${PACKAGE_FILE} from ${TO_REF}."

if [[ "$base_version" == "$head_version" ]]; then
  ok "${PACKAGE_FILE} changed but the version stayed at ${head_version}; changelog gating not required"
  exit 0
fi

if ! grep -Fxq "$CHANGELOG_FILE" <<<"$changed_files"; then
  fail "The version changed from ${base_version} to ${head_version}, but ${CHANGELOG_FILE} was not updated. Run: npm run changelog:update -- --current-ref ${TO_REF} --version ${head_version}"
fi

if [[ ! -f "$CHANGELOG_FILE" ]]; then
  fail "${CHANGELOG_FILE} is missing in the current checkout."
fi

grep -Eq "^## v${head_version}( |-)" "$CHANGELOG_FILE" \
  || fail "${CHANGELOG_FILE} was changed, but it does not contain a section for v${head_version}."

ok "${CHANGELOG_FILE} contains an entry for v${head_version}"
