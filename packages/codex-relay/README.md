# Codex Relay CLI

Codex Relay runs a local bridge server for the Codex Relay mobile app. Keep Codex on your computer, then use your phone to pair with that local session, send prompts, watch streamed output, and respond to approval requests.

Codex Relay is an independent project. It is not affiliated with, endorsed by, or sponsored by OpenAI or the OpenAI Codex team.

## Requirements

- Node.js 22.14 or newer
- Codex CLI installed and signed in on the computer running the relay
- The Codex Relay mobile app on the same network, Tailscale network, or another route that can reach your computer

## Start the Relay

Run the server from the workspace you want Codex to use:

```sh
npx codex-relay@latest
```

The CLI prints a QR code, a mobile URL, and a `codex-relay://pair...` pairing payload. Scan the QR code from the mobile app. If the relay detects multiple possible network addresses, the QR includes them and the app automatically uses the first address it can reach. If scanning is not available, paste the full pairing payload into the app.

When the app shows an approval code, approve it on the computer:

```sh
npx codex-relay@latest approve XXXX-XXXX
```

After approval, the phone can list Codex threads, start new work, stream messages, and handle approval prompts from the local Codex runtime.

## Experimental Shared App-Server Sessions

The default relay starts a private Codex app-server over stdio. On macOS and Linux, you can explicitly ask the relay to attach to an already-running Unix-socket app-server instead:

```sh
CODEX_RELAY_APP_SERVER_MODE=socket npx codex-relay@latest
```

Socket mode is attach-only and experimental:

- The relay does not start `codex app-server --listen unix://` for you.
- The default socket is `${CODEX_HOME:-~/.codex}/app-server-control/app-server-control.sock`.
- Set `CODEX_RELAY_APP_SERVER_SOCK` to attach to a different Unix socket.
- If the socket is missing, the connection fails, or the initial JSON-RPC handshake fails, the relay falls back to its private stdio app-server.
- If an attached socket disconnects, active streamed turns fail closed with a `thread.error` event and the SSE response ends. The relay does not replay a turn because it may contain non-idempotent tool calls.
- After the active stream is closed, the relay retries the shared connection with bounded backoff and falls back to stdio when reconnect attempts are exhausted. Later requests can continue through the recovered transport.
- Stopping the relay closes only its WebSocket connection. It does not stop the external shared app-server.
- Native Windows shared sockets are not supported. Windows continues to use private stdio mode.

The default remains stdio. Socket mode must always be enabled explicitly.

Maintainers can run the live shared-session contract against a selected model:

```sh
CODEX_RELAY_LIVE_APP_SERVER_TEST=1 \
CODEX_RELAY_APP_SERVER_MODE=socket \
CODEX_RELAY_LIVE_MODEL=gpt-5.6-sol \
pnpm --filter codex-relay test -- live-mobile-stream-contract.test.ts
```

The disconnect contract sends `SIGKILL` to the supplied PID. Run it only against a disposable app-server that you started for the test:

```sh
CODEX_RELAY_LIVE_APP_SERVER_TEST=1 \
CODEX_RELAY_APP_SERVER_MODE=socket \
CODEX_RELAY_LIVE_MODEL=gpt-5.6-sol \
CODEX_RELAY_LIVE_DISCONNECT_PID=<disposable-app-server-pid> \
pnpm --filter codex-relay exec vitest run \
  test/live-mobile-stream-contract.test.ts \
  -t "fails closed when the shared app-server disconnects and recovers later requests"
```

## Background Mode

To keep the relay running after the command returns:

```sh
npx codex-relay@latest --bg
```

Background mode writes runtime files under `.codex-relay/` in the current directory:

- `.codex-relay/server.log`
- `.codex-relay/server.pid`
- `.codex-relay/server-state.json`
- `.codex-relay/auth.db`

Print the current pairing QR again:

```sh
npx codex-relay@latest qr
```

