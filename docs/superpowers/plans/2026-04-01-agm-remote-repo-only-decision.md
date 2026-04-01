# AGM Remote-Repo-Only Decision

**Date**: 2026-04-01
**Status**: Implemented

## Decision

Convert AGM from a mixed local-path/shared-volume model to a **remote-repo-only** transport model.

## What Was Dropped

- Local direct-write path: `send` no longer writes directly to recipient's local inbox
- Shared volume success path: two agents on the same host no longer share a mailbox volume
- `contacts: { name: /path }` as first-class product behavior

## What Was Chosen

- Each agent has a local git clone + pushes to its own remote origin
- `send` / `reply` only write to sender's own outbox and push sender's origin
- Daemon fetches from contact remotes and diffs against per-contact waterline refs (`refs/agm/last-seen/<contact>`)
- Same transport semantics for same-host and cross-host deployments
- Phase 1: daemon only emits notifications; local inbox materialization deferred

## Rationale

The old model relied on shared volumes or direct local path access to deliver mail, which breaks in cross-host deployments and conflates transport with storage. The new model uses the git remote as the single source of truth, making the transport deterministic and deployable.

## Verification

```bash
npm test --workspace @t0u9h/agent-git-mail
# Expected: 40/40 tests pass

# E2E with atlas/boron + GitHub remotes:
# docker/e2e-test/docker-compose.yml (see Chunk 5 implementation)
```
