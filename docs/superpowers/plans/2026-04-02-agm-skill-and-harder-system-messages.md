# AGM Skill + Harder System Messages Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AGM notifications harder to ignore by shipping an AGM-specific skill through the plugin install path and upgrading system-event text so agents reliably enter the `agm` workflow (`read → reply/archive`) instead of improvising.

**Architecture:** Keep the change lightweight and product-shaped. The plugin remains responsible for detecting new inbox mail and enqueueing a system event, but the event text becomes action-oriented and explicitly tells the agent to use AGM commands. In parallel, the plugin installation/bootstrap path must ensure an AGM skill is present locally so the agent has a concrete workflow reference the moment the notification lands.

**Tech Stack:** TypeScript, Node.js, OpenClaw plugin package, AGM CLI package, markdown skill files, existing installer/bootstrap scripts.

---

## File/Boundary Map

### Existing files to modify
- `packages/openclaw-plugin/src/index.ts`
  - Change queued system-event text from weak informational wording to strong AGM action-oriented wording.
- `packages/openclaw-plugin/test/routing.test.ts`
  - Extend tests to assert the stronger message format if route/message helpers remain here.
- `packages/openclaw-plugin/package.json`
  - Include the AGM skill files in the published plugin tarball if not already included.
- `scripts/bootstrap.sh`
  - Ensure local install flow places the AGM skill into the expected OpenClaw skills directory.
- `scripts/install-openclaw.sh`
  - Ensure curl-friendly installer also installs/copies the AGM skill.
- `README.md`
  - Update top-level Quick Start to mention that plugin install also installs the AGM skill and explain the notification handling expectation.
- `packages/agm/README.md`
  - Update package Quick Start / operational docs with the new notification semantics and skill-install behavior.

### New files likely needed
- `packages/openclaw-plugin/skills/agm-mail/SKILL.md`
  - The AGM-specific operational skill agents should use when a mail notification arrives.
- `packages/openclaw-plugin/skills/agm-mail/EXAMPLES.md` or inline examples inside `SKILL.md`
  - Optional, if the skill needs concrete command patterns but SKILL.md gets too dense.
- `packages/openclaw-plugin/test/skill-install.test.ts`
  - If installer/packaging verification needs explicit coverage.
- `docs/2026-04-02-agm-skill-and-notification-hardening.md`
  - Short design note recording why this work exists and what behavior is expected.

### Existing files to inspect before editing
- `packages/openclaw-plugin/README.md`
  - To align wording with plugin responsibilities.
- `packages/openclaw-plugin/openclaw.plugin.json`
  - To see whether a plugin-local skill/assets declaration pattern already exists.
- any existing skill-install path used by this repo or by other OpenClaw plugins in your environment
  - Follow established packaging/install conventions instead of inventing a one-off path.

---

## Design Decisions To Lock Before Coding

1. **This is a lightweight hardening pass, not a full runtime action planner.**
2. **The plugin should ship the AGM skill automatically.** Users should not perform a second manual skill install.
3. **System messages must be action-oriented, not merely descriptive.**
4. **The default flow to encode is:** `agm read <file>` → decide → `agm reply` or `agm archive`.
5. **Do not auto-run AGM commands yet.** This pass only hardens discovery and routing.

---

## Chunk 1: Define the skill content and notification contract

### Task 1: Write the AGM skill content first

**Files:**
- Create: `packages/openclaw-plugin/skills/agm-mail/SKILL.md`
- Optionally create: `packages/openclaw-plugin/skills/agm-mail/EXAMPLES.md`

- [ ] **Step 1: Write the failing expectation as a short checklist in the plan branch**

Create a local note/checklist describing what the skill must cover:
- when an AGM system message arrives, treat it as mailbox work, not chat
- first action is `agm read <file>`
- if a response is needed, use `agm reply`
- after completion, use `agm archive`
- do not replace mail workflow with ordinary chat reply

This step is just to anchor the exact content before writing the skill file.

- [ ] **Step 2: Write `SKILL.md` with the minimum useful content**

