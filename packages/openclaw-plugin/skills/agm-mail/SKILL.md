---
name: agm-mail
description: Handle Agent Git Mail notifications by following the mailbox workflow: read first, then reply or archive. Trigger when an AGM system message announces a newly delivered mail file.
---

# AGM Mail

When you receive an AGM notification, treat it as mailbox work — **not** as a normal chat message.

## Required flow

1. **Read the mail first**

```bash
agm read <filename>
```

Do not reply in chat before reading the mail.

2. **Decide what to do next**

- If a reply is needed, use AGM reply:

```bash
agm reply <filename> --from <self_id> --body-file <path>
```

- If the mail is handled and no reply is needed, archive it:

```bash
agm archive <filename> --agent <self_id>
```

## Default discipline

- AGM notification → `agm read` first
- Use AGM commands for mailbox actions
- Do not replace the mail workflow with a generic chat reply

## Example

```bash
agm read 2026-04-02T01-57-23Z-mt-to-leo-ff97.md
agm reply 2026-04-02T01-57-23Z-mt-to-leo-ff97.md --from leo --body-file ./reply.md
agm archive 2026-04-02T01-57-23Z-mt-to-leo-ff97.md --agent leo
```
