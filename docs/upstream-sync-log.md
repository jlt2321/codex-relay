# Upstream Sync Log

This document tracks decisions made while comparing this private fork with
`gronxb/codex-relay` upstream. Use it as the durable ledger for what was
migrated, deferred, or intentionally ignored from upstream commits.

## How To Use

For each upstream comparison or sync pass, add a new dated entry at the top.
Keep entries focused on decisions rather than raw git output.

Each entry should answer:

- What upstream range was reviewed?
- What local branch or commit was compared?
- Which upstream features or fixes were migrated?
- Which upstream features or fixes were ignored or deferred?
- Why was each ignored or deferred item safe to skip?
- What local private-fork behavior must be protected during future merges?
- What verification was run, or what verification remains pending?

Use these statuses:

- `migrated`: Brought into the private fork.
- `ignored`: Intentionally skipped; no planned action.
- `deferred`: Not migrated yet; should be revisited.
- `superseded`: Covered by a different private-fork implementation.
- `conflict`: Needs manual merge/design decision.

## 2026-07-18 - No-Merge Audit: upstream 1.2.5 through the 1.4.0 release line

### Scope

- Upstream remote: `https://github.com/gronxb/codex-relay.git`
- Previously reviewed upstream head: `32bb959 chore: publish 1.2.5`
- Current upstream main head: `112d8c6 feat: push notifications`
- Current upstream release branch head: `ed84999 chore: release codex-relay`
- Published npm version observed during the audit: `1.3.2`
- Release-branch package version observed during the audit: `1.4.0`
- Local branch: `codex/private-ios-build`
- Local head: `4e1b721 feat: align relay with Codex 0.142.5`
- Shared merge base: `20a05fb chore: 1.1.1`
- Divergence at audit time: 23 local-only commits and 51 upstream-only commits
- Comparison commands: `git cherry -v HEAD upstream/main`, topic/path diffs,
  object-hash comparisons, and `git merge-tree --write-tree HEAD upstream/main`

### Summary

No merge or cherry-pick was performed. The local worktree was clean before this
ledger update. The upstream range after the previous `1.2.5` audit adds a large
mobile control redesign, agent/subagent presentation, shared app-server session
management, Intel macOS database support, push notifications, CI/release
automation, and a Codex SDK `0.144.5` bump.

Some older entries marked `deferred` are already covered by local aggregate
commits even though their upstream commits are not patch-equivalent. Four key
production modules are byte-identical to upstream: mobile session expiration,
mobile network timeout, relay background-process detection, and skill
discovery. Thread compaction and the Codex-config model fallback are local-only
features from `4e1b721`; upstream main does not contain their API or mobile UI.
Where this entry reclassifies an older commit, the status in this entry takes
precedence over the 2026-07-09 baseline.

### Confirmed Local Coverage

