#!/usr/bin/env bash
set -euo pipefail

VPS_IP="${JLT_RELAY_VPS_IP:-43.143.114.214}"
PUBLIC_URL="${JLT_RELAY_PUBLIC_URL:-http://43.143.114.214:8788}"
LOCAL_PORT="${JLT_RELAY_LOCAL_PORT:-8787}"
PREVIEW_PORT="${JLT_RELAY_PREVIEW_PORT:-30000}"
RELAY_PROJECT_PATH="${JLT_RELAY_PROJECT_PATH:-/Users/mormontjiang/Documents/workspace/codex-relay-private}"
RECOVER_SCRIPT="${JLT_RELAY_RECOVER_SCRIPT:-$RELAY_PROJECT_PATH/scripts/jlt-relay-recover.sh}"
LOG_PATH="${JLT_RELAY_HEALTHCHECK_LOG:-$RELAY_PROJECT_PATH/.codex-relay/healthcheck.log}"
LOCK_DIR="${JLT_RELAY_HEALTHCHECK_LOCK:-/tmp/jlt-relay-healthcheck.lock}"

mkdir -p "$(dirname "$LOG_PATH")"

log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >>"$LOG_PATH"
}

status_code() {
  curl -sS -o /dev/null -w '%{http_code}' --max-time 6 "$1" 2>/dev/null || true
}

route_iface_for_vps() {
  route -n get "$VPS_IP" 2>/dev/null | awk '/interface:/ {print $2; exit}'
}

healthy=true
reasons=()

local_code="$(status_code "http://127.0.0.1:$LOCAL_PORT/version")"
if [[ "$local_code" != "200" ]]; then
  healthy=false
  reasons+=("local_relay=$local_code")
fi

public_code="$(status_code "$PUBLIC_URL/v1/version")"
if [[ "$public_code" != "401" && "$public_code" != "200" ]]; then
  healthy=false
  reasons+=("public_relay=$public_code")
fi

preview_code="$(status_code "http://127.0.0.1:$PREVIEW_PORT/")"
if [[ "$preview_code" != "200" ]]; then
  healthy=false
  reasons+=("preview=$preview_code")
fi

vps_iface="$(route_iface_for_vps || true)"
if [[ "$vps_iface" != "en0" && "$vps_iface" != en* ]]; then
  healthy=false
  reasons+=("vps_route=${vps_iface:-missing}")
fi

if [[ "$healthy" == true ]]; then
  log "ok local=$local_code public=$public_code preview=$preview_code route=$vps_iface"
  exit 0
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "skip_recover lock_exists reasons=${reasons[*]}"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

log "recover_start reasons=${reasons[*]}"
if "$RECOVER_SCRIPT" >>"$LOG_PATH" 2>&1; then
  log "recover_done"
else
  code="$?"
  log "recover_failed exit=$code"
  exit "$code"
fi
