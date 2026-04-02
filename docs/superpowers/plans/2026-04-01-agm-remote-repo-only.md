# AGM Remote-Repo-Only Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert AGM from mixed local-path/shared-volume semantics to a single remote-repo-only model where users provide remote repo URLs, each agent works from its own local clone, and send/reply/daemon all follow the same transport model on same-host and cross-host deployments.

**Architecture:** Treat the remote repo as the source of truth and each agent's local clone as its private working copy. Config should describe `self` and `contacts` in terms of remote repo URLs plus optional local clone paths; `send/reply` only mutate the sender’s local clone and push sender-owned commits; daemon detects incoming mail by fetching/pulling contact remotes into local tracking refs and diffing waterline against those refs, never by relying on direct writes into another agent’s working tree.

**Tech Stack:** TypeScript, Vitest, git CLI wrapper, existing AGM CLI + OpenClaw plugin.

---

## File/Boundary Map

### Existing files to modify
- `packages/agm/src/config/schema.ts`
  - Replace path-based `contacts` shape with remote-repo-first model.
- `packages/agm/src/config/index.ts`
  - Add helpers for self/contact lookup in remote mode.
- `packages/agm/src/cli/commands/bootstrap.ts`
  - Bootstrap from remote repo URL + clone path, not an already-prepared repo path.
- `packages/agm/src/app/send-message.ts`
  - Stop writing recipient inbox directly; only write sender outbox and push sender repo.
- `packages/agm/src/app/reply-message.ts`
  - Same change as send.
- `packages/agm/src/app/run-daemon.ts`
  - Poll/fetch contact remotes and detect new mail from remote refs instead of local recipient inbox repos.
- `packages/agm/src/app/list-messages.ts`
  - Ensure listing still works from self local clone only.
- `packages/agm/src/app/read-message.ts`
  - Ensure read uses self local clone only.
- `packages/agm/src/app/git-push.ts`
  - May need stricter remote checks / push target behavior.
- `packages/agm/src/git/repo.ts`
  - Add fetch/list-ref helpers needed by daemon and bootstrap.
- `packages/agm/src/index.ts`
  - Update help text.
- `packages/agm/test/*.ts`
  - Rewrite tests away from direct recipient-local writes.
- `packages/agm/README.md`
  - Rewrite docs to remote-repo-only model.
- `docs/*e2e*`, `docs/*handoff*`, `docs/*smoke*`
  - Update wording so shared-volume is no longer presented as product behavior.

### New files likely needed
- `packages/agm/src/app/clone-or-open-self-repo.ts`
  - Bootstrap helper to clone/open self repo from remote URL.
- `packages/agm/src/app/remote-mail-discovery.ts`
  - Encapsulate “fetch contact remote ref → diff since waterline → filter inbound messages to self”.
- `packages/agm/test/remote-daemon.test.ts`
  - Dedicated daemon tests for remote-only discovery.
- `packages/agm/test/bootstrap-remote.test.ts`
  - Bootstrap tests for remote URL + clone path flow.
- `docs/2026-04-01-agm-remote-repo-only-decision.md`
  - Short design note capturing the boundary decision.

---

## Design Decisions To Lock Before Coding

1. **Single truth:** remote repo history is the transport truth; local clone is only that agent’s working copy.
2. **Ownership:** each agent only writes/commits/pushes in its own repo.
3. **Inbound mail location:** incoming mail is discovered from contact remotes’ outbox commits, not by mutating recipient inbox from sender side.
4. **Local state:** recipient may materialize remote mail into local inbox/archive for UX, but that materialization is derived state and must not be the transport truth.
5. **Same-host rule:** same-host multi-agent uses the exact same protocol; no shared-volume success path in product semantics.

---

## Chunk 1: Redefine config and bootstrap around remote URLs

### Task 1: Replace path-only config shape with remote-first shape

**Files:**
- Modify: `packages/agm/src/config/schema.ts`
- Modify: `packages/agm/src/config/index.ts`
- Test: `packages/agm/test/config.test.ts`

- [ ] **Step 1: Write failing tests for new config shape**