The skill should explicitly include:
- trigger condition: AGM notification / new agent git mail system event
- required first action: `agm read <file>`
- follow-up actions: `agm reply` / `agm archive`
- warning not to answer in generic chat without first reading the mail
- note that mailbox workflow lives in AGM commands, not freeform reply behavior

Use concrete examples like:

```bash
agm read 2026-04-02T01-57-23Z-mt-to-leo-ff97.md
agm reply 2026-04-02T01-57-23Z-mt-to-leo-ff97.md --from leo --body-file ./reply.md
agm archive 2026-04-02T01-57-23Z-mt-to-leo-ff97.md --agent leo
```

- [ ] **Step 3: Review for brevity and forcefulness**

Check manually that the skill:
- is not a long tutorial
- reads like operating instructions
- makes the default action path unavoidable

- [ ] **Step 4: Commit**

```bash
git add packages/openclaw-plugin/skills/agm-mail
git commit -m "feat(plugin): add AGM operational skill"
```

### Task 2: Define the stronger system message wording

**Files:**
- Modify: `packages/openclaw-plugin/src/index.ts`
- Test: `packages/openclaw-plugin/test/routing.test.ts`

- [ ] **Step 1: Write a failing test for message wording**

Add or update a test asserting that the notification text is no longer just:
- `New agent git mail: from=..., file=...`

Instead assert the message includes all of:
- strong AGM label (e.g. `[AGM ACTION REQUIRED]`)
- sender
- filename
- explicit next step: `agm read <file>`
- explicit note to use AGM commands, not generic chat reply

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm test --workspace @t0u9h/openclaw-agent-git-mail -- routing.test.ts
```
Expected: FAIL because current message is still too weak.

- [ ] **Step 3: Implement the new message template**

Recommended shape:

```text
[AGM ACTION REQUIRED]
New mail delivered to your inbox.
from=<from>
file=<filename>

Use AGM commands, not generic chat reply.
Next step: agm read <filename>
Then decide whether to agm reply or agm archive.
```

Keep it concise but directive.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm test --workspace @t0u9h/openclaw-agent-git-mail -- routing.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/openclaw-plugin/src/index.ts packages/openclaw-plugin/test/routing.test.ts
git commit -m "feat(plugin): harden AGM notification messages"
```

---

## Chunk 2: Ship the skill automatically with plugin install/bootstrap

### Task 3: Decide and implement the plugin-local skill installation path

**Files:**
- Modify: `scripts/bootstrap.sh`
- Modify: `scripts/install-openclaw.sh`
- Modify: `packages/openclaw-plugin/package.json`
- Possibly modify: `packages/openclaw-plugin/README.md`
- Test: add installer/packaging test if practical

- [ ] **Step 1: Inspect how plugin-owned assets are currently packaged**

Check:
- whether `package.json.files` already includes a `skills/` directory
- whether install flow already copies non-code assets anywhere
- whether an existing OpenClaw plugin in your environment already bundles skills; copy that pattern

Document the chosen target directory before coding.

- [ ] **Step 2: Write a failing verification step**

Use one or both of:
- `npm pack --dry-run --workspace @t0u9h/openclaw-agent-git-mail`
- a local install dry-run checklist

Expected failing condition before implementation:
- AGM skill files are not present in the plugin tarball and/or not installed into the runtime skill directory.

- [ ] **Step 3: Implement minimal packaging support**

At minimum:
- include `skills/agm-mail/**` in plugin package files
- make bootstrap/install copy those files into the target OpenClaw skills directory during install

Be explicit about destination paths in the code. Do not leave them implicit in comments.

- [ ] **Step 4: Verify packaging/install behavior**

Run:
```bash
npm pack --workspace @t0u9h/openclaw-agent-git-mail --dry-run
```
And confirm the skill files appear in the tarball.

If you add installer logic, run a local smoke path or a deterministic dry-run/log assertion.

- [ ] **Step 5: Commit**

