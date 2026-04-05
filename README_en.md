# Agent Git Mail

[中文版 README](./README.md)

Agent Git Mail (AGM) is a **Git-backed asynchronous mailbox transport** for long-running assistant agents.

It lets an agent use a Git repository as its mailbox, exchange durable async messages as Markdown files, and integrate with a local wakeup path when new mail arrives.

**Simple is better.**  
**No central server. No task orchestrator. No workflow maze.**

## What AGM is

AGM is designed for a narrow problem:

- durable async message handoff between long-running agents
- Git-native storage with auditability and history
- simple host integration for “new mail arrived” wakeup
- low-infrastructure deployments where Git is already available

In short:

> AGM is a **mailbox transport + wakeup integration layer**, not a full agent runtime.

## What AGM is not

AGM is **not** trying to be any of the following:

- not an IM system
- not a low-latency message bus
- not a task queue
- not a workflow orchestrator
- not a general-purpose multi-agent runtime
- not a replacement for obligation tracking, session management, or higher-level assistant protocols

If you need strong delivery guarantees, centralized scheduling, complex retries, or large-scale fleet coordination, AGM is the wrong layer.

## Why Git

AGM uses Git on purpose, but for a specific reason.

Git is not chosen for real-time messaging. It is chosen because it gives us:

- durable, auditable history
- simple replication and backup
- familiar hosting and auth workflows
- append-mostly collaboration primitives
- a practical async substrate with very low platform assumptions

The trade-off is explicit:

> Git is good at durability and traceability. It is not good at low-latency messaging.

## Core model

AGM keeps the core model intentionally small:

- **one agent, one mailbox repo**
- **one message, one Markdown file**
- **frontmatter + body = transport payload**
- **daemon detects new mail and triggers a wakeup path**

A typical deployment looks like this:

1. each agent owns one remote mailbox repo
2. the runtime keeps one local clone for that mailbox
3. send / reply operations write message files through Git
4. the daemon discovers new mail in the local mailbox view
5. a host-specific activator wakes the long-running assistant runtime

### Architecture at a glance

```text
sender/runtime
    |
    | write message via AGM CLI
    v
receiver mailbox repo (Git remote)
    |
    | sync to local clone
    v
AGM daemon
    |
    | detect new mail
    v
activator / host integration
    |
    | wake assistant host
    v
long-running assistant agent
```

The important boundary is:

- **mailbox transport** handles message persistence and sync
- **daemon / activator** handles new-mail discovery and wakeup
- **assistant runtime / skill layer** handles obligation, interpretation, workflow, and action

Those are different layers on purpose.

## Message model

A message is stored as a Markdown file.

- the **filename** is the primary transport identifier
- **frontmatter** stores protocol fields and metadata
- the **body** stores the message content
- `reply_to` references another message identifier

AGM keeps the transport primitive intentionally lightweight, but the protocol still needs clear semantics.

README-level guarantees and expectations:

- message IDs must be unique per mailbox
- `reply_to` forms an explicit relation between messages
- mailbox operations should be treated as **idempotent where possible**
- concurrent writers may still produce Git-level conflicts and must be handled by the runtime / tooling path
- higher-level concepts like “seen”, “obligation cleared”, or “action completed” belong to upper-layer protocol, not the raw transport primitive

## Trade-offs and non-goals

AGM is deliberately opinionated. It chooses simplicity and auditability over completeness.

### Trade-offs

- higher latency than purpose-built messaging systems
- operational friction shifts to Git repo management
- scaling characteristics are better for small deployments than large fleets
- wakeup reliability depends on the chosen integration mode
- ordering is limited by Git sync and protocol handling, not by a central broker

### Non-goals

AGM does not try to provide:

- centralized state truth for all agent workflows
- queue scheduling or priority dispatch
- built-in retry orchestration
- global ordering guarantees
- large-scale mailbox fleet management
- complete assistant behavior semantics

If your use case needs those, layer them above AGM or choose a different transport.

## Who AGM is for

### Good fit

- long-running assistant agents
- async handoff between agents or between human and agent
- small-scale or medium-scale systems that value auditability over speed
- OpenClaw-like assistant hosts that already have a wakeup / activation path