Stop a background server with the printed process id:

```sh
kill -TERM <pid>
```

## Commands

```sh
npx codex-relay@latest
```

Start the relay in the foreground.

```sh
npx codex-relay@latest --bg
```

Start the relay in the background.

```sh
npx codex-relay@latest qr
```

Print the latest pairing QR for an already running relay.

```sh
npx codex-relay@latest approve XXXX-XXXX
```

Approve a pending mobile pairing request.

```sh
npx codex-relay@latest --dangerously-auto-approve
```

Start the relay and automatically approve mobile pairing requests. Use this only for controlled review or demo environments.

## Configuration

The relay listens on `0.0.0.0:8787` by default. Configure it with environment variables:

| Variable                               | Purpose                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `PORT`                                 | Server port. Defaults to `8787`.                                                                   |
| `HOST`                                 | Listen host. Defaults to `0.0.0.0`.                                                                |
| `CODEX_RELAY_PUBLIC_URL`               | URL printed into the pairing QR, for example a Tailscale or tunnel URL.                            |
| `CODEX_RELAY_WORKSPACE_PATH`           | Workspace path Codex should use. Defaults to the directory where you run `npx codex-relay@latest`. |
| `CODEX_RELAY_AUTH_DB_PATH`             | Pairing and session database path. Defaults to `.codex-relay/auth.db`.                             |
| `CODEX_RELAY_APPROVAL_SECRET`          | Secret used by the local approve command. Usually generated automatically.                         |
| `CODEX_RELAY_DANGEROUSLY_AUTO_APPROVE` | Set to `1` to auto-approve mobile pairing requests. Prefer the CLI flag for local use.             |
| `CODEX_RELAY_APP_SERVER_MODE`          | App-server mode: default `stdio`, existing `proxy`, or experimental Unix attach-only `socket`.     |
| `CODEX_RELAY_APP_SERVER_SOCK`          | Explicit proxy/shared socket path. In `socket` mode, overrides the default Codex Unix socket.      |
| `CODEX_HOME`                           | Codex home directory, used when reading Codex session metadata.                                    |
| `CODEX_BIN`                            | Codex CLI executable path.                                                                         |

Examples:

```sh
PORT=8788 npx codex-relay@latest
```

```sh
CODEX_RELAY_PUBLIC_URL=http://100.64.0.10:8787 npx codex-relay@latest
```

```sh
CODEX_RELAY_WORKSPACE_PATH=/path/to/project npx codex-relay@latest
```

## Network Notes

The phone must be able to reach one of the URLs printed by the relay.

- On the same Wi-Fi network, the relay usually prints a local network address.
- On Tailscale, the relay prefers your Tailscale address when it can detect one.
- If several Wi-Fi, VPN, or virtual network addresses are available, the QR includes all detected candidates and the app tries them automatically.
- If the printed URL is not reachable from the phone, set `CODEX_RELAY_PUBLIC_URL` to a reachable HTTP URL.

## Troubleshooting

If `npx codex-relay@latest qr` cannot find a server, start one first:

```sh
npx codex-relay@latest
```

If the relay says another process is using the local pairing database, use the existing server:

```sh
npx codex-relay@latest qr
```

Or stop the background process shown by the CLI:

```sh
kill -TERM <pid>
```

If the mobile app cannot connect, confirm that the phone can reach the printed `Mobile:` URL and that the chosen port is not blocked by a firewall.

Connection checklist:

- Are the phone and computer on the same Wi-Fi or LAN?
- If keeping the same network is difficult, are both devices connected through Tailscale or another reachable private network?
- Can the phone open the exact `Mobile:` URL printed by the relay?
- Does the computer firewall allow inbound traffic on the relay port, usually `8787`?
- If the printed URL is not reachable, did you set `CODEX_RELAY_PUBLIC_URL` to a reachable LAN, Tailscale, or tunnel URL?
