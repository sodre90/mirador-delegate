# Delegate

A [Mirador](https://github.com/sodre90/mirador) plugin that lets the agent hand a self-contained task to a new conversation on another Mirador profile, such as one running a local model. The agent uses it when you ask, or for easy tasks that read a lot and answer in a few lines.

- `delegate({ profile, task })` starts the conversation in the same workspace and returns at once. If the calling conversation bypasses permissions, the new one does too.
- Set **Delegate to** on a profile, in Mirador's Profiles, and its conversations hand easy tasks to that profile without being asked, and without naming it. New conversations pick up a change.
- When that conversation's first turn ends, its last message reaches the agent as its next message, cut at 8,000 characters. A restart of Mirador in the meantime doesn't lose it: the turn picks up again and its reply still comes.
- Mirador shows the task above the calling conversation's composer, where you can stop it, and nests its conversation under the caller in the sidebar.
- A delegated conversation can't delegate again.

Needs Mirador's plugin API 5, in a Mirador with profile settings (`profileSetting` and `guidanceFor`).

## Develop

```bash
bun install
bun run typecheck
bun run test     # unit tests
scripts/e2e.sh   # e2e in a Mirador test host from MIRADOR_DIR, with Mirador's Playwright
```

`MIRADOR_DIR` is Mirador's checkout, by default `../visualized-claude-sessions`.