| Status | Upstream item | Upstream commit(s) | Local coverage | Notes |
| --- | --- | --- | --- | --- |
| migrated | Session expiration handling | `f6dff9d`, `8e99797` | `ecdfa68` | `apps/mobile/src/lib/session-expiration.ts` and its server test are byte-identical to upstream. Private pairing behavior remains protected. |
| migrated | Mobile stalled-request timeout | `fc34afa` | `ecdfa68` | `apps/mobile/src/lib/network-timeout.ts` is byte-identical to upstream; the private branch also keeps additional timeout tests. |
| migrated | Background-process detection and skill discovery hardening | `699168a`, `7e920bb`, process/skill portions of `9373935` | `ecdfa68` | `background-process.ts` and `skill-discovery.ts` are byte-identical to upstream. The upstream watchdog-command wrapper from `9373935` is still absent. |
| superseded | Dead-listener/watchdog recovery | `621ef59` | `e37097e`, `ecdfa68`, private `jlt-relay-healthcheck.sh` and `jlt-relay-recover.sh` | The private deployment uses launchd/frp-aware recovery rather than upstream's generic watchdog flow. Keep upstream watchdog-command work separate. |
| superseded | Older Codex SDK and lockfile updates | `88bac41`, `5e5548c`, `95130b4` | `4e1b721` | Local relay now uses Codex SDK `0.142.5`; importing the older dependency commits has no value. |
| superseded | Codex binary/window helper | `1732266` | `456497c`, `c9b7151`, `4e1b721` | Patch-equivalent base support exists. Local behavior intentionally defaults to isolated stdio and enables proxy mode only when explicitly requested. |
| superseded | Base plan-progress implementation | `f55bf40`, `3230d34`, `dadbe39`, `e893026`, `af72651` | `ce2ba4c`, `258e269`, `4edd5e7` | The private branch has its own plan banner and fallback behavior. Later upstream Power/subagent redesign remains a separate conflict item. |
| superseded | Expo 56, React Native, and Hot Updater dependency levels | dependency portions of `f6dff9d`, `356fad5` | local dependency updates through `e37097e` | Local and upstream currently use Expo `56.0.9`, React Native `0.85.3`, and Hot Updater `0.32.0`; do not import package/lockfile churn solely for these versions. |
| migrated | Unix attach-only shared app-server core | selected transport/reconnect portions of `dd7ac93`, `baa714c` | current uncommitted shared-session implementation | Adds stdio/WebSocket transport abstraction, explicit macOS/Linux `socket` mode, Unix socket discovery, attach-only ownership, bounded reconnect, per-attempt socket cleanup, initial-handshake and reconnect-exhaustion stdio fallback, ownership-safe close, diagnostics, and fake-socket regression tests. Stdio remains the default; no external app-server is started or killed. |

### Remaining Upstream Content Not Migrated

