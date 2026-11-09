# PLAN

A local web dashboard for Harness. React, TypeScript, and Vite on the front end; a small Node and Express backend that serves everything on `127.0.0.1`. Built with the loop in `CLAUDE.md`: the orchestrator delegates, Codex implements, tests decide.

**Every definition of done also requires:** `npm test`, `npm run typecheck`, and `npm run build` pass, run by the orchestrator from `dashboard/`.

**Dependencies:** the Codex sandbox has no network, so the orchestrator installs every dependency during `scaffold`.

**Product rules:** the product is called Harness. Claude Code and Codex are the only agents. The interface is in English. No photos, avatars, emails, local paths, or keys anywhere. Bundled fonts and inline SVG icons only: no CDN requests.

**UI rule:** a control appears only in the milestone that makes it work. No disabled placeholders.

## Working a task

At the start of each task the orchestrator moves it from Pending to In progress in this file and commits that on `main`, so the dashboard shows what is being worked on. When the task is done and merged, it moves to Done with its result.

## Closing a milestone

Work in the order listed. A milestone closes only after these steps, in order:

1. All its tasks are done and merged to `main` locally.
2. From a clean `npm ci`, the orchestrator confirms that tests, typecheck, and build pass.
3. The orchestrator runs the milestone acceptance, and the user runs `/codex:review`.
4. The orchestrator stops and asks for confirmation to push. It never pushes without that confirmation.
5. After the push, CI must be green on the pushed commit. A red run reopens the milestone, and the fix needs a new push confirmation.

## Security model

**Network (Milestone 1)**
- The server binds to `127.0.0.1` only.
- Every request must have an allowlisted `Host`, which blocks DNS rebinding.
- Every state-changing request must have an allowlisted `Origin` and a JSON content type, which blocks cross-site requests from other tabs.
- Request bodies are size-limited and validated with Zod.

**Repo data (Milestone 1)**
- The backend reads a fixed list of files. No path ever comes from a request.
- `git` runs through `execFile` with fixed arguments and no shell. Author names and emails are never requested.

**Local answers (Milestone 1)**
- Clickable suggestions and known questions are answered by plain code from `PLAN.md`, the run log, and `git log`. No agent runs and no tokens are used.

**Voice keys (Milestone 2)**
- Keys are read only from `.env` in the backend.
- The API reports only whether a provider is configured, and never returns a key or voice ID.

**Orchestrator with no capabilities (Milestone 3)**
- Free text goes to Claude Code, the only CLI used for the chat, with a repo snapshot built by the backend, so the agent has nothing to fetch:
  - Arguments: `-p --tools "" --strict-mcp-config --safe-mode --no-session-persistence`, plus the allowlisted model. `--safe-mode` keeps locally installed plugins and hooks from running.
  - On Windows the native `claude.exe` is started, because the npm `.cmd` shim cannot start without a shell.
  - The working directory is an empty temporary folder.
  - The prompt goes through stdin. It is never an argument.
  - Arguments are fixed, there is no shell, and the model comes from a server-side allowlist.
  - Voice keys are removed from the child environment.
  - Each run has a timeout and an output cap, and only one can run at a time.
- Repo content in the snapshot is marked as untrusted data. The prompt tells the agent not to try to use tools. Replies render as plain text, never as HTML, and tool-call markup in a reply is replaced by a short notice.
- Codex is never started by the chat. `docs/chat-isolation.md` showed that on Windows its read-only sandbox does not stop it from reading files outside its working directory or running commands. When Codex is the selected orchestrator the chat gives local answers only and the interface explains why.

## Pending

### Milestone 1: dashboard visible

### Milestone 2: voice and widget

### Milestone 3: chat with the orchestrator

## In progress

_None._

## Done

### scaffold
- **Goal:** Create the Vite, React, TypeScript, Vitest, and Express project with a page that renders "Harness".
- **Files:** `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `tests/app.test.tsx`
- **Definition of done:** `tests/app.test.tsx` passes: the app renders the product name. Vite binds to `127.0.0.1` and proxies `/api`. `.gitignore` covers `dist/` and `.data/`. A clean `npm ci` works.
- **Result:** done. 2 tests pass, typecheck and build clean, verified from a clean `npm ci`.

### server-app
- **Goal:** Add an Express app factory, a separate entry point that binds to `127.0.0.1`, and `GET /api/health`.
- **Files:** `server/app.ts`, `server/index.ts`, `tests/server/health.test.ts`
- **Definition of done:** `tests/server/health.test.ts` passes: health returns 200; importing `createApp` does not open a port; the entry point uses host `127.0.0.1`.
- **Result:** done. 11 tests pass, typecheck and build clean.

### server-guards
- **Goal:** Add the Host, Origin, content-type, and body-size guards.
- **Files:** `server/security.ts`, `server/app.ts`, `tests/server/security.test.ts`
- **Definition of done:** `tests/server/security.test.ts` passes: an unknown `Host` returns 403; a POST with a foreign or missing `Origin` returns 403; a non-JSON POST returns 415; an oversized body returns 413; allowed requests pass.
- **Result:** done. 32 tests pass, typecheck and build clean.

### api-contract
- **Goal:** Define the Zod schemas and types shared by the front end and backend for Milestone 1. Later milestones extend this file.
- **Files:** `shared/api.ts`, `tests/shared/api.test.ts`
- **Definition of done:** `tests/shared/api.test.ts` passes: valid plan, run-log, commit, galaxy, agent card, and chat payloads are accepted; unknown enum values and unknown fields are rejected.
- **Result:** done. 91 tests pass, typecheck and build clean.

### plan-parser
- **Goal:** Parse a `PLAN.md` into Pending, In progress, and Done tasks.
- **Files:** `server/data/plan.ts`, `tests/server/plan.test.ts`
- **Definition of done:** `tests/server/plan.test.ts` passes: goal, files, definition of done, and result are extracted; `_None._` gives an empty column; a level-3 heading with no task fields is kept as the milestone group of the tasks after it; the Phase 2 section is excluded; malformed input does not throw.
- **Result:** done. 105 tests pass, typecheck and build clean.

### runlog-parser
- **Goal:** Parse `docs/run-log.md` into entries, separating example-app entries (`## 1. name`) from dashboard entries (`## D1. name`).
- **Files:** `server/data/runlog.ts`, `tests/server/runlog.test.ts`
- **Definition of done:** `tests/server/runlog.test.ts` passes: branch, attempts, result, and notes are extracted; non-entry sections are ignored; malformed input does not throw.
- **Result:** done. 121 tests pass, typecheck and build clean.

### git-reader
- **Goal:** Read recent commits and tracked test files with fixed `git` arguments.
- **Files:** `server/data/git.ts`, `tests/server/git.test.ts`
- **Definition of done:** `tests/server/git.test.ts` passes against a temporary repository: commits return hash, subject, and date only; no author or email appears; the commit limit is enforced; a missing `git` or repository returns an empty result.
- **Result:** done. 131 tests pass, typecheck and build clean.