```bash
git add packages/openclaw-plugin/package.json scripts/bootstrap.sh scripts/install-openclaw.sh packages/openclaw-plugin/README.md
 git commit -m "feat(plugin): install AGM skill with plugin"
```

### Task 4: Update Quick Start docs to describe the combined install

**Files:**
- Modify: `README.md`
- Modify: `packages/agm/README.md`
- Modify: `packages/openclaw-plugin/README.md`

- [ ] **Step 1: Update top-level README Quick Start**

Must state clearly:
- plugin install/bootstrap also installs the AGM skill
- AGM notifications are command-oriented
- if using AGM mail, the expected flow is `agm read` then `agm reply/archive`

- [ ] **Step 2: Update package README**

In `packages/agm/README.md`, adjust wording so users understand:
- mailbox notifications are not ordinary chat prompts
- the shipped AGM skill is part of the plugin experience
- `bind_session_key` can be used when the notification target should be fixed to a specific session

- [ ] **Step 3: Update plugin README**

Make plugin README say explicitly:
- it installs the AGM operational skill
- it emits stronger action-oriented system messages

- [ ] **Step 4: Run a grep sanity check**

Run:
```bash
grep -RIn "New agent git mail\|generic chat reply\|bind_session_key\|AGM ACTION REQUIRED\|install AGM skill" README.md packages/agm/README.md packages/openclaw-plugin/README.md
```
Expected: wording matches the new model.

- [ ] **Step 5: Commit**

```bash
git add README.md packages/agm/README.md packages/openclaw-plugin/README.md
git commit -m "docs: describe AGM skill and stronger notification flow"
```

---

## Chunk 3: Verify the integrated behavior end-to-end

### Task 5: Verify plugin message + skill packaging together

**Files:**
- Test docs or verification note in `docs/2026-04-02-agm-skill-and-notification-hardening.md`
- Optional test files if automation is practical

- [ ] **Step 1: Verify the skill is packaged**

Run:
```bash
npm pack --workspace @t0u9h/openclaw-agent-git-mail --dry-run
```
Expected: tarball contains `skills/agm-mail/SKILL.md` (and any companion files).

- [ ] **Step 2: Verify the stronger system message text**

Use the routing/plugin tests or a local helper to confirm the exact text shape.
Expected: message includes:
- AGM action label
- filename
- `agm read`
- reply/archive next step

- [ ] **Step 3: Verify installer/bootstrap docs and output are still coherent**

At minimum re-run:
```bash
npm run build --workspace @t0u9h/agent-git-mail
npm run build --workspace @t0u9h/openclaw-agent-git-mail
```
Optionally re-run the local installer syntax checks if touched.

- [ ] **Step 4: Write a short verification note**

Create/update:
- `docs/2026-04-02-agm-skill-and-notification-hardening.md`

Record:
- what changed
- what was verified
- any remaining gaps (e.g. no automatic execution yet)

- [ ] **Step 5: Commit**

```bash
git add docs/2026-04-02-agm-skill-and-notification-hardening.md
git commit -m "test: verify AGM skill and notification hardening"
```

---

## Acceptance Criteria

This work is complete only when all of the following are true:

- AGM plugin emits an action-oriented system message, not a weak informational reminder
- the message explicitly instructs the agent to use `agm read` first
- the shipped AGM skill exists and covers the default `read → reply/archive` flow
- plugin installation/bootstrap installs the AGM skill automatically
- README/Quick Start docs mention the shipped skill and the stronger mailbox-handling expectations
- `bind_session_key` remains documented as the hard-binding escape hatch for fixed user sessions

## Non-Goals

- Auto-running AGM commands without agent approval
- Building a full runtime action planner
- Reworking the entire plugin lifecycle/session discovery model
- Replacing mailbox workflow with chat-native replies

## Final Handoff Requirements

When implementation is complete, provide:
- exact files changed
- exact message template now emitted by the plugin
- exact skill install path used by the plugin/bootstrap flow
- packaging verification evidence (`npm pack --dry-run` or equivalent)
- docs paths updated