| Status | Priority | Upstream item | Commit(s) | Missing content / decision |
| --- | --- | --- | --- | --- |
| deferred | high | Shared app-server relay-owned startup and CLI integration | remaining portions of `dd7ac93`, `baa714c` | Attach-only transport, reconnect, fallback, shutdown safety, and live `gpt-5.6-sol`/compact validation are complete. Relay-owned `codex app-server --listen unix://` startup, a CLI flag, and startup instructions remain deferred. |
| conflict | high | Power controls, advanced model picker, runtime preference coordinator, and planned subagent status | `f03bbf6`, `76ed9ec` | Twelve upstream chat/control files are absent locally, including `PowerSelector`, `PowerTrack`, `AdvancedModelOptions`, and `runtime-preferences-coordinator`. This overlaps the private composer, plan UI, voice controls, runtime preferences, and 5.6 model fallback. Requires a product/UI decision before selective migration. |
| deferred | high | Codex SDK `0.144.5` | `1ce12a8` | Local is pinned to `0.142.5`. Upgrade only after verifying `model/list`, `gpt-5.6-sol`, thread compaction, stdio mode, and the mobile stream contract against the newer app-server. |
| deferred | high | Mobile push notifications and initial registration | `2bb9703`, `112d8c6` | Push API/schema, pairing-store registration data, server sender, mobile settings, Expo notification dependency, and registration hook are absent. Must use JLT bundle identifiers, credentials, privacy policy, and deployment endpoints rather than upstream defaults. |
| deferred | medium | Intel macOS pairing database compatibility | `8484afa` | `libsql-database.ts`, workspace native-package configuration, and pairing-store coverage are absent. Valuable if Intel macOS must be supported; otherwise defer to an Intel-specific validation pass. |
| conflict | medium | Agent/subagent visual redesign and compact status totals | `c9d7fa9`, `99557b7` | Local has protocol-level subagent messages but not upstream's agent icons/theme or compact planned-subagent totals. Depends on the Power/plan-progress UI decision. |
| deferred | medium | Tailscale Serve lifecycle integration | `daea7f3` | Local detects Tailscale addresses and existing Serve URLs, but lacks upstream `tailscale-serve.ts`, automatic Serve configuration, and the upstream pairing/settings flow. Reconcile with the private frp/VPS and PWA preview architecture before migrating. |
| deferred | medium | Native chat/keyboard/store-review refinements | `3561504` | Dependency levels are covered, but upstream store-review gate/prompt files and the complete chat/timeline/layout refactor are not present. Review behavior selectively; do not replace the private composer or voice flow wholesale. |
| deferred | medium | iPad resizable layout | `1bd516d` | `ipad-split-layout.tsx` and upstream drawer/layout behavior are absent. Conflicts with private chat layout fixes and app identity configuration. |
| conflict | medium | Upstream plan-progress refinements after the private implementation | `1e8ef97`, `f03bbf6`, `c9d7fa9`, `99557b7` | Local and upstream plan-progress files have materially different object hashes and structure. Compare user-visible behavior and tests rather than copying files. |
| deferred | low | Queued-prompt spacing/alignment polish | `721a9e1`, `7cda42c`, `ab8059a` | Small `ChatComposer` layout fixes remain unverified against the private composer. Apply only after visual regression checks. |
| deferred | low | Server-state message extraction and optimistic steering tests | `59482d9` | `server-state-messages.ts` is absent. Review after the mobile state/API conflict is resolved. |
| deferred | low | Upstream watchdog-command wrapper | remaining CLI/watchdog portion of `9373935` | `background-process.ts` is covered, but `relay-watchdog-command.mjs` and its declaration are absent. Private launchd scripts may make it unnecessary; compare operational behavior before deciding. |
| deferred | low | Changesets and GitHub CI/release workflows | `9c2fa96`, `87f7bf7` | `.changeset/` and upstream CI/release workflows are absent. Adopt only after defining private package publication, signing, and secret handling. |
| deferred | low | Hot Updater QA cohort shipping skill | `466fec1` | Upstream skill is absent. Only useful if the private fork adopts the same cohort/release workflow. |
| deferred | low | Upstream `DESIGN.md` updates | `daea7f3`, `f03bbf6`, `c9d7fa9`, `99557b7`, `76ed9ec` | Useful as design reference, but it describes upstream branding and UI architecture rather than the private product contract. |
| ignored | none | Native Windows shared app-server transport | `346bba0` | Native Windows support is outside the current JLT Relay target. Do not add the loopback `ws://127.0.0.1:8788` listener, Windows socket probing, shell-specific spawn behavior, startup text, or tests. Windows users should remain on private stdio mode; WSL can be reconsidered only if it becomes an explicit supported environment. |
| ignored | none | Upstream package/mobile version-only releases | `44ff7b0`, `2740f52`, `9cac502`, `990d5ca`, `6ab4661`, `64c979d`, `32bb959`, `60a72cb`, `814b9ef`, `1ff97b5`, `24110b1`, `543e6f4`, release commit `ed84999` | Do not cherry-pick upstream release numbers into JLT Relay. Version and compatibility policy must be updated deliberately with the private app/package release. |

### Shared App-Server Decomposition

The Unix/macOS shared-session feature is not a single migration unit. Treat it
as the following independently reviewable pieces. Native Windows behavior from
`346bba0` is explicitly excluded from every piece.