### galaxy-model
- **Goal:** Build the galaxy nodes (core, Claude Code, Codex, Tasks, Commits, Tests) from real data, taking the orchestrator and worker roles as input.
- **Files:** `server/data/galaxy.ts`, `tests/server/galaxy.test.ts`
- **Definition of done:** `tests/server/galaxy.test.ts` passes with fixtures: node counts and details match the input; test counts come from tracked test files and recorded results; the given roles are applied, and they default to Claude Code as orchestrator and Codex as worker; empty input gives a valid galaxy.
- **Result:** done. 139 tests pass, typecheck and build clean.

### agents-model
- **Goal:** Derive agent cards from plan tasks and run-log entries, with no invented data.
- **Files:** `server/data/agents.ts`, `tests/server/agents.test.ts`
- **Definition of done:** `tests/server/agents.test.ts` passes: In progress maps to `working`, Done to `done`, and a run-log failure to `error`; output lines are the latest run-log notes; the agent is taken only from the run-log entry; agent, model, and time are `null` when they are not recorded.
- **Result:** done. 155 tests pass, typecheck and build clean.

### data-routes
- **Goal:** Expose plan, run-log, commits, galaxy, and agents over the API.
- **Files:** `server/routes/data.ts`, `server/app.ts`, `tests/server/data-routes.test.ts`
- **Definition of done:** `tests/server/data-routes.test.ts` passes: each route matches `shared/api.ts`; `source` accepts only `dashboard` or `example-app`; a path in `source` returns 400; a missing file returns an empty result.
- **Result:** done. 172 tests pass, typecheck and build clean.

### chat-local-answers
- **Goal:** Answer known repo questions without an agent, through `POST /api/chat`.
- **Files:** `server/chat/local.ts`, `server/routes/chat.ts`, `server/routes/data.ts`, `server/app.ts`, `shared/api.ts`, `tests/server/chat-local.test.ts`, `tests/shared/api.test.ts`
- **Definition of done:** `tests/server/chat-local.test.ts` passes: pending tasks, current task, latest commits, latest run, and test status are answered from fixtures; an unknown question returns a reply listing what can be asked; invalid bodies return 400; the route cannot start a process.
- **Result:** done. 199 tests pass, typecheck and build clean. Also adds `GET /api/chat/suggestions` and a shared repo reader.

### api-client
- **Goal:** Add a typed front-end client that validates responses against `shared/api.ts`.
- **Files:** `src/lib/api.ts`, `tests/client/api.test.ts`
- **Definition of done:** `tests/client/api.test.ts` passes: valid responses are parsed; HTTP errors and invalid shapes produce typed errors.
- **Result:** done. 227 tests pass, typecheck and build clean.

### theme-tokens
- **Goal:** Add the dark theme: near-black textured background, teal `#2dd4bf`, amber for active states, bundled modern sans font, and large section titles.
- **Files:** `src/styles/tokens.css`, `src/styles/global.css`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `package.json`, `package-lock.json`, `tests/client/theme.test.ts`
- **Definition of done:** `tests/client/theme.test.ts` passes: the required tokens exist and no stylesheet loads a remote URL.
- **Result:** done. 231 tests pass, typecheck and build clean. The Inter font ships from the build output (`@fontsource-variable/inter`, OFL license).

### app-shell
- **Goal:** Add the collapsible sidebar with navigation for Harness, Agents, Galaxy, and Plan, a status dot, and Full screen.
- **Files:** `src/components/Sidebar.tsx`, `src/components/Sidebar.css`, `src/hooks/useAgentStatus.ts`, `src/App.tsx`, `src/App.css`, `tests/app.test.tsx`, `tests/client/sidebar.test.tsx`
- **Definition of done:** `tests/client/sidebar.test.tsx` passes: the four views are listed and switch on click; Close menu hides the labels and keeps accessible names; the status dot reflects `GET /api/health`; Full screen calls the browser API.
- **Result:** done. 243 tests pass, typecheck and build clean. Views are placeholders until their own tasks.

### orb
- **Goal:** Add the animated orb with concentric teal rings and idle, listening, and speaking states, using SVG and CSS only.
- **Files:** `src/components/Orb.tsx`, `src/components/Orb.css`, `tests/client/orb.test.tsx`
- **Definition of done:** `tests/client/orb.test.tsx` passes: each state renders; rings are present; no `img` element exists; animation is disabled under `prefers-reduced-motion`.
- **Result:** done. 250 tests pass, typecheck and build clean.

### chat-panel
- **Goal:** Add the chat with local answers only: New chat, suggestions, text field, and Send.
- **Files:** `src/components/ChatPanel.tsx`, `src/components/ChatPanel.css`, `tests/client/chat-panel.test.tsx`
- **Definition of done:** `tests/client/chat-panel.test.tsx` passes: sending calls the API and shows the reply; suggestions send their text; New chat clears history; HTML in a reply renders as literal text; errors are shown; Send is disabled while waiting.
- **Result:** done. 262 tests pass, typecheck and build clean.

### home-view
- **Goal:** Compose the orb, spaced "H A R N E S S" title, subtitle, and chat.
- **Files:** `src/views/HomeView.tsx`, `src/views/HomeView.css`, `src/App.tsx`, `tests/client/home-view.test.tsx`, `tests/app.test.tsx`, `tests/client/sidebar.test.tsx`
- **Definition of done:** `tests/client/home-view.test.tsx` passes: orb, title, subtitle, and chat render.
- **Result:** done. 266 tests pass, typecheck and build clean.

### agents-view
- **Goal:** Add the historical agent card grid with a 1, 2x2, and 3x3 selector.
- **Files:** `src/views/AgentsView.tsx`, `src/views/AgentsView.css`, `src/lib/format.ts`, `src/App.tsx`, `tests/client/agents-view.test.tsx`, `tests/client/format.test.ts`, `tests/client/sidebar.test.tsx`
- **Definition of done:** `tests/client/agents-view.test.tsx` passes: task, agent, model, status, time, and monospaced output render; the selector changes the layout; a `null` value shows "—"; the empty state renders.
- **Result:** done. 294 tests pass, typecheck and build clean. Adds pagination (page size follows the layout) and a Refresh button.

### galaxy-camera
- **Goal:** Add pure functions for orbit positions, wheel zoom, drag pan, and hit testing.
- **Files:** `src/galaxy/camera.ts`, `tests/client/galaxy-camera.test.ts`
- **Definition of done:** `tests/client/galaxy-camera.test.ts` passes: zoom keeps the point under the cursor fixed and respects limits; pan moves by the screen delta at any zoom; hit testing finds a planet and returns `null` in empty space.
- **Result:** done. 317 tests pass, typecheck and build clean.

