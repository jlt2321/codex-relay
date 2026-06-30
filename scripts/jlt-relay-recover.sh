#!/usr/bin/env bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

VPS_IP="${JLT_RELAY_VPS_IP:-43.143.114.214}"
PUBLIC_URL="${JLT_RELAY_PUBLIC_URL:-http://43.143.114.214:8788}"
LOCAL_PORT="${JLT_RELAY_LOCAL_PORT:-8787}"
RELAY_PROJECT_PATH="${JLT_RELAY_PROJECT_PATH:-/Users/mormontjiang/Documents/workspace/codex-relay-private}"
WORKSPACE_PATH="${JLT_RELAY_WORKSPACE_PATH:-$RELAY_PROJECT_PATH}"
RELAY_CLI_PATH="${JLT_RELAY_CLI_PATH:-$RELAY_PROJECT_PATH/packages/codex-relay/src/cli.ts}"
TSX_BIN="${JLT_RELAY_TSX_BIN:-$RELAY_PROJECT_PATH/node_modules/.bin/tsx}"
FRPC_PLIST="${JLT_RELAY_FRPC_PLIST:-/Users/mormontjiang/Library/LaunchAgents/com.jlt.codex-relay.frpc.plist}"
TMUX_SESSION="${JLT_RELAY_TMUX_SESSION:-jlt-relay-local}"
PREVIEW_TMUX_SESSION="${JLT_RELAY_PREVIEW_TMUX_SESSION:-jlt-vite-preview}"
START_PREVIEW="${JLT_RELAY_START_PREVIEW:-0}"
TMUX_BIN="${JLT_RELAY_TMUX_BIN:-$(command -v tmux || true)}"
PNPM_BIN="${JLT_RELAY_PNPM_BIN:-$(command -v pnpm || true)}"

log() {
  printf '==> %s\n' "$*"
}

wifi_gateway() {
  route -n get default 2>/dev/null | awk '/gateway:/ {print $2; exit}'
}

wifi_iface() {
  route -n get default 2>/dev/null | awk '/interface:/ {print $2; exit}'
}

route_gateway_for_vps() {
  route -n get "$VPS_IP" 2>/dev/null | awk '/gateway:/ {print $2; exit}'
}

route_iface_for_vps() {
  route -n get "$VPS_IP" 2>/dev/null | awk '/interface:/ {print $2; exit}'
}

iface_ipv4() {
  local iface="$1"
  [[ -n "$iface" ]] || return 0
  ifconfig "$iface" 2>/dev/null | awk '/inet / {print $2; exit}'
}

ensure_vps_route() {
  local gateway
  gateway="$(wifi_gateway)"
  if [[ -z "$gateway" ]]; then
    log "Could not find the current default gateway."
    return 1
  fi

  local iface
  iface="$(wifi_iface || true)"
  local current_iface
  current_iface="$(route_iface_for_vps || true)"
  local current_gateway
  current_gateway="$(route_gateway_for_vps || true)"
  if [[ "$current_iface" == "$iface" && "$current_gateway" == "$gateway" ]]; then
    log "Route already points $VPS_IP through $current_gateway on $current_iface."
    return 0
  fi

  log "Repairing route: $VPS_IP -> $gateway on $iface (was ${current_gateway:-missing} on ${current_iface:-missing})"
  sudo route -n delete -host "$VPS_IP" >/dev/null 2>&1 || true
  sudo route -n add -host "$VPS_IP" "$gateway" >/dev/null
}

ensure_frpc() {
  if [[ ! -f "$FRPC_PLIST" ]]; then
    log "Missing frpc LaunchAgent: $FRPC_PLIST"
    return 1
  fi

  log "Restarting frpc LaunchAgent."
  launchctl bootout "gui/$(id -u)" "$FRPC_PLIST" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$FRPC_PLIST" >/dev/null 2>&1 || true
  launchctl kickstart -k "gui/$(id -u)/com.jlt.codex-relay.frpc"
}

ensure_relay() {
  if [[ -z "$TMUX_BIN" ]]; then
    log "tmux not found. Install tmux or set JLT_RELAY_TMUX_BIN."
    return 1
  fi

  log "Restarting codex-relay in tmux session $TMUX_SESSION."
  "$TMUX_BIN" kill-session -t "$TMUX_SESSION" >/dev/null 2>&1 || true
  "$TMUX_BIN" new-session -d -s "$TMUX_SESSION" \
    "cd '$WORKSPACE_PATH'; HOST=127.0.0.1 PORT=$LOCAL_PORT CODEX_RELAY_PUBLIC_URL='$PUBLIC_URL' NODE_ENV=development caffeinate -is '$TSX_BIN' '$RELAY_CLI_PATH'"
}

ensure_web_preview() {
  if [[ -z "$TMUX_BIN" ]]; then
    log "tmux not found. Install tmux or set JLT_RELAY_TMUX_BIN."
    return 1
  fi
  if [[ "$START_PREVIEW" != "1" ]]; then
    log "Stopping web preview session $PREVIEW_TMUX_SESSION to save power."
    "$TMUX_BIN" kill-session -t "$PREVIEW_TMUX_SESSION" >/dev/null 2>&1 || true
    return 0
  fi
  if [[ -z "$PNPM_BIN" ]]; then
    log "pnpm not found. Install pnpm or set JLT_RELAY_PNPM_BIN."
    return 1
  fi

  log "Restarting web preview in tmux session $PREVIEW_TMUX_SESSION."
  "$TMUX_BIN" kill-session -t "$PREVIEW_TMUX_SESSION" >/dev/null 2>&1 || true
  "$TMUX_BIN" new-session -d -s "$PREVIEW_TMUX_SESSION" \
    "cd '$RELAY_PROJECT_PATH'; caffeinate -is '$PNPM_BIN' --filter @codex-relay/mobile dev:workspace-web-preview"
}

verify() {
  log "Current VPS route:"
  route -n get "$VPS_IP" | awk '/destination:|gateway:|interface:/ {print "  " $0}'

  log "Local relay listener:"
  lsof -nP -iTCP:"$LOCAL_PORT" -sTCP:LISTEN || true

  log "Local web preview listener:"
  lsof -nP -iTCP:30000 -sTCP:LISTEN || true

  log "Public relay check:"
  local vps_iface
  vps_iface="$(route_iface_for_vps || true)"
  local vps_source_ip
  vps_source_ip="$(iface_ipv4 "$vps_iface")"
  if [[ -n "$vps_source_ip" ]]; then
    curl --interface "$vps_source_ip" -i --max-time 8 "$PUBLIC_URL/v1/version" || true
  else
    curl -i --max-time 8 "$PUBLIC_URL/v1/version" || true
  fi
  printf '\n'

  log "QR / pairing output:"
  "$TMUX_BIN" capture-pane -pt "$TMUX_SESSION" -S -80 | tail -60
}

ensure_vps_route
ensure_frpc
ensure_relay
ensure_web_preview
sleep 4
verify
