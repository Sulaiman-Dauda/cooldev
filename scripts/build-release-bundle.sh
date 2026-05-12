#!/usr/bin/env bash
set -euo pipefail

VERSION_OVERRIDE=""
OUTPUT_DIR="dist/release"
RELEASE_NOTES_FILE=""
CHANGELOG_FILE=""
SBOM_FILE=""
SCAN_REPORT_FILE=""
REPOSITORY_OVERRIDE=""
IMAGE_OVERRIDE=""
INSTALLER_URL_OVERRIDE=""

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }
fail()  { printf '\033[1;31m ✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Build a release bundle containing the files needed to ship CoolDev.

Usage:
  bash scripts/build-release-bundle.sh [options]

Options:
  --version <version>       Override the bundle version label.
  --output-dir <path>       Output directory. Default: dist/release
  --repository <owner/repo> Public GitHub repository for this release.
  --image <image-ref>       Versioned public image for this release.
  --installer-url <url>     Public installer asset URL for this release.
  --release-notes <path>    Optional release-notes file to include.
  --changelog <path>        Optional changelog file to include.
  --sbom <path>             Optional SBOM file to include.
  --scan-report <path>      Optional vulnerability scan report to include.
  --help                    Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION_OVERRIDE="$2"; shift 2 ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --repository) REPOSITORY_OVERRIDE="$2"; shift 2 ;;
    --image) IMAGE_OVERRIDE="$2"; shift 2 ;;
    --installer-url) INSTALLER_URL_OVERRIDE="$2"; shift 2 ;;
    --release-notes) RELEASE_NOTES_FILE="$2"; shift 2 ;;
    --changelog) CHANGELOG_FILE="$2"; shift 2 ;;
    --sbom) SBOM_FILE="$2"; shift 2 ;;
    --scan-report) SCAN_REPORT_FILE="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

VERSION="$VERSION_OVERRIDE"
if [[ -z "$VERSION" ]]; then
  VERSION=$(node -e "console.log(JSON.parse(require('node:fs').readFileSync('package.json','utf8')).version)")
fi

[[ -n "$VERSION" ]] || fail "Could not determine the bundle version."

