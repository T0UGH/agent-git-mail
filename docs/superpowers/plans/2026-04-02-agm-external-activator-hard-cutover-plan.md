# AGM External Activator Hard-Cutover Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete a hard cutover from the abandoned OpenClaw AGM plugin model to a single-package AGM architecture where daemon + external activation both live inside `@t0u9h/agent-git-mail`.

**Architecture:** AGM becomes the only maintained integration surface. It owns mailbox transport, daemon inbox watching, activation checkpointing, and external wake-up via `openclaw agent --channel feishu ... --deliver`. The old `@t0u9h/openclaw-agent-git-mail` plugin is not retained as a migration path or compatibility layer; it must be physically removed from the codebase and from documentation as an active product path.

**Tech Stack:** TypeScript, Vitest, AGM CLI package, OpenClaw CLI invocation from AGM daemon.

---

## Hard Constraints (Non-Negotiable)

1. **Plugin must be physically deleted.**
   - Do not keep a dual-path.
   - Do not keep activator logic in plugin code.
   - Do not leave plugin as a supported migration/runtime path.

2. **Only one maintained package remains:**
   - `@t0u9h/agent-git-mail`

3. **External activation must live in AGM daemon path only.**
   - No plugin fallback.
   - No enqueue+heartbeat path.

4. **Do not modify OpenClaw core.**

5. **Do not implement multi-platform activators now.**
   - First version supports only `feishu-openclaw-agent`
   - But the activator interface must be extensible.

If any implementation choice violates the above, it is wrong even if tests pass.

---

## What Must Not Happen

These are explicitly forbidden in implementation:

- [ ] No plugin dual-path / migration bridge
- [ ] No new logic added under `packages/openclaw-plugin/src/index.ts`
- [ ] No plugin-side activator invocation
- [ ] No release of plugin as part of the new architecture
- [ ] No docs that say plugin is still the recommended path
- [ ] No shell-style escaping added to `execFileSync(..., args)` calls
- [ ] No checkpoint keying by filename alone

---

## Phase 0: Gate Check Before Any Refactor

### Task 0: Freeze the execution assumption

**Files:**
- add note in commit message / handoff, no code artifact required unless you want a short verification note in `docs/`

- [ ] **Step 1: Re-verify OpenClaw CLI from daemon-like environment**

Run a smoke command in the same kind of non-interactive environment daemon will use:

```bash
openclaw agent --channel feishu -t <openId> -m "AGM wake smoke test" --deliver
```

Required evidence:
- command found in PATH
- exit code 0
- message actually reaches target channel

- [ ] **Step 2: If this fails, stop implementation immediately**

Do not continue to refactor architecture until this gate passes.

- [ ] **Step 3: Record evidence in a short note or handoff**

---

## Phase 1: Physically delete the plugin path

### Task 1: Remove `packages/openclaw-plugin` from active architecture

**Files:**
- Delete: `packages/openclaw-plugin/**`
- Modify: root workspace/package metadata if it still references plugin workspace
- Modify: any publish/release scripts that still publish plugin
- Modify: README/docs references

- [ ] **Step 1: Delete the plugin package directory**

This is a hard cutover. Remove the package, not just disable it.

At minimum remove:
- `packages/openclaw-plugin/src/**`
- `packages/openclaw-plugin/test/**`
- `packages/openclaw-plugin/package.json`
- `packages/openclaw-plugin/README.md`
- `packages/openclaw-plugin/openclaw.plugin.json`
- `packages/openclaw-plugin/skills/**`

- [ ] **Step 2: Remove plugin from workspace/package graph**

Check root `package.json`, workspace config, release scripts, CI/test scripts. Remove references so plugin is not built or published.

- [ ] **Step 3: Remove plugin install steps from scripts/docs**

`bootstrap.sh`, `install-openclaw.sh`, README files must stop installing or referencing `@t0u9h/openclaw-agent-git-mail` as the active path.

- [ ] **Step 4: Run repo grep to confirm plugin path is dead**