| Unit | Source | Purpose | Dependency / risk | Decision |
| --- | --- | --- | --- | --- |
| 1. Mode contract | `dd7ac93` `codex-binary.ts`, `cli.ts` | Introduce an explicit shared `socket` mode while keeping `stdio` separate. | Local keeps `proxy` as an explicit escape hatch and stdio as the default. No CLI flag was added. | migrated for environment-based `socket` opt-in; CLI integration remains deferred. |
| 2. Transport abstraction | `dd7ac93` `app-server.ts` | Route JSON-RPC reads/writes through either child stdio or WebSocket instead of directly using `child.stdin`. | Touches initialization, responses to server requests, notification delivery, pending request rejection, and close semantics. Requires direct `ws` and `@types/ws` dependencies. | migrated with stdio regression coverage. |
| 3. Unix socket discovery | `dd7ac93`, `baa714c` | Resolve `${CODEX_HOME:-~/.codex}/app-server-control/app-server-control.sock` and detect an already-running shared server. | Socket path is a Codex implementation contract and may change between CLI versions. Missing/stale paths must not break normal stdio startup. | migrated for macOS/Linux attach-only mode; missing or failed sockets fall back to stdio. |
| 4. Attach-first ownership | `baa714c` | Attach to an existing socket without spawning or taking ownership of the external app-server. | Prevents duplicate listeners and prevents the relay from killing a server owned by another Codex client. | migrated as attach-only; relay-owned shared listeners are intentionally not implemented. |
| 5. Relay-owned listener startup | `dd7ac93`, refined by `baa714c` | If no shared socket exists, spawn `codex app-server --listen unix://` and poll for readiness. | Starting a shared server broadens relay ownership and can reintroduce the 5.6/model-list regression. Startup timeout and stderr handling must remain bounded. | deferred phase 2: start with attach-only mode; add spawn-if-absent only after 5.6 validation. |
| 6. Disconnect and reconnect state machine | `baa714c` | On relay WebSocket reset, reject in-flight requests, reinitialize JSON-RPC, and reconnect with bounded backoff without stopping the shared server. | Concurrency-sensitive: must prevent duplicate reconnect loops, handle close during backoff, clean up sockets whose initialize handshake failed, restore connection-scoped thread subscriptions, and avoid replaying non-idempotent requests. | migrated; every reconnect reinitializes JSON-RPC, failed attempts close their socket, subscription state is cleared so the next turn resumes the thread, and exhaustion falls back to private stdio. |
| 7. Lifecycle and ownership-safe shutdown | `dd7ac93`, `baa714c` | Close relay sockets/readlines while never terminating an external shared app-server. | Incorrect cleanup can terminate terminal/mobile shared sessions or leave orphan listeners. | migrated for attach-only ownership and covered by a second-client reuse test. |
| 8. Diagnostics | `baa714c` | Emit attached, fallback, disconnected, reconnecting, and reconnected events. | Must not log prompts, auth data, pairing secrets, or provider keys. | migrated with non-sensitive socket path/error metadata. |
| 9. CLI/startup integration | `dd7ac93` | Add an opt-in CLI flag, initialize the shared client before serving HTTP, register signal cleanup, and print `codex resume --remote unix://`. | Private launchd/tmux control may set environment variables instead of using the upstream CLI flag. Startup failure must not disable normal relay recovery. | deferred: integrate only after the client layer is validated. |
| 10. Tests | `dd7ac93`, `baa714c` | Cover attach-without-spawn, forced socket reset, bounded reconnect, stdio fallback, attached-server preservation, mode parsing, socket paths, and Windows rejection. | Fake Unix-socket tests cover failed reconnect handshakes, exhausted reconnect fallback, recovery after a failed stdio fallback initialize, subscription invalidation, and initial-handshake fallback. The live contract accepts `CODEX_RELAY_LIVE_MODEL` and covers model-selected turns, cross-client continuation, mobile streaming, and thread compaction. | migrated and live-validated on macOS with Codex CLI `0.144.5` and `gpt-5.6-sol`. |

#### Proposed Extraction Order

1. Refactor `CodexAppServerClient` transport reads/writes while retaining stdio
   as the only active transport; run the existing relay and mobile stream tests.
2. Add Unix socket path resolution, attach-first ownership, and fake-socket unit
   tests behind an explicit experimental mode; do not spawn a listener yet.
3. Add bounded reconnect and ownership-safe close behavior with diagnostics.
4. Completed on 2026-07-19 with Codex CLI `0.144.5` and `gpt-5.6-sol`:
   `model/list`, thread start, turn completion, cross-client continuation,
   mobile streaming, and thread compaction.
5. Decide whether relay-owned spawn-if-absent and CLI startup
   integration are necessary for the private deployment.

#### Explicit Exclusions

- Native Windows loopback WebSocket support from `346bba0`.
- Any change that makes shared/socket/proxy mode the default.
- Reusing upstream `model: null` as sufficient 5.6 validation.
- Killing an app-server process or socket that the relay attached to but did not
  create.
- Migrating upstream release/version changes as part of shared-session work.

### Private-Fork Protection Notes

- Preserve `JLT Relay` names, bundle identifiers, schemes, signing, and private
  server URLs when evaluating upstream mobile configuration or release commits.
