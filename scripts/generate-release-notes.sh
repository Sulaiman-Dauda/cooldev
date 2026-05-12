#!/usr/bin/env bash
set -euo pipefail

CURRENT_REF=""
PREVIOUS_REF=""
VERSION=""
OUTPUT_FILE=""
FORMAT="release"
REPOSITORY_SLUG="${GITHUB_REPOSITORY:-}"
INCLUDE_COMPARE=true

fail() { printf '\033[1;31m ✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Generate release notes or a changelog section from git history.

Usage:
  bash scripts/generate-release-notes.sh [options]

Options:
  --current-ref <ref>     Current git ref. Default: HEAD
  --previous-ref <ref>    Previous git ref. Auto-detected from tags when omitted.
  --version <version>     Version label to print. Default: package.json version
  --format <type>         release | changelog. Default: release
  --output <path>         Write the result to a file instead of stdout.
  --repo <owner/repo>     Repository slug for compare links.
  --no-compare-link       Do not include a compare link.
  --help                  Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --current-ref) CURRENT_REF="$2"; shift 2 ;;
    --previous-ref) PREVIOUS_REF="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
    --output) OUTPUT_FILE="$2"; shift 2 ;;
    --repo) REPOSITORY_SLUG="$2"; shift 2 ;;
    --no-compare-link) INCLUDE_COMPARE=false; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

command -v git >/dev/null 2>&1 || fail "git is required to generate release notes."
command -v node >/dev/null 2>&1 || fail "node is required to generate release notes."

CURRENT_REF="${CURRENT_REF:-HEAD}"
VERSION="${VERSION:-$(node -e "console.log(JSON.parse(require('node:fs').readFileSync('package.json','utf8')).version)")}"

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || fail "Run this script inside the CoolDev git repository."
cd "$GIT_ROOT"

if [[ -z "$PREVIOUS_REF" ]]; then
  if git rev-parse --verify "${CURRENT_REF}^{tag}" >/dev/null 2>&1; then
    PREVIOUS_REF=$(git describe --tags --abbrev=0 "${CURRENT_REF}^" 2>/dev/null || true)
  else
    PREVIOUS_REF=$(git describe --tags --abbrev=0 "$CURRENT_REF" 2>/dev/null || true)
  fi
fi

RANGE="$CURRENT_REF"
if [[ -n "$PREVIOUS_REF" ]]; then
  RANGE="${PREVIOUS_REF}..${CURRENT_REF}"
fi

TMP_JS=$(mktemp)
trap 'rm -f "$TMP_JS"' EXIT
cat > "$TMP_JS" <<'NODE'
const fs = require('node:fs')
const version = process.argv[2]
const format = process.argv[3]
const previousRef = process.argv[4]
const currentRef = process.argv[5]
const repository = process.argv[6]
const includeCompare = process.argv[7] === 'true'
const raw = fs.readFileSync(0, 'utf8').trim()
const lines = raw ? raw.split(/\n+/) : []

const groups = {
  breaking: [],
  features: [],
  fixes: [],
  security: [],
  performance: [],
  refactors: [],
  docs: [],
  tests: [],
  maintenance: [],
  others: [],
}

const normalizeSubject = (subject) => subject
  .replace(/^[a-zA-Z]+(?:\([^)]+\))?!?:\s*/, '')
  .replace(/^./, (value) => value.toUpperCase())

for (const line of lines) {
  const [, short, ...subjectParts] = line.split('\t')
  const subject = subjectParts.join('\t').trim()
  if (!subject) continue

  const clean = normalizeSubject(subject)
  const entry = `- ${clean} (${short})`

  if (/^[a-zA-Z]+(?:\([^)]+\))?!:/.test(subject) || /BREAKING CHANGE/i.test(subject)) {
    groups.breaking.push(entry)
  } else if (/^(feat)(?:\([^)]+\))?:/i.test(subject)) {
    groups.features.push(entry)
  } else if (/^(fix)(?:\([^)]+\))?:/i.test(subject)) {
    groups.fixes.push(entry)
  } else if (/^(sec|security)(?:\([^)]+\))?:/i.test(subject) || /security/i.test(subject)) {
    groups.security.push(entry)
  } else if (/^(perf)(?:\([^)]+\))?:/i.test(subject)) {
    groups.performance.push(entry)
  } else if (/^(refactor)(?:\([^)]+\))?:/i.test(subject)) {
    groups.refactors.push(entry)
  } else if (/^(docs)(?:\([^)]+\))?:/i.test(subject)) {
    groups.docs.push(entry)
  } else if (/^(test)(?:\([^)]+\))?:/i.test(subject)) {
    groups.tests.push(entry)
  } else if (/^(build|ci|chore)(?:\([^)]+\))?:/i.test(subject)) {
    groups.maintenance.push(entry)
  } else {
    groups.others.push(entry)
  }
}

const date = new Date().toISOString().slice(0, 10)
const sectionTitle = format === 'changelog'
  ? `## v${version} - ${date}`
  : `# Release notes for v${version}`
const output = [sectionTitle, '']

if (format === 'release') {
  output.push(`Generated on ${date}.`, '')
}

if (includeCompare && repository && previousRef && currentRef && previousRef !== currentRef) {
  const previousLabel = previousRef.replace(/^refs\/tags\//, '')
  const currentLabel = currentRef.replace(/^refs\/tags\//, '')
  output.push(`[Compare changes](https://github.com/${repository}/compare/${previousLabel}...${currentLabel})`, '')
}

const sections = [
  ['Breaking changes', groups.breaking],
  ['Features', groups.features],
  ['Fixes', groups.fixes],
  ['Security', groups.security],
  ['Performance', groups.performance],
  ['Refactors', groups.refactors],
  ['Docs', groups.docs],
  ['Tests', groups.tests],
  ['Maintenance', groups.maintenance],
  ['Other changes', groups.others],
]

let hasChanges = false
for (const [title, entries] of sections) {
  if (!entries.length) continue
  hasChanges = true
  output.push(`### ${title}`, '', ...entries, '')
}

if (!hasChanges) {
  output.push('No changes were detected in this release range.', '')
}

process.stdout.write(output.join('\n').trimEnd() + '\n')
NODE

RESULT=$(git log --no-merges --pretty=format:'%H%x09%h%x09%s' "$RANGE" | node "$TMP_JS" "$VERSION" "$FORMAT" "$PREVIOUS_REF" "$CURRENT_REF" "$REPOSITORY_SLUG" "$INCLUDE_COMPARE")

if [[ -n "$OUTPUT_FILE" ]]; then
  mkdir -p "$(dirname "$OUTPUT_FILE")"
  printf '%s\n' "$RESULT" > "$OUTPUT_FILE"
else
  printf '%s\n' "$RESULT"
fi
