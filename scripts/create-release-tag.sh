#!/usr/bin/env bash
set -euo pipefail

PUSH_TAG=false
ALLOW_DIRTY=false
SKIP_CHECKS=false
DRY_RUN=false
REMOTE_NAME="origin"

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }
fail()  { printf '\033[1;31m ✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Create a release tag for CoolDev.

Usage:
  bash scripts/create-release-tag.sh [options]

Options:
  --push                Push the created tag after creation.
  --remote <name>       Git remote to push to. Default: origin
  --allow-dirty         Allow uncommitted changes.
  --skip-checks         Skip test/build/syntax checks before tagging.
  --dry-run             Print what would happen without creating the tag.
  --help                Show this help.

Expected flow:
  1. Bump package.json version.
  2. Generate release notes and update CHANGELOG.md.
  3. Commit the version change.
  4. Run this script.
  5. Push the tag or pass --push.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push) PUSH_TAG=true; shift ;;
    --remote) REMOTE_NAME="$2"; shift 2 ;;
    --allow-dirty) ALLOW_DIRTY=true; shift ;;
    --skip-checks) SKIP_CHECKS=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

command -v git >/dev/null 2>&1 || fail "git is required to create release tags."
command -v node >/dev/null 2>&1 || fail "node is required to read the package version."

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || fail "Run this script inside the CoolDev git repository."
cd "$GIT_ROOT"

VERSION=$(node -e "console.log(JSON.parse(require('node:fs').readFileSync('package.json','utf8')).version)")
[[ -n "$VERSION" ]] || fail "Could not read package.json version."
[[ "$VERSION" != "0.0.0" ]] || fail "package.json still uses the placeholder version 0.0.0. Bump it before tagging."
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] || fail "package.json version '$VERSION' is not a supported release version."

TAG="v${VERSION}"

if [[ "$ALLOW_DIRTY" == "false" ]]; then
  [[ -z "$(git status --porcelain)" ]] \
    || fail "Working tree is not clean. Commit or stash changes before tagging."
fi

git rev-parse "$TAG" >/dev/null 2>&1 && fail "Git tag '$TAG' already exists."
[[ -f CHANGELOG.md ]] || fail "CHANGELOG.md is missing. Generate and commit it before tagging."
grep -Eq "^## v${VERSION}( |-)" CHANGELOG.md \
  || fail "CHANGELOG.md does not contain an entry for v${VERSION}. Run: npm run changelog:update -- --current-ref HEAD --version ${VERSION}"

if [[ "$SKIP_CHECKS" == "false" ]]; then
  info "Running release checks …"
  npm test
  npm run build
  bash -n install.sh
  bash -n scripts/fresh-server-smoke-test.sh
  bash -n scripts/next-version.sh
  bash -n scripts/bump-version.sh
  bash -n scripts/generate-release-notes.sh
  bash -n scripts/update-changelog.sh
  bash -n scripts/check-conventional-commits.sh
  bash -n scripts/check-changelog.sh
  ok "Release checks passed"
fi

if [[ "$DRY_RUN" == "true" ]]; then
  info "Dry run complete"
  echo "Version: $VERSION"
  echo "Tag:     $TAG"
  echo "Push:    $PUSH_TAG"
  echo "Remote:  $REMOTE_NAME"
  exit 0
fi

info "Creating annotated tag $TAG …"
git tag -a "$TAG" -m "Release $TAG"
ok "Created $TAG"

if [[ "$PUSH_TAG" == "true" ]]; then
  info "Pushing $TAG to $REMOTE_NAME …"
  git push "$REMOTE_NAME" "$TAG"
  ok "Pushed $TAG"
else
  info "Tag created locally. Push it with: git push $REMOTE_NAME $TAG"
fi