Add tests covering:
- `self.id`
- `self.remote_repo_url`
- `self.local_repo_path`
- `contacts.<name>.remote_repo_url`
- optional `contacts.<name>.local_cache_path` only if truly needed
- old `contacts: { name: /path }` rejected or migrated explicitly

Run: `npm test --workspace @t0u9h/agent-git-mail -- config.test.ts`
Expected: FAIL because schema/helpers still assume plain repo paths.

- [ ] **Step 2: Implement minimal schema/helpers**

Required helper API shape:
- `getSelfLocalRepoPath(config): string`
- `getSelfRemoteRepoUrl(config): string`
- `getContactRemoteRepoUrl(config, name): string | null`
- `getContactNames(config): string[]`

Do **not** preserve ambiguous helper names like `getAgentRepoPath` if they now mean different things.

- [ ] **Step 3: Run tests and verify pass**

Run: `npm test --workspace @t0u9h/agent-git-mail -- config.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/agm/src/config/schema.ts packages/agm/src/config/index.ts packages/agm/test/config.test.ts
git commit -m "refactor(agm): model config around remote repos"
```

### Task 2: Rework bootstrap to clone/open self repo from remote URL

**Files:**
- Modify: `packages/agm/src/cli/commands/bootstrap.ts`
- Modify: `packages/agm/src/index.ts`
- Create: `packages/agm/src/app/clone-or-open-self-repo.ts`
- Test: `packages/agm/test/bootstrap-remote.test.ts`

- [ ] **Step 1: Write failing bootstrap tests**

Cover:
- bootstrap with `--self-remote-repo-url` + `--self-local-repo-path`
- clone repo if local path missing
- reuse existing clone if path already points to correct remote
- fail if local clone points to different remote
- generated config uses remote-first shape

- [ ] **Step 2: Implement clone/open helper**

Behavior:
- If local path missing: `git clone <remote> <path>`
- If exists: verify git repo + `origin` URL matches expected remote
- Ensure mail dirs exist in local clone
- Never require user to pre-create a local repo manually

- [ ] **Step 3: Update bootstrap command and help text**

Replace old flags with remote-first flags:
- `--self-id`
- `--self-remote-repo-url`
- `--self-local-repo-path`

Do not leave misleading `--self-repo-path` examples in help/docs.

- [ ] **Step 4: Run tests**

Run: `npm test --workspace @t0u9h/agent-git-mail -- bootstrap-remote.test.ts cli-args.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agm/src/cli/commands/bootstrap.ts packages/agm/src/index.ts packages/agm/src/app/clone-or-open-self-repo.ts packages/agm/test/bootstrap-remote.test.ts packages/agm/test/cli-args.test.ts
git commit -m "feat(agm): bootstrap from remote mailbox repo"
```

---

## Chunk 2: Rewrite send/reply to sender-owned commits only

### Task 3: Change send to write only sender outbox + push sender remote

**Files:**
- Modify: `packages/agm/src/app/send-message.ts`
- Modify: `packages/agm/src/app/git-push.ts`
- Test: `packages/agm/test/send.test.ts`

- [ ] **Step 1: Write failing tests for remote-only send semantics**

Required assertions:
- sender outbox gets new mail file
- sender repo gets exactly one new commit
- recipient local clone is untouched by `sendMessage()`
- pushed commit is on sender remote repo after push

- [ ] **Step 2: Implement minimal send change**

Delete recipient-side write/add/commit logic from `send-message.ts`.
Keep:
- load config
- resolve sender local repo
- verify recipient exists as contact
- write outbox file in sender local clone
- commit sender outbox file
- push sender origin

- [ ] **Step 3: Run tests**

Run: `npm test --workspace @t0u9h/agent-git-mail -- send.test.ts push-behavior.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/agm/src/app/send-message.ts packages/agm/src/app/git-push.ts packages/agm/test/send.test.ts packages/agm/test/push-behavior.test.ts
git commit -m "refactor(agm): make send sender-owned remote transport"
```

### Task 4: Change reply to follow the same transport rule

**Files:**
- Modify: `packages/agm/src/app/reply-message.ts`
- Test: `packages/agm/test/reply.test.ts`

- [ ] **Step 1: Write failing tests**