### galaxy-view
- **Goal:** Render the animated galaxy on a 2D canvas with a detail panel.
- **Files:** `src/views/GalaxyView.tsx`, `src/views/GalaxyView.css`, `src/galaxy/draw.ts`, `src/App.tsx`, `tests/client/galaxy-view.test.tsx`, `tests/client/galaxy-draw.test.ts`, `tests/client/galaxy-fixture.ts`, `tests/client/sidebar.test.tsx`
- **Definition of done:** `tests/client/galaxy-view.test.tsx` passes with a mocked canvas: it renders from API data; clicking a planet opens its detail; the animation frame is cancelled on unmount; the systems are also listed for screen readers.
- **Result:** done. 330 tests pass, typecheck and build clean.

### plan-view
- **Goal:** Add the Pending, In progress, and Done board with the run log and a source selector.
- **Files:** `src/views/PlanView.tsx`, `src/views/PlanView.css`, `src/App.tsx`, `tests/client/plan-view.test.tsx`, `tests/client/sidebar.test.tsx`, `tests/app.test.tsx`
- **Definition of done:** `tests/client/plan-view.test.tsx` passes: tasks appear in the right column under their milestone; the source selector reloads data; the run log renders; empty and error states render.
- **Result:** done. 343 tests pass, typecheck and build clean. All four views are real now.

### serve-build
- **Goal:** Serve the built front end from Express with a strict content security policy.
- **Files:** `server/static.ts`, `server/app.ts`, `server/index.ts`, `package.json`, `tests/server/static.test.ts`, `tests/server/health.test.ts`
- **Definition of done:** `tests/server/static.test.ts` passes: the index is served with the CSP header; API routes are not shadowed; the CSP blocks remote scripts, styles, fonts, and connections.
- **Result:** done. 365 tests pass, typecheck and build clean. The Host allowlist now follows the configured `PORT`, and `npm start` serves the built front end.

### public-safety-test
- **Goal:** Fail the test suite when public-repo rules are broken in `dashboard/`.
- **Files:** `tests/helpers/safety-scan.ts`, `tests/public-safety.test.ts`, and four client tests whose image-tag fixtures are now built at runtime
- **Definition of done:** `tests/public-safety.test.ts` passes on the repo and fails on fixtures containing an email address, an absolute local path, a filled-in key, a person image, or a remote font.
- **Result:** done. 402 tests pass, typecheck and build clean. It also rejects the retired product name and other agent tools, and scans `docs/run-log.md` and `.env.example`.

### ci-dashboard
- **Goal:** Add a `dashboard` job to the CI workflow.
- **Files:** `../.github/workflows/ci.yml`, `tests/ci-workflow.test.ts`
- **Definition of done:** the YAML parses; the new job runs `npm ci`, `npm test`, `npm run typecheck`, and `npm run build` in `dashboard/`, uses the same pinned actions, and keeps read-only permissions; the `example-app` job is unchanged.
- **Result:** done. YAML parsed with an external parser; 406 tests pass, typecheck and build clean. The workflow has not run on GitHub yet.

### docs-dashboard
- **Goal:** Document setup, the four views, the Milestone 1 security model, and what is not built yet.
- **Files:** `README.md`, `../README.md`, `../docs/architecture.md`, `../docs/setup.md`, `../docs/run-log.md`
- **Definition of done:** the documents match the implemented behavior; the run-log header describes both entry types; a search of the changed files finds no personal data or local paths.
- **Result:** done. Docs checked against the code by Codex and reviewed by the orchestrator; 406 tests pass, typecheck and build clean.

### m1-acceptance
- **Goal:** Run the built dashboard and check it in a real browser. Performed by the orchestrator.
- **Files:** none
- **Definition of done:** from a clean `npm ci`, all checks pass; the server answers only on `127.0.0.1`; the four views work with real repo data; suggestions return local answers; findings are fixed or listed for the user. Then follow "Closing a milestone".
- **Result:** done. Checks and the real server passed; the Harness and Galaxy views were checked by screenshot, Agents and Plan through the page structure only because the browser tool timed out on screenshots. Two findings were fixed (`home-layout-fix`, `fix-flaky-tests`); two are listed for the user: raw markdown characters in recorded notes, and the dense style of `GalaxyView.tsx` and `draw.ts`. Waiting for `/codex:review` and the push confirmation.

### plain-text-notes
- **Goal:** Show run-log notes and chat replies as clean plain text, without markdown characters (`**`, backticks) and without rendering HTML.
- **Files:** `server/data/plain-text.ts`, `server/data/runlog.ts`, `server/chat/local.ts`, `tests/server/plain-text.test.ts`, `tests/server/runlog.test.ts`, `tests/server/chat-local.test.ts`, `tests/server/agents.test.ts`
- **Definition of done:** `tests/server/plain-text.test.ts` passes: bold, italic, inline code, links, and heading markers are removed while the words stay; HTML-looking text is left as literal text; the run-log notes and the chat replies use it; the Agents cards and the Plan run log receive clean notes.
- **Result:** done. 445 tests pass, typecheck and build clean. Single `*` and `_` are left alone on purpose (globs and identifiers), so italic markers are not removed.

### reformat-galaxy
- **Goal:** Reformat `GalaxyView.tsx` and `draw.ts` with readable line lengths, without changing behavior.
- **Files:** `src/views/GalaxyView.tsx`, `src/galaxy/draw.ts`
- **Definition of done:** no test file changes and all existing tests pass unchanged; no line is longer than 100 characters in the two files; no logic, names, or exported signatures change.
- **Result:** done. The minified output of both files is identical before and after; the longest lines are 95 and 74 characters (before: 512 and 252); 445 tests pass unchanged, typecheck and build clean.

### agents-card-layout
- **Goal:** Make the Agents card output wrap onto at most 4 lines with no horizontal scroll, and hide the Model and Time rows when their value is null.
- **Files:** `src/views/AgentsView.tsx`, `src/views/AgentsView.css`, `tests/client/agents-view.test.tsx`, `README.md`
- **Definition of done:** `tests/client/agents-view.test.tsx` passes: output text wraps (long words too) and is limited to 4 lines through CSS with no horizontal scrolling; the Model and Time rows do not render when null and render when present; the Agent row still shows an em dash when unknown; the empty-output placeholder stays; the dashboard README describes this behavior.
- **Result:** done. 451 tests pass, typecheck and build clean. The full output text is in the tooltip.

### run-log-model-duration
- **Goal:** Record the Codex model and the task duration in every new run-log entry, read them in the parser, and show them in the Agents cards.
- **Files:** `shared/api.ts`, `server/data/duration.ts`, `server/data/runlog.ts`, `server/data/agents.ts`, `../docs/run-log.md`, `README.md`, and the tests that build run-log entries
- **Definition of done:** new entries carry the table rows `Codex model` and `Duration`; the parser returns `model` and `durationSeconds` (null when absent or unparseable, so older entries keep working); the Agents cards use them for model and elapsed time; the run-log introduction and the dashboard README document the two rows.
- **Result:** done. 494 tests pass, typecheck and build clean. Entries D1 to D28 have neither row; from D29 on the model is "not reported" unless the Codex companion output shows one.

