# AGM Mailbox Model Correction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct AGM’s mailbox semantics so `send` writes to the sender’s `outbox` and the recipient’s `inbox`, while daemon only watches the local agent’s own `inbox`.

**Architecture:** Keep each agent’s remote repo as that agent’s mailbox truth. Sending a message becomes a dual-write operation: sender keeps a sent copy in its own `outbox`, and the actual delivered message is written to the recipient repo’s `inbox`. Daemon returns to mailbox semantics by watching only the local agent repo and diffing `inbox/` changes, instead of scanning contact remotes’ `outbox/`.

**Tech Stack:** TypeScript, Vitest, git CLI wrapper, AGM CLI, existing config/bootstrap structure.

---

## File/Boundary Map

### Existing files to modify
- `packages/agm/src/app/send-message.ts`
  - Rework send so it writes sender `outbox` + recipient `inbox`, commits both sides, and pushes both repos.
- `packages/agm/src/app/reply-message.ts`
  - Mirror the corrected send semantics for replies.
- `packages/agm/src/app/run-daemon.ts`
  - Remove remote-outbox observer semantics; daemon should only watch the local agent repo `inbox/`.
- `packages/agm/src/app/list-messages.ts`
  - Ensure local inbox/outbox/archive listing matches corrected mailbox semantics.
- `packages/agm/src/config/index.ts`
  - Add or restore helpers needed to resolve recipient local repo path in the corrected model.
- `packages/agm/src/config/schema.ts`
  - Adjust config shape if current v2 can no longer express the needed recipient repo access for direct inbox delivery.
- `packages/agm/src/index.ts`
  - Update help/examples if current CLI help implies remote observer semantics.
- `packages/agm/README.md`
  - Rewrite docs so mailbox semantics are sender outbox + recipient inbox, daemon watches local inbox.
- `README.md`
  - Rewrite top-level docs to match the corrected model.
- `scripts/bootstrap.sh`
  - Update bootstrap flow if config needs recipient repo access details beyond remote URLs.
- `scripts/install-openclaw.sh`
  - Keep installer aligned with the corrected config model.

### Existing files likely to delete or heavily reduce
- `packages/agm/src/app/remote-mail-discovery.ts`
  - Current design is built around scanning contacts’ outboxes; likely delete outright or replace with a much smaller helper.
- `packages/agm/test/remote-daemon.test.ts`
  - Tests for observer-style daemon behavior should be removed or rewritten.

### Existing tests to rewrite
- `packages/agm/test/send.test.ts`
- `packages/agm/test/reply.test.ts`
- `packages/agm/test/daemon.test.ts`
- `packages/agm/test/config.test.ts`
- any bootstrap/config tests that currently assume remote-repo-only transport semantics

### New files likely needed
- `packages/agm/test/send-mailbox-model.test.ts`
  - Dedicated tests for sender outbox + recipient inbox behavior.
- `packages/agm/test/reply-mailbox-model.test.ts`
  - Reply behavior under the corrected model.
- `packages/agm/test/daemon-inbox-watch.test.ts`
  - Daemon only watches local inbox.
- `docs/2026-04-02-agm-mailbox-model-correction.md`
  - Short decision note capturing the model reversal and why the remote observer model was rejected.

---

## Design Decisions To Lock Before Coding

1. **Mailbox truth remains per-agent repo.** Each agent’s repo is its mailbox truth.
2. **Send is dual-write.** A successful send writes:
   - sender repo → `outbox/<file>.md`
   - recipient repo → `inbox/<file>.md`
3. **Daemon watches only local inbox.** No contact-remote outbox scanning.
4. **Outbox is sent copy, inbox is actual delivery.** These are not optional UX caches; they are mailbox semantics.
5. **Direct recipient repo write is now an accepted deployment assumption.** Do not keep arguing with this inside implementation.

If current config cannot express recipient repo write access, fix config to express the real operational model instead of preserving the wrong one.

---

## Chunk 1: Restore the mailbox model in tests before touching implementation

### Task 1: Rewrite send tests around sender outbox + recipient inbox

