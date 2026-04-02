# AGM Skill Packaging and Installer Design

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore AGM skills as a first-class deliverable after plugin removal, and upgrade the installer/bootstrap flow so AGM CLI + AGM skills are installed together in a stable, reviewable way.

**Architecture:** Treat AGM as two separate but coordinated deliverables: (1) the CLI/runtime package (`packages/agm`), and (2) the agent-facing operational skill package (`skills/agm-mail`). The installer/bootstrap flow should install the CLI, run `agm bootstrap`, then copy the repo-owned AGM skill directory into the target OpenClaw skills directory. Do not generate skill content inline in shell scripts.

**Tech Stack:** TypeScript/Node.js CLI package, bash installer scripts, OpenClaw skill directory conventions, markdown skill files.

---

## Problem Statement

AGM removed the plugin path, which was directionally correct, but the current cleanup also removed skill packaging as a first-class concern.

Current state:
- the repo no longer has a dedicated `skills/` directory
- `scripts/bootstrap.sh` writes `agm-mail/SKILL.md` via heredoc
- skill content is therefore not versioned/reviewed as a normal product artifact
- installer behavior is coupled to shell-script inline text instead of repo-owned skill assets

This is the wrong boundary.

**Plugin removal does not imply skill removal.**

The plugin was host/runtime integration.
The skill is agent operational guidance.
Those are different layers and should not be coupled.

---

## Design Decision Summary

### 1. AGM skill must exist as a repo-owned directory

Create a first-class skill directory in the repo:

```text
skills/
  agm-mail/
    SKILL.md
    references/
      commands.md
      workflows.md
```

`bootstrap.sh` and `install-openclaw.sh` should install/copy this directory.
They should **not** embed the skill body inline.

### 2. AGM skill scope is broader than “notification handling”

The skill should not only say “when notified, run `agm read`”.
It should package the core AGM operational protocol:

- `agm read`
- `agm list`
- `agm send`
- `agm reply`
- `agm archive`

The skill should encode both:
- **workflow discipline**: read first, then reply/archive
- **primitive reference**: how to use AGM commands correctly

### 3. Installer should install both CLI and skills

The install flow should now be explicitly:
1. install `@t0u9h/agent-git-mail`
2. run `agm bootstrap`
3. install `skills/agm-mail/` into OpenClaw skills dir

This should be documented as part of the product, not a side effect.

### 4. No plugin-shaped assumptions should remain in the skill path

Skill installation should work whether or not any OpenClaw plugin exists.
The skill is attached to AGM the product, not to a plugin package.

---

## File / Responsibility Map

### New files to create
- `skills/agm-mail/SKILL.md`
  - Primary operational skill for AGM mailbox handling.
- `skills/agm-mail/references/commands.md`
  - Concise command reference for `read/list/send/reply/archive`.
- `skills/agm-mail/references/workflows.md`
  - Default workflows: receive mail, inspect inbox, reply, archive, basic troubleshooting.

### Existing files to modify
- `scripts/bootstrap.sh`
  - Stop generating skill content inline.
  - Copy/install repo-owned skill directory.
- `scripts/install-openclaw.sh`
  - Ensure one-line installer fetches bootstrap and results in both CLI + skill being installed.
- `packages/agm/README.md`
  - Update install/bootstrap docs to state that AGM skills are installed from repo-owned assets.
- `README.md`
  - Top-level product shape should mention CLI/runtime + skill together.
- optionally `package.json` / publish files if skill assets need packaging discipline for release workflows
  - Only if needed for distribution; do not invent extra packaging layers unless they solve a real install path.

### Files to inspect before editing
- `scripts/bootstrap.sh`
- `scripts/install-openclaw.sh`
- `packages/agm/README.md`
- existing OpenClaw skill examples for shape only (not for cargo-culting metadata)

---

## Skill Content Design

### `skills/agm-mail/SKILL.md`

Keep it short and operational.
It should answer:
- when does this skill apply?
- what is the required default path?
- what should the agent avoid doing?
- where are the primitive references?

Required behavior guidance:
- AGM notification / mail arrival means mailbox work, not generic chat handling
- first action is `agm read <filename>`
- use AGM commands for mailbox actions
- if response needed: `agm reply ...`
- once handled: `agm archive ...`
- use `agm list` when inbox/outbox visibility is needed
- use `agm send` only for initiating new mail, not as a substitute for reply

Keep detailed syntax examples out of the main skill body when possible; move them to `references/commands.md`.

### `skills/agm-mail/references/commands.md`

This file should be the concise primitive reference.
Recommended sections:
- read
- list
- send
- reply
- archive
- common flags / required args
- 1–2 examples per command max

This is where “read/list/write-like primitives” should live in a reusable way.

### `skills/agm-mail/references/workflows.md`

This file should capture default workflows, not command syntax.
Recommended sections:
- handling a newly delivered mail
- checking mailbox state
- replying to a thread
- archiving after completion
- failure/recovery hints (missing file, wrong self id, no config, etc.)

---

## Installer / Bootstrap Design

### Current anti-pattern to remove

Do not keep this pattern:
- shell script writes SKILL.md via heredoc

Why this is bad:
- hard to review
- easy to accidentally delete during non-skill refactors
- duplicates product content into install logic
- makes skill evolution harder than it should be

### New install behavior

