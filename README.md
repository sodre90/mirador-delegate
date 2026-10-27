# Delegate

A [Mirador](https://github.com/sodre90/mirador) plugin that lets the agent hand a self-contained task to a new conversation on another Mirador profile, such as one running a local model. The agent uses it when you ask, or for easy tasks that read a lot and answer in a few lines.

- `delegate({ profile, task })` starts the conversation in the same workspace and returns at once. If the calling conversation bypasses permissions, the new one does too.
- When that conversation's first turn ends, its last message reaches the agent as its next message, cut at 8,000 characters.
- A delegated conversation can't delegate again.
- A restart of Mirador while the task runs leaves the reply undelivered. The conversation keeps it, so open it to read it.

Needs Mirador's plugin API 5.

## Develop

```bash
bun install
bun run typecheck
bun run test     # unit tests
scripts/e2e.sh   # e2e in a Mirador test host from MIRADOR_DIR, with Mirador's Playwright
```

`MIRADOR_DIR` is Mirador's checkout, by default `../visualized-claude-sessions`.
