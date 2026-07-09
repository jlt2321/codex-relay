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
