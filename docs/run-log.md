# Run log

One entry per task: how many attempts Codex needed, which tests passed, and the result. Numbered entries (`## 1. name`) are example-app tasks from `example-app/PLAN.md`; D-prefixed entries (`## D1. name`) are dashboard tasks from `dashboard/PLAN.md`. The orchestrator (Claude Code) runs the tests itself after every attempt.

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
