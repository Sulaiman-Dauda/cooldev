#!/usr/bin/env bash
set -euo pipefail

RANGE=""
FROM_REF=""
TO_REF=""
ALLOW_MERGE_COMMITS=true
ALLOW_REVERT_COMMITS=true

fail() { printf '\033[1;31m ✗\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }

usage() {
  cat <<'EOF'
Validate commit subjects against a conventional-commit policy.

Usage:
  bash scripts/check-conventional-commits.sh [options]

Options:
  --range <ref..ref>      Explicit git revision range.
  --from <ref>            Base ref.
  --to <ref>              Head ref.
  --no-allow-merge        Fail on merge commits.
  --no-allow-revert       Fail on git-generated revert commits.
  --help                  Show this help.

Accepted conventional types:
  build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test

Examples:
  bash scripts/check-conventional-commits.sh --range origin/main..HEAD
  bash scripts/check-conventional-commits.sh --from <base-sha> --to <head-sha>
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --range) RANGE="$2"; shift 2 ;;
    --from) FROM_REF="$2"; shift 2 ;;
    --to) TO_REF="$2"; shift 2 ;;
    --no-allow-merge) ALLOW_MERGE_COMMITS=false; shift ;;
    --no-allow-revert) ALLOW_REVERT_COMMITS=false; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

command -v git >/dev/null 2>&1 || fail "git is required."

if [[ -z "$RANGE" ]]; then
  if [[ -n "$FROM_REF" && -n "$TO_REF" ]]; then
    RANGE="${FROM_REF}..${TO_REF}"
  else
    fail "Provide --range or both --from and --to."
  fi
fi

conventional_regex='^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^)]+\))?(!)?: .+'
merge_regex='^Merge '
revert_regex='^Revert "'
mapfile -t commits < <(git log --no-color --format='%H%x09%s' "$RANGE")

if [[ ${#commits[@]} -eq 0 ]]; then
  ok "No commits found for range ${RANGE}"
  exit 0
fi

invalid_commits=()
for commit in "${commits[@]}"; do
  sha=${commit%%$'\t'*}
  subject=${commit#*$'\t'}

  if [[ "$ALLOW_MERGE_COMMITS" == "true" && "$subject" =~ $merge_regex ]]; then
    continue
  fi

  if [[ "$ALLOW_REVERT_COMMITS" == "true" && "$subject" =~ $revert_regex ]]; then
    continue
  fi

  if [[ "$subject" =~ $conventional_regex ]]; then
    continue
  fi

  invalid_commits+=("${sha:0:12}  ${subject}")
done

if [[ ${#invalid_commits[@]} -gt 0 ]]; then
  echo "Commit subjects must follow the conventional-commit pattern:" >&2
  echo "  type(scope): summary" >&2
  echo >&2
  echo "Allowed types: build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test" >&2
  echo >&2
  echo "Invalid commits:" >&2
  for item in "${invalid_commits[@]}"; do
    echo "  - ${item}" >&2
  done
  exit 1
fi

ok "All commit subjects in ${RANGE} match the conventional-commit policy"
