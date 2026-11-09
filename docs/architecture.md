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

The backend parses a fixed list of repo files: `dashboard/PLAN.md`, `example-app/PLAN.md`, and `docs/run-log.md`. Read-only git commands supply recent commit hashes, subjects, dates, and tracked test file names. Parsers and derived models turn this data into API responses validated with shared Zod schemas. The React API client validates responses before the Harness, Agents, Galaxy, and Plan views display them. Agent cards represent recorded history; model and elapsed time appear only when recorded in the run log. Agents and Plan poll every 5 seconds after loading, pause while hidden, and keep the last data on refresh failure.

The backend binds only to `127.0.0.1`. A Host allowlist guards against DNS rebinding, while state-changing requests require an allowlisted Origin and JSON content type when carrying a body. JSON bodies are limited to 16 kb and chat requests use strict schema validation. Repo file paths never come from requests. Git uses `execFile` without a shell, with fixed argument structures and a bounded commit limit, and never requests author names or emails.

The backend sends a strict Content Security Policy restricting resources and connections to the same origin, with `media-src 'self' blob:` for generated audio. Remote sources, objects, and framing remain blocked. Other headers disable content-type sniffing, suppress referrer information, and deny framing. Chat replies render as plain text.

Chat answers known repo questions and action requests locally, with no agent and no tokens; action requests are declined. Other questions go to Claude Code, the only CLI the chat starts, using the model selected in chat (`sonnet`, `opus`, or `haiku`). Free-text answers require Claude Code to be installed and logged in. On Windows, the runner resolves the native `claude.exe` inside the global npm package; `HARNESS_CLAUDE_BIN` can select another location of the Claude executable. If it is missing, local answers still work and the chat displays a clear CLI-not-found message.

A free-text question sent to the model includes the repo snapshot (pending and in-progress tasks, recent run-log notes, commits, and tracked test file names) and recent chat history. It uses the user's own Claude Code login and consumes that account's usage allowance or billing. The prompt is capped at 24,000 UTF-16 code units, with up to 12 recent history messages within an 8,000-unit history budget; context can be truncated or omitted.

The chat runner disables tools with `--tools ""` and passes `--strict-mcp-config`, `--safe-mode`, and `--no-session-persistence`. It starts without a shell, sends the prompt on stdin, and uses a new empty temporary working directory that is removed afterward. Voice keys and voice configuration variables are removed from the child environment. The server validates models against the `sonnet`, `opus`, and `haiku` allowlist. A run has a 60-second timeout and a 256,000-byte combined stdout/stderr cap, and the chat router permits only one model run at a time. Stderr is excluded from replies. Repo data and history are escaped inside a marked `<untrusted_context>` block and described as untrusted data, never instructions. Reply cleanup replaces tool-call markup with "Tools are not available in this chat."

When Codex is the selected orchestrator, chat gives local answers only and displays a notice explaining the file-read and command-execution concern, with a link to the isolation document. Codex could be enabled only in a future phase, if its reading can be limited to an empty folder. [The chat isolation report](chat-isolation.md) records one non-adversarial check on one Windows machine, with specific CLI versions; it is not a general isolation guarantee. Launching agents to perform tasks or change files remains Phase 2 work in the [dashboard roadmap](../dashboard/PLAN.md).

Voice input uses the browser Web Speech API and discloses that microphone audio may go to the browser vendor's speech service. Shared voice state drives the orb, controls, and widget portal. The widget uses Document Picture-in-Picture or a popup. Browser speech output is the default; optional Fish Audio, ElevenLabs, and OpenAI adapters run behind `POST /api/tts`. The client limits provider text to 1,000 characters, plays returned audio through a blob URL, and falls back to browser voice on provider or playback failure. Each availability or synthesis request reads root `.env`, with process environment values taking precedence. Public availability responses contain no credentials or voice IDs, and synthesis errors are generic. The shared Host, Origin, and JSON guards cover these routes. Adapter tests mock the services rather than verifying live calls.

Settings are validated and written atomically to ignored `dashboard/.data/settings.json`; missing or corrupt settings use defaults. The orchestrator determines the other agent's worker role in Galaxy without changing historical Agents cards. Chat history uses ignored `dashboard/.data/chat-history.json`, retaining at most 200 messages and 100,000 text characters, with a 10,000-character limit per message. Reload restores it, New chat deletes it, and persistence failures never prevent an answer.

The dashboard was built with the same loop: Claude Code orchestrates, Codex implements one task per branch, and tests decide whether the task is done. The dashboard checks are `npm test`, `npm run typecheck`, and `npm run build`, also run by the CI `dashboard` job. See [the dashboard guide](../dashboard/README.md) for commands and API routes.
