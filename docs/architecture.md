# Architecture

Harness is a development loop with two agents and one referee. Claude Code orchestrates, Codex implements, and the test suite decides when a task is finished.

## Roles

| Role | Played by | Responsibilities |
|---|---|---|
| Orchestrator | Claude Code | Splits work into tasks, briefs the worker, runs the tests, reviews the result, creates branches and commits, merges, and keeps `PLAN.md` and `docs/run-log.md` current |
| Worker | Codex, through `codex-plugin-cc` | Writes the code and its tests for one task, inside the sandbox |
| Referee | The test suite and the type checker | Decides whether a task passes |
| Human | The repo owner | Approves the plan, handles escalations, and decides when to push |

## Flow

1. The orchestrator writes `PLAN.md`: small tasks, each with a goal, its files, and a definition of done.
2. For the next task, the orchestrator creates a `task/<short-name>` branch.
3. It delegates the task to Codex with the goal, the files involved, and the tests that must pass.
4. Codex writes the code and tests in the working tree.
5. The orchestrator runs the tests and the type checker itself and reviews the diff.
6. If the checks fail, the error goes back to Codex. After two failed attempts on the same task, the loop stops and asks the human.
7. If the checks pass, the orchestrator commits, merges to `main` with a merge commit, updates `PLAN.md`, and records the run in `docs/run-log.md`.
8. The loop continues with the next task.

## Design decisions

### A single orchestrator

Only one agent holds the plan and decides what happens next. Every state change goes through it: branches, commits, merges, and `PLAN.md`. The worker starts from a focused brief, so it needs only the context for its task.

### One branch per task

Each task is isolated on its own branch, so a failed attempt never reaches `main`. Merging with a merge commit keeps each task visible as a unit in the history.

### Tests as the referee

An agent's report that it finished is a claim, not evidence. The orchestrator re-runs the checks itself after every attempt, and a task counts as done only when they pass. Each definition of done names the behavior the tests must cover, so "done" is agreed before the code is written.

### Two model families

One agent reviewing its own work tends to share the blind spots that produced it. Here the code is written by one model family and reviewed by another. Running on two fixed-price plans also keeps costs predictable, with no per-token billing and no API keys to manage.

### Sandbox limits as a boundary

Codex runs in a `workspace-write` sandbox, and two of its limits shape the division of labor:

- **No network.** Codex cannot reach the npm registry, so the orchestrator installs dependencies as an environment step and records it in the run log.
- **No writes to `.git`.** Codex cannot change repository history, so the orchestrator creates all branches and commits.

The worker can only change files in the working tree. Nothing reaches the history until the orchestrator has checked it.