### chat-unsupported-requests
- **Goal:** Make the local chat answer clearly when asked to do something it cannot do (for example launching agents).
- **Files:** `server/chat/local.ts`, `tests/server/chat-local.test.ts`, `README.md`, `../docs/architecture.md`
- **Definition of done:** `tests/server/chat-local.test.ts` passes: requests to launch, run, start, or otherwise act get a reply saying that this version cannot run agents or change files and listing what it can answer; the five suggestions still reach their own answers; the help reply for unknown questions states the same limit.
- **Result:** done in 2 attempts. 545 tests pass, typecheck and build clean. Short read-only phrases such as `run log`, `test status`, and `commit history` are not treated as actions.

### chat-word-boundaries
- **Goal:** Match chat intent keywords as whole words or phrases, so `know` and `unknown` no longer trigger `now` (finding from the Codex review of Milestone 1).
- **Files:** `server/chat/local.ts`, `tests/server/chat-local.test.ts`
- **Definition of done:** `Do you know what is pending?` returns the pending tasks; questions that only contain `unknown` get the not-understood reply with the capability notice; look-alikes such as `nowhere`, `leftover`, `commitment`, and `currency` trigger no intent; real keywords with plurals, capitals, and punctuation still work.
- **Result:** done. 592 tests pass, typecheck and build clean. A bare `commit` is still treated as an action request (verb-first rule); `commits` returns the commit list.

### home-layout-fix
- **Goal:** Keep the home chat usable on short browser windows (found in the Milestone 1 browser acceptance).
- **Files:** `src/views/HomeView.css`, `src/App.css`, `tests/client/home-view.test.tsx`
- **Definition of done:** at a 630 px viewport height the chat messages area keeps at least 12rem and the page scrolls; the orb shrinks on short viewports; tests, typecheck, and build pass.
- **Result:** done. 407 tests pass, typecheck and build clean.

### fix-flaky-tests
- **Goal:** Remove two intermittent test failures found in the Milestone 1 acceptance.
- **Files:** `tests/client/galaxy-view.test.tsx`, `tests/client/chat-panel.test.tsx`, `tests/public-safety.test.ts`, `tests/server/chat-local.test.ts`, `tests/server/data-routes.test.ts`
- **Definition of done:** no test creates a temporary directory inside `dashboard/`; the safety scan tolerates files that disappear during the walk; the galaxy test waits for the canvas effect; the suite passes repeatedly, including under CPU load.
- **Result:** done. 409 tests pass; 12 of 12 parallel runs under CPU load pass (6 of 12 earlier runs had failed in a similar stress test).

### tts-config
- **Goal:** Load voice settings from the root `.env` and expose only provider availability.
- **Files:** `server/voice/config.ts`, `shared/api.ts`, `../.env.example`, `tests/server/tts-config.test.ts`
- **Definition of done:** `tests/server/tts-config.test.ts` passes: a provider is available only with both key and voice ID; the public view contains no key or voice ID. `.env.example` no longer says it is intentionally empty, and has empty, commented `FISH_AUDIO_API_KEY`, `FISH_AUDIO_VOICE_ID`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `OPENAI_TTS_API_KEY`, and `OPENAI_TTS_VOICE`.
- **Result:** done in 2 attempts. 605 tests pass, typecheck and build clean. Adds the shared `voiceProvidersSchema`, an `.env` parser with no new dependency, and a public view with only `id` and `available`. Process env values override the file and still work when the file is missing.

### tts-fish-audio
- **Goal:** Add the Fish Audio adapter.
- **Files:** `server/voice/fish-audio.ts`, `server/voice/errors.ts`, `server/voice/config.ts`, `tests/server/tts-fish-audio.test.ts`
- **Definition of done:** `tests/server/tts-fish-audio.test.ts` passes with a mocked `fetch`: URL, headers, and body are correct; audio bytes are returned; provider errors become a typed error that contains no key.
- **Result:** done in 1 attempt. 612 tests pass, typecheck and build clean. Adds the shared `TtsProviderError` (no key, voice ID, or response body in its message) that the other adapters reuse.

### tts-elevenlabs
- **Goal:** Add the ElevenLabs adapter.
- **Files:** `server/voice/elevenlabs.ts`, `tests/server/tts-elevenlabs.test.ts`
- **Definition of done:** `tests/server/tts-elevenlabs.test.ts` passes with a mocked `fetch`: URL, headers, and body are correct; audio bytes are returned; provider errors become a typed error that contains no key.
- **Result:** done in 1 attempt. 619 tests pass, typecheck and build clean. The voice ID is URL-encoded in the request path; errors reuse `TtsProviderError`.

### tts-openai
- **Goal:** Add the OpenAI TTS adapter.
- **Files:** `server/voice/openai-tts.ts`, `tests/server/tts-openai.test.ts`
- **Definition of done:** `tests/server/tts-openai.test.ts` passes with a mocked `fetch`: URL, headers, and body are correct; audio bytes are returned; provider errors become a typed error that contains no key.
- **Result:** done in 1 attempt. 626 tests pass, typecheck and build clean.

### tts-route
- **Goal:** Add `GET /api/voice/providers` and `POST /api/tts`, which dispatches to the selected adapter.
- **Files:** `server/routes/tts.ts`, `server/app.ts`, `shared/api.ts`, `tests/server/tts-route.test.ts`
- **Definition of done:** `tests/server/tts-route.test.ts` passes: providers returns availability only; audio is returned with the right content type; an unconfigured provider returns 409; over-limit text returns 400; a provider failure returns 502 with no secret in the body.
- **Result:** done in 1 attempt. 641 tests pass, typecheck and build clean. Adapters are injectable for tests; the voice configuration is read on every request, so `.env` edits apply without a restart.

### settings-store
- **Goal:** Persist the orchestrator and voice settings in the ignored `.data/settings.json`, expose them over the API, and use the saved roles in the galaxy.
- **Files:** `server/settings.ts`, `server/routes/settings.ts`, `server/routes/data.ts`, `server/app.ts`, `shared/api.ts`, `tests/server/settings.test.ts`
- **Definition of done:** `tests/server/settings.test.ts` passes: defaults apply when the file is missing or corrupt; a save survives a reload; invalid values return 400; choosing one orchestrator makes the other agent the worker; the galaxy route reflects the saved roles; historical agent cards do not change.
- **Result:** done in 1 attempt. 659 tests pass, typecheck and build clean. Settings are validated on read and write, saved atomically, and fall back to defaults when the file is missing or corrupt. The agent cards ignore the setting.

### settings-view
- **Goal:** Add the Settings view with orchestrator and voice choices.
- **Files:** `src/views/SettingsView.tsx`, `src/views/SettingsView.css`, `src/components/Sidebar.tsx`, `src/App.tsx`, `src/lib/api.ts`, `tests/client/settings-view.test.tsx`, `tests/client/sidebar.test.tsx`, `tests/client/api.test.ts`
- **Definition of done:** `tests/client/settings-view.test.tsx` passes: Settings appears in the sidebar; choosing an orchestrator saves it and shows the other as worker; unconfigured voice providers are disabled; no key field exists.
- **Result:** done in 1 attempt. 671 tests pass, typecheck and build clean. Adds `getSettings`, `saveSettings`, and `getVoiceProviders` to the API client. If the providers request fails, only the browser voice stays selectable.