`bootstrap.sh` should:
1. validate env and dependencies
2. install AGM CLI
3. run `agm bootstrap`
4. install repo-owned AGM skill directory into `${OPENCLAW_SKILLS_DIR:-$HOME/.openclaw/workspace/skills}`

The copy/install logic should:
- create destination parent dir if missing
- replace/update the target `agm-mail` skill directory deterministically
- avoid partial writes where possible
- print the final install path clearly

### Installer responsibilities split

#### `scripts/install-openclaw.sh`
Use as curl-friendly entrypoint only:
- validate required env
- fetch bootstrap script
- exec bootstrap script

Do not duplicate skill content here.

#### `scripts/bootstrap.sh`
Use as actual installer/orchestrator:
- owns CLI install
- owns `agm bootstrap`
- owns skill install from repo assets

This keeps the logic centralized.

---

## Distribution / Packaging Guidance

There are two acceptable models. Pick one explicitly.

### Option A — repo-local install only (minimum viable, recommended first)
Assume skill installation happens from repo checkout / fetched bootstrap context.

Meaning:
- `bootstrap.sh` copies `skills/agm-mail/` from the current repo contents
- no extra npm packaging behavior is required yet

Use this if the one-line installer always fetches a bootstrap script that can also fetch or already includes the needed skill assets in a stable way.

### Option B — published package contains skill assets
If the long-term desired path is “`npm install -g @t0u9h/agent-git-mail` is sufficient to later install skills from package contents”, then ensure the published package contains `skills/agm-mail/**` and bootstrap can locate them from the installed package.

Use this only if there is a clear distribution need.
Do **not** add packaging complexity unless it buys a real install simplification.

**Recommended current decision:** start with **Option A**, unless Hex finds that the curl/bootstrap distribution path cannot reliably access repo-owned skill files.

---

## Documentation Changes Required

### Top-level README
Must explain AGM as:
- CLI/runtime
- operational skill for agents
- bootstrap installs both

### `packages/agm/README.md`
Must explain:
- one-line installer installs CLI and AGM skill
- skill is what teaches the agent the mailbox workflow
- skill is repo-owned and versioned, not generated ad hoc

### Shell output text
Bootstrap output should say something explicit like:
- `AGM CLI installed`
- `AGM bootstrap complete`
- `AGM skill installed: <path>`

---

## Non-Goals

Do not expand this task into:
- a new plugin package
- a multi-skill taxonomy unless needed now
- ClawHub packaging/publishing work
- automatic AGM command execution
- richer mailbox UX redesign

This task is about restoring the correct boundary and making install behavior stable.

---

## Acceptance Criteria

This design is implemented correctly only when all of the following are true:

- AGM repo contains a first-class `skills/agm-mail/` directory
- skill content is no longer generated inline in `bootstrap.sh`
- `agm-mail` skill covers both workflow discipline and AGM command primitives via references
- bootstrap/install flow installs the AGM skill into the OpenClaw skills directory
- README/docs describe AGM as CLI + skill, not CLI-only
- plugin removal no longer implies skill disappearance

---

## Recommended Implementation Chunks

## Chunk 1: Create first-class AGM skill assets

### Task 1: Create the repo-owned skill directory

**Files:**
- Create: `skills/agm-mail/SKILL.md`
- Create: `skills/agm-mail/references/commands.md`
- Create: `skills/agm-mail/references/workflows.md`

- [ ] Define the minimal skill body focused on trigger + required default flow.
- [ ] Move command syntax/examples into `references/commands.md`.
- [ ] Write `references/workflows.md` for receive → read → reply/archive discipline.
- [ ] Keep the main `SKILL.md` concise; use references for details.
- [ ] Commit.

## Chunk 2: Replace inline shell-generated skill installation

### Task 2: Refactor bootstrap to install repo-owned skill files

**Files:**
- Modify: `scripts/bootstrap.sh`
- Modify: `scripts/install-openclaw.sh`

- [ ] Remove heredoc-based `install_agm_skill()` content generation.
- [ ] Replace it with deterministic copy/install of `skills/agm-mail/`.
- [ ] Keep installer responsibilities split: curl entrypoint vs real bootstrap.
- [ ] Print final installed skill path.
- [ ] Commit.

## Chunk 3: Update docs and distribution assumptions

### Task 3: Update docs to reflect CLI + skill product shape

**Files:**
- Modify: `README.md`
- Modify: `packages/agm/README.md`

- [ ] Document that AGM includes both CLI/runtime and operational skill.
- [ ] Document that bootstrap installs both.
- [ ] Remove wording that implies skill content is shell-generated or plugin-owned.
- [ ] Commit.

## Chunk 4: Verification

### Task 4: Verify install flow end-to-end

**Files:**
- No new product files required unless a short verification note is helpful.

- [ ] Run bootstrap/install in a controlled local test path.
- [ ] Verify target skill directory exists and contains `SKILL.md` + references.
- [ ] Verify `agm bootstrap` still works after the refactor.
- [ ] Verify docs/printed output match actual behavior.
- [ ] Commit.

---

## Final Handoff Requirements

When handing this back, include:
- exact new skill directory tree
- exact install path used by bootstrap
- whether you chose distribution Option A or B and why
- verification evidence that the installed skill exists and is readable by OpenClaw
- updated docs paths