- Preserve the local web/PWA client, frp/VPS access path, launchd health checks,
  automation preview, voice dictation, and secure transport behavior.
- Preserve `4e1b721` thread compaction and Codex-config model synthesis. Upstream
  still hard-codes `gpt-5.5` and does not expose the local `gpt-5.6-sol` fallback.
- Do not switch the default app-server mode back to shared proxy until the proxy
  path passes the same `gpt-5.6-sol` end-to-end turn used to validate stdio mode.
- Native Windows shared app-server transport is intentionally unsupported and
  should not be introduced during Unix/macOS shared-session extraction.
- Treat upstream model/Power UI work as a product migration, not a mechanical
  file sync, because it overlaps private runtime preferences and chat controls.

### Conflict Preview

`git merge-tree --write-tree HEAD upstream/main` reported 21 conflict paths.
This was a no-worktree preview only; no merge state was created. The primary
hotspots remain mobile app configuration, chat composer/screen/shell, plan
progress, relay API/schema/app-server, Codex binary tests, and `pnpm-lock.yaml`.

### Verification

- Refreshed `upstream/main` and compared it with local `4e1b721` without merging.
- Ran `git cherry -v HEAD upstream/main`; only `88bac41`, `95130b4`, and
  `1732266` were patch-equivalent.
- Confirmed exact object hashes for session expiration, network timeout,
  background-process detection, skill discovery, and selected tests.
- Confirmed local/upstream dependency parity for Expo `56.0.9`, React Native
  `0.85.3`, and Hot Updater `0.32.0`.
- Confirmed upstream lacks the local thread-compaction API/mobile flow.
- Selectively implemented the Unix attach-only transport contract without merge
  or cherry-pick; relay-owned startup, CLI integration, and Windows transport
  remain excluded.
- `pnpm --filter codex-relay test`: 176 passed, 3 live-only tests skipped.
- `pnpm typecheck`: all four workspace projects passed.

### 2026-07-19 Live Shared-Session Validation

- Manually started Codex CLI `0.144.5` with `app-server --listen unix://`; the
  relay remained attach-only and did not start or own the server.
- `initialize` and `model/list` succeeded; the catalog returned seven models,
  including `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`.
- The first cross-client continuation run exposed a connection-scoped thread
  subscription gap: the second turn completed in rollout history but its events
  were still routed away from the new relay connection.
- Added per-client thread subscription tracking. New clients and reconnected
  sockets now call `thread/resume` before continuing an existing thread.
- The live contract then passed all three scenarios with `gpt-5.6-sol`: first
  turn streaming, cross-client continuation, and relay API compaction ending in
  a completed `contextCompaction` item (`178 passed`).
- The manually started app-server was stopped after validation; no merge,
  cherry-pick, commit, or push was performed.

## 2026-07-09 - Baseline Comparison: upstream/main 1.2.5 vs private fork

### Scope

- Upstream remote: `https://github.com/gronxb/codex-relay.git`
- Upstream branch: `upstream/main`
- Upstream head reviewed: `32bb959 chore: publish 1.2.5`
- Local repository: `/Users/mormontjiang/Documents/workspace/codex-relay-private`
- Local base branch: `main`
- Local base commit: `20a05fb chore: 1.1.1`
- Local working branch reviewed: `codex/private-ios-build`
- Local working branch head: `cc990be feat: add web mobile relay client`

### Summary

Local `main` is exactly the shared base with upstream 1.1.1 and is 32 commits
behind upstream/main. The active private branch has 19 local-only commits and
upstream/main has 32 upstream-only commits. After patch-equivalent changes are
ignored, the branch still has substantial divergence on mobile UI, relay API,
web preview, private branding, and release/support tooling.

The active worktree also had uncommitted edits during this comparison. Do not
merge upstream directly into the dirty worktree; commit or stash private changes
first.

### Upstream Items To Consider Migrating

