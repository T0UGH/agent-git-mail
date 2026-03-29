# Agent Git Mail v0 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Agent Git Mail v0 as a TypeScript/Node monorepo with a working `agm` CLI/daemon and a minimal OpenClaw plugin integration path.

**Architecture:** Keep the repo as a two-package monorepo: `packages/agm` is the product body (CLI, protocol, git orchestration, daemon), and `packages/openclaw-plugin` is the host adapter (session binding, inject, wake). Git remains the source of truth; daemon runtime state is represented by a local git ref such as `refs/agm/last-seen`, not a custom checkpoint file.

**Tech Stack:** TypeScript, Node.js, npm workspaces, system `git` CLI, YAML frontmatter, OpenClaw plugin runtime.

---

## File Structure

### Repository root
- Create: `package.json` — root workspace scripts (`build`, `test`, `lint` if needed)
- Create: `tsconfig.base.json` — shared TS compiler options
- Create: `.gitignore` — Node/TS build artifacts
- Create: `packages/agm/package.json`
- Create: `packages/agm/tsconfig.json`
- Create: `packages/openclaw-plugin/package.json`
- Create: `packages/openclaw-plugin/tsconfig.json`

### `packages/agm`
- Create: `packages/agm/src/index.ts` — CLI entry
- Create: `packages/agm/src/config/schema.ts` — config schema
- Create: `packages/agm/src/config/load.ts` — config loading and resolution
- Create: `packages/agm/src/config/paths.ts` — config file path helpers
- Create: `packages/agm/src/domain/filename.ts` — filename generation/parsing
- Create: `packages/agm/src/domain/frontmatter.ts` — 6-field message schema + parse/serialize helpers
- Create: `packages/agm/src/domain/message.ts` — message model helpers
- Create: `packages/agm/src/git/exec.ts` — safe git subprocess wrapper
- Create: `packages/agm/src/git/repo.ts` — repo operations wrapper
- Create: `packages/agm/src/git/waterline.ts` — git ref waterline helpers (`refs/agm/last-seen`)
- Create: `packages/agm/src/app/send-message.ts`
- Create: `packages/agm/src/app/reply-message.ts`
- Create: `packages/agm/src/app/read-message.ts`
- Create: `packages/agm/src/app/list-messages.ts`
- Create: `packages/agm/src/app/archive-message.ts`
- Create: `packages/agm/src/app/run-daemon.ts`
- Create: `packages/agm/src/cli/commands/config.ts`
- Create: `packages/agm/src/cli/commands/send.ts`
- Create: `packages/agm/src/cli/commands/reply.ts`
- Create: `packages/agm/src/cli/commands/read.ts`
- Create: `packages/agm/src/cli/commands/list.ts`
- Create: `packages/agm/src/cli/commands/archive.ts`
- Create: `packages/agm/src/cli/commands/daemon.ts`

### `packages/openclaw-plugin`
- Create: `packages/openclaw-plugin/src/index.ts` — plugin registration entry
- Create: `packages/openclaw-plugin/src/session-binding.ts` — agent↔session mapping
- Create: `packages/openclaw-plugin/src/notify.ts` — system-event + wake adapter
- Create: `packages/openclaw-plugin/src/service.ts` — plugin-side daemon/service bootstrapping

### Tests
- Create: `packages/agm/test/filename.test.ts`
- Create: `packages/agm/test/frontmatter.test.ts`
- Create: `packages/agm/test/config.test.ts`
- Create: `packages/agm/test/git-waterline.test.ts`
- Create: `packages/agm/test/send.test.ts`
- Create: `packages/agm/test/reply.test.ts`
- Create: `packages/agm/test/archive.test.ts`
- Create: `packages/agm/test/daemon.test.ts`

---

## Chunk 1: Monorepo skeleton

### Task 1: Create workspace root

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `packages/agm/package.json`
- Create: `packages/agm/tsconfig.json`
- Create: `packages/openclaw-plugin/package.json`
- Create: `packages/openclaw-plugin/tsconfig.json`

