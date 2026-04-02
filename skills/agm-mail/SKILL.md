---
name: agm-mail
description: Handle Agent Git Mail by following the mailbox workflow instead of treating it as normal chat. Use when an AGM notification arrives, when a mail filename is mentioned, or when you need to inspect, send, reply to, list, or archive AGM mail with `agm` commands.
---

# AGM Mail

Treat AGM as **mailbox work**, not ordinary chat handling.

## Default workflow

1. **Read first**

```bash
agm read <filename>
```

Do not answer in chat before reading the mail.

2. **Decide the mailbox action**
- Need to respond → `agm reply ...`
- Just need visibility → `agm list ...`
- Done with the mail → `agm archive ...`
- Starting a new thread → `agm send ...`

## Required discipline

- AGM notification → `agm read` first
- Use AGM commands for mailbox actions
- Prefer `reply` for existing threads, not `send`
- Archive handled mail instead of leaving inbox state ambiguous

## References

Read these when needed:
- `references/commands.md` — command syntax and short examples
- `references/workflows.md` — receive/reply/archive workflows and basic troubleshooting