| Status | Upstream item | Commit(s) | Notes |
| --- | --- | --- | --- |
| deferred | Publish/version updates through 1.2.5 | `32bb959`, `64c979d`, `6ab4661`, `2740f52`, `44ff7b0` | Needs private versioning policy. Do not blindly overwrite JLT Relay app identity or package metadata. |
| deferred | Tailscale web preview flow | `daea7f3` | Valuable for reachable mobile web previews. Must be reconciled with the private web/PWA preview implementation. |
| deferred | Relay watchdog health checks and dead-listener recovery | `621ef59`, related watchdog files | Likely useful. Check against local relay recovery scripts and private deployment assumptions before migrating. |
| deferred | Stalled relay request timeout | `fc34afa` | Likely useful operational hardening. Needs API/client behavior review. |
| deferred | Keep valid relay sessions after auth blips | `8e99797` | Likely useful for mobile reliability. Verify interaction with private secure pairing/session code. |
| deferred | Skill discovery and plugin skill dedupe fixes | `699168a`, `7e920bb` | Useful if private fork keeps upstream plugin/skill discovery behavior. |
| deferred | iPad resizable layout / expanded drawer | `1bd516d` and related layout commits | Relevant for tablet support. Conflicts with local mobile chat layout changes. |
| deferred | Plan progress UI refinements | `f55bf40`, `3230d34`, `dadbe39`, `e893026`, `af72651` | Local branch already has plan progress work, so compare behavior before copying code. |
| deferred | Hot Updater QA cohort shipping skill | `466fec1` | Useful only if the private fork uses the same Hot Updater release flow. |
| deferred | `DESIGN.md` design system documentation | included upstream | Can be useful as reference, but private branding and UI direction differ. |

### Additional Upstream Commits Registered After Audit

These commits were present in the upstream range but were not individually
listed in the first pass. They are now part of the ledger so future sync work
can update their status instead of rediscovering them.

| Status | Upstream item | Commit(s) | Notes |
| --- | --- | --- | --- |
| deferred | Native SDK, chat keyboard, store review, and thread stream stabilization | `3561504` | Touches mobile dependencies, chat components, store review gate/prompt, thread run stream, and lockfile. Needs careful comparison with private mobile composer/timeline edits. |
| deferred | Expo 56 migration plus session expiration handling | `f6dff9d` | Includes dependency/package changes, `session-expiration` logic, mobile app layout changes, and tests. Needs validation against private secure pairing/session behavior. |
| deferred | Server-state message extraction and optimistic steering test coverage | `59482d9` | Adds `server-state-messages` and changes `server-state`. Relevant to mobile state semantics and should be reviewed before API merge work. |
| deferred | Plan progress opacity style fix | `1e8ef97` | Small UI polish in `PlanProgressBanner`. Check after resolving local/upstream plan progress divergence. |
| deferred | App version bump to 1.2.1 | `9cac502` | Changes mobile `app.config.ts` version only. Should follow private release/versioning policy rather than upstream blindly. |
| deferred | Codex dependency bump | `5e5548c` | Changes `packages/codex-relay/package.json` and lockfile. Reconcile with private Codex SDK requirements. |
| deferred | Package version bump to 1.2.2 | `990d5ca` | Package metadata only. Should follow private release/versioning policy. |
| deferred | Queued prompt action spacing | `721a9e1` | ChatComposer UI polish. Conflicts conceptually with local mobile composer changes. |
| deferred | Queued prompt text column alignment | `7cda42c` | ChatComposer UI polish/layout correction. Review together with `721a9e1` and `ab8059a`. |
| deferred | Relay skill and process hardening | `9373935` | Adds `background-process` helper/tests and hardens CLI, skill discovery, and watchdog command logic. High-value reliability candidate. |
| deferred | Center queued prompt row text | `ab8059a` | Small ChatComposer alignment fix. Review with the queued prompt UI group. |

### Upstream Commits With Local Patch-Equivalent Coverage

`git cherry -v HEAD FETCH_HEAD` reported these upstream commits as
patch-equivalent to changes already present on the private branch. They still
need final human confirmation before being treated as fully migrated.

