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

## Dashboard architecture

The dashboard uses React and TypeScript with Vite for the front end and a small Node and Express backend. In a built run, Express serves the front end and API on `127.0.0.1`; during development, Vite serves the front end on port 5173 and proxies `/api` to the backend on port 3001.

The backend parses a fixed list of repo files: `dashboard/PLAN.md`, `example-app/PLAN.md`, and `docs/run-log.md`. Read-only git commands supply recent commit hashes, subjects, dates, and tracked test file names. Parsers and derived models turn this data into API responses validated with shared Zod schemas. The React API client validates responses before the Harness, Agents, Galaxy, and Plan views display them. Agent cards represent recorded history; model and elapsed time remain unknown because neither is recorded.

The backend binds only to `127.0.0.1`. A Host allowlist guards against DNS rebinding, while state-changing requests require an allowlisted Origin and JSON content type when carrying a body. JSON bodies are limited to 16 kb and chat requests use strict schema validation. Repo file paths never come from requests. Git uses `execFile` without a shell, with fixed argument structures and a bounded commit limit, and never requests author names or emails.

The backend sends a strict Content Security Policy restricting resources and connections to the same origin and blocking objects and framing. Other headers disable content-type sniffing, suppress referrer information, and deny framing. Chat replies render as plain text.

Milestone 1 chat answers known repo questions with local code so the dashboard remains read-only and needs no API key or agent execution. The answer function starts no process; its data reader uses the same fixed git queries as the other views. Unsupported questions return suggestions. There is no chat with an agent or way to launch agents yet. Voice, widget mode, settings, and orchestrator selection are also not built; see the [dashboard roadmap](../dashboard/PLAN.md) for milestones 2 and 3 and Phase 2.

The dashboard was built with the same loop: Claude Code orchestrates, Codex implements one task per branch, and tests decide whether the task is done. The dashboard checks are `npm test`, `npm run typecheck`, and `npm run build`, also run by the CI `dashboard` job. See [the dashboard guide](../dashboard/README.md) for commands and API routes.
