#!/usr/bin/env bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

VPS_IP="${JLT_RELAY_VPS_IP:-43.143.114.214}"
PUBLIC_URL="${JLT_RELAY_PUBLIC_URL:-http://43.143.114.214:8788}"
LOCAL_PORT="${JLT_RELAY_LOCAL_PORT:-8787}"
PREVIEW_PORT="${JLT_RELAY_PREVIEW_PORT:-30000}"
RELAY_PROJECT_PATH="${JLT_RELAY_PROJECT_PATH:-/Users/mormontjiang/Documents/workspace/codex-relay-private}"
RECOVER_SCRIPT="${JLT_RELAY_RECOVER_SCRIPT:-$RELAY_PROJECT_PATH/scripts/jlt-relay-recover.sh}"
LOG_PATH="${JLT_RELAY_HEALTHCHECK_LOG:-$RELAY_PROJECT_PATH/.codex-relay/healthcheck.log}"
LOCK_DIR="${JLT_RELAY_HEALTHCHECK_LOCK:-/tmp/jlt-relay-healthcheck.lock}"
FAIL_STATE_PATH="${JLT_RELAY_HEALTHCHECK_FAIL_STATE:-/tmp/jlt-relay-healthcheck.failcount}"
PUBLIC_TIMEOUT_SECONDS="${JLT_RELAY_PUBLIC_TIMEOUT_SECONDS:-15}"
LOCAL_TIMEOUT_SECONDS="${JLT_RELAY_LOCAL_TIMEOUT_SECONDS:-5}"
RECOVER_AFTER_FAILURES="${JLT_RELAY_RECOVER_AFTER_FAILURES:-3}"
CHECK_PREVIEW="${JLT_RELAY_CHECK_PREVIEW:-0}"
PUBLIC_REQUIRED="${JLT_RELAY_PUBLIC_REQUIRED:-1}"

mkdir -p "$(dirname "$LOG_PATH")"

log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >>"$LOG_PATH"
}

status_code() {
  local timeout="$1"
  local url="$2"
  local source_ip="${3:-}"
  if [[ -n "$source_ip" ]]; then
    curl --interface "$source_ip" -sS -o /dev/null -w '%{http_code}' --max-time "$timeout" "$url" 2>/dev/null || true
  else
    curl -sS -o /dev/null -w '%{http_code}' --max-time "$timeout" "$url" 2>/dev/null || true
  fi
}

read_fail_count() {
  [[ -f "$FAIL_STATE_PATH" ]] && cat "$FAIL_STATE_PATH" 2>/dev/null || printf '0'
}

write_fail_count() {
  printf '%s\n' "$1" >"$FAIL_STATE_PATH"
}

route_iface_for_vps() {
  route -n get "$VPS_IP" 2>/dev/null | awk '/interface:/ {print $2; exit}'
}

route_gateway_for_vps() {
  route -n get "$VPS_IP" 2>/dev/null | awk '/gateway:/ {print $2; exit}'
}

default_iface() {
  route -n get default 2>/dev/null | awk '/interface:/ {print $2; exit}'
}

default_gateway() {
  route -n get default 2>/dev/null | awk '/gateway:/ {print $2; exit}'
}

iface_ipv4() {
  local iface="$1"
  [[ -n "$iface" ]] || return 0
  ifconfig "$iface" 2>/dev/null | awk '/inet / {print $2; exit}'
}

healthy=true
reasons=()

local_code="$(status_code "$LOCAL_TIMEOUT_SECONDS" "http://127.0.0.1:$LOCAL_PORT/version")"
if [[ "$local_code" != "200" ]]; then
  healthy=false
  reasons+=("local_relay=$local_code")
fi

vps_iface="$(route_iface_for_vps || true)"
vps_gateway="$(route_gateway_for_vps || true)"
vps_source_ip="$(iface_ipv4 "$vps_iface")"

public_code="$(status_code "$PUBLIC_TIMEOUT_SECONDS" "$PUBLIC_URL/v1/version" "$vps_source_ip")"
if [[ "$public_code" != "401" && "$public_code" != "200" ]]; then
  reasons+=("public_relay=$public_code")
  if [[ "$PUBLIC_REQUIRED" == "1" ]]; then
    healthy=false
  fi
fi

preview_code="skipped"
if [[ "$CHECK_PREVIEW" == "1" ]]; then
  preview_code="$(status_code "$LOCAL_TIMEOUT_SECONDS" "http://127.0.0.1:$PREVIEW_PORT/")"
  if [[ "$preview_code" != "200" ]]; then
    reasons+=("preview=$preview_code")
  fi
fi

current_iface="$(default_iface || true)"
current_gateway="$(default_gateway || true)"
if [[ -z "$current_iface" || -z "$current_gateway" ]]; then
  healthy=false
  reasons+=("default_route=missing")
elif [[ "$vps_iface" != "$current_iface" || "$vps_gateway" != "$current_gateway" ]]; then
  healthy=false
  reasons+=("vps_route=${vps_gateway:-missing}/${vps_iface:-missing},default=${current_gateway}/${current_iface}")
fi

if [[ "$healthy" == true ]]; then
  write_fail_count 0
  if (( ${#reasons[@]} > 0 )); then
    log "warn noncritical local=$local_code public=$public_code preview=$preview_code route=$vps_gateway/$vps_iface source=${vps_source_ip:-none} reasons=${reasons[*]}"
  else
    log "ok local=$local_code public=$public_code preview=$preview_code route=$vps_gateway/$vps_iface source=${vps_source_ip:-none}"
  fi
  exit 0
fi

fail_count="$(read_fail_count)"
if ! [[ "$fail_count" =~ ^[0-9]+$ ]]; then
  fail_count=0
fi
fail_count=$((fail_count + 1))
write_fail_count "$fail_count"

if (( fail_count < RECOVER_AFTER_FAILURES )); then
  log "warn fail_count=$fail_count/$RECOVER_AFTER_FAILURES reasons=${reasons[*]}"
  exit 0
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "skip_recover lock_exists reasons=${reasons[*]}"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

log "recover_start fail_count=$fail_count reasons=${reasons[*]}"
if "$RECOVER_SCRIPT" >>"$LOG_PATH" 2>&1; then
  write_fail_count 0
  log "recover_done"
else
  code="$?"
  log "recover_failed exit=$code"
  exit "$code"
fi