Required assertions:
- reply writes only replier outbox
- reply commit lands only in replier repo
- original sender local clone is untouched at send-time
- `reply_to` still points to original filename

- [ ] **Step 2: Implement minimal reply change**

Mirror send semantics exactly.
No recipient local writes.

- [ ] **Step 3: Run tests**

Run: `npm test --workspace @t0u9h/agent-git-mail -- reply.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/agm/src/app/reply-message.ts packages/agm/test/reply.test.ts
git commit -m "refactor(agm): align reply with sender-owned transport"
```

---

## Chunk 3: Rebuild daemon around remote discovery

### Task 5: Add git helpers for remote fetch and remote-ref diffing

**Files:**
- Modify: `packages/agm/src/git/repo.ts`
- Test: `packages/agm/test/git-waterline.test.ts`
- Create or Modify: remote-specific repo tests if needed

- [ ] **Step 1: Write failing tests for repo remote helpers**

Need helpers like:
- `fetchRemote(remoteName: string): Promise<void>`
- `getRemoteBranchSha(remoteName: string, branch?: string): Promise<string | null>`
- `diffNames(commitA: string, commitB: string)` already exists; reuse

- [ ] **Step 2: Implement helpers**

Prefer explicit remote refs like `refs/remotes/<remote>/main` or configurable default branch.
Do not use ad-hoc shelling outside `GitRepo` if avoidable.

- [ ] **Step 3: Run tests and commit**

```bash
git add packages/agm/src/git/repo.ts packages/agm/test/git-waterline.test.ts
git commit -m "feat(agm): add remote fetch helpers for daemon"
```

### Task 6: Implement remote mail discovery for daemon

**Files:**
- Create: `packages/agm/src/app/remote-mail-discovery.ts`
- Modify: `packages/agm/src/app/run-daemon.ts`
- Test: `packages/agm/test/remote-daemon.test.ts`
- Modify: `packages/agm/test/daemon.test.ts`

- [ ] **Step 1: Write failing daemon tests for remote-only delivery**

Cover:
- first poll initializes waterline per contact remote and does not backfill
- after a new sender outbox commit is pushed, recipient daemon fetches sender remote and detects exactly one new mail addressed to self
- daemon ignores messages in contact outbox that are addressed to someone else
- repeated polls do not redeliver same message

- [ ] **Step 2: Implement discovery module**

Recommended algorithm per contact:
1. fetch contact remote
2. read waterline ref scoped by contact (example: `refs/agm/last-seen/<contact>`)
3. get current remote branch SHA for that contact
4. if no waterline: initialize and return
5. diff waterline..current remote SHA
6. inspect only added `outbox/*.md` files from contact remote commit range
7. parse frontmatter and keep only messages where `to === self.id`
8. invoke `onNewMail`
9. advance per-contact waterline

Important: waterline must become **per contact remote**, not one global repo HEAD watermark.

- [ ] **Step 3: Decide inbox materialization policy**

Pick one and implement explicitly:
- **Option A (recommended for Phase 1):** daemon only emits notifications; local inbox materialization is deferred
- **Option B:** daemon copies detected remote messages into local derived inbox directory and records that as derived state

Do not leave this implicit.

- [ ] **Step 4: Run tests**

Run: `npm test --workspace @t0u9h/agent-git-mail -- daemon.test.ts remote-daemon.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agm/src/app/remote-mail-discovery.ts packages/agm/src/app/run-daemon.ts packages/agm/test/daemon.test.ts packages/agm/test/remote-daemon.test.ts
 git commit -m "feat(agm): detect incoming mail from contact remotes"
```

---

## Chunk 4: Repair UX commands and docs around the new model

### Task 7: Update list/read UX so they match chosen inbox materialization policy

**Files:**
- Modify: `packages/agm/src/app/list-messages.ts`
- Modify: `packages/agm/src/app/read-message.ts`
- Possibly modify CLI command files if flags need clarification
- Test: relevant unit tests

- [ ] **Step 1: Write failing tests for chosen UX policy**

If daemon does not materialize local inbox in Phase 1, add explicit behavior:
- `list --dir inbox` shows derived/local inbox only
- `list --dir outbox` continues to work from self repo
- errors/help text explain that remote inbox visibility depends on daemon sync/materialization policy

