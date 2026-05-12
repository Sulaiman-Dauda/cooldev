#!/usr/bin/env bash
# CoolDev installer — provisions the full CoolDev product and its managed
# platform together.
# Run the published release installer asset as root on a fresh Debian/Ubuntu server.
#
# Public flags:
#   --port <n>      Port CoolDev should listen on for bootstrap access (default: 3001)
#
# Hidden/internal flags:
#   --no-platform-install
#   --image-source-dir <path>
#   --platform-url <url>
#   --platform-token <token>
#
set -euo pipefail

COOLDEV_PORT="${COOLDEV_PORT:-3001}"
INSTALL_PLATFORM=true
PLATFORM_HEALTH_URL="${COOLDEV_PLATFORM_HEALTH_URL:-http://127.0.0.1:8000}"
PLATFORM_INTERNAL_URL="${COOLDEV_PLATFORM_BASE_URL:-http://coolify:8080}"
PLATFORM_API_TOKEN="${COOLDEV_PLATFORM_API_TOKEN:-}"
COOLDEV_IMAGE="${COOLDEV_IMAGE:-}"
IMAGE_SOURCE_DIR="${COOLDEV_IMAGE_SOURCE_DIR:-}"
LOCAL_BUILD_CONTEXT=""
LOCAL_BUILD_DOCKERFILE=""
SERVER_IP=""
BOOTSTRAP_URL=""

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m !\033[0m %s\n' "$*"; }
fail()  { printf '\033[1;31m ✗\033[0m %s\n' "$*" >&2; exit 1; }

script_dir() {
  local source_path="${BASH_SOURCE[0]:-}"

  if [[ -z "$source_path" || ! -e "$source_path" ]]; then
    return 1
  fi

  cd "$(dirname "$source_path")" >/dev/null 2>&1 && pwd
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) COOLDEV_PORT="$2"; shift 2 ;;
    --image-source-dir) IMAGE_SOURCE_DIR="$2"; shift 2 ;;
    --platform-url) PLATFORM_INTERNAL_URL="$2"; PLATFORM_HEALTH_URL="$2"; shift 2 ;;
    --platform-token) PLATFORM_API_TOKEN="$2"; shift 2 ;;
    --no-platform-install) INSTALL_PLATFORM=false; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

require_root() {
  if [[ $EUID -ne 0 ]]; then
    fail "This installer must run as root. Try: sudo bash install.sh"
  fi
}

check_docker() {
  info "Checking Docker …"
  if ! command -v docker &>/dev/null; then
    info "Docker not found — installing via get.docker.com"
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
  fi
  docker info &>/dev/null || fail "Docker daemon is not running."
  ok "Docker ready"
}

resolve_server_ip() {
  SERVER_IP=$(hostname -I | awk '{print $1}')
  [[ -n "$SERVER_IP" ]] || fail "Could not determine the server IP address."
  BOOTSTRAP_URL="http://${SERVER_IP}:${COOLDEV_PORT}"
}

install_managed_platform() {
  info "Installing the managed platform …"
  curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
  ok "Managed platform installed"
}

wait_for_platform_health() {
  info "Waiting for the managed platform to become healthy …"
  local retries=40
  while [[ $retries -gt 0 ]]; do
    if curl -sf "${PLATFORM_HEALTH_URL}/api/v1/health" &>/dev/null; then
      ok "Managed platform healthy"
      return 0
    fi
    sleep 3
    retries=$((retries - 1))
  done

  return 1
}

normalize_platform_token() {
  printf '%s' "$1" | tr -d '\r' | tr -d '\n'
}

is_valid_platform_token() {
  local candidate="$1"

  [[ "$candidate" =~ ^[0-9]+\|[^[:space:]]+$ ]]
}

is_release_image_configured() {
  local candidate="$1"

  [[ -n "$candidate" ]]
}