### Poor fit

- short-lived “do work then exit” coding agents
- high-throughput multi-agent execution systems
- centralized orchestration-heavy platforms
- systems that require strict queue semantics or low-latency delivery

## Quickstart

### 1. Install CLI

```bash
npm install -g @t0u9h/agent-git-mail
```

### 2. Bootstrap one profile

```bash
agm --profile agent-a bootstrap \
  --self-id agent-a \
  --self-remote-repo-url https://github.com/USER/agent-a-mailbox.git
```

Notes:

- `--profile` is the local runtime profile
- `--self-id` is the agent identity bound to that profile
- default self repo path: `~/.agm/profiles/<profile>/self`
- local self repo path is derived from the profile unless explicitly overridden
- `--self-local-repo-path` remains available as an advanced override

If you also want to configure an external activation target:

```bash
agm --profile agent-a bootstrap \
  --self-id agent-a \
  --self-remote-repo-url https://github.com/USER/agent-a-mailbox.git \
  --activation-open-id ou_xxx
```

### 3. Verify the profile

```bash
agm --profile agent-a config show
```

Example profile structure:

```yaml
profiles:
  agent-a:
    self:
      id: agent-a
      remote_repo_url: https://github.com/USER/agent-a-mailbox.git
    contacts: {}
    notifications:
      default_target: main
      bind_session_key: null
      forced_session_key: null
    runtime:
      poll_interval_seconds: 30
    activation:
      enabled: true
      activator: feishu-openclaw-agent
      dedupe_mode: filename
      feishu:
        open_id: ou_xxx
        message_template: |
          [AGM ACTION REQUIRED]
          你有新的 Agent Git Mail。
          请先执行：agm read {{filename}}
```

## Run the daemon

```bash
agm --profile agent-a daemon run
```

On macOS, you can also use launchd management:

```bash
agm --profile agent-a daemon start
agm --profile agent-a daemon status
```

When new mail is detected, the daemon triggers the configured activator / host integration.

## Wakeup model

AGM mailbox storage and agent wakeup are related, but they are not the same thing.

AGM itself does **not** claim to be a realtime notification system.
Instead, it provides a practical wakeup integration path on top of mailbox discovery.

That means:

- new mail discovery can be polling-based or host-integration-based
- delivery latency depends on runtime configuration
- wakeup success depends on the host activator path
- assistant-side dedupe / idempotency still matters

If you need broker-style notification guarantees, AGM is not the right abstraction.

## Verify AGM is working

Recommended verification path:

```bash
agm --profile agent-a config show
agm --profile agent-a doctor
agm --profile agent-a log
```

Then verify end to end:

1. send a test message from another profile
2. confirm the receiver mailbox contains the message
3. confirm the daemon detects the new message
4. confirm the activator emits the wakeup action
5. confirm the assistant host surfaces the wakeup on the receiving side

## Common commands

```bash
agm --profile agent-a send --from agent-a --to agent-b --subject "Hello" --body-file /tmp/body.md
agm --profile agent-b read <filename.md> --agent agent-a
agm --profile agent-b reply <filename.md> --from agent-b --body-file /tmp/reply.md
agm --profile agent-a list --agent agent-b --dir inbox
agm --profile agent-a archive <filename.md> --agent agent-b
agm --profile agent-a doctor
agm --profile agent-a log
```

## Current status

AGM is past pure-concept stage.

Current project focus:

- close the bootstrap flow
- converge on profile-first onboarding
- remove stale wording and legacy entry paths
- keep README, CLI behavior, and runtime truth aligned

## Monorepo structure

```text
agent-git-mail/
├─ docs/
├─ packages/
│  └─ agm/          # CLI + daemon + activation / host integration
├─ skills/
│  └─ agm-mail/     # Optional OpenClaw workflow skill for AGM mailbox operations
└─ test/
```

- `packages/agm`: CLI, daemon, protocol, Git orchestration, activation, host integration
- `skills/agm-mail`: optional OpenClaw workflow skill, not AGM's core transport entry point
- `docs/`: design, integration, implementation, and closure docs

## License

MIT
