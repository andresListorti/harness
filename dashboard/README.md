# Harness dashboard

A local web dashboard for Harness, with a React, TypeScript, and Vite front end and a small Node and Express backend. Everything is served on `127.0.0.1`; milestone 1 is read-only and local.

## Requirements

Use Node 24 (the version CI uses) and npm. Git supplies commit history and tracked test file names.

## Run

For a production-style run, start from the repo root:

```sh
cd dashboard
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:3001`. The `PORT` environment variable changes the backend port; valid values are integers from 1 to 65535. No API key is needed.

For development, install dependencies with `npm ci` in `dashboard/`, then run these commands in separate terminals in that directory:

```sh
npm run dev:server
```

```sh
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to port 3001, so keep the backend on its default port for this setup.

## Views

- **Harness:** an orb and chat with suggestions and local answers about pending tasks, work in progress, recent commits, the latest recorded run, and tests. Unknown questions return help.
- **Agents:** historical cards derived from the plans and run log, showing task status and recorded notes. Model and time show an em dash because nothing records them. Choose 1, 2x2, or 3x3 layouts with pagination.
- **Galaxy:** an animated canvas with the Harness core, Claude Code, Codex, Tasks, Commits, and Tests. Details use recorded tasks and attempts, recent commits, tracked test files, and recorded test results. Wheel to zoom, drag to pan, or click a planet; the button legend also opens details from the keyboard. Roles currently default to Claude Code as orchestrator and Codex as worker.
- **Plan:** a Pending, In progress, and Done board with task details and the run log. The source selector switches between the dashboard and example-app plans. Future milestone tasks can appear as pending; Phase 2 is excluded from the board.

## Data sources

The backend reads a fixed list of repo files: `dashboard/PLAN.md`, `example-app/PLAN.md`, and `docs/run-log.md`. It also reads `git log` and tracked test file names. In the run log, entries headed `## N. name` belong to example-app and `## DN. name` belong to the dashboard, where N is a number. Test information is recorded history and file inventory; opening the dashboard does not run tests.

## HTTP API

All routes are relative to the backend. The allowed `source` values are `dashboard` and `example-app`; omitting `source` selects `dashboard`.

| Route | Response |
|---|---|
| `GET /api/health` | Server health: `{ "status": "ok" }`. |
| `GET /api/plan?source=` | Parsed tasks for the selected plan. |
| `GET /api/runlog?source=` | Recorded entries for the selected source. |
| `GET /api/commits?limit=` | Commit hash, subject, and date; default limit 20, integer limits clamped to 1–200. |
| `GET /api/galaxy` | Core, agent, task, commit, and test nodes from both sources. |
| `GET /api/agents` | Historical cards for In progress and Done tasks from both plans. |
| `GET /api/chat/suggestions` | Supported local question suggestions. |
| `POST /api/chat` | Accepts only `{ "message": "What is pending?" }`, with a trimmed message of 1–2000 characters; returns a plain-text `reply` and `source: "local"`. |

## Security

- The backend binds only to `127.0.0.1`. A Host allowlist for loopback names and configured ports guards against DNS rebinding.
- State-changing requests require an allowlisted Origin; bodies on those requests must use a JSON content type. JSON bodies have a 16 kb limit, and chat input is validated with a strict Zod schema.
- Repo data uses a fixed file allowlist, with no file path taken from requests. Git runs through `execFile` without a shell, using fixed argument structures and a bounded commit limit; author names and emails are never requested.
- The backend sends a strict Content Security Policy allowing resources and connections only from the same origin, blocking objects and framing. It also sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `X-Frame-Options: DENY`.
- Chat builds answers locally from repo data and launches no agent process. Its shared data reader can invoke the fixed read-only git commands above. Replies render as plain text, so reply content cannot become HTML.

## Project layout

```text
server/  Express app, security, static serving, routes, data readers, local answers
shared/  Zod API schemas and TypeScript types
src/     React views, components, API client, styles, galaxy canvas
tests/   Server, shared contract, client, CI, and public-safety checks
```

## Checks

Run from `dashboard/`:

```sh
npm test
npm run typecheck
npm run build
```

Tests use Vitest and React Testing Library. The public-safety scan checks dashboard files, the run log, and `.env.example` for prohibited public content. The CI `dashboard` job installs with `npm ci` and runs the same three checks.

## Not built yet

There is no voice input or output, widget mode, settings view, orchestrator selection, text-to-speech provider, chat with an agent, or way to launch agents from the dashboard yet. The [roadmap](PLAN.md) places voice and widget in milestone 2, chat with the orchestrator in milestone 3, and real agent execution in Phase 2.