**Files:**
- Modify or Create: `packages/agm/test/send.test.ts`
- Possibly Create: `packages/agm/test/send-mailbox-model.test.ts`

- [ ] **Step 1: Write failing tests for corrected send semantics**

Required assertions:
- sender repo gets exactly one new file in `outbox/`
- recipient repo gets exactly one new file in `inbox/`
- both files share the same filename / logical message identity
- sender repo gets a commit
- recipient repo gets a commit
- both origins get pushed if configured

Do not test the old “recipient untouched” behavior anymore.

- [ ] **Step 2: Run tests to verify failure**

Run:
```bash
npm test --workspace @t0u9h/agent-git-mail -- send.test.ts
```
Expected: FAIL because current implementation only writes sender outbox.

- [ ] **Step 3: Commit failing-test checkpoint**

```bash
git add packages/agm/test/send.test.ts
git commit -m "test(agm): redefine send around mailbox semantics"
```

### Task 2: Rewrite reply tests around sender outbox + recipient inbox

**Files:**
- Modify or Create: `packages/agm/test/reply.test.ts`
- Possibly Create: `packages/agm/test/reply-mailbox-model.test.ts`

- [ ] **Step 1: Write failing tests for corrected reply semantics**

Required assertions:
- replier keeps a copy in its own `outbox/`
- reply is delivered into the original sender’s `inbox/`
- `reply_to` still references original message filename
- both sides commit/push as expected

- [ ] **Step 2: Run tests to verify failure**

Run:
```bash
npm test --workspace @t0u9h/agent-git-mail -- reply.test.ts
```
Expected: FAIL

- [ ] **Step 3: Commit failing-test checkpoint**

```bash
git add packages/agm/test/reply.test.ts
git commit -m "test(agm): redefine reply around mailbox semantics"
```

### Task 3: Rewrite daemon tests so it watches only local inbox

**Files:**
- Modify: `packages/agm/test/daemon.test.ts`
- Remove or Replace: `packages/agm/test/remote-daemon.test.ts`

- [ ] **Step 1: Write failing daemon tests**

Required assertions:
- daemon first-run waterline initializes against local repo HEAD
- new `inbox/*.md` commit in self repo is detected
- changes in contact outboxes are ignored entirely
- daemon no longer depends on contact remote fetch to discover mail

- [ ] **Step 2: Run tests to verify failure**

Run:
```bash
npm test --workspace @t0u9h/agent-git-mail -- daemon.test.ts remote-daemon.test.ts
```
Expected: FAIL because current daemon still uses remote discovery.

- [ ] **Step 3: Commit failing-test checkpoint**

```bash
git add packages/agm/test/daemon.test.ts packages/agm/test/remote-daemon.test.ts
git commit -m "test(agm): restore daemon to local inbox watching"
```

---

## Chunk 2: Fix config to express the real recipient delivery model

### Task 4: Correct config model so recipient repo write access is representable

**Files:**
- Modify: `packages/agm/src/config/schema.ts`
- Modify: `packages/agm/src/config/index.ts`
- Test: `packages/agm/test/config.test.ts`

- [ ] **Step 1: Inspect current config helpers and decide the minimum viable corrected shape**

The current remote-only model likely lacks the exact local/remote repo information needed to write directly into recipient inbox. Decide one corrected shape and stick to it.

Most likely corrected shape:

```yaml
self:
  id: mt
  local_repo_path: /path/to/mt-mail
  remote_repo_url: https://github.com/org/mt-mail.git

contacts:
  leo:
    repo_path: /path/to/leo-mail
    remote_repo_url: https://github.com/org/leo-mail.git
```

If direct local path is not always available, define the actual operational assumption clearly instead of hiding it.

- [ ] **Step 2: Write failing config tests for the corrected shape**

Tests should cover:
- `self.local_repo_path`
- `self.remote_repo_url`
- `contacts.<id>.repo_path`
- `contacts.<id>.remote_repo_url`
- helper functions for sender/recipient repo resolution

- [ ] **Step 3: Implement minimal schema/helper changes**

Add helpers such as:
- `getSelfRepoPath(config)`
- `getSelfRemoteRepoUrl(config)`
- `getContactRepoPath(config, id)`
- `getContactRemoteRepoUrl(config, id)`