ensure_platform_root_tenant() {
  local platform_container="$1"

  docker exec "$platform_container" php artisan tinker --execute '
$rootUser = App\Models\User::find(0);
if (! $rootUser) {
    $rootUser = (new App\Models\User)->forceFill([
        "id" => 0,
        "name" => "CoolDev System",
        "email" => "cooldev-system@localhost.invalid",
        "password" => Illuminate\Support\Facades\Hash::make(Illuminate\Support\Str::random(64)),
        "email_verified_at" => now(),
        "force_password_reset" => false,
        "marketing_emails" => false,
    ]);
    $rootUser->save();
}

$rootUser = App\Models\User::find(0);
if (! $rootUser) {
    fwrite(STDERR, "Could not create the root Coolify user.\n");
    exit(1);
}

$rootTeam = App\Models\Team::find(0);
if (! $rootTeam) {
    $rootTeam = $rootUser->recreate_personal_team();
}

if (! $rootTeam || (int) $rootTeam->id !== 0) {
    fwrite(STDERR, "Could not create the root Coolify team.\n");
    exit(1);
}

if (! Illuminate\Support\Facades\DB::table("team_user")->where("user_id", 0)->where("team_id", 0)->exists()) {
    Illuminate\Support\Facades\DB::table("team_user")->insert([
        "user_id" => 0,
        "team_id" => 0,
        "role" => "owner",
        "created_at" => now(),
        "updated_at" => now(),
    ]);
}

  $instanceSettings = App\Models\InstanceSettings::find(0);
  if (! $instanceSettings) {
    $instanceSettings = App\Models\InstanceSettings::create([
      "id" => 0,
    ]);
  }

  $instanceSettings->is_api_enabled = true;
  $instanceSettings->save();

$rootTeam->show_boarding = false;
$rootTeam->save();

echo $rootUser->id . "|" . $rootTeam->id;
' 2>/dev/null || true
}

seed_platform_api_token_with_tinker() {
  local platform_container="$1"

  docker exec "$platform_container" php artisan tinker --execute '
$rootUser = App\Models\User::find(0);
$rootTeam = App\Models\Team::find(0);

if (! $rootUser || ! $rootTeam) {
    fwrite(STDERR, "Root Coolify tenant is missing.\n");
    exit(1);
}

$tokenName = "CoolDev";
$rootUser->tokens()
    ->where("name", $tokenName)
    ->where("team_id", 0)
    ->delete();

$tokenEntropy = Illuminate\Support\Str::random(40);
$plainTextToken = sprintf(
    "%s%s%s",
    config("sanctum.token_prefix", ""),
    $tokenEntropy,
    hash("crc32b", $tokenEntropy),
);

$token = $rootUser->tokens()->create([
    "name" => $tokenName,
    "token" => hash("sha256", $plainTextToken),
    "abilities" => ["*"],
    "team_id" => 0,
]);

echo $token->getKey() . "|" . $plainTextToken;
' 2>/dev/null || true
}

seed_platform_api_token() {
  info "Finishing server-side platform setup …"

  local platform_container
  local candidate_token
  local root_tenant
  platform_container=$(docker ps --filter "name=coolify$" --format '{{.Names}}' | head -1)

  if [[ -z "$platform_container" ]]; then
    return 1
  fi

  root_tenant=$(ensure_platform_root_tenant "$platform_container")
  root_tenant=$(normalize_platform_token "$root_tenant")
  if [[ "$root_tenant" != "0|0" ]]; then
    return 1
  fi

  candidate_token=$(
    docker exec "$platform_container" \
      php artisan cooldev:seed-token 2>/dev/null \
    || true
  )

  candidate_token=$(normalize_platform_token "$candidate_token")
  if is_valid_platform_token "$candidate_token"; then
    PLATFORM_API_TOKEN="$candidate_token"
    return 0
  fi

  candidate_token=$(seed_platform_api_token_with_tinker "$platform_container")
  candidate_token=$(normalize_platform_token "$candidate_token")
  if is_valid_platform_token "$candidate_token"; then
    PLATFORM_API_TOKEN="$candidate_token"
    return 0
  fi

  return 1
}