### chat-history
- **Goal:** Keep the chat history in the ignored `.data/` folder and restore it when the page reloads; "New chat" deletes it.
- **Files:** `server/chat/history.ts`, `server/routes/chat.ts`, `server/routes/data.ts`, `shared/api.ts`, `src/components/ChatPanel.tsx`, `src/lib/api.ts`, `tests/server/chat-history.test.ts`, `tests/client/chat-panel.test.tsx`, `tests/test-app.ts`, `tests/storage-safeguard.ts`, `vitest.config.ts`, and the tests that build the app or mock the client
- **Definition of done:** the history is stored in `.data/chat-history.json` (ignored by git, written atomically, capped in size, validated on read, with a corrupt file treated as empty); `GET /api/chat/history` returns it and `DELETE /api/chat/history` clears it, both behind the existing Host and Origin guards; the chat panel loads the history on mount and renders it as plain text; every sent message and reply is saved; `New chat` deletes the stored history; a reload shows the previous conversation.
- **Result:** done in 2 attempts. 683 tests pass, typecheck and build clean. The server saves each question and reply in `POST /api/chat` (capped at 200 messages and 100000 characters, written atomically, writes serialized). A history write failure never blocks an answer. A failed clear keeps the conversation and shows an error. A suite-wide safeguard fails the tests if they ever touch the real `.data` files.

### live-refresh
- **Goal:** Refresh the Agents and Plan views on their own every 5 seconds by polling the API, and pause while the browser tab is hidden.
- **Files:** `src/hooks/usePolling.ts`, `src/views/AgentsView.tsx`, `src/views/PlanView.tsx`, `tests/client/use-polling.test.tsx`, `tests/client/agents-view.test.tsx`, `tests/client/plan-view.test.tsx`
- **Definition of done:** `tests/client/use-polling.test.tsx` passes with fake timers: the callback runs every 5 seconds; polling pauses while `document.visibilityState` is hidden and refreshes once when the tab becomes visible; no request overlaps a pending one; the timer is cleared on unmount. Agents and Plan reload on their own without losing the page, layout, or source selection, and a failed refresh keeps the last data and shows no flicker. Manual Refresh still works.
- **Result:** done in 1 attempt. 690 tests pass, typecheck and build clean. Silent refreshes never show the loading state, keep the last data on failure, and are discarded when a newer load or an unmount makes them stale. Polling is off while the first load runs or shows an error.

### speech-input
- **Goal:** Add Web Speech API input with hold Space to talk.
- **Files:** `src/voice/useSpeechInput.ts`, `tests/client/speech-input.test.tsx`
- **Definition of done:** `tests/client/speech-input.test.tsx` passes with a mocked API: holding Space starts once and release stops; Space is ignored inside inputs; the transcript is delivered; an unsupported browser reports it without throwing; the UI discloses that the browser may process audio through its vendor's service.
- **Result:** done in 1 attempt. 716 tests pass, typecheck and build clean. It is the hook only; the interface that uses it and shows the privacy notice comes with `voice-controls`. Space is also ignored on buttons, links, and selects, because Space activates them.

### speech-output
- **Goal:** Speak replies with the browser voice by default, or through `/api/tts`.
- **Files:** `src/voice/speak.ts`, `server/static.ts`, `tests/client/speech-output.test.ts`, `tests/server/static.test.ts`
- **Definition of done:** `tests/client/speech-output.test.ts` passes with mocks: the browser provider never calls the backend; other providers do; a new reply cancels the previous one; Mute stops playback; a backend failure falls back to the browser voice. `tests/server/static.test.ts` passes: the CSP allows generated audio and still blocks remote sources.
- **Result:** done in 1 attempt. 739 tests pass, typecheck and build clean. A stale or superseded request never plays, and any provider failure falls back to the browser voice with no error text exposed. The policy lives in `server/static.ts` and now allows `media-src 'self' blob:` only; every remote source is still blocked.

### voice-controls
- **Goal:** Add Talk, Mute, and voice selector to the sidebar, plus Reply with voice, Hands-free, and microphone to the chat, and connect voice to the orb.
- **Files:** `src/voice/VoiceProvider.tsx`, `src/lib/settings-events.ts`, `src/components/VoiceControls.tsx`, `src/components/VoiceControls.css`, `src/components/Sidebar.tsx`, `src/components/ChatPanel.tsx`, `src/components/ChatPanel.css`, `src/views/SettingsView.tsx`, `src/App.tsx`, `tests/client/voice-controls.test.tsx`
- **Definition of done:** `tests/client/voice-controls.test.tsx` passes: Talk and Mute call the voice modules; the selector lists available voices; orb state follows voice state; Reply with voice speaks replies only when on; Hands-free sends the final transcript.
- **Result:** done in 2 attempts. 750 tests pass, typecheck and build clean. One app-level VoiceProvider holds the voice state so it survives view changes; without a provider the sidebar and chat show no voice controls. Saving the voice in Settings now notifies the provider through a window event, so the sidebar selector and spoken replies follow it.

### widget-mode
- **Goal:** Add Widget mode to the sidebar: a compact window with only the orb, status, and Talk button, using Document Picture-in-Picture with a popup fallback.
- **Files:** `src/widget/openWidget.ts`, `src/widget/WidgetView.tsx`, `src/widget/WidgetView.css`, `src/components/Sidebar.tsx`, `src/App.tsx`, `tests/client/widget.test.tsx`
- **Definition of done:** `tests/client/widget.test.tsx` passes with mocks: Picture-in-Picture is used when available; the popup is used otherwise; a blocked popup shows a message; the widget renders only its three elements; closing it cleans up.
- **Result:** done in 1 attempt. 761 tests pass, typecheck and build clean. The widget is rendered by a portal from the main app, so it shares the voice state; a blocked popup shows a message, and closing the window (or toggling) cleans up once.

### docs-voice
- **Goal:** Document voice providers, `.env` setup, Settings, widget mode, and the browser speech disclosure.
- **Files:** `README.md`, `../docs/architecture.md`, `../docs/setup.md`
- **Definition of done:** the documents match the implemented behavior; a search of the changed files finds no personal data, keys, or local paths.
- **Result:** done in 1 attempt. Docs checked against the code by Codex and reviewed by the orchestrator; 761 tests pass, typecheck and build clean. Live provider calls are stated as not verified.