| Status | Upstream item | Commit(s) | Notes |
| --- | --- | --- | --- |
| superseded | Codex SDK 0.137.0 bump | `88bac41` | Patch-equivalent in the private branch. Confirm local dependency version and lockfile before closing. |
| superseded | Lockfile-only update | `95130b4` | Patch-equivalent in the private branch. Low risk, but keep tied to dependency verification. |
| superseded | Supports window / Codex binary helper | `1732266` | Patch-equivalent in the private branch. Confirm private branch keeps the intended `codex-binary` behavior and tests. |

### Local Private-Fork Items To Protect

| Area | Local behavior | Notes |
| --- | --- | --- |
| Branding | `JLT Relay`, package/bundle identifiers, private app metadata | Upstream uses Codex Relay identity. Preserve private identity unless intentionally rebranding. |
| Web/PWA client | `apps/web/` and `docs/pwa-migration-plan.md` | Upstream/main does not carry the same private web app surface. Treat deletions from upstream as unsafe by default. |
| Secure pairing / transport | Local changes in relay API, pairing, and secure transport | Must be reviewed before accepting upstream API/server changes. |
| Mobile voice dictation | Local mobile composer speech controls | Upstream package changes may remove or alter related dependencies. |
| Automation/web preview | Private automation preview and web preview work | Upstream Tailscale preview work may overlap but is not a direct replacement. |
| Android/iOS private build support | Local generated/build assumptions from private mobile packaging work | Do not overwrite private native app identity or signing assumptions without an explicit release decision. |

### Conflict Hotspots From Merge Preview

These files were predicted to conflict when merging `upstream/main` into
`codex/private-ios-build`:

- `apps/mobile/app.config.ts`
- `apps/mobile/package.json`
- `apps/mobile/src/app/settings.tsx`
- `apps/mobile/src/components/chat/ChatComposer.tsx`
- `apps/mobile/src/components/chat/ChatScreen.tsx`
- `apps/mobile/src/components/chat/ChatShell.tsx`
- `apps/mobile/src/components/chat/MessageTimeline.tsx`
- `apps/mobile/src/components/chat/PlanProgressBanner.tsx`
- `apps/mobile/src/components/chat/ThreadDrawerContent.tsx`
- `apps/mobile/src/components/chat/plan-progress.ts`
- `apps/mobile/src/components/chat/workspace-preview/WebWorkspacePreviewTab.tsx`
- `apps/mobile/src/lib/codex-relay-api.ts`
- `apps/mobile/src/lib/version-policy.ts`
- `packages/codex-relay/package.json`
- `packages/codex-relay/src/api-schema.ts`
- `packages/codex-relay/src/app-server.ts`
- `pnpm-lock.yaml`

### Decision Notes

- No upstream commit was migrated during this baseline comparison.
- No upstream commit was permanently ignored yet.
- All 32 upstream commits in `main..upstream/main` have now been registered in
  this ledger at either topic level, individual commit level, or
  patch-equivalent coverage level.
- The next sync should be topic-based rather than a single large merge.
- Recommended first topics: relay reliability fixes, then session/auth fixes,
  then mobile UI/layout features, then release tooling.

### Verification

- Compared `main...FETCH_HEAD` and `HEAD...FETCH_HEAD`.
- Ran a no-worktree merge preview with `git merge-tree`.
- No source files were intentionally modified during the comparison pass.

## Entry Template

Copy this section for future sync passes.

### YYYY-MM-DD - <short title>

#### Scope

- Upstream range:
- Upstream head:
- Local branch:
- Local head:
- Comparison command(s):

#### Migrated

| Upstream commit | Feature/fix | Local commit/change | Verification |
| --- | --- | --- | --- |
|  |  |  |  |

#### Ignored

| Upstream commit | Feature/fix | Reason ignored | Revisit trigger |
| --- | --- | --- | --- |
|  |  |  |  |

#### Deferred

| Upstream commit | Feature/fix | Reason deferred | Next owner/action |
| --- | --- | --- | --- |
|  |  |  |  |

#### Private-Fork Protection Notes

- 

#### Verification

- 