Avoid ambiguous helper names that hide the distinction.

- [ ] **Step 4: Run tests**

Run:
```bash
npm test --workspace @t0u9h/agent-git-mail -- config.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agm/src/config/schema.ts packages/agm/src/config/index.ts packages/agm/test/config.test.ts
git commit -m "refactor(agm): express sender and recipient mailbox repos explicitly"
```

---

## Chunk 3: Re-implement send/reply as true mailbox delivery

### Task 5: Implement corrected send behavior

**Files:**
- Modify: `packages/agm/src/app/send-message.ts`
- Possibly modify: `packages/agm/src/app/git-push.ts`
- Test: send tests from Chunk 1

- [ ] **Step 1: Implement minimal send logic that matches the new tests**

Required flow:
1. load config
2. resolve sender repo path
3. resolve recipient repo path
4. write message file into sender `outbox/`
5. write same logical message into recipient `inbox/`
6. commit sender repo
7. commit recipient repo
8. push sender origin
9. push recipient origin

Do not preserve the current “sender outbox only” transport semantics.

- [ ] **Step 2: Decide filename identity rule explicitly**

Recommended: one logical mail file name shared across both sides.
Do not generate two different filenames for the same mail.

- [ ] **Step 3: Run send tests**

Run:
```bash
npm test --workspace @t0u9h/agent-git-mail -- send.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/agm/src/app/send-message.ts packages/agm/src/app/git-push.ts packages/agm/test/send.test.ts
git commit -m "feat(agm): deliver sent mail to recipient inbox"
```

### Task 6: Implement corrected reply behavior

**Files:**
- Modify: `packages/agm/src/app/reply-message.ts`
- Test: reply tests from Chunk 1

- [ ] **Step 1: Implement minimal reply logic mirroring send**

Required flow:
- write replier sent copy into replier `outbox/`
- write delivered reply into recipient `inbox/`
- preserve `reply_to`
- commit/push both sides

- [ ] **Step 2: Run reply tests**

Run:
```bash
npm test --workspace @t0u9h/agent-git-mail -- reply.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/agm/src/app/reply-message.ts packages/agm/test/reply.test.ts
git commit -m "feat(agm): deliver replies to recipient inbox"
```

---

## Chunk 4: Remove observer-style daemon logic and restore mailbox-style daemon

### Task 7: Delete remote outbox discovery from daemon path

**Files:**
- Modify: `packages/agm/src/app/run-daemon.ts`
- Delete or drastically reduce: `packages/agm/src/app/remote-mail-discovery.ts`
- Test: daemon tests from Chunk 1

- [ ] **Step 1: Implement daemon against self repo only**

Target behavior:
- daemon opens local self repo
- pull/fetch self origin as needed
- compare waterline vs local/self HEAD
- parse only newly added `inbox/*.md`
- notify for those new inbox messages

The legacy daemon already had the right directional intuition. Prefer restoring that mailbox behavior over preserving v2 observer semantics.

- [ ] **Step 2: Remove contact-outbox scanning from runtime path**

If `remote-mail-discovery.ts` is no longer needed, delete it.
If any helper logic remains useful, keep only the minimal pieces and rename accordingly.

- [ ] **Step 3: Run daemon tests**

Run:
```bash
npm test --workspace @t0u9h/agent-git-mail -- daemon.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/agm/src/app/run-daemon.ts packages/agm/src/app/remote-mail-discovery.ts packages/agm/test/daemon.test.ts packages/agm/test/remote-daemon.test.ts
git commit -m "refactor(agm): make daemon watch local inbox only"
```

---

## Chunk 5: Align UX commands, bootstrap, and docs with the corrected model

### Task 8: Fix list/read/help/bootstrap semantics

**Files:**
- Modify: `packages/agm/src/app/list-messages.ts`
- Modify: `packages/agm/src/app/read-message.ts` if needed
- Modify: `packages/agm/src/cli/commands/bootstrap.ts`
- Modify: `packages/agm/src/index.ts`
- Test: relevant config/bootstrap/list tests

- [ ] **Step 1: Ensure list/read operate against true mailbox semantics**