### m2-acceptance
- **Goal:** Check voice and widget in a real browser. Performed by the orchestrator, with the user for microphone steps.
- **Files:** none
- **Definition of done:** from a clean `npm ci`, all checks pass; hold Space to talk and browser voice output work; Settings persists after a restart; widget mode opens; no key or voice ID appears in browser responses; providers without keys are verified only through their mocked tests, and this is reported. Then follow "Closing a milestone".
- **Result:** done. From a clean `npm ci`, 761 tests, typecheck, and build pass. The server listens only on `127.0.0.1`; no key or voice ID appeared in any response or bundled asset; Settings survived a server restart; the user confirmed microphone input, browser voice output, Mute, and widget mode in a real browser. Fish Audio, ElevenLabs, and OpenAI were verified only through their mocked tests, not with real keys. Two `/codex:review` passes found four issues, fixed as D50 to D53; the milestone was then pushed (`7109af8`) and CI was green on both jobs.

### voice-transcript-provider
- **Goal:** Send Hands-free transcripts from the persistent voice provider, so they work from any view and from the widget (finding from the Codex review of Milestone 2).
- **Files:** `src/voice/VoiceProvider.tsx`, `src/components/ChatPanel.tsx`, `tests/client/voice-controls.test.tsx`, `tests/client/chat-panel.test.tsx`
- **Definition of done:** a test reproduces the bug first: with Hands-free on, navigating to Agents (chat unmounted) and finishing a transcript sends no chat request. After the fix the final transcript is sent exactly once with Hands-free on, from any view and from the widget; when the chat panel is mounted it still shows the exchange live through its own send path (no duplicate request); when it is not mounted the provider sends the message directly, speaks the reply if Reply with voice is on, and a chat panel that mounts later shows the saved exchange from the history, including one that finishes after mounting; with Hands-free off nothing is sent; interim transcripts still only fill the field of a mounted chat.
- **Result:** done in 1 attempt. 773 tests pass, typecheck and build clean. The reproducing test failed before the fix (zero chat requests) and passes now. The provider sends the final Hands-free transcript from any view and from the widget; a mounted chat registers its own send path, so there is no duplicate request, and an exchange that finishes after the chat mounts is loaded from the history.

### chat-clear-generation
- **Goal:** Make "New chat" safe against requests still in flight, with a conversation generation identifier on the server (finding from the Codex review of Milestone 2).
- **Files:** `server/chat/history.ts`, `server/routes/chat.ts`, `tests/server/chat-history.test.ts`
- **Definition of done:** a test reproduces the bug first: a chat request is held while it reads repo data, the history is cleared, the request is released, and the cleared conversation reappears. After the fix the history stays empty: each history path has a generation that clearing increments, a chat request captures the generation before it reads anything, and its save is skipped when the generation changed; the reply is still returned to the caller; requests that start after a clear are saved normally; concurrent requests without a clear lose nothing; two app instances over the same file share the generation.
- **Result:** done in 1 attempt. 778 tests pass, typecheck and build clean. The reproducing test failed before the fix. Each history path has a shared in-memory generation that clearing bumps immediately; a chat request captures it before reading anything and its save is skipped when it changed, while the reply is still returned. Requests started after a clear and concurrent requests without a clear are saved normally.

### settings-view-sync
- **Goal:** Keep the Settings view in sync with voice changes made from the sidebar, so saving an orchestrator never reverts the voice (second finding from the Codex review of Milestone 2).
- **Files:** `src/views/SettingsView.tsx`, `tests/client/settings-view.test.tsx`
- **Definition of done:** a test reproduces the bug first: with Settings open, the voice is changed through the sidebar selector (the settings-changed event fires and the server now holds the new voice), the user then chooses an orchestrator, and the saved payload carries the old voice. After the fix the Settings view listens for the settings-changed event, re-reads the settings (ignoring stale or failed reads and reads that finish after a newer save, and removing the listener on unmount), and the next save carries the current voice; a failed re-read keeps the previous values; saving from Settings itself does not trigger a redundant extra read loop.
- **Result:** done in 1 attempt. 784 tests pass, typecheck and build clean. The reproducing test failed before the fix. Settings now re-reads the saved settings when the sidebar changes them, ignoring failed or stale reads and any read during or before its own save.

### space-cancels-speech
- **Goal:** Make starting speech input with hold Space cancel any spoken output first, like the Talk button (second finding from the Codex review of Milestone 2).
- **Files:** `src/voice/useSpeechInput.ts`, `src/voice/VoiceProvider.tsx`, `tests/client/speech-input.test.tsx`, `tests/client/voice-controls.test.tsx`
- **Definition of done:** a test reproduces the bug first: while a reply is being spoken, holding Space starts recognition without cancelling the speaker. After the fix every way of starting recognition (Space, the sidebar Talk button, the chat microphone, and the widget Talk button) cancels the speaker before recognition starts; the key is still ignored inside inputs, buttons, and editable fields and then cancels nothing; releasing Space still stops listening; the cancel runs once per start.
- **Result:** done in 1 attempt. 801 tests pass, typecheck and build clean. The reproducing test failed before the fix. The speech input hook has a new `onBeforeStart` option that runs once at every real start, and the voice provider uses it to cancel speech, so Space, the sidebar Talk, the chat microphone, and the widget Talk all cancel the same way.

### voice-widget-focus
- **Goal:** Keep microphone input running when it was started from the widget and the main window loses focus or is hidden (finding from the third Codex review of Milestone 2).
- **Files:** `src/voice/useSpeechInput.ts`, `src/voice/VoiceProvider.tsx`, `src/App.tsx`, `tests/client/speech-input.test.tsx`, `tests/client/voice-controls.test.tsx`, `tests/client/widget.test.tsx`
- **Definition of done:** a test reproduces the bug first: with the widget open, starting recognition from the widget Talk button and then blurring or hiding the main window stops recognition. After the fix, while the widget is open, a session started from a Talk button is not stopped by the blur or hidden-tab events of the main window; it still stops when Talk is pressed again, when recognition ends or fails, and when the widget closes. A session started by holding Space still stops on key release, blur, and hidden tab, and without the widget open the current stop behavior on blur and hidden tab is unchanged (the microphone is never left on in a hidden dashboard with no widget). The listeners are removed on unmount and nothing updates state after it.
- **Result:** done in 1 attempt. 811 tests pass, typecheck and build clean. Both reproducing tests failed before the fix. While the widget is open, a session started from a Talk button survives blur and hidden-tab events of the main window; Space sessions and the no-widget case keep stopping as before, and closing the widget stops recognition.

### voice-reply-on-navigation
- **Goal:** Speak the reply of a Hands-free chat request even when the user navigates away from Home before it arrives (finding from the third Codex review of Milestone 2).
- **Files:** `src/voice/VoiceProvider.tsx`, `src/components/ChatPanel.tsx`, `tests/client/voice-controls.test.tsx`, `tests/client/chat-panel.test.tsx`
- **Definition of done:** a test reproduces the bug first: with Hands-free and Reply with voice on, a transcript is submitted on Home through the chat panel, the user navigates to another view before the request resolves, and the reply is never spoken. After the fix the reply is spoken exactly once whether the chat panel is still mounted or not (no double playback when it is mounted), and it is still saved in the history as before. Playback is owned by the persistent provider or the pending request is handed over when the chat unmounts. A request abandoned on purpose with New chat is not spoken, Reply with voice off speaks nothing, and a failed request speaks nothing and shows its error as before.
- **Result:** done in 1 attempt. 817 tests pass, typecheck and build clean. The reproducing test failed before the fix (zero playback calls). The persistent voice provider now speaks the reply exactly once, whether or not the chat panel is still mounted; New chat, Reply with voice off, and failed requests speak nothing. Known limit: New chat in a freshly mounted panel does not cancel a request started by an earlier, unmounted panel.