write_cooldev_config() {
  local config_dir="/var/lib/cooldev"
  mkdir -p "$config_dir"

  cat > "${config_dir}/cooldev-config.json" <<EOF
{
  "platformBaseUrl": "${PLATFORM_INTERNAL_URL}",
  "apiToken": "${PLATFORM_API_TOKEN}",
  "bootstrapUrl": "${BOOTSTRAP_URL}"
}
EOF
  chmod 600 "${config_dir}/cooldev-config.json"
  ok "CoolDev service config written to ${config_dir}/cooldev-config.json"
}

ensure_bootstrap_port_available() {
  if ss -ltn "( sport = :${COOLDEV_PORT} )" | grep -q LISTEN; then
    fail "Bootstrap port ${COOLDEV_PORT} is already in use. Choose a different port with --port <n>."
  fi
}

wait_for_cooldev_health() {
  info "Waiting for CoolDev to become healthy …"

  local retries=20
  local health_url="${BOOTSTRAP_URL%/}/api/healthz"

  while [[ $retries -gt 0 ]]; do
    if curl -sf "$health_url" | grep -q '"status":"ok"'; then
      ok "CoolDev bootstrap is healthy"
      return 0
    fi

    sleep 3
    retries=$((retries - 1))
  done

  docker logs --tail 100 cooldev >&2 || true
  fail "CoolDev did not become healthy at ${health_url}."
}

resolve_local_image_source() {
  local candidate
  local discovered_script_dir=""

  LOCAL_BUILD_CONTEXT=""
  LOCAL_BUILD_DOCKERFILE=""
  discovered_script_dir=$(script_dir || true)

  for candidate in "$IMAGE_SOURCE_DIR" "$discovered_script_dir" "$PWD"; do
    [[ -n "$candidate" ]] || continue

    if [[ -f "$candidate/Dockerfile.release" && -f "$candidate/package.json" && -f "$candidate/package-lock.json" && -d "$candidate/dist" ]]; then
      LOCAL_BUILD_CONTEXT="$candidate"
      LOCAL_BUILD_DOCKERFILE="$candidate/Dockerfile.release"
      return 0
    fi

    if [[ -f "$candidate/Dockerfile" && -f "$candidate/package.json" && -f "$candidate/package-lock.json" && ( -d "$candidate/dist" || -d "$candidate/src" ) ]]; then
      LOCAL_BUILD_CONTEXT="$candidate"
      LOCAL_BUILD_DOCKERFILE="$candidate/Dockerfile"
      return 0
    fi
  done

  return 1
}

build_local_cooldev_image() {
  local context_dir="$1"
  local build_tag

  [[ -n "$LOCAL_BUILD_DOCKERFILE" ]] || return 1

  build_tag="cooldev-local:$(date +%Y%m%d%H%M%S)"
  info "Building the CoolDev product image from ${context_dir} …"

  docker build \
    -f "$LOCAL_BUILD_DOCKERFILE" \
    -t "$build_tag" \
    "$context_dir"

  COOLDEV_IMAGE="$build_tag"
  ok "Built local image ${COOLDEV_IMAGE}"
}

try_pull_cooldev_image() {
  local status=0

  set +e
  docker pull "$COOLDEV_IMAGE"
  status=$?
  set -e

  return "$status"
}

