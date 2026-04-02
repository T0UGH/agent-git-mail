# AGM Workflows

## Handle a newly delivered mail

1. Read the file first:

```bash
agm read <filename>
```

2. Decide whether the mail needs:
- a reply
- only acknowledgment / no reply
- later follow-up

3. If replying:

```bash
agm reply <filename> --from <self_id> --body-file <path>
```

4. When handled, archive it:

```bash
agm archive <filename> --agent <self_id>
```

## Check mailbox state

Use `list` when you need visibility before acting.

```bash
agm list --agent <self_id> --dir inbox
agm list --agent <self_id> --dir outbox
agm list --agent <self_id> --dir archive
```

## Start a new mail thread

Use `send` only when you are intentionally starting a new conversation.

```bash
agm send --from <self_id> --to <target_id> --subject <subject> --body-file <path>
```

Do not use `send` as a substitute for replying to an existing file.

## Basic troubleshooting

### `Unknown agent`
Check contacts in:

```text
~/.config/agm/config.yaml
```

### Cannot find the file
First inspect mailbox state:

```bash
agm list --agent <self_id> --dir inbox
```

Then confirm you are using the exact filename from the notification.

### Notification arrived but state is unclear
Do not improvise in chat. Re-anchor on the mailbox state:

```bash
agm read <filename>
agm list --agent <self_id> --dir inbox
```

### Finished handling but inbox still looks messy
Archive the handled file explicitly:

```bash
agm archive <filename> --agent <self_id>
```