- [ ] **Step 2: Implement minimal behavior**

Avoid accidental code paths that still read contact local clones as if they were writable mailboxes.

- [ ] **Step 3: Run tests and commit**

```bash
git add packages/agm/src/app/list-messages.ts packages/agm/src/app/read-message.ts
git commit -m "refactor(agm): align read and list with remote-only model"
```

### Task 8: Rewrite docs and help to remove shared-volume semantics

**Files:**
- Modify: `packages/agm/README.md`
- Modify: `packages/agm/src/index.ts`
- Modify: `docs/2026-03-30-agent-git-mail-smoke-test-plan.md`
- Modify: `docs/2026-03-30-openclaw-plugin-docker-session-handoff.md`
- Create: `docs/2026-04-01-agm-remote-repo-only-decision.md`

- [ ] **Step 1: Update README architecture section**

State explicitly:
- user provides remote repo URLs
- each agent has its own local clone
- same-host and cross-host use the same transport semantics
- shared-volume/local direct-write is not a supported product model

- [ ] **Step 2: Update examples/CLI help**

All examples should use remote-first bootstrap flags and `atlas/boron`-style test names.

- [ ] **Step 3: Capture boundary decision**

Write one short decision note explaining why the product chose remote-only Phase 1 and what was explicitly dropped.

- [ ] **Step 4: Commit**

```bash
git add packages/agm/README.md packages/agm/src/index.ts docs/2026-03-30-agent-git-mail-smoke-test-plan.md docs/2026-03-30-openclaw-plugin-docker-session-handoff.md docs/2026-04-01-agm-remote-repo-only-decision.md
git commit -m "docs(agm): declare remote-repo-only transport model"
```

---

## Chunk 5: End-to-end verification

### Task 9: Add/update real remote E2E harness using atlas/boron

**Files:**
- Modify: `docker/e2e-test/docker-compose.yml`
- Modify/create: any helper scripts under `docker/e2e-test/`
- Test artifacts/docs: update relevant E2E docs

- [ ] **Step 1: Remove shared-volume-as-success-path assumptions**

Containers may still share non-mailbox code mounts for convenience, but mailbox transport must occur through remote repos only.

- [ ] **Step 2: Make E2E use existing test repos**

Required repos:
- `atlas` → `https://github.com/T0UGH/test-mailbox-a.git`
- `boron` → `https://github.com/T0UGH/test-mailbox-b.git`

Each container must clone only its own repo locally.
Do not mount the other agent’s mailbox working tree into the sender’s path.

- [ ] **Step 3: Verify send + reply in both directions**

Required evidence:
- atlas send detected by boron daemon
- boron reply detected by atlas daemon
- atlas and boron each show sender-owned remote commits only
- no code path writes directly into the other agent’s local clone

- [ ] **Step 4: Run verification commands**

Run at minimum:
```bash
npm test --workspace @t0u9h/agent-git-mail
# plus the real docker E2E commands documented in docker/e2e-test
```

Record exact commands and key log lines in the final handoff note.

- [ ] **Step 5: Commit**

```bash
git add docker/e2e-test docker/e2e-test/*
git commit -m "test(agm): verify remote-only transport with atlas and boron"
```

---

## Acceptance Criteria

The work is only complete when all of the following are true:

- `send` and `reply` mutate only the sender’s local clone
- config/bootstrap require remote repo URL + self local clone path
- daemon detects inbound mail by fetching/polling contact remotes, not by direct recipient-local writes
- same-host and cross-host semantics are identical
- docs no longer imply shared-volume/local direct-write is a supported transport model
- atlas/boron real remote E2E passes in both directions

## Non-Goals for this change

- Supporting direct local-path-only transport
- Supporting mixed local-path + remote transport in one config
- Preserving old “contacts: name -> local repo path” as first-class product behavior
- Solving advanced conflict resolution beyond safe fetch/pull/retry behavior needed for E2E

## Final Handoff Requirements

When implementation is complete, provide a closure note containing:
- what changed in config/bootstrap/send/reply/daemon
- exact verification commands run
- key E2E log evidence
- remaining gaps, if any
- whether local inbox materialization was included in Phase 1 or deferred