resolve_cooldev_image() {
  if is_release_image_configured "$COOLDEV_IMAGE"; then
    if docker image inspect "$COOLDEV_IMAGE" >/dev/null 2>&1; then
      ok "Using existing local image ${COOLDEV_IMAGE}"
      return 0
    fi

    info "Pulling the CoolDev product image …"
    if try_pull_cooldev_image; then
      ok "Pulled image ${COOLDEV_IMAGE}"
      return 0
    fi
  fi

  if resolve_local_image_source; then
    if is_release_image_configured "$COOLDEV_IMAGE"; then
      warn "Could not pull ${COOLDEV_IMAGE} — trying the local release bundle instead"
    else
      warn "No published release image is configured in this installer — trying the local release bundle instead"
    fi

    build_local_cooldev_image "$LOCAL_BUILD_CONTEXT"
    return 0
  fi

  if ! is_release_image_configured "$COOLDEV_IMAGE"; then
    fail "This installer does not include a published CoolDev image reference. Download the stamped install.sh asset from a GitHub release, set COOLDEV_IMAGE explicitly, or run the installer from an extracted release bundle."
  fi

  fail "Could not pull ${COOLDEV_IMAGE}, and no local release bundle or source build context was found. Set COOLDEV_IMAGE or run the installer from a release bundle directory."
}

run_cooldev_container() {
  resolve_cooldev_image

  docker rm -f cooldev 2>/dev/null || true
  ensure_bootstrap_port_available

  local container_network="bridge"
  if docker network inspect coolify &>/dev/null; then
    container_network="coolify"
  fi

  docker run -d \
    --name cooldev \
    --restart unless-stopped \
    --network "${container_network}" \
    -p "${COOLDEV_PORT}:80" \
    -v "/var/lib/cooldev:/var/lib/cooldev" \
    -v "/var/run/docker.sock:/var/run/docker.sock" \
    -v "/data/coolify/proxy:/var/lib/cooldev/platform-proxy" \
    -e "COOLDEV_DATA_DIR=/var/lib/cooldev" \
    -e "COOLDEV_BOOTSTRAP_URL=${BOOTSTRAP_URL}" \
    -e "COOLDEV_PLATFORM_BASE_URL=${PLATFORM_INTERNAL_URL}" \
    -e "COOLDEV_PLATFORM_API_TOKEN=${PLATFORM_API_TOKEN}" \
    "${COOLDEV_IMAGE}"

  if docker network inspect coolify-proxy &>/dev/null; then
    docker network connect coolify-proxy cooldev >/dev/null 2>&1 || true
  fi

  wait_for_cooldev_health
  ok "CoolDev running on port ${COOLDEV_PORT}"
}

print_summary() {
  echo ""
  echo "┌─────────────────────────────────────────────────────────────┐"
  echo "│  CoolDev is ready!                                          │"
  echo "│                                                             │"
  printf  "│  Bootstrap URL: %-42s│\n" "${BOOTSTRAP_URL}"
  echo "│  Custom domain: set later inside CoolDev settings           │"
  echo "│                                                             │"
  echo "│  Next steps:                                                │"
  echo "│   1. Open the bootstrap URL above in your browser.          │"
  echo "│   2. Create the first owner account.                        │"
  echo "│   3. Set your domain in Settings when DNS is ready.         │"
  echo "│   4. Review the connected server in Servers.                │"
  echo "│   5. Deploy your first app.                                 │"
  echo "└─────────────────────────────────────────────────────────────┘"
  echo ""
}

bootstrap_platform() {
  if [[ "$INSTALL_PLATFORM" == "true" ]]; then
    install_managed_platform

    if ! wait_for_platform_health; then
      fail "The managed platform never became healthy. CoolDev does not expose manual browser token setup. Rerun the installer after the platform is ready."
    fi

    if [[ -n "$PLATFORM_API_TOKEN" ]]; then
      info "Using the provided platform connection for bootstrap …"
    elif seed_platform_api_token; then
      ok "Server-side platform connection created"
    else
      fail "Automatic platform bootstrap failed. CoolDev does not expose manual browser token setup. Rerun the installer after the platform is ready."
    fi
  else
    if [[ -z "$PLATFORM_API_TOKEN" ]]; then
      fail "Internal compatibility mode requires a platform token at install time."
    fi
    info "Using the provided platform connection for compatibility mode …"
  fi
}

require_root
check_docker
resolve_server_ip
bootstrap_platform
write_cooldev_config
run_cooldev_container
print_summary