- [ ] **Step 1: Create root `package.json` with npm workspaces**

Include:
- `workspaces: ["packages/*"]`
- scripts: `build`, `test`
- dev deps for TypeScript + test runner chosen by implementer

- [ ] **Step 2: Create `tsconfig.base.json`**

Include conservative Node-targeted compiler settings shared by both packages.

- [ ] **Step 3: Create `.gitignore`**

Ignore at least:
- `node_modules/`
- `dist/`
- `coverage/`
- `.DS_Store`

- [ ] **Step 4: Create package manifests and tsconfig files for both packages**

Requirements:
- `packages/agm` exposes CLI bin `agm`
- `packages/openclaw-plugin` builds independently

- [ ] **Step 5: Run install and build smoke test**

Run:
```bash
npm install
npm run build
```

Expected:
- workspace install succeeds
- both packages compile without runtime code yet

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.base.json .gitignore packages/agm/package.json packages/agm/tsconfig.json packages/openclaw-plugin/package.json packages/openclaw-plugin/tsconfig.json
git commit -m "chore: initialize monorepo workspace"
```

---

## Chunk 2: `agm` config + protocol foundation

### Task 2: Implement config schema and loading

**Files:**
- Create: `packages/agm/src/config/schema.ts`
- Create: `packages/agm/src/config/load.ts`
- Create: `packages/agm/src/config/paths.ts`
- Test: `packages/agm/test/config.test.ts`

- [ ] **Step 1: Write failing tests for config path resolution and schema validation**

Cover:
- valid config with `agents.<name>.repo_path`
- valid `runtime.poll_interval_seconds`
- missing agent mapping rejected when command asks for unknown agent

- [ ] **Step 2: Run tests to confirm failure**

Run:
```bash
npm test -- packages/agm/test/config.test.ts
```

- [ ] **Step 3: Implement config schema**

Schema must allow only:
```yaml
agents:
  <name>:
    repo_path: <string>
runtime:
  poll_interval_seconds: <number>
