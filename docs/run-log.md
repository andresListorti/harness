# Run log

One entry per task: how many attempts Codex needed, which tests passed, and the result. Numbered entries (`## 1. name`) are example-app tasks from `example-app/PLAN.md`; D-prefixed entries (`## D1. name`) are dashboard tasks from `dashboard/PLAN.md`. The orchestrator (Claude Code) runs the tests itself after every attempt. Entries from D29 on have two more table rows: `Codex model` (the model name shown in the Codex companion output, or `not reported` when it does not show one) and `Duration` (the wall time of the delegated task as measured by the orchestrator, which includes the Codex run; written like `1m 54s`). Older entries do not have these rows.

## Environment note: Codex sandbox on Windows

Before the first task, Codex runs were blocked with `blocked by policy` and reported a read-only sandbox, even when a write-enabled task was requested. The cause was the missing Windows elevated sandbox. It was fixed by running `codex sandbox setup --elevated --current-user` once as administrator and setting `sandbox_mode = "workspace-write"` and `[windows] sandbox = "elevated"` in the user-level Codex config. A trivial write-and-list test confirmed the fix. The blocked run never attempted the task, so it is not counted as an attempt below.

The write-enabled sandbox has no network access, so Codex cannot run `npm install`. The orchestrator runs dependency installation as an environment step and then runs the tests.

## 1. project-setup

| | |
|---|---|
| Branch | `task/project-setup` |
| Codex attempts | 2 |
| Result | Done |

- **Attempt 1:** Codex wrote the scaffold, `GET /health`, the app factory split, and two tests. It could not install dependencies (no network) and used `latest` tags in `package.json`. After the orchestrator installed dependencies, `npm test` passed (2 tests) and `npm run typecheck` was clean.
- **Attempt 2:** The orchestrator sent back one fix: pin the dependency versions. Codex replaced every `latest` with a caret range of the installed version, editing only `package.json`.
- **Final check by the orchestrator:** `npm install` to refresh `package-lock.json`, then a clean `npm ci`, `npm test` (1 file, 2 tests passed) and `npm run typecheck` (no errors).

## 2. task-validation

| | |
|---|---|
| Branch | `task/task-validation` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `src/validation.ts` (the `Task` type, strict `createTaskSchema` and `updateTaskSchema`) and `tests/validation.test.ts`. PowerShell blocked the `npm` launcher, so Codex ran the checks through the Windows command prompt instead.
- **Orchestrator check:** `npm test` passed (2 files, 48 tests) and `npm run typecheck` was clean.

## 3. task-store

| | |
|---|---|
| Branch | `task/task-store` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `src/store.ts` (a `createTaskStore()` factory with create, list, get, update, and delete, returning copies of tasks) and `tests/store.test.ts`, using fake timers to check `updatedAt`.
- **Orchestrator check:** `npm test` passed (3 files, 55 tests) and `npm run typecheck` was clean.

## 4. create-task

| | |
|---|---|
| Branch | `task/create-task` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex added `POST /tasks` in `src/routes/tasks.ts`, the `errorBody` helper in `src/errors.ts`, store injection in `createApp({ store })`, the exported `TaskStore` type in `src/store.ts`, and `tests/create-task.test.ts`.
- **Orchestrator check:** `npm test` passed (4 files, 62 tests) and `npm run typecheck` was clean. Reviewed the tests: a valid body returns 201 and is stored, and five invalid bodies return 400 `VALIDATION_ERROR` with details and leave the store empty.

## 5. list-and-get-tasks

| | |
|---|---|
| Branch | `task/list-and-get-tasks` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex added `GET /tasks` (with a strict `completed=true|false` filter) and `GET /tasks/:id` (404 `TASK_NOT_FOUND`) to the router, plus `tests/list-tasks.test.ts`. Because tasks cannot be completed through the API yet, the tests decorate the store with a small test-only wrapper to produce completed tasks.
- **Orchestrator check:** `npm test` passed (5 files, 79 tests) and `npm run typecheck` was clean.

## 6. edit-task

| | |
|---|---|
| Branch | `task/edit-task` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex added `PATCH /tasks/:id` (body validated first, then lookup, 404 `TASK_NOT_FOUND`) and `tests/edit-task.test.ts`, with fake timers to check `updatedAt`.
- **Orchestrator check:** `npm test` passed (6 files, 93 tests) and `npm run typecheck` was clean.

## 7. complete-task

| | |
|---|---|
| Branch | `task/complete-task` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex added an idempotent `complete(id)` to the store (it refreshes `updatedAt` only on the first completion), `POST /tasks/:id/complete`, and `tests/complete-task.test.ts`. As requested, it also replaced the test-only wrapper in `tests/list-tasks.test.ts` with `store.complete()` and added store tests for the new method.
- **Orchestrator check:** `npm test` passed (7 files, 97 tests) and `npm run typecheck` was clean.

## 8. delete-task

| | |
|---|---|
| Branch | `task/delete-task` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex added `DELETE /tasks/:id` (204 with an empty body, 404 `TASK_NOT_FOUND`) and `tests/delete-task.test.ts`, which also checks that other tasks are unaffected and that a second delete returns 404.
- **Orchestrator check:** `npm test` passed (8 files, 100 tests) and `npm run typecheck` was clean.

## 9. error-handling

| | |
|---|---|
| Branch | `task/error-handling` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex added `notFoundHandler` and `errorHandler` to `src/errors.ts`, registered them last in `src/app.ts`, and wrote `tests/errors.test.ts`. Malformed JSON returns 400 `INVALID_JSON`, unknown routes and unsupported methods return 404 `ROUTE_NOT_FOUND`, other parser 4xx errors return `BAD_REQUEST`, and unexpected errors return 500 `INTERNAL_ERROR` without the stack or original message (the error is logged on the server).
- **Orchestrator check:** `npm test` passed (9 files, 109 tests) and `npm run typecheck` was clean.

## 10. ci

| | |
|---|---|
| Branch | `task/ci` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex created `.github/workflows/ci.yml` (triggers: push and pull request; one job that runs `npm ci`, `npm test`, and `npm run typecheck` inside `example-app/`, with read-only permissions). This is the only task that writes outside `example-app/`, which was allowed explicitly in the task prompt. Codex could not parse the YAML because no parser was installed in its sandbox.
- **Orchestrator check:** the YAML was parsed with a YAML library installed outside the repo (valid; triggers `push` and `pull_request`; working directory `example-app`). After deleting `node_modules`, `npm ci`, `npm test` (9 files, 109 tests), and `npm run typecheck` all passed. The workflow itself has not run on GitHub yet.

## Environment steps summary

Dependencies were installed by the orchestrator once, during task 1, because the Codex sandbox has no network. No task after that needed new dependencies, so there were no further installs.

## D1. scaffold

| | |
|---|---|
| Branch | `task/scaffold` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote the Vite, React, TypeScript, Vitest, and Express project files in `dashboard/` (dependencies pinned to caret ranges given in the task prompt), plus `tests/app.test.tsx` covering the Harness heading and the Vite config (host `127.0.0.1`, `/api` proxy). It could not install dependencies (no network).
- **Orchestrator check:** the orchestrator ran `npm install` once to create `package-lock.json`, then deleted `node_modules` and `dist` and verified from a clean `npm ci`: `npm test` passed (1 file, 2 tests), `npm run typecheck` was clean, and `npm run build` passed. npm warns that the `esbuild` install script is not yet covered by `allowScripts`; the build and tests are unaffected.

