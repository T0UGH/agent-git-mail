---
name: agm-mail
description: Handle Agent Git Mail with profile-based `agm` commands instead of treating AGM notifications as ordinary chat. Use when an AGM notification arrives, when a mail filename is mentioned, or when you need to inspect, send, reply to, list, or archive AGM mail.
---

# AGM Mail

Treat AGM as **mailbox work**, not ordinary chat handling.

AGM is profile-based. All examples below assume you are operating inside one AGM profile and should use:

```bash
agm --profile <profile> ...
```

Do not omit `--profile` in normal usage.

## Default workflow

1. **Read first**

```bash
agm --profile <profile> read <filename> --agent <contact>
```

Do not answer in chat before reading the mail.

2. **Decide the mailbox action**
- Need to respond → `agm --profile <profile> reply <filename> --from <self-id> --body-file <file> --dir inbox`
- Just need visibility → `agm --profile <profile> list --agent <contact>`
- Done with the mail → `agm --profile <profile> archive <filename> --agent <contact>`
- Starting a new thread → `agm --profile <profile> send --from <self-id> --to <contact> --subject <subject> --body-file <file>`

## Required discipline

- AGM notification → `agm --profile <profile> read ...` first
- Use AGM commands for mailbox actions
- Prefer `reply` for existing threads, not `send`
- Archive handled mail instead of leaving inbox state ambiguous
- `--profile` is the runtime identity; `--from` should match that profile's `self.id`

## Bootstrap / daemon reminders

If AGM is not initialized yet, the primary onboarding path is:

```bash
agm --profile <profile> bootstrap --self-id <self-id> --self-remote-repo-url <repo-url>
```

To run the daemon:

```bash
agm --profile <profile> daemon run
```

## References

Read these when needed:
- `references/commands.md` — command syntax and short examples
- `references/workflows.md` — receive/reply/archive workflows and basic troubleshooting