```

No speculative fields.

- [ ] **Step 4: Implement config loading**

Requirements:
- load a single config file path helper
- parse YAML
- validate with schema
- return typed result

- [ ] **Step 5: Re-run tests and fix until green**

- [ ] **Step 6: Commit**

```bash
git add packages/agm/src/config packages/agm/test/config.test.ts
git commit -m "feat(agm): add config loading and validation"
```

### Task 3: Implement frontmatter and message schema

**Files:**
- Create: `packages/agm/src/domain/frontmatter.ts`
- Create: `packages/agm/src/domain/message.ts`
- Test: `packages/agm/test/frontmatter.test.ts`

- [ ] **Step 1: Write failing tests for parse + serialize**

Cover the 6 approved fields:
- `from`
- `to`
- `subject`
- `created_at`
- `reply_to` (optional)
- `expects_reply`

- [ ] **Step 2: Run tests to confirm failure**

- [ ] **Step 3: Implement parser and serializer**

Requirements:
- parse YAML frontmatter from markdown
- serialize exact 6-field schema
- reject unknown/malformed required fields conservatively

- [ ] **Step 4: Re-run tests**

- [ ] **Step 5: Commit**

```bash
git add packages/agm/src/domain/frontmatter.ts packages/agm/src/domain/message.ts packages/agm/test/frontmatter.test.ts
git commit -m "feat(agm): add message frontmatter schema"
```

### Task 4: Implement filename rules

**Files:**
- Create: `packages/agm/src/domain/filename.ts`
- Test: `packages/agm/test/filename.test.ts`

- [ ] **Step 1: Write failing tests for filename generation**

Cover:
- timestamp-readable format
- `from` / `to` included
- collision suffix support
- `.md` extension

- [ ] **Step 2: Run tests to confirm failure**

- [ ] **Step 3: Implement generator/parser**

Rules:
- filename is primary identifier
- format is readable timestamp + `from-to-to`
- optional short suffix on collision

- [ ] **Step 4: Re-run tests**

- [ ] **Step 5: Commit**

```bash
git add packages/agm/src/domain/filename.ts packages/agm/test/filename.test.ts
git commit -m "feat(agm): add filename generation rules"
```

---

## Chunk 3: Git wrapper + waterline spike closure

### Task 5: Implement safe git subprocess wrapper

**Files:**
- Create: `packages/agm/src/git/exec.ts`
- Create: `packages/agm/src/git/repo.ts`

- [ ] **Step 1: Implement a single subprocess helper for `git` invocations**

Requirements:
- explicit cwd required
- stdout/stderr captured
- non-zero exit converted to structured error

- [ ] **Step 2: Implement repo guard helpers**

At minimum:
- verify repo exists
- read HEAD SHA
- read current branch or symbolic HEAD safely
- run `git add -- <file>`
- run `git commit`
- run `git push`
- run `git pull --rebase`
- run `git mv`
- run `git diff --name-status`

- [ ] **Step 3: Manual smoke test against a temp repo**

Expected:
- each helper behaves exactly like underlying git CLI

- [ ] **Step 4: Commit**

```bash
git add packages/agm/src/git/exec.ts packages/agm/src/git/repo.ts
git commit -m "feat(agm): add git cli wrapper"
```

### Task 6: Implement git ref waterline

**Files:**
- Create: `packages/agm/src/git/waterline.ts`
- Test: `packages/agm/test/git-waterline.test.ts`

- [ ] **Step 1: Write failing tests for waterline read/write behavior**

Cover:
- missing `refs/agm/last-seen` returns absent state
- write updates ref
- read returns exact SHA

- [ ] **Step 2: Run tests to confirm failure**

- [ ] **Step 3: Implement waterline helpers**

Rules:
- use local ref `refs/agm/last-seen`
- no checkpoint file
- this is daemon-local runtime state, not repo protocol

- [ ] **Step 4: Re-run tests**

- [ ] **Step 5: Manual spike verification in a real temp repo**

Commands to prove:
```bash
git update-ref refs/agm/last-seen <sha>
git rev-parse --verify refs/agm/last-seen
```

- [ ] **Step 6: Commit**

```bash
git add packages/agm/src/git/waterline.ts packages/agm/test/git-waterline.test.ts
git commit -m "feat(agm): add git ref waterline support"
```

---

## Chunk 4: CLI command implementation

### Task 7: Create CLI entry and `config` command

**Files:**
- Create: `packages/agm/src/index.ts`
- Create: `packages/agm/src/cli/commands/config.ts`

- [ ] **Step 1: Implement CLI root entry with subcommand registration**

Subcommands required:
- `config`
- `send`
- `reply`
- `read`
- `list`
- `archive`
- `daemon`

- [ ] **Step 2: Implement minimal `agm config` behavior**

Support only what v0 needs:
- `show`
- `get`
- `set`
- `edit`

- [ ] **Step 3: Run help smoke test**

Run:
```bash
node packages/agm/dist/index.js --help
```

- [ ] **Step 4: Commit**

```bash
git add packages/agm/src/index.ts packages/agm/src/cli/commands/config.ts
git commit -m "feat(agm): add cli entry and config command"
```

### Task 8: Implement `send`

**Files:**
- Create: `packages/agm/src/app/send-message.ts`
- Create: `packages/agm/src/cli/commands/send.ts`
- Test: `packages/agm/test/send.test.ts`

- [ ] **Step 1: Write failing end-to-end test using two temp repos**

Cover:
- body loaded from `--body-file`
- sender `outbox/<filename>.md` created
- recipient `inbox/<filename>.md` created
- two separate commits
- pushes happen when remotes are configured

- [ ] **Step 2: Run test to confirm failure**

- [ ] **Step 3: Implement send flow**

Required behavior:
- `--from <agent>` and `--to <agent>` explicit in v0
- load sender/recipient repo paths from config
- generate frontmatter + filename
- write sender outbox file
- commit **only** sender outbox file
- push sender repo if remote exists
- write recipient inbox file
- commit **only** recipient inbox file
- push recipient repo if remote exists

- [ ] **Step 4: Re-run test**

- [ ] **Step 5: Manual verify git history only contains target files**

- [ ] **Step 6: Commit**

```bash
git add packages/agm/src/app/send-message.ts packages/agm/src/cli/commands/send.ts packages/agm/test/send.test.ts
git commit -m "feat(agm): implement send command"
```

### Task 9: Implement `reply`

**Files:**
- Create: `packages/agm/src/app/reply-message.ts`
- Create: `packages/agm/src/cli/commands/reply.ts`
- Test: `packages/agm/test/reply.test.ts`

- [ ] **Step 1: Write failing test for reply by filename**

Required contract:
```bash
agm reply <filename> --from mt --body-file ./reply.md
```

Cover:
- original message located by filename
- `reply_to` equals original filename
- recipient flips from original sender

- [ ] **Step 2: Run test to confirm failure**

- [ ] **Step 3: Implement reply flow**

Rules:
- reply target is positional filename, not `--to`
- derive target recipient from original message frontmatter
- reuse send flow internally where sensible

- [ ] **Step 4: Re-run test**

- [ ] **Step 5: Commit**

```bash
git add packages/agm/src/app/reply-message.ts packages/agm/src/cli/commands/reply.ts packages/agm/test/reply.test.ts
git commit -m "feat(agm): implement reply command"
```

### Task 10: Implement `read`, `list`, and `archive`

**Files:**
- Create: `packages/agm/src/app/read-message.ts`
- Create: `packages/agm/src/app/list-messages.ts`
- Create: `packages/agm/src/app/archive-message.ts`
- Create: `packages/agm/src/cli/commands/read.ts`
- Create: `packages/agm/src/cli/commands/list.ts`
- Create: `packages/agm/src/cli/commands/archive.ts`
- Test: `packages/agm/test/archive.test.ts`

- [ ] **Step 1: Implement `read` and `list` first**

Rules:
- `read` reads one file and prints parsed content
- `list` only reads frontmatter, not full body dependence

- [ ] **Step 2: Write failing test for archive move semantics**

Cover:
- `inbox/<file>` moved via `git mv` to `archive/<file>`
- commit includes only moved target
- push is required

- [ ] **Step 3: Implement `archive`**

Rules:
- use `git mv`
- commit exact target move
- `push` required; do not silently stop at local-only archive

- [ ] **Step 4: Re-run tests**

- [ ] **Step 5: Commit**

```bash
git add packages/agm/src/app/read-message.ts packages/agm/src/app/list-messages.ts packages/agm/src/app/archive-message.ts packages/agm/src/cli/commands/read.ts packages/agm/src/cli/commands/list.ts packages/agm/src/cli/commands/archive.ts packages/agm/test/archive.test.ts
git commit -m "feat(agm): implement read list and archive commands"
```

---

## Chunk 5: Daemon implementation

### Task 11: Implement daemon loop

**Files:**
- Create: `packages/agm/src/app/run-daemon.ts`
- Create: `packages/agm/src/cli/commands/daemon.ts`
- Test: `packages/agm/test/daemon.test.ts`

- [ ] **Step 1: Write failing daemon test against a temp repo**

Cover:
- no waterline on first start creates `refs/agm/last-seen` and emits no historical notification
- later new commit with `A inbox/*.md` is detected
- waterline advances only after successful processing of this loop

- [ ] **Step 2: Run test to confirm failure**

- [ ] **Step 3: Implement daemon start semantics**

Rules:
- load repo path and poll interval from config
- verify repo valid before entering loop
- if waterline missing: set to current HEAD and sleep; do not backfill old inbox

- [ ] **Step 4: Implement each poll iteration**

Order must be:
1. `git pull --rebase`
2. read old waterline
3. read current HEAD
4. if unchanged, sleep
5. diff `old..new`
6. select only `A inbox/*.md`
7. parse each new file frontmatter to read `from`
8. emit notification payload(s)
9. update waterline to new HEAD only after successful processing

- [ ] **Step 5: Re-run tests**

- [ ] **Step 6: Manual smoke test on temp repo with real commits**

- [ ] **Step 7: Commit**

```bash
git add packages/agm/src/app/run-daemon.ts packages/agm/src/cli/commands/daemon.ts packages/agm/test/daemon.test.ts
git commit -m "feat(agm): implement daemon loop"
```

---

## Chunk 6: OpenClaw plugin spike + minimal integration

### Task 12: Verify actual plugin surface against installed OpenClaw

**Files:**
- Create: `packages/openclaw-plugin/src/index.ts`
- Create: `packages/openclaw-plugin/src/service.ts`
- Create: `packages/openclaw-plugin/src/session-binding.ts`
- Create: `packages/openclaw-plugin/src/notify.ts`

- [ ] **Step 1: Inspect actual installed OpenClaw plugin API before coding abstractions**

Required check:
- confirm service registration shape
- confirm session hook names/context
- confirm runtime methods used for system event enqueue and heartbeat wake

Do not assume interface names beyond what is verified locally.

- [ ] **Step 2: Document verified API assumptions in code comments or README note**

- [ ] **Step 3: Commit the spike notes if code changes are introduced**

```bash
git add packages/openclaw-plugin
git commit -m "chore(plugin): verify openclaw runtime integration surface"
```

### Task 13: Implement minimal plugin wiring

**Files:**
- Modify: `packages/openclaw-plugin/src/index.ts`
- Modify: `packages/openclaw-plugin/src/service.ts`
- Modify: `packages/openclaw-plugin/src/session-binding.ts`
- Modify: `packages/openclaw-plugin/src/notify.ts`

- [ ] **Step 1: Implement session binding storage**

Rules:
- track agent → current eligible session key
- keep policy conservative; only intended main/direct session should be bound

- [ ] **Step 2: Implement service startup**

Rules:
- bootstrap daemon-like watcher using `agm` library/runtime logic
- do not duplicate core daemon logic inside plugin if avoidable

- [ ] **Step 3: Implement notification adapter**

Rules:
- emit minimal notification with `from` and `filename`
- request wake after enqueue

- [ ] **Step 4: Manual end-to-end verification**

Evidence required:
- plugin loads
- session binding captured
- new inbox commit causes system event / wake path

- [ ] **Step 5: Commit**

```bash
git add packages/openclaw-plugin
git commit -m "feat(plugin): add minimal openclaw integration"
```

---

## Milestones

### Milestone 1: Repo foundation
Complete when:
- workspace builds
- config/frontmatter/filename modules implemented
- git wrapper + waterline verified

### Milestone 2: CLI closed loop
Complete when:
- `config`, `send`, `reply`, `read`, `list`, `archive` all work end-to-end on temp repos
- archive proves `git mv` + push
- commit precision verified

### Milestone 3: Daemon closed loop
Complete when:
- daemon detects newly added `inbox/*.md` via git ref waterline
- first start does not backfill
- successful loop advances waterline

### Milestone 4: OpenClaw minimal integration
Complete when:
- plugin binds a target session
- plugin receives daemon new-mail event
- plugin injects minimal system event and requests wake

---

## Verification checklist before claiming completion

- [ ] `archive` always pushes
- [ ] no command uses broad `git add .`
- [ ] sender and recipient commits stay file-precise
- [ ] filename is the only primary identifier
- [ ] no `id` field exists in message schema
- [ ] daemon uses local git ref, not checkpoint file
- [ ] plugin surface is verified against actual OpenClaw runtime, not guessed

---

Plan complete and saved to `docs/2026-03-29-agent-git-mail-v0-implementation-plan.md`. Ready to execute?
