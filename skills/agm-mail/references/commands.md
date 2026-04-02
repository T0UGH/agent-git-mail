# AGM Commands

## `agm read`

Read one mail file before taking any mailbox action.

```bash
agm read <filename>
```

Example:

```bash
agm read 2026-04-02T01-57-23Z-mt-to-leo-ff97.md
```

## `agm list`

Inspect mailbox state.

```bash
agm list --agent <self_id> --dir inbox
agm list --agent <self_id> --dir outbox
agm list --agent <self_id> --dir archive
```

Examples:

```bash
agm list --agent leo --dir inbox
agm list --agent mt --dir outbox
```

## `agm send`

Start a new mail thread.

```bash
agm send --from <self_id> --to <target_id> --subject <subject> --body-file <path>
```

Example:

```bash
agm send --from mt --to leo --subject "Need review" --body-file ./body.md
```

## `agm reply`

Reply to an existing mail thread.

```bash
agm reply <filename> --from <self_id> --body-file <path>
```

Example:

```bash
agm reply 2026-04-02T01-57-23Z-mt-to-leo-ff97.md --from leo --body-file ./reply.md
```

Use `reply` when responding to an existing file. Do not start a fresh `send` unless you are intentionally creating a new thread.

## `agm archive`

Archive a handled mail.

```bash
agm archive <filename> --agent <self_id>
```

Example:

```bash
agm archive 2026-04-02T01-57-23Z-mt-to-leo-ff97.md --agent leo
```

## Quick rules

- Notification arrived → `agm read`
- Existing thread response → `agm reply`
- New conversation → `agm send`
- Need mailbox visibility → `agm list`
- Finished handling → `agm archive`