Expected behavior:
- inbox = actual delivered mail
- outbox = sent copy
- archive = archived local mail

No docs/help text should imply inbox is an optional materialized cache from remote observer logic.

- [ ] **Step 2: Update bootstrap around the corrected config model**

If contacts now need both recipient repo path and remote URL, bootstrap/docs must not pretend remote URL alone is enough.

- [ ] **Step 3: Run targeted tests**

Run:
```bash
npm test --workspace @t0u9h/agent-git-mail -- config.test.ts list.test.ts bootstrap-remote.test.ts
```
Adjust filenames to actual existing tests.

- [ ] **Step 4: Commit**

```bash
git add packages/agm/src/app/list-messages.ts packages/agm/src/app/read-message.ts packages/agm/src/cli/commands/bootstrap.ts packages/agm/src/index.ts
git commit -m "refactor(agm): align CLI semantics with mailbox model"
```

### Task 9: Rewrite docs to stop teaching the wrong model

**Files:**
- Modify: `README.md`
- Modify: `packages/agm/README.md`
- Modify: installer/bootstrap docs if present
- Create: `docs/2026-04-02-agm-mailbox-model-correction.md`

- [ ] **Step 1: Write a short decision note**

Must state clearly:
- the remote observer model was rejected
- send writes sender outbox + recipient inbox
- daemon watches only self inbox
- inbox is not optional local materialization

- [ ] **Step 2: Rewrite README examples**

Remove language implying:
- sender-only transport truth
- contact-outbox scanning
- inbox as optional cache

- [ ] **Step 3: Run a docs grep sanity check**

Run:
```bash
grep -RIn "contact remotes\|outbox scanning\|materialized by daemon\|transport truth" README.md packages/agm/README.md docs | head -n 50
```
Expected: no stale wording that contradicts the corrected model.

- [ ] **Step 4: Commit**

```bash
git add README.md packages/agm/README.md docs/2026-04-02-agm-mailbox-model-correction.md
git commit -m "docs(agm): correct mailbox model documentation"
```

---

## Chunk 6: End-to-end verification under the corrected model

### Task 10: Verify real delivery semantics with mt → leo (and reply back)

**Files:**
- Test docs or verification note in `docs/`
- Existing E2E helpers if still useful

- [ ] **Step 1: Run real send verification**

Required evidence:
- `mt` send creates sender outbox file
- `leo-mail` remote receives inbox file
- `leo` local repo pulls/fetches and sees inbox change
- `leo` daemon notices local inbox change

- [ ] **Step 2: Run reply verification**

Required evidence:
- `leo` reply creates `leo` outbox copy
- `mt-mail` remote receives inbox file
- `mt` daemon notices local inbox change

- [ ] **Step 3: Capture exact commands and outputs**

Record:
- send command
- git log evidence on both repos
- inbox/outbox file paths on both sides
- daemon/plugin-visible evidence if available

- [ ] **Step 4: Run full tests**

Run:
```bash
npm test --workspace @t0u9h/agent-git-mail
```
Expected: PASS

- [ ] **Step 5: Commit verification artifacts if appropriate**

Only commit stable docs/scripts, not temporary logs.

```bash
git add docs <any stable helper changes>
git commit -m "test(agm): verify corrected mailbox delivery model"
```

---

## Acceptance Criteria

This work is complete only when all of the following are true:

- `send` writes to sender `outbox` and recipient `inbox`
- `reply` writes to sender `outbox` and recipient `inbox`
- daemon watches only the local agent’s own `inbox`
- contact-outbox scanning is removed from runtime semantics
- config/bootstrap/docs reflect the real operational model
- mt → leo real delivery is verified with repo evidence
- leo → mt reply path is verified with repo evidence

## Non-Goals

- Preserving the remote observer model
- Treating inbox as optional materialized cache
- Re-arguing direct recipient repo write permissions
- General event-stream transport abstractions

## Final Handoff Requirements

When implementation is complete, provide:
- exact files changed
- exact tests run
- exact send/reply repo evidence on both sides
- confirmation that daemon no longer scans contact outboxes
- remaining gaps, if any