### chat-isolation-check
- **Goal:** Verify on this machine what each CLI can reach with the exact chat flags, including how to launch each one without a shell on Windows. Performed by the orchestrator, not Codex.
- **Files:** `docs/chat-isolation.md`
- **Definition of done:** the document records the result of asking each CLI to read a canary file outside its working directory, write a file, and run a command. Claude Code must fail all three. If Codex can read the canary, Codex chat stays limited to local answers until the user decides.
- **Result:** done by the orchestrator. Claude Code failed all three requests (read the canary, write a file, run a command). Codex read the canary and ran a command; only its writes were blocked, so Codex chat stays limited to local answers until the user decides. The `claude` and `codex` npm shims cannot be started without a shell on Windows, so the runner must start the native executables. Details in `docs/chat-isolation.md`.

### chat-prompt
- **Goal:** Build the capped prompt from the repo snapshot and chat history.
- **Files:** `server/chat/prompt.ts`, `tests/server/chat-prompt.test.ts`
- **Definition of done:** `tests/server/chat-prompt.test.ts` passes: repo content sits inside a marked untrusted block; closing markers inside repo content are neutralized; size and history limits are enforced; the read-only instruction is present; the prompt tells the agent that it has no tools and must not try to use them or print tool-call markup.
- **Result:** done in 2 attempts. 831 tests pass, typecheck and build clean. Repo content and chat history are escaped inside a marked untrusted block; history is limited to 12 messages and 8000 characters, so the snapshot always keeps its share of the 24000-character budget.

### chat-runner
- **Goal:** Run Claude Code with the isolation rules in the security model and return a clean reply. The runner cannot start Codex.
- **Files:** `server/chat/runner.ts`, `server/chat/models.ts`, `server/chat/reply.ts`, `tests/server/chat-runner.test.ts`, `tests/server/chat-reply.test.ts`
- **Definition of done:** `tests/server/chat-runner.test.ts` passes with a mocked spawn: exact Claude Code arguments, including `--safe-mode` and `--no-session-persistence`; `shell` is never true; on Windows the native executable is resolved from the global npm package folder or an explicit server-side setting, and a `.cmd` file is never started; no code path starts Codex; the prompt is sent only through stdin; the working directory is empty and is removed afterwards; voice keys are absent from the child environment; a model outside the allowlist is rejected; timeout kills the process; output is capped; stderr is never part of the reply; a missing CLI returns a typed error. `tests/server/chat-reply.test.ts` passes: replies with no markup are unchanged; `invoke`, `parameter`, and `function_calls` blocks, including unclosed ones, are replaced by one short notice that tools are not available in this chat; surrounding text is kept; a reply that is only markup becomes only the notice.
- **Result:** done in 1 attempt. 879 tests pass with a mocked spawn, typecheck and build clean. Claude Code only, started natively with no shell and the exact isolation flags; tool-call markup in a reply is replaced by a short notice.

### chat-route
- **Goal:** Extend `POST /api/chat`: local answer first, then Claude Code with the saved model, which is added to the settings. With Codex as orchestrator the chat stays on local answers.
- **Files:** `server/routes/chat.ts`, `server/settings.ts`, `shared/api.ts`, `tests/server/chat-route.test.ts`, `tests/server/chat-local.test.ts`
- **Definition of done:** `tests/server/chat-route.test.ts` passes: a known question never spawns a CLI; a free-text question with Claude Code as orchestrator uses the saved model; with Codex as orchestrator no CLI is ever spawned, the reply is local, and the response carries a notice saying why; a concurrent run returns 429; a missing CLI returns a clear message and local answers keep working; invalid bodies return 400; a settings file saved before this task still loads; `GET /api/docs/chat-isolation` serves that one fixed document as plain text with `nosniff`. `tests/server/chat-local.test.ts` is updated so only the agent-free path is covered there.
- **Result:** done in 2 attempts. 905 tests pass, typecheck and build clean. Free text goes to Claude Code with the saved model; with Codex as orchestrator no CLI starts and the response carries the notice. Replies longer than the history limit are stored shortened and returned in full.

### chat-panel-orchestrator
- **Goal:** Add the Claude Code model selector, a running state, and the Codex notice to the chat.
- **Files:** `src/components/ChatPanel.tsx`, `src/components/ChatPanel.css`, `src/lib/api.ts`, `tests/client/chat-panel.test.tsx`
- **Definition of done:** `tests/client/chat-panel.test.tsx` passes: with Claude Code as orchestrator the selector lists only its allowlisted models and a change is saved; a running state is shown; a reply shows whether it was local or from the orchestrator; a missing CLI message is shown; with Codex as orchestrator there is no selector and a clear notice says the chat uses local answers because on Windows its sandbox does not stop it from reading files or running commands, with a link to the isolation document.
- **Result:** done in 1 attempt. 914 tests pass, typecheck and build clean. With Claude Code the chat has a model selector; with Codex it shows the notice and its link. Known limit: busy and timeout errors show generic text.

### docs-chat
- **Goal:** Document the orchestrator chat, its isolation, and its limits.
- **Files:** `README.md`, `../docs/architecture.md`, `../docs/setup.md`
- **Definition of done:** the documents match the implemented behavior and link to `docs/chat-isolation.md`; a search of the changed files finds no personal data or local paths.
- **Result:** done in 1 attempt. Docs checked against the code by Codex and reviewed by the orchestrator; 914 tests pass, typecheck and build clean.

### chat-error-messages
- **Goal:** Show the server's clear message in the chat for a busy chat (429) and a timeout (504).
- **Files:** `src/lib/api.ts`, `tests/client/api.test.ts`, `tests/client/chat-panel.test.tsx`
- **Definition of done:** a test reproduces the bug first: a 429 `CHAT_BUSY` or 504 `TIMEOUT` response produces the generic message. After the fix the chat shows the server message for those two and for 503 `CLI_NOT_FOUND`; every other error keeps the generic message.
- **Result:** done in 1 attempt. 927 tests pass, typecheck and build clean. The reproducing tests failed before the fix. The chat shows the server message for busy, timeout, and missing CLI; other errors stay generic.

### plan-test-real-state
- **Goal:** Make the test on the real plan independent of how far the project has advanced (found by the clean `npm ci` run of `m3-acceptance`).
- **Files:** `tests/server/plan.test.ts`
- **Definition of done:** the test on the real `PLAN.md` passes with or without pending tasks, and grouping of pending tasks stays covered by a fixture.
- **Result:** done in 1 attempt. 927 tests pass, typecheck and build clean. The test on the real plan no longer depends on how far the project has advanced.