Run:
```bash
grep -RIn "openclaw-agent-git-mail\|packages/openclaw-plugin\|openclaw.plugin.json\|plugins install @t0u9h/openclaw-agent-git-mail" .
```
Expected: no active runtime/docs references except historical docs you explicitly choose to retain.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove AGM OpenClaw plugin package"
```

---

## Phase 2: Move all activation behavior into AGM daemon cleanly

### Task 2: Keep only AGM-native activation path

**Files:**
- Modify: `packages/agm/src/app/run-daemon.ts`
- Modify: `packages/agm/src/activator/index.ts`
- Modify: `packages/agm/src/activator/types.ts`
- Modify: `packages/agm/src/activator/checkpoint-store.ts`
- Modify: `packages/agm/src/activator/feishu-openclaw-agent.ts`
- Test: add/expand tests under `packages/agm/test/`

- [ ] **Step 1: Remove any plugin-conditioned logic from daemon path**

`run-daemon.ts` should not mention plugin fallback, heartbeat, enqueue, or dual-path behavior.

Target daemon behavior:
1. watch local inbox
2. detect new inbox files
3. consult checkpoint store
4. invoke activator
5. on success, mark checkpoint

That is the entire activation chain.

- [ ] **Step 2: Fix activator command invocation**

For `execFileSync('openclaw', args)`:
- DO NOT shell-escape arguments manually
- DO NOT convert newlines to literal `\\n`
- pass raw strings as array arguments

This is mandatory.

- [ ] **Step 3: Tighten checkpoint key design**

Checkpoint key must be at least:
- `selfId + filename`

Recommended shape:
```json
{
  "processed": {
    "leo::2026-04-02T05-28-19Z-mt-to-leo-b899.md": {
      "activatedAt": "..."
    }
  }
}
```

Do not leave it as filename-only.

- [ ] **Step 4: Run targeted tests**

Add/fix tests covering:
- activator called once per new file
- same file does not reactivate after checkpoint written
- different self IDs with same filename do not collide
- command argument formatting preserves multiline messages correctly

- [ ] **Step 5: Commit**

```bash
git add packages/agm/src/app/run-daemon.ts packages/agm/src/activator packages/agm/test
git commit -m "feat(agm): run external activation entirely from daemon"
```

---

## Phase 3: Clean config/bootstrap around the new architecture

### Task 3: Make bootstrap/config speak only AGM + activator

**Files:**
- Modify: `packages/agm/src/config/schema.ts`
- Modify: `packages/agm/src/cli/commands/bootstrap.ts`
- Modify: `scripts/bootstrap.sh`
- Modify: `scripts/install-openclaw.sh`
- Test: relevant config/bootstrap tests

- [ ] **Step 1: Remove plugin-era config noise**

Config should describe:
- mailbox self/contact repos
- notifications routing
- activation config

It should not carry plugin-specific install assumptions.

- [ ] **Step 2: Bootstrap should initialize activation config cleanly**

If `--activation-open-id` is provided, generated config should include:
- `activation.enabled: true`
- `activation.activator: feishu-openclaw-agent`
- `activation.feishu.open_id`
- message template / poll interval defaults

- [ ] **Step 3: Stop bootstrap from installing the deleted plugin**

This is mandatory.
If current installer still installs `@t0u9h/openclaw-agent-git-mail`, remove that behavior.

- [ ] **Step 4: Run tests and smoke checks**

Verify:
- bootstrap creates valid config
- installer/bootstrap no longer mention plugin
- build succeeds without plugin package present

- [ ] **Step 5: Commit**

```bash
git add packages/agm/src/config/schema.ts packages/agm/src/cli/commands/bootstrap.ts scripts/bootstrap.sh scripts/install-openclaw.sh
git commit -m "refactor(agm): bootstrap only AGM daemon and activator"
```

---

## Phase 4: Rewrite docs to match the hard cutover

### Task 4: Rewrite README and docs around the single-package architecture

**Files:**
- Modify: `README.md`
- Modify: `packages/agm/README.md`
- Modify or archive: plugin-related docs
- Create/update: design/verification notes as needed

- [ ] **Step 1: Remove plugin as a recommended path everywhere**

Docs must no longer say:
- install plugin
- plugin installs AGM skill
- plugin emits notifications
- plugin is part of the architecture

- [ ] **Step 2: Document new architecture clearly**

README must state:
- AGM daemon watches local inbox
- AGM daemon uses external activator to wake target agent
- current supported activator: Feishu via `openclaw agent --channel feishu ... --deliver`

- [ ] **Step 3: Document operator reality**

Be explicit that:
- activation messages are user-visible
- this is an intentional tradeoff to get reliable wake-up without modifying OpenClaw core

- [ ] **Step 4: Run grep sanity check**

```bash
grep -RIn "plugin\|openclaw-agent-git-mail\|heartbeat\|enqueueSystemEvent\|requestHeartbeatNow" README.md packages/agm/README.md docs scripts
```
Expected: no stale architecture claims in active docs/scripts.

- [ ] **Step 5: Commit**

```bash
git add README.md packages/agm/README.md docs scripts
git commit -m "docs: hard-cut AGM architecture to daemon plus external activator"
```

---

## Phase 5: End-to-end verification of the real architecture

### Task 5: Verify the new chain without plugin involvement

**Files:**
- optional verification note under `docs/`

- [ ] **Step 1: Verify mail delivery still works**

Required evidence:
- sender outbox commit exists
- recipient inbox commit exists

- [ ] **Step 2: Verify external activator fires**

Required evidence:
- daemon detects new inbox file
- activator invokes `openclaw agent --channel feishu ... --deliver`
- target user-visible Feishu message is sent

- [ ] **Step 3: Verify checkpoint dedupe**

Required evidence:
- same file does not trigger twice
- new file does trigger again

- [ ] **Step 4: Verify there is no plugin in the loop**

Required evidence:
- no plugin package installed/used/required
- logs and docs show AGM daemon path only

- [ ] **Step 5: Run full tests/build**

Run at minimum:
```bash
npm test --workspace @t0u9h/agent-git-mail
npm run build --workspace @t0u9h/agent-git-mail
```

- [ ] **Step 6: Commit verification note if needed**

```bash
git add docs
git commit -m "test(agm): verify daemon external activator cutover"
```

---

## Acceptance Criteria

This work is complete only when all of the following are true:

- `packages/openclaw-plugin/` is physically removed
- no plugin runtime path remains in the active architecture
- AGM daemon alone performs inbox watching and external activation
- activator invocation uses raw `execFileSync(..., args)` without shell-escaping mistakes
- checkpoint keys are at least `selfId + filename`
- bootstrap/install no longer install or reference the old plugin
- docs describe only the daemon + external activator architecture
- end-to-end verification proves user-visible Feishu wake-up without plugin involvement

## Final Handoff Requirements

When implementation is complete, provide:
- exact files deleted (plugin removal)
- exact files changed in AGM
- exact verification commands run
- evidence of external activation message sent
- evidence that plugin is no longer part of the runtime path
