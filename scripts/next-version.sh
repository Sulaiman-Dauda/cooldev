#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
PREID="rc"
EXPLICIT_VERSION=""
CURRENT_VERSION=""

fail() { printf '\033[1;31m ✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Print the next semantic version for CoolDev.

Usage:
  bash scripts/next-version.sh <mode> [options]

Modes:
  patch
  minor
  major
  prerelease
  release        Strip the prerelease suffix from the current version.
  set            Use --version <value> exactly.

Options:
  --preid <id>            Prerelease label. Default: rc
  --version <version>     Explicit version for set mode.
  --current <version>     Override the current version instead of reading package.json.
  --help                  Show this help.
EOF
}

[[ -n "$MODE" ]] || { usage; exit 1; }
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --preid) PREID="$2"; shift 2 ;;
    --version) EXPLICIT_VERSION="$2"; shift 2 ;;
    --current) CURRENT_VERSION="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

if [[ -z "$CURRENT_VERSION" ]]; then
  CURRENT_VERSION=$(node -e "console.log(JSON.parse(require('node:fs').readFileSync('package.json','utf8')).version)")
fi

node - <<'NODE' "$CURRENT_VERSION" "$MODE" "$EXPLICIT_VERSION" "$PREID"
const current = process.argv[2]
const mode = process.argv[3]
const explicit = process.argv[4]
const preid = process.argv[5] || 'rc'

function fail(message) {
  console.error(`\u001b[1;31m ✗\u001b[0m ${message}`)
  process.exit(1)
}

function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version)
  if (!match) {
    fail(`Version '${version}' is not a supported semantic version.`)
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  }
}

function render(version) {
  return `${version.major}.${version.minor}.${version.patch}${version.prerelease ? `-${version.prerelease}` : ''}`
}

const parsed = parse(current)
let next = { ...parsed }

switch (mode) {
  case 'patch':
    next.patch += 1
    next.prerelease = ''
    break
  case 'minor':
    next.minor += 1
    next.patch = 0
    next.prerelease = ''
    break
  case 'major':
    next.major += 1
    next.minor = 0
    next.patch = 0
    next.prerelease = ''
    break
  case 'prerelease': {
    if (!parsed.prerelease) {
      next.patch += 1
      next.prerelease = `${preid}.1`
      break
    }

    const prereleaseMatch = new RegExp(`^${preid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d+)$`).exec(parsed.prerelease)
    if (prereleaseMatch) {
      next.prerelease = `${preid}.${Number(prereleaseMatch[1]) + 1}`
      break
    }

    next.prerelease = `${preid}.1`
    break
  }
  case 'release':
    if (!parsed.prerelease) {
      fail('Current version is already a stable release.')
    }
    next.prerelease = ''
    break
  case 'set':
    if (!explicit) {
      fail('set mode requires --version <value>.')
    }
    parse(explicit)
    console.log(explicit)
    process.exit(0)
  default:
    fail(`Unsupported mode '${mode}'.`)
}

console.log(render(next))
NODE
