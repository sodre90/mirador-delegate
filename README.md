# Delegate

A [Mirador](https://github.com/sodre90/mirador) plugin that lets the agent hand a self-contained task to a new conversation on another Mirador profile, such as one running a local model. The agent uses it when you ask, or for easy tasks that read a lot and answer in a few lines.

- `delegate({ profile, model, task })` starts the conversation in the same workspace and returns at once. If the calling conversation bypasses permissions, the new one does too.
- Set **Delegate to** on a profile, in Mirador's Profiles, and its conversations hand easy tasks to that profile without being asked, and without naming it. New conversations pick up a change.
- Set **Delegate model** next to it to one of that profile's models, and the tasks handed to that profile run on it; *Agent's default* leaves them on the model its agent starts on. Both can be chosen for one conversation in its header. The agent names a `model` itself only when you name one, and a model the profile's agent doesn't offer leaves the task on the agent's own, which that conversation says.
- When that conversation's first turn ends, its last message reaches the agent as its next message, cut at 8,000 characters. A caller still at work takes it into its turn once its running tools finish, rather than after the turn ends. A restart of Mirador in the meantime doesn't lose it: the turn picks up again and its reply still comes. That reply is what tells you the task is done: the delegated conversation itself doesn't notify you or wait for you as it ends.
- Mirador shows the task above the calling conversation's composer, where you can stop it, and nests its conversation under the caller in the sidebar.
- A delegated conversation can't delegate again.

Needs Mirador's plugin API 9, which brought profile settings that list a profile's models.

## Develop

```bash
bun install
bun run typecheck
bun run test     # unit tests
scripts/e2e.sh   # e2e in a Mirador test host from MIRADOR_DIR, with Mirador's Playwright
```

`MIRADOR_DIR` is Mirador's checkout, by default `../visualized-claude-sessions`.