### chat-orchestrator-plain-text
- **Goal:** Pass orchestrator replies through the same markdown cleaner as local replies (found in `m3-acceptance`).
- **Files:** `server/routes/chat.ts`, `tests/server/chat-route.test.ts`
- **Definition of done:** a test reproduces the bug first: an orchestrator reply keeps its markdown characters. After the fix the reply and the saved history are clean, and the tools notice survives.
- **Result:** done in 1 attempt. 930 tests pass, typecheck and build clean. The reproducing test failed before the fix. Orchestrator replies and their saved history are clean of markdown; the tools notice survives.

### chat-local-intent
- **Goal:** Stop treating `to do` inside phrases such as `how to do it` as a question about pending tasks, and make the local help reply say that free-text questions go to the orchestrator (found in `m3-acceptance`).
- **Files:** `server/chat/local.ts`, `tests/server/chat-local.test.ts`, `tests/server/chat-route.test.ts`
- **Definition of done:** a test reproduces the bug first: `how to do it` gets the pending tasks. After the fix such phrases are not recognized, real `to do` questions still are, and the help reply mentions the orchestrator.
- **Result:** done in 1 attempt. 954 tests pass, typecheck and build clean. The reproducing tests failed before the fix. Phrases such as how to do it are no longer pending-tasks questions, and the help reply mentions the orchestrator.

### m3-acceptance
- **Goal:** Check the orchestrator chat in a real browser. Performed by the orchestrator.
- **Files:** none
- **Definition of done:** from a clean `npm ci`, all checks pass; with Claude Code a free-text question is answered with repo data; no file changes in the repo after a chat; a prompt asking the agent to write a file does not change anything and shows no tool-call markup; with Codex selected no CLI starts, the answer is local, and the notice and its link work. Then follow "Closing a milestone".
- **Result:** done. Clean `npm ci` with all checks passing; real Claude Code answered with repo data and could not write files or run commands; Codex mode stayed local with its notice. The user confirmed the seven browser steps. Next: `/codex:review` and the push confirmation.

### chat-codex-reply
- **Goal:** Make the reply to a free-text question in Codex mode say that it was not sent to a model, instead of "I didn't understand that" (requested after `m3-acceptance`).
- **Files:** `server/chat/local.ts`, `server/routes/chat.ts`, `tests/server/chat-local.test.ts`, `tests/server/chat-route.test.ts`
- **Definition of done:** a test reproduces the bug first: with Codex as orchestrator a free-text question gets "I didn't understand that". After the fix the reply says free-text questions are not sent to a model, points to Why?, and lists what the chat can answer; known questions and Claude Code mode do not change.
- **Result:** done in 1 attempt. 958 tests pass, typecheck and build clean from a clean `npm ci`. The reproducing test failed before the fix. In Codex mode a free-text question now gets a reply saying it was not sent to a model, with what the chat can answer.

### chat-conversation-generation
- **Goal:** Move the conversation generation to the persistent voice provider, so New chat also cancels pending replies from earlier chat panel instances (finding from the Codex review of Milestone 3).
- **Files:** `src/voice/VoiceProvider.tsx`, `src/components/ChatPanel.tsx`, `tests/client/voice-controls.test.tsx`, `tests/client/chat-panel.test.tsx`
- **Definition of done:** a test reproduces the bug first: a question is sent, the panel remounts, New chat is pressed, and the old reply is still spoken. After the fix it is not spoken; replies not abandoned are spoken exactly once, and a request after New chat is spoken normally.
- **Result:** done in 1 attempt. 960 tests pass, typecheck and build clean from a clean `npm ci`. The reproducing test failed before the fix. New chat in any panel now cancels pending replies from earlier panels.

## Phase 2: real agent execution

Not started. Requires explicit user approval and a new security review. The plan parser excludes this section from the board.

### codex-chat-sandbox
- **Goal:** Enable Codex for the orchestrator chat, only if its reading can be limited to an empty folder.
- **Files:** `server/chat/runner.ts`, `../docs/chat-isolation.md`, `tests/server/chat-runner.test.ts`
- **Definition of done:** `docs/chat-isolation.md` records a repeated check in which Codex cannot read a canary file outside an empty folder and cannot run a command. Without that result Codex stays on local answers.

### run-audit-log
- **Goal:** Record every launched run in an append-only ignored log.
- **Files:** `server/runs/audit.ts`, `tests/server/run-audit.test.ts`
- **Definition of done:** the test passes: start, end, task, agent, and exit code are recorded; secrets are redacted.

### run-session-token
- **Goal:** Require a per-launch session token on every execution endpoint.
- **Files:** `server/security.ts`, `tests/server/session-token.test.ts`
- **Definition of done:** the test passes: a missing or wrong token returns 401, even from an allowed origin.

### run-worktree
- **Goal:** Give each run an isolated git worktree on its own `task/<short-name>` branch.
- **Files:** `server/runs/worktree.ts`, `tests/server/run-worktree.test.ts`
- **Definition of done:** the test passes on a temporary repository: the main checkout is untouched; invalid branch names are rejected; cleanup keeps unmerged work.

### run-launcher
- **Goal:** Launch the worker with write access limited to its worktree.
- **Files:** `server/runs/launcher.ts`, `tests/server/run-launcher.test.ts`
- **Definition of done:** the test passes with a mocked spawn: fixed arguments, no shell, write access limited to the worktree, no permission-bypass flag, concurrency limit, and cancellation.

### run-approval
- **Goal:** Require an explicit approval in the UI before any run starts, after showing the task, agent, and branch.
- **Files:** `server/routes/runs.ts`, `src/components/RunApproval.tsx`, `tests/server/run-approval.test.ts`, `tests/client/run-approval.test.tsx`
- **Definition of done:** the tests pass: no run starts without an approval bound to that exact request; an approval cannot be reused; voice input alone can never approve.

### run-stream
- **Goal:** Stream real run output to the Agents view, including model and elapsed time.
- **Files:** `server/routes/runs.ts`, `src/views/AgentsView.tsx`, `tests/server/run-stream.test.ts`, `tests/client/agents-live.test.tsx`
- **Definition of done:** the tests pass: output arrives in order; reconnecting resumes; the card status follows the process state.

### run-test-gate
- **Goal:** Run the task tests after a run and allow a merge only when they pass.
- **Files:** `server/runs/gate.ts`, `tests/server/run-gate.test.ts`
- **Definition of done:** the test passes: a failure blocks the merge and returns the error for the next attempt; pushing is never available from the dashboard.

### orchestrator-switch
- **Goal:** Make the orchestrator setting drive real delegation in either direction.
- **Files:** `server/runs/roles.ts`, `tests/server/run-roles.test.ts`
- **Definition of done:** the test passes: the selected orchestrator delegates and the other agent is launched as worker, under the same sandbox, approval, and test gate.
