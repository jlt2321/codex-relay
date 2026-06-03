#!/usr/bin/env bash
set -euo pipefail

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

log() {
  printf '==> %s\n' "$*"
}

wifi_gateway() {
  route -n get default 2>/dev/null | awk '/gateway:/ {print $2; exit}'
}

route_iface_for_vps() {
  route -n get "$VPS_IP" 2>/dev/null | awk '/interface:/ {print $2; exit}'
}

ensure_vps_route() {
  local gateway
  gateway="$(wifi_gateway)"
  if [[ -z "$gateway" ]]; then
    log "Could not find the current default gateway."
    return 1
  fi

  local current_iface
  current_iface="$(route_iface_for_vps || true)"
  if [[ "$current_iface" == "en0" || "$current_iface" == en* ]]; then
    log "Route already points $VPS_IP through $current_iface."
    return 0
  fi

  log "Repairing route: $VPS_IP -> $gateway"
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
  log "Restarting codex-relay in tmux session $TMUX_SESSION."
  tmux kill-session -t "$TMUX_SESSION" >/dev/null 2>&1 || true
  tmux new-session -d -s "$TMUX_SESSION" \
    "cd '$WORKSPACE_PATH'; HOST=127.0.0.1 PORT=$LOCAL_PORT CODEX_RELAY_PUBLIC_URL='$PUBLIC_URL' NODE_ENV=development caffeinate -ims '$TSX_BIN' '$RELAY_CLI_PATH'"
}

ensure_web_preview() {
  log "Restarting web preview in tmux session $PREVIEW_TMUX_SESSION."
  tmux kill-session -t "$PREVIEW_TMUX_SESSION" >/dev/null 2>&1 || true
  tmux new-session -d -s "$PREVIEW_TMUX_SESSION" \
    "cd '$RELAY_PROJECT_PATH'; caffeinate -ims pnpm --filter @codex-relay/mobile dev:workspace-web-preview"
}

verify() {
  log "Current VPS route:"
  route -n get "$VPS_IP" | awk '/destination:|gateway:|interface:/ {print "  " $0}'

  log "Local relay listener:"
  lsof -nP -iTCP:"$LOCAL_PORT" -sTCP:LISTEN || true

  log "Local web preview listener:"
  lsof -nP -iTCP:30000 -sTCP:LISTEN || true

  log "Public relay check:"
  curl -i --max-time 8 "$PUBLIC_URL/v1/version" || true
  printf '\n'

  log "QR / pairing output:"
  tmux capture-pane -pt "$TMUX_SESSION" -S -80 | tail -60
}

ensure_vps_route
ensure_frpc
ensure_relay
ensure_web_preview
sleep 4
verify
