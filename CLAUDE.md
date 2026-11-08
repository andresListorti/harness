# CLAUDE.md

## Public repo rules

1. All repo content is written in English.
2. This repo is public. Never write local machine paths, emails, client or product names, tokens, or any personal data.
3. Do not read or copy anything from outside this folder.
4. Before every commit, show what will be committed. Never push unless explicitly asked.
5. No photos, avatars, or images of the author anywhere (README, docs, or the example front end).
6. No commit message may contain `Claude-Session` lines or session links.

## Orchestrator rules

- You are the orchestrator. Codex (codex plugin) is the worker.
- Do not write feature code yourself unless Codex fails twice on the same task.
- Split work into small tasks: one file or function, with its test.
- Each task gets its own branch: `task/<short-name>`.
- Give Codex: goal, files involved, definition of done (which tests must pass).
- After each task, run the tests yourself. If they fail, send the error back to Codex.
- A task is done only when tests pass. Then merge to main.
- Track state in `PLAN.md`: pending, in progress, done.
- After a large feature, ask the user to run `/codex:review` on the changes.