infer_repository_from_git() {
  local remote_url=""

  remote_url=$(git config --get remote.origin.url 2>/dev/null || true)
  [[ -n "$remote_url" ]] || return 1

  remote_url="${remote_url#git@github.com:}"
  remote_url="${remote_url#https://github.com/}"
  remote_url="${remote_url#http://github.com/}"
  remote_url="${remote_url%.git}"

  [[ "$remote_url" == */* ]] || return 1
  printf '%s' "$remote_url"
}

resolve_repository() {
  if [[ -n "$REPOSITORY_OVERRIDE" ]]; then
    printf '%s' "$REPOSITORY_OVERRIDE"
    return 0
  fi

  if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    printf '%s' "$GITHUB_REPOSITORY"
    return 0
  fi

  infer_repository_from_git
}

resolve_image() {
  if [[ -n "$IMAGE_OVERRIDE" ]]; then
    printf '%s' "$IMAGE_OVERRIDE"
    return 0
  fi

  local repository=""
  repository=$(resolve_repository || true)
  [[ -n "$repository" ]] || return 1
  printf 'ghcr.io/%s/cooldev:v%s' "${repository%%/*}" "$VERSION"
}

resolve_installer_url() {
  if [[ -n "$INSTALLER_URL_OVERRIDE" ]]; then
    printf '%s' "$INSTALLER_URL_OVERRIDE"
    return 0
  fi

  local repository=""
  repository=$(resolve_repository || true)
  [[ -n "$repository" ]] || return 1
  printf 'https://github.com/%s/releases/download/v%s/install.sh' "$repository" "$VERSION"
}

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'
}

stamp_release_text() {
  local source_path="$1"
  local destination_path="$2"
  local release_image="$3"
  local repository_url="$4"
  local installer_url="$5"

  sed \
    -e 's|COOLDEV_IMAGE="${COOLDEV_IMAGE:-}"|COOLDEV_IMAGE="${COOLDEV_IMAGE:-'"$(escape_sed_replacement "$release_image")"'}"|g' \
    -e 's|^COOLDEV_IMAGE=$|COOLDEV_IMAGE='"$(escape_sed_replacement "$release_image")"'|g' \
    -e "s|https://github.com/acme/cooldev|$(escape_sed_replacement "$repository_url")|g" \
    -e "s|https://github.com/acme/cooldev/releases/download/v1.2.3/install.sh|$(escape_sed_replacement "$installer_url")|g" \
    "$source_path" > "$destination_path"
}

REPOSITORY=$(resolve_repository || true)
[[ -n "$REPOSITORY" ]] || fail "Could not resolve the public GitHub repository. Pass --repository <owner/repo> when building a public release bundle outside a checked-out git repository."

RELEASE_IMAGE=$(resolve_image || true)
[[ -n "$RELEASE_IMAGE" ]] || fail "Could not resolve the public release image. Pass --image <image-ref>."

INSTALLER_URL=$(resolve_installer_url || true)
[[ -n "$INSTALLER_URL" ]] || fail "Could not resolve the public installer URL. Pass --installer-url <url>."

REPOSITORY_URL="https://github.com/${REPOSITORY}"

if [[ ! -f dist/client/index.html || ! -f dist/server/index.js ]]; then
  info "Production build artifacts are missing — running npm run build"
  npm run build
fi

BUNDLE_ROOT="${OUTPUT_DIR}/cooldev-release-bundle-${VERSION}"
ARCHIVE_PATH="${OUTPUT_DIR}/cooldev-release-bundle-${VERSION}.tar.gz"
STAGED_INSTALLER_PATH="${OUTPUT_DIR}/install.sh"
STAGED_ENV_PATH="${OUTPUT_DIR}/.env.example"
STAGED_COMPOSE_PATH="${OUTPUT_DIR}/docker-compose.release.yml"
STAGED_PRODUCTION_RELEASE_DOC="${OUTPUT_DIR}/production-release.md"
STAGED_RELEASE_HARDENING_DOC="${OUTPUT_DIR}/release-hardening.md"

rm -rf "$BUNDLE_ROOT"
mkdir -p "$BUNDLE_ROOT/dist" "$BUNDLE_ROOT/docs" "$OUTPUT_DIR"

stamp_release_text .env.example "$BUNDLE_ROOT/.env.example" "$RELEASE_IMAGE" "$REPOSITORY_URL" "$INSTALLER_URL"
cp Dockerfile.release "$BUNDLE_ROOT/Dockerfile.release"
cp docker-compose.release.yml "$BUNDLE_ROOT/docker-compose.release.yml"
stamp_release_text install.sh "$BUNDLE_ROOT/install.sh" "$RELEASE_IMAGE" "$REPOSITORY_URL" "$INSTALLER_URL"
cp README.md "$BUNDLE_ROOT/README.md"
cp CHANGELOG.md "$BUNDLE_ROOT/CHANGELOG.md"
cp package.json "$BUNDLE_ROOT/package.json"
cp package-lock.json "$BUNDLE_ROOT/package-lock.json"
stamp_release_text docs/production-release.md "$BUNDLE_ROOT/docs/production-release.md" "$RELEASE_IMAGE" "$REPOSITORY_URL" "$INSTALLER_URL"
cp docs/deployment-diagram.md "$BUNDLE_ROOT/docs/deployment-diagram.md"
cp docs/release-versioning.md "$BUNDLE_ROOT/docs/release-versioning.md"
cp docs/commit-conventions.md "$BUNDLE_ROOT/docs/commit-conventions.md"
cp docs/release-checklist.md "$BUNDLE_ROOT/docs/release-checklist.md"
stamp_release_text docs/release-hardening.md "$BUNDLE_ROOT/docs/release-hardening.md" "$RELEASE_IMAGE" "$REPOSITORY_URL" "$INSTALLER_URL"
cp scripts/fresh-server-smoke-test.sh "$BUNDLE_ROOT/fresh-server-smoke-test.sh"
cp -R dist/client "$BUNDLE_ROOT/dist/client"
cp -R dist/server "$BUNDLE_ROOT/dist/server"

cp "$BUNDLE_ROOT/install.sh" "$STAGED_INSTALLER_PATH"
cp "$BUNDLE_ROOT/.env.example" "$STAGED_ENV_PATH"
cp "$BUNDLE_ROOT/docker-compose.release.yml" "$STAGED_COMPOSE_PATH"
cp "$BUNDLE_ROOT/docs/production-release.md" "$STAGED_PRODUCTION_RELEASE_DOC"
cp "$BUNDLE_ROOT/docs/release-hardening.md" "$STAGED_RELEASE_HARDENING_DOC"

if [[ -n "$RELEASE_NOTES_FILE" && -f "$RELEASE_NOTES_FILE" ]]; then
  cp "$RELEASE_NOTES_FILE" "$BUNDLE_ROOT/docs/release-notes.md"
fi

if [[ -n "$CHANGELOG_FILE" && -f "$CHANGELOG_FILE" ]]; then
  cp "$CHANGELOG_FILE" "$BUNDLE_ROOT/docs/changelog.md"
fi

if [[ -n "$SBOM_FILE" && -f "$SBOM_FILE" ]]; then
  cp "$SBOM_FILE" "$BUNDLE_ROOT/docs/sbom.spdx.json"
fi

if [[ -n "$SCAN_REPORT_FILE" && -f "$SCAN_REPORT_FILE" ]]; then
  cp "$SCAN_REPORT_FILE" "$BUNDLE_ROOT/docs/vulnerability-scan.sarif"
fi

cat > "$BUNDLE_ROOT/VERSION" <<EOF
${VERSION}
EOF

tar -czf "$ARCHIVE_PATH" -C "$OUTPUT_DIR" "cooldev-release-bundle-${VERSION}"
ok "Release bundle written to ${ARCHIVE_PATH}"