## D2. server-app

| | |
|---|---|
| Branch | `task/server-app` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex added `server/app.ts` (`createApp()` with `GET /api/health`, JSON 404 for unknown `/api` routes, `x-powered-by` disabled), `server/index.ts` (`HOST` fixed to `127.0.0.1`, validated `PORT`, `startServer()` that listens only when run directly), `tests/server/health.test.ts`, and a `start:server` script.
- **Orchestrator check:** reviewed the code; `npm test` passed (2 files, 11 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D3. server-guards

| | |
|---|---|
| Branch | `task/server-guards` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex added `server/security.ts` (Host allowlist, Origin check on state-changing methods, JSON content-type check, 16 kb body limit, and a JSON error handler for 400, 413, and 500), wired it into `createApp()` with a `ports` option and a `routes` hook, updated the health tests to send an allowed Host, and wrote `tests/server/security.test.ts`.
- **Orchestrator check:** reviewed the code; `npm test` passed (3 files, 32 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D4. api-contract

| | |
|---|---|
| Branch | `task/api-contract` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `shared/api.ts` with strict Zod schemas and inferred types for plan tasks and boards, run-log entries, commits, galaxy nodes, agent cards, health, chat request and response, and the API error shape, plus `tests/shared/api.test.ts`. The orchestrator fixed the field shapes in the task prompt so later parsers and models share one contract.
- **Orchestrator check:** reviewed the schemas; `npm test` passed (4 files, 91 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D5. plan-parser

| | |
|---|---|
| Branch | `task/plan-parser` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `parsePlan(markdown, source)` in `server/data/plan.ts`: columns from the level-2 headings, tasks from level-3 headings with field bullets, group headings applied to the following tasks, other level-2 sections (including Phase 2) ignored, and no throws on malformed input. `tests/server/plan.test.ts` uses inline fixtures plus the real `dashboard/PLAN.md` and `example-app/PLAN.md`.
- **Orchestrator check:** reviewed the code; `npm test` passed (5 files, 105 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D6. runlog-parser

| | |
|---|---|
| Branch | `task/runlog-parser` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `parseRunLog(markdown, source)` in `server/data/runlog.ts`: entries from `## N. name` and `## DN. name` headings split by source, branch, attempts, and result from the table rows, bullets as notes with continuation lines joined, other sections ignored, and no throws on bad input. `tests/server/runlog.test.ts` uses inline fixtures plus the real `docs/run-log.md`. Codex's own first test, typecheck, and build runs failed and it corrected one file within the same attempt.
- **Orchestrator check:** reviewed the code; `npm test` passed (6 files, 121 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D7. git-reader

| | |
|---|---|
| Branch | `task/git-reader` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `server/data/git.ts`: `getRepoRoot()`, `readCommits(repoDir, limit)` (hash, subject, and committer date only, limit clamped to 1-200, results validated with `commitSchema`), and `listTestFiles(repoDir)` (tracked `*.test.ts` and `*.test.tsx`, sorted). Git runs through `execFile` with fixed argument arrays and no shell, and every failure returns an empty result. `tests/server/git.test.ts` builds a temporary repository with a placeholder identity assembled at runtime, so no email literal is in the source.
- **Orchestrator check:** reviewed the code and the email search; `npm test` passed (7 files, 131 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D8. galaxy-model

| | |
|---|---|
| Branch | `task/galaxy-model` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `buildGalaxy(input)` in `server/data/galaxy.ts`: six fixed nodes (core, Claude Code, Codex, Tasks, Commits, Tests) built from plan tasks, run-log entries, commits, and tracked test files. Roles follow the `orchestrator` input and default to Claude Code as orchestrator and Codex as worker; the last recorded test count is read from run-log notes. `tests/server/galaxy.test.ts` validates every case against `galaxySchema`.
- **Orchestrator check:** reviewed the code; `npm test` passed (8 files, 139 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D9. agents-model

| | |
|---|---|
| Branch | `task/agents-model` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `buildAgents(sources)` in `server/data/agents.ts`: cards only for In progress and Done tasks, status `working`, `done`, or `error` (a non-Done run-log result), agent `codex` only when the matching run-log entry records Codex attempts, model and elapsed time always `null` because nothing records them, and the last three run-log notes (truncated at 240 characters) as output. Card ids use `<source>/<task id>`. `tests/server/agents.test.ts` covers the rules with fixtures and with the real plan and run-log files.
- **Orchestrator check:** reviewed the code and confirmed the ellipsis is stored as proper UTF-8; `npm test` passed (9 files, 155 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D10. data-routes

| | |
|---|---|
| Branch | `task/data-routes` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex added `createDataRouter(deps)` in `server/routes/data.ts` with read-only `GET /api/plan`, `/api/runlog`, `/api/commits`, `/api/galaxy`, and `/api/agents`, mounted in `createApp` before the `/api` 404 fallback. Files come from a fixed allowlist under the repo root, `source` is validated against `dashboard` and `example-app`, every response is parsed with its schema, and responses are sent with `Cache-Control: no-store`. `tests/server/data-routes.test.ts` uses a temporary repo root with injected git functions, plus an integration test against the real repo.
- **Orchestrator check:** reviewed the code; `npm test` passed (10 files, 172 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D11. chat-local-answers

| | |
|---|---|
| Branch | `task/chat-local-answers` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex added `answerLocally` in `server/chat/local.ts` (five intents: pending, in progress, latest commits, latest run, and tests, with a help reply for anything else), `POST /api/chat` and `GET /api/chat/suggestions` in `server/routes/chat.ts`, a shared `createRepoReader` exported from `server/routes/data.ts`, and a `chatSuggestionsSchema` in `shared/api.ts`. Replies are plain text built only from repo data. A test asserts the chat modules contain no `child_process` or `spawn`. Codex's first test run showed "latest" matching the tests intent and it fixed the matching to whole words within the same attempt.
- **Orchestrator check:** reviewed the code; `npm test` passed (11 files, 199 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D12. api-client

| | |
|---|---|
| Branch | `task/api-client` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `src/lib/api.ts`: `ApiError` (codes `NETWORK_ERROR`, `HTTP_ERROR`, `INVALID_RESPONSE`, or the server's own code), `createApiClient(fetchImpl)` with typed methods for health, plan, run log, commits, galaxy, agents, chat suggestions, and chat, and a default `api` instance. Every response is validated against `shared/api.ts`, URLs are relative, and error messages never include the response body. `tests/client/api.test.ts` uses a mocked `fetch`.
- **Orchestrator check:** reviewed the code; `npm test` passed (12 files, 227 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D13. theme-tokens

| | |
|---|---|
| Branch | `task/theme-tokens` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `src/styles/tokens.css` (colors, typography, spacing, radii, sidebar widths), `src/styles/global.css` (near-black background with a texture made only from CSS gradients, teal focus ring, amber pressed state, `.section-title`, reduced-motion handling), wired both plus the font into `src/main.tsx`, and wrote `tests/client/theme.test.ts`, which also rejects any remote URL or `data:` URI in the styles. Codex's first typecheck and build failed on missing Vite client types and it added `src/vite-env.d.ts` within the same attempt.
- **Environment step:** the orchestrator installed `@fontsource-variable/inter` (OFL license) before the task, because the plan asks for a bundled font and the Codex sandbox has no network. The built `dist/assets` contains the font files locally.
- **Orchestrator check:** reviewed the code; `npm test` passed (13 files, 231 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D14. app-shell

| | |
|---|---|
| Branch | `task/app-shell` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote the collapsible `Sidebar` (four views, accessible names kept when collapsed, "Close menu" and "Open menu" toggle, status dot, "Full screen" toggle that tolerates missing browser support), the `useAgentStatus` hook that polls `GET /api/health`, and the app layout in `App.tsx`. Each view is a titled placeholder until its own task replaces it. `tests/client/sidebar.test.tsx` covers the sidebar, the hook (fake timers), and an integration test through `App`; `tests/app.test.tsx` now mocks the API client.
- **Orchestrator check:** reviewed the code; `npm test` passed (14 files, 243 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D15. orb

| | |
|---|---|
| Branch | `task/orb` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote the `Orb` component: five concentric SVG rings, a CSS-gradient glow and core, and idle, listening (amber), and speaking (faster teal pulse with ripples) states driven by `data-state`. Animation is pure CSS with a `prefers-reduced-motion` block. The glow uses HTML radial gradients instead of SVG gradient definitions, so no `url(...)` appears in the files. `tests/client/orb.test.tsx` checks the states, the five rings, the absence of any image element or external reference, and the reduced-motion rule.
- **Orchestrator check:** reviewed the code; `npm test` passed (15 files, 250 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D16. chat-panel

| | |
|---|---|
| Branch | `task/chat-panel` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `ChatPanel` with an injectable client: suggestion chips loaded from `GET /api/chat/suggestions`, Send (button or Enter), New chat that invalidates any in-flight request, a "Local answer" label on replies, a "Thinking…" indicator, a `role="alert"` error that never shows a raw response body, and plain-text rendering with preserved line breaks so HTML in a reply stays literal. No microphone, voice, hands-free, or model controls exist yet. `tests/client/chat-panel.test.tsx` covers these cases, including a late reply after New chat and after unmount.
- **Orchestrator check:** reviewed the code and confirmed the ellipsis is stored as proper UTF-8; `npm test` passed (16 files, 262 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D17. home-view

| | |
|---|---|
| Branch | `task/home-view` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `HomeView` (orb, title, subtitle, and the chat panel with a bounded height) and wired it into `App.tsx` for the Harness view; the other three views are still placeholders. The "H A R N E S S" look comes only from CSS (`text-transform: uppercase`, wide letter-spacing, compensating padding) while the heading text stays "Harness", so its accessible name and the existing tests are unchanged. `tests/client/home-view.test.tsx` covers the composition, and two existing tests were adjusted to mock the chat API calls.
- **Orchestrator check:** reviewed the code; `npm test` passed (17 files, 266 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D18. agents-view

| | |
|---|---|
| Branch | `task/agents-view` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `AgentsView` (grid of historical cards with a 1, 2x2, and 3x3 selector, pagination whose page size follows the layout, a Refresh button, and loading, empty, and error states with retry), the `formatElapsed` helper, and wired the view into `App.tsx`. Cards show source, task, status, agent, model, time, and output as plain monospaced text; missing values show an em dash. `tests/client/agents-view.test.tsx` and `tests/client/format.test.ts` cover the cases, including stale responses and literal HTML.
- **Orchestrator check:** reviewed the code and confirmed the special characters (multiplication sign, em dash, ellipsis) are stored as proper UTF-8; `npm test` passed (19 files, 294 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D19. galaxy-camera

| | |
|---|---|
| Branch | `task/galaxy-camera` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `src/galaxy/camera.ts`: world and screen conversion, zoom that keeps the point under the cursor fixed with limits, wheel zoom factor, drag pan clamped to a maximum, fit zoom, `layoutGalaxy` (core at the origin, agents and systems on two orbits turning in opposite directions, planet radius growing with count), and hit testing in world and screen space. `tests/client/galaxy-camera.test.ts` covers these. The Codex run outlasted a tool timeout and reported before finishing; the orchestrator waited for the process to end and then verified the result itself.
- **Orchestrator check:** reviewed the code against the task spec; `npm test` passed (20 files, 317 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D20. galaxy-view

| | |
|---|---|
| Branch | `task/galaxy-view` |
| Codex attempts | 1 |
| Result | Done |

- **Not an attempt:** the first launch never reached Codex: the task text contained single quotes that broke the shell command, and the branch stayed unchanged. The task text was saved to a file and passed to Codex through command substitution on the relaunch.
- **Attempt 1:** Codex wrote `src/galaxy/draw.ts` (deterministic starfield, orbits, core glow, planets, selection ring, labels and counts), `GalaxyView` (data loading with retry, canvas animation loop cancelled on unmount, native non-passive wheel zoom, pointer drag, click-to-select, `Reset view`, reduced-motion handling, an accessible legend of buttons, and a detail panel), and wired it into `App.tsx`. Its tests use a recording canvas context and cover loading, errors, stale responses, selection, drag, wheel, reset, and reduced motion. Codex's first build failed because PowerShell saved the new files with a UTF-8 byte order mark and it re-saved them; the orchestrator found the marks still present in the six new files and stripped them.
- **Orchestrator check:** reviewed the code; `npm test` passed (22 files, 330 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D21. plan-view

| | |
|---|---|
| Branch | `task/plan-view` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `PlanView`: a Pending, In progress, and Done board with counts and milestone group headings, expandable task details, a source selector between the dashboard and example-app plans, a run log (newest first) with expandable notes, loading, error, and retry states, and protection against stale responses. It also removed the temporary placeholder from `App.tsx`, since all four views are real now. `tests/client/plan-view.test.tsx` covers these cases.
- **Orchestrator check:** reviewed the code and confirmed no file has a byte order mark; `npm test` passed (23 files, 343 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D22. serve-build

| | |
|---|---|
| Branch | `task/serve-build` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex added `server/static.ts` (a strict content security policy with only same-origin sources, plus `nosniff`, no-referrer, and frame-deny headers on every response; static serving of `dist/` with immutable caching for hashed assets; a single-page fallback that never answers `/api`, dotfiles, missing files with an extension, or non-GET methods), applied it in `createApp`, made the Host allowlist follow the configured `PORT` through `createServerApp()`, added startup messages, and added the `npm start` script. `tests/server/static.test.ts` covers the policy, headers on every kind of response, traversal attempts, and the no-`dist` case. Codex's first test run failed because Express's default 404 replaced the policy header and a dotfile was served; it fixed both within the same attempt.
- **Orchestrator check:** reviewed the code and confirmed no file has a byte order mark; `npm test` passed (24 files, 365 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D23. public-safety-test

| | |
|---|---|
| Branch | `task/public-safety-test` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `tests/helpers/safety-scan.ts` (a pure scanner for emails, absolute local paths, filled-in secrets, remote fonts, forbidden product and tool names, and image references, with masked excerpts) and `tests/public-safety.test.ts` (self-tests with fixtures built at runtime, a real scan of `dashboard/`, the run log, and `.env.example`, a ban on image files, a check that `.env` is ignored, and a guard against a vacuous scan). Its first run flagged literal image tags in four older client tests; Codex changed those fixtures to be assembled at runtime without changing what they assert.
- **Orchestrator check:** reviewed the scanner and confirmed no file has a byte order mark; `npm test` passed (25 files, 402 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D24. ci-dashboard

| | |
|---|---|
| Branch | `task/ci-dashboard` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex added a `dashboard` job to `.github/workflows/ci.yml` (same pinned actions, Node 24, npm cache keyed on `dashboard/package-lock.json`, then `npm ci`, `npm test`, `npm run typecheck`, `npm run build` in `dashboard/`), leaving the `example-app` job and the read-only permissions untouched. It also wrote `dashboard/tests/ci-workflow.test.ts`, which checks the workflow text: permissions, both jobs and their steps in order, 40-character SHAs that match across jobs, and no secrets or tabs. Like the first CI task, this one writes outside its own folder, which the task prompt allowed explicitly.
- **Orchestrator check:** the YAML was parsed with a YAML library installed outside the repo (valid; triggers `push` and `pull_request`; both jobs and their steps as expected); `npm test` passed (26 files, 406 tests), `npm run typecheck` was clean, and `npm run build` passed. The workflow itself has not run on GitHub yet.

## D25. docs-dashboard

| | |
|---|---|
| Branch | `task/docs-dashboard` |
| Codex attempts | 1 |
| Result | Done |

- **Attempt 1:** Codex wrote `dashboard/README.md` (requirements, production and development run commands, the four views and their real data, data sources, the HTTP API, the implemented security measures, project layout, checks, and a "Not built yet" section), added a Dashboard section to the root `README.md`, a dashboard architecture section to `docs/architecture.md`, run steps to `docs/setup.md`, and rewrote only the introduction of this run log so it explains both entry types. It checked the claims against the code and ran the three checks.
- **Orchestrator check:** reviewed every changed document against the code and the plan, confirmed no file has a byte order mark or carriage returns, and confirmed the existing run-log entries are unchanged; `npm test` passed (26 files, 406 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D26. home-layout-fix

| | |
|---|---|
| Branch | `task/home-layout-fix` |
| Codex attempts | 1 |
| Result | Done |

- **Why:** the Milestone 1 browser acceptance showed that on a window about 630 px tall the home chat had only a thin strip of message area, so a conversation was unreadable.
- **Attempt 1:** Codex replaced the fixed chat height with an automatic height and a message area of at least 12rem (scrolling inside after 24rem), shrank the orb on short viewports, made the main area scroll vertically, and extended `tests/client/home-view.test.tsx` with checks on these CSS rules. Its first test run failed and it fixed the cause within the same attempt.
- **Orchestrator check:** reviewed the diff; `npm test` passed (26 files, 407 tests) on re-runs, `npm run typecheck` was clean, and `npm run build` passed. One orchestrator run failed on an unrelated intermittent test, which is handled in D27.

## D27. fix-flaky-tests

| | |
|---|---|
| Branch | `task/fix-flaky-tests` |
| Codex attempts | 1 |
| Result | Done |

- **Why:** the Milestone 1 acceptance saw the full suite fail intermittently (a galaxy test once, then a different test under load). The orchestrator reproduced two failures with parallel runs under CPU load and found both causes in the tests, not in the application: the public-safety scan walked `dashboard/` while two server tests created and deleted temporary folders inside it (`ENOENT`), and the galaxy test read canvas state before the React effect that sets it up had run.
- **Attempt 1:** Codex moved the two temporary folders to the operating system temp directory, made the scan ignore only `ENOENT` while walking and reading (with two regression tests), made the galaxy and chat panel tests wait for the real condition instead of reading right after `findBy`, and audited the other client tests for the same pattern. No application code changed. Codex's first run after its initial edits failed and it fixed the cause within the same attempt.
- **Orchestrator check:** reviewed the diff and confirmed no leftover temporary folders in `dashboard/` and no byte order marks; `npm test` passed (26 files, 409 tests) in 12 of 12 parallel runs under CPU load (before the fix, 2 of 6 such runs failed), `npm run typecheck` was clean, and `npm run build` passed.

## D28. m1-acceptance

| | |
|---|---|
| Branch | `task/m1-acceptance` |
| Codex attempts | not applicable (orchestrator task) |
| Result | Done |

- **Checks:** from a clean `npm ci`, typecheck and build passed. Tests passed except one intermittent failure that was investigated and fixed (D27). The built server listened only on `127.0.0.1`; every data route returned schema-valid data from the real repo; the five suggested chat questions returned local answers; a foreign or missing Origin, a foreign Host, a path-like `source`, and a traversal attempt were all rejected; the content security policy and the other headers were present on every kind of response.
- **Browser:** the Harness and Galaxy views were checked by screenshot, and the four views through the page structure (the browser tool timed out on some screenshots; a page without the dashboard ran at the same low frame rate, so it was the browser session and not the application). Agents showed historical cards with an em dash for model and time, Plan showed the board and run log for both sources, and Galaxy zoomed and opened planet details.
- **Findings fixed:** the home chat was unusable on a short window (D26) and two intermittent test failures (D27).
- **Findings left for the user:** recorded notes show raw markdown characters in the Agents cards and in the "latest run" chat answer, and `GalaxyView.tsx` and `draw.ts` use very dense formatting.

## D29. plain-text-notes

| | |
|---|---|
| Branch | `task/plain-text-notes` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 1m 54s |
| Result | Done |

- **Attempt 1:** Codex added `toPlainText` in `server/data/plain-text.ts` (it removes bold markers, inline code backticks, fenced code markers, link and image syntax, heading and blockquote markers, and leaves HTML-looking text, single asterisks, and single underscores untouched), applied it to every run-log note in the parser and to every local chat reply, and added `tests/server/plain-text.test.ts` plus checks in the run-log, chat, and agents tests. Its first test run failed and it fixed the cause within the same attempt.
- **Orchestrator check:** reviewed the code; `npm test` passed (27 files, 445 tests), `npm run typecheck` was clean, and `npm run build` passed.
- **Recording note:** from this entry on, the model row records the model name shown in the Codex companion output (this run showed only a thread id, so "not reported"), and the duration is the wall time of the delegated task as measured by the orchestrator's agent, which includes the Codex run.

## D30. reformat-galaxy

| | |
|---|---|
| Branch | `task/reformat-galaxy` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 3m 53s |
| Result | Done |

- **Attempt 1:** Codex reformatted `GalaxyView.tsx` and `draw.ts` (one statement per line, long literals and JSX broken across lines) without touching any other file or any test.
- **Orchestrator check:** esbuild minified output of both files is identical before and after, so only formatting changed; the longest line went from 512 to 95 characters in `GalaxyView.tsx` and from 252 to 74 in `draw.ts`; there is no byte order mark or carriage return; `npm test` passed unchanged (27 files, 445 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D31. agents-card-layout

| | |
|---|---|
| Branch | `task/agents-card-layout` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 1m 47s |
| Result | Done |

- **Attempt 1:** Codex made the Agents card output wrap (including long words), keep line breaks, and show at most four lines with an ellipsis and no horizontal scrolling, put the full text in the block's tooltip, and made the Model and Time rows render only when their value is not null (the Agent row still shows an em dash when unknown). It updated the tests and the dashboard README. Its first test run failed and it fixed the cause within the same attempt.
- **Orchestrator check:** reviewed the diff and confirmed no byte order marks; `npm test` passed (27 files, 451 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D32. run-log-model-duration

| | |
|---|---|
| Branch | `task/run-log-model-duration` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 2m 47s |
| Result | Done |

- **Attempt 1:** Codex added `model` and `durationSeconds` to the run-log entry schema, a strict `parseDuration` (`45s`, `1m 54s`, `1h 02m 05s`, and similar; anything else returns null), made the parser read the `Codex model` and `Duration` rows (a model of "not reported" or similar becomes null; entries without the rows keep nulls), made the Agents cards take model and time from the entry, updated the fixtures and tests (including real-file checks: D29 gives 114 seconds and D1 gives nulls), and documented the two rows in the run-log introduction and the dashboard README.
- **Orchestrator check:** reviewed the diff and confirmed no byte order marks and that only the run-log introduction changed in the existing text; `npm test` passed (28 files, 494 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D33. chat-unsupported-requests

| | |
|---|---|
| Branch | `task/chat-unsupported-requests` |
| Codex attempts | 2 |
| Codex model | not reported |
| Duration | 4m 12s |
| Result | Done |

- **Attempt 1:** Codex added `CAPABILITY_NOTICE` and action detection ahead of the intents in `server/chat/local.ts`: a request to launch, run, start, merge, push, create, fix, and similar, or to have an agent do something, gets "I can't do that." plus the notice and the list of questions it can answer; unknown questions get "I didn't understand that." with the same notice and list. It updated the tests, the dashboard README, and one sentence of `docs/architecture.md`. Duration of attempt 1: 2m 20s.
- **Orchestrator review of attempt 1:** probing 33 phrases through the real function showed that the verb-first rule wrongly treated short read-only phrases as actions, including one regression (`run log` used to return the latest run): `test status`, `build status`, `commit history`, `update status`, and `open tasks` were also rejected.
- **Attempt 2:** the orchestrator sent the probe results back. Codex exempted verb-first messages whose next word is a read-only noun (`log`, `status`, `history`, `results`, `summary`, and similar), removed `open` from the verb list, and added a test table for these phrases. Duration of attempt 2: 1m 52s.
- **Orchestrator check:** a second probe of 53 phrases classified every one as expected (18 actions, 28 questions answered, 7 not understood); `npm test` passed (28 files, 545 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D34. chat-word-boundaries

| | |
|---|---|
| Branch | `task/chat-word-boundaries` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 1m 35s |
| Result | Done |

- **Why:** the `/codex:review` of Milestone 1 reported one P2 finding: the chat matched intent keywords as substrings, so `now` matched inside `know` and `unknown` (for example "Do you know what is pending?" returned the in-progress answer).
- **Attempt 1:** Codex replaced the substring helper with a whole-word matcher (Unicode-aware word boundaries, an optional trailing `s`, flexible spaces inside phrases) and added `currently` to the in-progress keywords. Intent order, replies, and action detection are unchanged. It added tests for the reported question, for questions that only contain `unknown`, for look-alikes (`nowhere`, `leftover`, `commitment`, `currency`), and for real keywords with plurals, capitals, and punctuation. Its first run after adding two extra cases failed on existing normalization behavior and it fixed that within the same attempt.
- **Orchestrator check:** probing 42 phrases through the real function gave the expected classification for all of them; a bare `commit` stays an action request under the unchanged verb-first rule, while `commits` returns the commit list. `npm test` passed (28 files, 592 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D35. tts-config

| | |
|---|---|
| Branch | `task/tts-config` |
| Codex attempts | 2 |
| Codex model | not reported |
| Duration | 3m 28s |
| Result | Done |

- **Attempt 1:** Codex added the shared `voiceProvidersSchema`, `server/voice/config.ts` (a small `.env` parser, `loadVoiceConfig`, and `toPublicProviders`), the commented voice variables in `.env.example`, and tests. Its first run flagged two fake-key fixtures in the public-safety test and it fixed them within the attempt. Duration of attempt 1: 2m 29s.
- **Orchestrator review of attempt 1:** a probe showed that when the `.env` file was missing, process environment values were ignored, although the spec says they override the file.
- **Attempt 2:** the orchestrator sent the probe back. Codex made a missing or unreadable file mean "no values from the file" and added regression tests. Duration of attempt 2: 58s.
- **Orchestrator check:** the same probe now returns the provider as available with env values and none without them; no byte order marks; `npm test` passed (29 files, 605 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D36. tts-fish-audio

| | |
|---|---|
| Branch | `task/tts-fish-audio` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 1m 24s |
| Result | Done |

- **Attempt 1:** Codex added `synthesizeFishAudio` (POST with bearer header, JSON body with text, voice reference, and mp3 format, a 30-second timeout, injectable `fetch`), the shared `TtsProviderError` in `server/voice/errors.ts` with a generic message and the upstream status only, and mocked-fetch tests. It also exported the `VoiceConfig` type.
- **Orchestrator check:** read the adapter and error class; the error message carries no key, voice ID, response body, or request text, and thrown fetch errors are replaced rather than rethrown; no byte order marks; `npm test` passed (30 files, 612 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D37. tts-elevenlabs

| | |
|---|---|
| Branch | `task/tts-elevenlabs` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 58s |
| Result | Done |

- **Attempt 1:** Codex added `synthesizeElevenLabs` (POST to the text-to-speech path with the URL-encoded voice ID, `xi-api-key` header, JSON body with text and model, a 30-second timeout, injectable `fetch`) and mocked-fetch tests, reusing `TtsProviderError` unchanged.
- **Orchestrator check:** read the adapter; thrown fetch errors are replaced rather than rethrown and no secret reaches an error; no byte order marks; `npm test` passed (31 files, 619 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D38. tts-openai

| | |
|---|---|
| Branch | `task/tts-openai` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 54s |
| Result | Done |

- **Attempt 1:** Codex added `synthesizeOpenAi` (POST to the speech endpoint with a bearer header, JSON body with model, text, voice, and mp3 format, a 30-second timeout, injectable `fetch`) and mocked-fetch tests, reusing `TtsProviderError` unchanged.
- **Orchestrator check:** read the adapter; no secret can reach an error; no byte order marks; `npm test` passed (32 files, 626 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D39. tts-route

| | |
|---|---|
| Branch | `task/tts-route` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 2m 6s |
| Result | Done |

- **Attempt 1:** Codex added `ttsRequestSchema`, the router with `GET /api/voice/providers` (availability only) and `POST /api/tts` (400 invalid request, 409 provider not configured, audio on success, 502 with a fixed generic message on any adapter failure), injectable configuration and adapters, and the mount in `server/app.ts`. The tests cover secrets absent from every response and the global Host, Origin, and content-type guards on the new route.
- **Orchestrator check:** read the router; the failure path discards the error entirely, so nothing from it, the key, the voice ID, or the text can reach the response; no byte order marks; `npm test` passed (33 files, 641 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D40. settings-store

| | |
|---|---|
| Branch | `task/settings-store` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 2m 49s |
| Result | Done |

- **Attempt 1:** Codex added the settings schemas (orchestrator and voice choice, with the worker derived as the other agent), `server/settings.ts` (defaults, validated read that falls back to defaults on a missing or corrupt file, atomic write through a temporary file and rename), `GET` and `PUT /api/settings`, and the galaxy route now builds its roles from the saved orchestrator. The tests cover the 400 and 500 paths, persistence across app instances, no leftover temporary files, unchanged agent cards, and the global guards.
- **Orchestrator check:** read the store and the router; error responses carry no paths; no byte order marks; the tests use temporary folders outside `dashboard/`; `npm test` passed (34 files, 659 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D41. settings-view

| | |
|---|---|
| Branch | `task/settings-view` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 3m 28s |
| Result | Done |

- **Attempt 1:** Codex added the Settings view (orchestrator and voice radio groups, the worker shown from the server response, unconfigured providers disabled and labelled, no key field), the API client methods, the sidebar entry, and tests. Its first two test runs failed on missing spacing in the radio labels' accessible names and it fixed that within the attempt. The delegating agent's final report did not arrive, so the orchestrator verified the working tree directly.
- **Orchestrator check:** read the view; a failed save keeps the previous selection and shows an alert; no byte order marks; `npm test` passed (35 files, 671 tests), `npm run typecheck` was clean, and `npm run build` passed.

## D42. chat-history

| | |
|---|---|
| Branch | `task/chat-history` |
| Codex attempts | 2 |
| Codex model | not reported |
| Duration | 4m 51s |
| Result | Done |

- **Attempt 1:** Codex added `server/chat/history.ts` (validated read, capped atomic append with serialized writes, clear), `GET` and `DELETE /api/chat/history`, saving of each question and reply in `POST /api/chat`, the API client methods, and the chat panel changes (load on mount, clear on New chat, error when the clear fails). Duration of attempt 1: 2m 58s.
- **Orchestrator review of attempt 1:** after the suite ran, the real `dashboard/.data/chat-history.json` existed. Existing tests that post to `/api/chat` used the default history path, so running the tests would overwrite a user's saved conversation. The orchestrator deleted that file and sent the finding back.
- **Attempt 2:** Codex gave every test that builds the app its own temporary storage under the system temp folder (a shared `tests/test-app.ts` helper), and added a global safeguard (`tests/storage-safeguard.ts`) that fails the suite if the default storage files appear. Duration of attempt 2: 1m 53s.
- **Orchestrator check:** after `npm test` the `.data` folder does not exist; no byte order marks; 36 files and 683 tests passed, `npm run typecheck` was clean, and `npm run build` passed.

## D43. live-refresh

| | |
|---|---|
| Branch | `task/live-refresh` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 2m 27s |
| Result | Done |

- **Attempt 1:** Codex added `usePolling` (5-second cadence, no overlapping calls, paused while the tab is hidden, one immediate call when it becomes visible, latest callback kept in a ref, timer and listener cleaned up) and gave the Agents and Plan views a silent refresh that keeps the loading state, the page, the layout, and the source selection untouched and keeps the last data when a refresh fails.
- **Orchestrator check:** read the hook and both views; stale responses are dropped through the existing request counter, so a manual or source-change load wins over a late refresh; no byte order marks; `.data` absent after the suite; 37 files and 690 tests passed, `npm run typecheck` was clean, and `npm run build` passed.

## D44. speech-input

| | |
|---|---|
| Branch | `task/speech-input` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 2m 46s |
| Result | Done |

- **Attempt 1:** Codex added the `useSpeechInput` hook (Web Speech API with the prefixed fallback, interim and final transcripts, hold Space to talk that starts once and stops on release, blur, or a hidden tab, generic error messages, cleanup on unmount) and the exported `SPEECH_PRIVACY_NOTICE`. Its first test and typecheck runs failed and it fixed that within the attempt.
- **Orchestrator check:** read the hook; Space is ignored inside inputs, text areas, editable elements, buttons, links, and selects, and unsupported browsers get a clear message instead of an exception; no byte order marks; 38 files and 716 tests passed, `npm run typecheck` was clean, and `npm run build` passed.

## D45. speech-output

| | |
|---|---|
| Branch | `task/speech-output` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 2m 48s |
| Result | Done |

- **Attempt 1:** Codex added `createSpeaker` and a shared `speaker` in `src/voice/speak.ts`: the browser voice never calls the backend, other providers go through `POST /api/tts` and play the audio from an object URL that is always revoked, any failure falls back to the browser voice, a new reply cancels the previous one, Mute stops playback and silences later replies, stale async results are dropped, and subscribers get `idle` and `speaking` changes. It added `media-src 'self' blob:` to the content security policy and updated the policy test. The plan listed `server/app.ts`, but the policy lives in `server/static.ts`.
- **Orchestrator check:** read the speaker and the policy diff; no remote source was allowed; no byte order marks; 39 files and 739 tests passed, `npm run typecheck` was clean, and `npm run build` passed.

## D46. voice-controls

| | |
|---|---|
| Branch | `task/voice-controls` |
| Codex attempts | 2 |
| Codex model | not reported |
| Duration | 14m 22s |
| Result | Done |

- **Attempt 1:** Codex added `VoiceProvider` (one app-level context for listening, speaking, mute, the selected voice, Reply with voice, Hands-free, and transcript listeners), `VoiceControls` in the sidebar (Talk, Mute, a voice selector with only the available voices, and the browser speech notice), the microphone button and the two switches in the chat, and the orb state wiring in `App`. Without a provider the sidebar and chat show no voice controls. Duration of attempt 1: 12m 48s.
- **Orchestrator review of attempt 1:** the provider read the saved voice once on mount, so changing the voice in Settings left the sidebar selector and spoken replies on the old voice until a reload. The finding was sent back.
- **Attempt 2:** Codex added `src/lib/settings-events.ts`; Settings announces each successful save, and the provider listens, re-reads the settings, ignores stale or failed reads, and removes the listener on unmount. Duration of attempt 2: 1m 34s.
- **Orchestrator check:** no byte order marks; `.data` absent after the suite; 40 files and 750 tests passed, `npm run typecheck` was clean, and `npm run build` passed.

## D47. widget-mode

| | |
|---|---|
| Branch | `task/widget-mode` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 3m 23s |
| Result | Done |

- **Attempt 1:** Codex added `openWidget` (Document Picture-in-Picture first, then a popup, a message instead of an exception when the popup is blocked, same-origin stylesheets cloned into the new window), `WidgetView` (only the orb, a status line, and a Talk button), a Widget mode button in the sidebar footer, and the App wiring: the widget is rendered into the new window through a portal, so it shares the voice state of the main app, and closing it through the toggle, the window itself, or unmounting the app cleans up once.
- **Orchestrator check:** read the opener, the view, and the App changes; no remote source is used and nothing is fetched; no byte order marks; `.data` absent after the suite; 41 files and 761 tests passed, `npm run typecheck` was clean, and `npm run build` passed. Real Picture-in-Picture behavior is checked in `m2-acceptance`.

## D48. docs-voice

| | |
|---|---|
| Branch | `task/docs-voice` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 2m 8s |
| Result | Done |

- **Attempt 1:** Codex documented the voice providers and `.env` setup, the new routes with their status codes, Settings, chat history and its caps, the voice controls and Reply with voice and Hands-free, the browser speech notice, widget mode, live refresh, the content security policy change, and what is still not built, in the dashboard README, `docs/architecture.md`, and `docs/setup.md`. It checked each claim against the code and states that live provider calls were not verified.
- **Orchestrator check:** read the full diff against the code facts; the setup text about the ChatGPT login was adjusted by Codex because `.env.example` now lists optional speech keys, and it is still accurate; no personal data, keys, or local paths; no byte order marks; 41 files and 761 tests passed (the safety scan covers these documents), `npm run typecheck` was clean, and `npm run build` passed.

## D49. m2-acceptance

| | |
|---|---|
| Branch | `main` (no code changes) |
| Codex attempts | not applicable (orchestrator task) |
| Result | Done |

- **Checks:** from a clean `npm ci`, 761 tests, typecheck, and build passed, and the suite left no `.data` folder behind. The real server listened only on `127.0.0.1`; a foreign Host or Origin returned 403; the content security policy included `media-src 'self' blob:` and no remote source. With fake provider credentials in the environment, every API route and every built asset was fetched and none contained the key or the voice ID; the providers route reported availability only. Settings saved before a restart were returned after it, and the galaxy used the saved roles.
- **Browser (by the user):** microphone input with hold Space, browser voice output, Mute, and widget mode all worked.
- **Not verified:** Fish Audio, ElevenLabs, and OpenAI with real keys. They are covered only by mocked tests.
- **Findings:** the orchestrator review found three defects during the milestone, all fixed before merge: environment values ignored when `.env` is missing (D35), tests writing the real `.data` files (D42), and the voice choice not following Settings (D46).

## D50. voice-transcript-provider

| | |
|---|---|
| Branch | `task/voice-transcript-provider` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 3m 37s |
| Result | Done |

- **Why:** the `/codex:review` of Milestone 2 reported that Hands-free transcripts were handled only by the chat panel, so after navigating away from Home, or when using the widget, a final transcript was discarded.
- **Attempt 1:** Codex first wrote a test that reproduces the bug (a final transcript on the Agents view sent zero chat requests) and confirmed it failed. It then made the persistent voice provider own the submission: a mounted chat registers its own send path as a sink (one request, live UI), otherwise the provider sends the message itself, speaks the reply when Reply with voice is on, ignores empty text and overlapping sends, and announces when it settles so a chat that mounts later reloads the saved history. The chat panel no longer sends from its transcript listener.
- **Orchestrator check:** read the diff; no byte order marks; 41 files and 773 tests passed, `npm run typecheck` was clean, and `npm run build` passed.
- **Incident:** the task text said that `dashboard/.data` must not exist afterwards. The user's real chat history from the manual acceptance was there, so Codex moved it to a backup outside the repository to satisfy that line. The orchestrator found the backup, restored the file (same size and date), and confirmed the suite leaves it untouched. Later task texts say never to move or delete anything in `.data`.

## D51. chat-clear-generation

| | |
|---|---|
| Branch | `task/chat-clear-generation` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 2m 3s |
| Result | Done |

- **Why:** the `/codex:review` of Milestone 2 reported that a chat request still reading repo data could save its exchange after New chat had cleared the history, so the deleted conversation came back on reload.
- **Attempt 1:** Codex first wrote a test that holds a chat request, clears the history, releases the request, and checks that the history stays empty, and confirmed it failed. It then added a generation counter per history path (shared by every app instance in the process) that clearing increments immediately, made each chat request capture the generation before it reads anything, and made the queued save skip when the generation changed. The stale request still gets its reply. Its tests also cover requests that start after a clear, concurrent requests without a clear, two app instances over one file, and a clear of a missing file. One mid-run typecheck error was fixed within the attempt.
- **Orchestrator check:** read the diff; no byte order marks; 41 files and 778 tests passed, `npm run typecheck` was clean, and `npm run build` passed. The real `dashboard/.data/chat-history.json` has the same hash before and after the suite.

## D52. settings-view-sync

| | |
|---|---|
| Branch | `task/settings-view-sync` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 1m 49s |
| Result | Done |

- **Why:** the second `/codex:review` of Milestone 2 reported that, with Settings open, a voice change made from the sidebar left the Settings view holding the old voice, so choosing an orchestrator afterwards saved the old voice and undid the change.
- **Attempt 1:** Codex first wrote a test that reproduces it (the saved payload carried the old voice) and confirmed it failed. It then made the Settings view listen for the settings-changed event and silently re-read the settings, ignoring failed reads, reads that were superseded by a newer read or a save, and reads after unmount, and skipping the re-read while its own save is running, so its own save does not cause an extra read or a loop.
- **Orchestrator check:** read the diff; no byte order marks; 41 files and 784 tests passed, `npm run typecheck` was clean, `npm run build` passed, and the real `dashboard/.data/chat-history.json` has the same hash before and after the suite.

## D53. space-cancels-speech

| | |
|---|---|
| Branch | `task/space-cancels-speech` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 2m 8s |
| Result | Done |

- **Why:** the second `/codex:review` of Milestone 2 reported that holding Space while a reply was being spoken started recognition without cancelling the speech, unlike the Talk button, so the microphone could transcribe the assistant's own reply and, with Hands-free on, send it as a new question.
- **Attempt 1:** Codex first wrote a test that reproduces it (Space did not cancel the speaker) and confirmed it failed. It then added an `onBeforeStart` option to the speech input hook, called once at every real start and never on ignored starts (inputs, buttons, key repeat, modified keys, unsupported browsers), and made the voice provider pass the speaker cancel to it, so every way of starting cancels once.
- **Orchestrator check:** read the diff; no byte order marks; 41 files and 801 tests passed, `npm run typecheck` was clean, `npm run build` passed, and the real `dashboard/.data/chat-history.json` has the same hash before and after the suite.

## D54. voice-widget-focus

| | |
|---|---|
| Branch | `task/voice-widget-focus` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 2m 25s |
| Result | Done |

- **Why:** the third `/codex:review` of Milestone 2 reported that a session started from the widget Talk button was stopped when the main window lost focus or was hidden, which is exactly what happens when the user works in another window with the widget open.
- **Attempt 1:** Codex first wrote two tests that reproduce it (blur and hidden tab both stopped recognition after Talk was pressed in the widget) and confirmed they failed. It then added an `allowBackground` option to the speech input hook and a widget-open flag in the voice provider, set by the app when the widget opens or closes. While the widget is open, blur and hidden events no longer stop a session started from a Talk button; a session started by holding Space still stops on release, blur, and hidden tab, and without the widget the old behavior is unchanged. Closing the widget stops recognition.
- **Orchestrator check:** read the diff; no byte order marks; 41 files and 811 tests passed, `npm run typecheck` was clean, `npm run build` passed, and the real `dashboard/.data/chat-history.json` has the same hash before and after the suite.

## D55. voice-reply-on-navigation

| | |
|---|---|
| Branch | `task/voice-reply-on-navigation` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 2m 4s |
| Result | Done |

- **Why:** the third `/codex:review` of Milestone 2 reported that a Hands-free request sent from the chat panel was spoken by the panel itself, so if the user left Home before the reply arrived, the panel was gone and the reply was never spoken.
- **Attempt 1:** Codex first wrote a test that reproduces it (request sent on Home, navigation before it resolves, zero playback calls) and confirmed it failed. It then moved playback to the persistent voice provider: the chat panel hands each request to a new `trackChatReply` function that waits for the response and speaks it once if Reply with voice is on, whether or not the panel is still mounted. The panel no longer speaks on its own, so there is no double playback. New chat bumps a conversation counter so an abandoned request is not spoken; failed requests speak nothing and the panel still shows the error.
- **Orchestrator check:** read the diff; no byte order marks; 41 files and 817 tests passed, `npm run typecheck` was clean, `npm run build` passed, and the real `dashboard/.data/chat-history.json` has the same hash before and after the suite. Known limit: the conversation counter lives in the panel instance, so New chat pressed in a freshly mounted panel does not cancel a request started by an earlier, unmounted panel.

## D56. chat-isolation-check

| | |
|---|---|
| Branch | `task/chat-isolation-check` |
| Codex attempts | 0 |
| Codex model | not applicable (done by the orchestrator) |
| Duration | 58s |
| Result | Done |

- **Why:** the plan requires proving what each CLI can reach with the exact chat flags before any chat code is written.
- **What was done:** the orchestrator ran Claude Code and Codex for real, with no shell, the prompt on stdin, and an empty working directory, and asked each to read a canary file outside that directory, create files, and run a command. Duration is the time of the CLI probes only (20s and 38s).
- **Result:** Claude Code failed all three requests. Codex could read the canary and run a command, and only its writes were blocked, so Codex chat stays limited to local answers until the user decides. Also found: the `claude` and `codex` shims are `.cmd` files that cannot be started without a shell on Windows, so the runner must start the native executables. Details in `docs/chat-isolation.md`.
- **Orchestrator check:** a search of the new files finds no local paths, host names, or personal data.

## D57. chat-isolation-decision

| | |
|---|---|
| Branch | `task/chat-isolation-decision` |
| Codex attempts | 0 |
| Codex model | not applicable (done by the orchestrator) |
| Duration | 14s |
| Result | Done |

- **Why:** the user decided that the orchestrator chat uses only Claude Code, and asked for three corrections to `docs/chat-isolation.md`.
- **What was done:** the first run showed that locally installed plugin hooks still start under `--tools "" --strict-mcp-config`, so the orchestrator repeated the three requests with `--safe-mode --no-session-persistence` added. Duration is the time of that repeated probe only. No hook ran, stderr was empty, and no request succeeded. The document now records both runs, states the limits of the check, and no longer claims which files Codex can read beyond the one tested. The plan was updated: Claude Code only, a notice for Codex, clean replies, and a Phase 2 task for a possible Codex chat.
- **Orchestrator check:** a search of the changed files finds no local paths, host names, or personal data; the test suite passes.

## D58. chat-prompt

| | |
|---|---|
| Branch | `task/chat-prompt` |
| Codex attempts | 2 |
| Codex model | not reported |
| Duration | 2m 57s |
| Result | Done |

- **Attempt 1:** Codex added a pure `buildChatPrompt` function. Repo content and chat history sit inside a marked untrusted block, every angle bracket in them is escaped so closing markers cannot end it, and the prompt says the chat is read-only and that the agent has no tools and must not print tool-call markup. All checks passed, but the review found that history took the budget before the snapshot, so a long conversation could leave the agent with no repo data.
- **Attempt 2:** Codex first wrote a test that reproduces it and confirmed it failed, then limited history to 8000 characters, keeping the newest messages, and left the rest of the budget to the snapshot.
- **Orchestrator check:** read the diff; no byte order marks; 42 files and 831 tests passed, `npm run typecheck` was clean, `npm run build` passed, and the real `dashboard/.data/chat-history.json` has the same hash before and after the suite.

## D59. chat-runner

| | |
|---|---|
| Branch | `task/chat-runner` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 3m 41s |
| Result | Done |

- **Attempt 1:** Codex added the runner for Claude Code only, with the exact isolation flags including `--safe-mode` and `--no-session-persistence`, no shell, the prompt on stdin, an empty temporary working directory removed after each run, voice keys removed from the child environment, a server-side model allowlist, a 60 second timeout, and an output cap. On Windows it resolves the native `claude.exe` and never starts a `.cmd` file. It also added `cleanChatReply`, which replaces tool-call markup with a short notice.
- **Orchestrator check:** read the code; no byte order marks; 44 files and 879 tests passed with a mocked spawn, `npm run typecheck` was clean, `npm run build` passed, and the real `dashboard/.data/chat-history.json` has the same hash before and after the suite. The real CLI is exercised in `m3-acceptance`.

## D60. chat-route

| | |
|---|---|
| Branch | `task/chat-route` |
| Codex attempts | 2 |
| Codex model | not reported |
| Duration | 5m 28s |
| Result | Done |

- **Attempt 1:** Codex stopped once to ask about a one-line type change in `ChatPanel.tsx`, outside its file list, which the orchestrator allowed, and then finished in the same thread. Known questions and action requests stay local. Other questions go to Claude Code with the saved model, or stay local with a notice when Codex is the orchestrator, and no CLI starts in that case. One run at a time returns 429 when busy; a missing CLI returns 503, a timeout 504, and other failures 502, with no diagnostics in the body. Old settings files keep loading, saves without `chatModel` keep the saved value, and `GET /api/docs/chat-isolation` serves that one fixed file as plain text. The review found that a reply over the 10000-character history limit failed validation and silently lost the exchange.
- **Attempt 2:** Codex first wrote a test that reproduces it and confirmed it failed, then stored long replies cut to the limit with a short marker. The caller still gets the full reply.
- **Orchestrator check:** read the diff; no byte order marks; 45 files and 905 tests passed, `npm run typecheck` was clean, `npm run build` passed, and the real `dashboard/.data/chat-history.json` has the same hash before and after the suite.

## D61. chat-panel-orchestrator

| | |
|---|---|
| Branch | `task/chat-panel-orchestrator` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 3m 4s |
| Result | Done |

- **Attempt 1:** Codex added the Claude Code model selector, which saves the choice and restores it if the save fails, a running status, a label on each reply saying whether it was local or from the orchestrator, and the Codex notice with a link to the isolation document. The panel follows changes made in Settings. The API client now passes on the server's message for a missing CLI. Two tests outside the list needed the new settings mocks.
- **Orchestrator check:** read the diff; no byte order marks; 45 files and 914 tests passed, `npm run typecheck` was clean, `npm run build` passed, and the real `dashboard/.data/chat-history.json` has the same hash before and after the suite. Known limit: busy and timeout errors still show the generic "API request failed" text in the chat.

## D62. docs-chat

| | |
|---|---|
| Branch | `task/docs-chat` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 1m 55s |
| Result | Done |

- **Attempt 1:** Codex documented the routing of chat questions, the isolation flags, what is sent to the model and through which account, setup, the Codex restriction, and the limits of the isolation check, and removed the statements that the chat never starts an agent or was not built yet. Each of the three documents links to `docs/chat-isolation.md`.
- **Orchestrator check:** read the diff; no byte order marks; a search of the changed files finds no personal data or local paths; 45 files and 914 tests passed, `npm run typecheck` was clean, `npm run build` passed, and the real `dashboard/.data/chat-history.json` has the same hash before and after the suite.

## D63. chat-error-messages

| | |
|---|---|
| Branch | `task/chat-error-messages` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 1m 39s |
| Result | Done |

- **Why:** a busy chat and a timeout showed the generic "API request failed" text instead of the server's clear message.
- **Attempt 1:** Codex first wrote tests that reproduce it and confirmed they failed (4 failures). It then passed the server message through for exactly 429 `CHAT_BUSY`, 504 `TIMEOUT`, and 503 `CLI_NOT_FOUND`; every other error keeps the generic text.
- **Orchestrator check:** read the diff; no byte order marks; 45 files and 927 tests passed, `npm run typecheck` was clean, `npm run build` passed, and the real `dashboard/.data/chat-history.json` has the same hash before and after the suite.

## D64. plan-test-real-state

| | |
|---|---|
| Branch | `task/plan-test-real-state` |
| Codex attempts | 1 |
| Codex model | not reported |
| Duration | 1m 2s |
| Result | Done |

- **Why:** the clean `npm ci` run of `m3-acceptance` failed because the test on the real plan required at least one pending task, which stops being true when the last task of a milestone starts.
- **Attempt 1:** Codex confirmed the failure and removed that one assertion. An inline fixture already covers grouping of pending tasks.
- **Orchestrator check:** read the diff; no byte order marks; 45 files and 927 tests passed, `npm run typecheck` was clean, and `npm run build` passed.
