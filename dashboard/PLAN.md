# PLAN

A local web dashboard for Harness. React, TypeScript, and Vite on the front end; a small Node and Express backend that serves everything on `127.0.0.1`. Built with the loop in `CLAUDE.md`: the orchestrator delegates, Codex implements, tests decide.

**Every definition of done also requires:** `npm test`, `npm run typecheck`, and `npm run build` pass, run by the orchestrator from `dashboard/`.

**Dependencies:** the Codex sandbox has no network, so the orchestrator installs every dependency during `scaffold`.

**Product rules:** the product is called Harness. Claude Code and Codex are the only agents. The interface is in English. No photos, avatars, emails, local paths, or keys anywhere. Bundled fonts and inline SVG icons only: no CDN requests.

**UI rule:** a control appears only in the milestone that makes it work. No disabled placeholders.

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
- Free text goes to the selected CLI with a repo snapshot built by the backend, so the agent has nothing to fetch:
  - Claude Code: `claude -p --tools "" --strict-mcp-config`.
  - Codex: `codex exec --sandbox read-only --ephemeral --skip-git-repo-check`.
  - The working directory is an empty temporary folder.
  - The prompt goes through stdin. It is never an argument.
  - Arguments are fixed, there is no shell, and the model comes from a server-side allowlist.
  - Voice keys are removed from the child environment.
  - Each run has a timeout and an output cap, and only one can run at a time.
- Repo content in the snapshot is marked as untrusted data. Replies render as plain text, never as HTML.
- The Codex read-only sandbox still allows reading files and running commands, so `chat-isolation-check` must prove what it can reach before that path ships.

## Pending

### Milestone 1: dashboard visible

### api-client
- **Goal:** Add a typed front-end client that validates responses against `shared/api.ts`.
- **Files:** `src/lib/api.ts`, `tests/client/api.test.ts`
- **Definition of done:** `tests/client/api.test.ts` passes: valid responses are parsed; HTTP errors and invalid shapes produce typed errors.

### theme-tokens
- **Goal:** Add the dark theme: near-black textured background, teal `#2dd4bf`, amber for active states, bundled modern sans font, and large section titles.
- **Files:** `src/styles/tokens.css`, `src/styles/global.css`, `src/main.tsx`, `tests/client/theme.test.ts`
- **Definition of done:** `tests/client/theme.test.ts` passes: the required tokens exist and no stylesheet loads a remote URL.

### app-shell
- **Goal:** Add the collapsible sidebar with navigation for Harness, Agents, Galaxy, and Plan, a status dot, and Full screen.
- **Files:** `src/components/Sidebar.tsx`, `src/App.tsx`, `tests/client/sidebar.test.tsx`
- **Definition of done:** `tests/client/sidebar.test.tsx` passes: the four views are listed and switch on click; Close menu hides the labels and keeps accessible names; the status dot reflects `GET /api/health`; Full screen calls the browser API.

### orb
- **Goal:** Add the animated orb with concentric teal rings and idle, listening, and speaking states, using SVG and CSS only.
- **Files:** `src/components/Orb.tsx`, `src/components/Orb.css`, `tests/client/orb.test.tsx`
- **Definition of done:** `tests/client/orb.test.tsx` passes: each state renders; rings are present; no `img` element exists; animation is disabled under `prefers-reduced-motion`.

### chat-panel
- **Goal:** Add the chat with local answers only: New chat, suggestions, text field, and Send.
- **Files:** `src/components/ChatPanel.tsx`, `tests/client/chat-panel.test.tsx`
- **Definition of done:** `tests/client/chat-panel.test.tsx` passes: sending calls the API and shows the reply; suggestions send their text; New chat clears history; HTML in a reply renders as literal text; errors are shown; Send is disabled while waiting.

### home-view
- **Goal:** Compose the orb, spaced "H A R N E S S" title, subtitle, and chat.
- **Files:** `src/views/HomeView.tsx`, `tests/client/home-view.test.tsx`
- **Definition of done:** `tests/client/home-view.test.tsx` passes: orb, title, subtitle, and chat render.

### agents-view
- **Goal:** Add the historical agent card grid with a 1, 2x2, and 3x3 selector.
- **Files:** `src/views/AgentsView.tsx`, `tests/client/agents-view.test.tsx`
- **Definition of done:** `tests/client/agents-view.test.tsx` passes: task, agent, model, status, time, and monospaced output render; the selector changes the layout; a `null` value shows "—"; the empty state renders.

### galaxy-camera
- **Goal:** Add pure functions for orbit positions, wheel zoom, drag pan, and hit testing.
- **Files:** `src/galaxy/camera.ts`, `tests/client/galaxy-camera.test.ts`
- **Definition of done:** `tests/client/galaxy-camera.test.ts` passes: zoom keeps the point under the cursor fixed and respects limits; pan moves by the screen delta at any zoom; hit testing finds a planet and returns `null` in empty space.

### galaxy-view
- **Goal:** Render the animated galaxy on a 2D canvas with a detail panel.
- **Files:** `src/views/GalaxyView.tsx`, `src/galaxy/draw.ts`, `tests/client/galaxy-view.test.tsx`
- **Definition of done:** `tests/client/galaxy-view.test.tsx` passes with a mocked canvas: it renders from API data; clicking a planet opens its detail; the animation frame is cancelled on unmount; the systems are also listed for screen readers.

### plan-view
- **Goal:** Add the Pending, In progress, and Done board with the run log and a source selector.
- **Files:** `src/views/PlanView.tsx`, `tests/client/plan-view.test.tsx`
- **Definition of done:** `tests/client/plan-view.test.tsx` passes: tasks appear in the right column under their milestone; the source selector reloads data; the run log renders; empty and error states render.

### serve-build
- **Goal:** Serve the built front end from Express with a strict content security policy.
- **Files:** `server/app.ts`, `server/index.ts`, `package.json`, `tests/server/static.test.ts`
- **Definition of done:** `tests/server/static.test.ts` passes: the index is served with the CSP header; API routes are not shadowed; the CSP blocks remote scripts, styles, fonts, and connections.

### public-safety-test
- **Goal:** Fail the test suite when public-repo rules are broken in `dashboard/`.
- **Files:** `tests/public-safety.test.ts`
- **Definition of done:** `tests/public-safety.test.ts` passes on the repo and fails on fixtures containing an email address, an absolute local path, a filled-in key, a person image, or a remote font.

### ci-dashboard
- **Goal:** Add a `dashboard` job to the CI workflow.
- **Files:** `../.github/workflows/ci.yml`
- **Definition of done:** the YAML parses; the new job runs `npm ci`, `npm test`, `npm run typecheck`, and `npm run build` in `dashboard/`, uses the same pinned actions, and keeps read-only permissions; the `example-app` job is unchanged.

### docs-dashboard
- **Goal:** Document setup, the four views, the Milestone 1 security model, and what is not built yet.
- **Files:** `README.md`, `../README.md`, `../docs/architecture.md`, `../docs/setup.md`, `../docs/run-log.md`
- **Definition of done:** the documents match the implemented behavior; the run-log header describes both entry types; a search of the changed files finds no personal data or local paths.

### m1-acceptance
- **Goal:** Run the built dashboard and check it in a real browser. Performed by the orchestrator.
- **Files:** none
- **Definition of done:** from a clean `npm ci`, all checks pass; the server answers only on `127.0.0.1`; the four views work with real repo data; suggestions return local answers; findings are fixed or listed for the user. Then follow "Closing a milestone".

### Milestone 2: voice and widget

### tts-config
- **Goal:** Load voice settings from the root `.env` and expose only provider availability.
- **Files:** `server/voice/config.ts`, `shared/api.ts`, `../.env.example`, `tests/server/tts-config.test.ts`
- **Definition of done:** `tests/server/tts-config.test.ts` passes: a provider is available only with both key and voice ID; the public view contains no key or voice ID. `.env.example` no longer says it is intentionally empty, and has empty, commented `FISH_AUDIO_API_KEY`, `FISH_AUDIO_VOICE_ID`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `OPENAI_TTS_API_KEY`, and `OPENAI_TTS_VOICE`.

### tts-fish-audio
- **Goal:** Add the Fish Audio adapter.
- **Files:** `server/voice/fish-audio.ts`, `tests/server/tts-fish-audio.test.ts`
- **Definition of done:** `tests/server/tts-fish-audio.test.ts` passes with a mocked `fetch`: URL, headers, and body are correct; audio bytes are returned; provider errors become a typed error that contains no key.

### tts-elevenlabs
- **Goal:** Add the ElevenLabs adapter.
- **Files:** `server/voice/elevenlabs.ts`, `tests/server/tts-elevenlabs.test.ts`
- **Definition of done:** `tests/server/tts-elevenlabs.test.ts` passes with a mocked `fetch`: URL, headers, and body are correct; audio bytes are returned; provider errors become a typed error that contains no key.

### tts-openai
- **Goal:** Add the OpenAI TTS adapter.
- **Files:** `server/voice/openai-tts.ts`, `tests/server/tts-openai.test.ts`
- **Definition of done:** `tests/server/tts-openai.test.ts` passes with a mocked `fetch`: URL, headers, and body are correct; audio bytes are returned; provider errors become a typed error that contains no key.

### tts-route
- **Goal:** Add `GET /api/voice/providers` and `POST /api/tts`, which dispatches to the selected adapter.
- **Files:** `server/routes/tts.ts`, `server/app.ts`, `shared/api.ts`, `tests/server/tts-route.test.ts`
- **Definition of done:** `tests/server/tts-route.test.ts` passes: providers returns availability only; audio is returned with the right content type; an unconfigured provider returns 409; over-limit text returns 400; a provider failure returns 502 with no secret in the body.

### settings-store
- **Goal:** Persist the orchestrator and voice settings in the ignored `.data/settings.json`, expose them over the API, and use the saved roles in the galaxy.
- **Files:** `server/settings.ts`, `server/routes/settings.ts`, `server/routes/data.ts`, `server/app.ts`, `shared/api.ts`, `tests/server/settings.test.ts`
- **Definition of done:** `tests/server/settings.test.ts` passes: defaults apply when the file is missing or corrupt; a save survives a reload; invalid values return 400; choosing one orchestrator makes the other agent the worker; the galaxy route reflects the saved roles; historical agent cards do not change.

### settings-view
- **Goal:** Add the Settings view with orchestrator and voice choices.
- **Files:** `src/views/SettingsView.tsx`, `src/components/Sidebar.tsx`, `src/App.tsx`, `tests/client/settings-view.test.tsx`
- **Definition of done:** `tests/client/settings-view.test.tsx` passes: Settings appears in the sidebar; choosing an orchestrator saves it and shows the other as worker; unconfigured voice providers are disabled; no key field exists.

### speech-input
- **Goal:** Add Web Speech API input with hold Space to talk.
- **Files:** `src/voice/useSpeechInput.ts`, `tests/client/speech-input.test.tsx`
- **Definition of done:** `tests/client/speech-input.test.tsx` passes with a mocked API: holding Space starts once and release stops; Space is ignored inside inputs; the transcript is delivered; an unsupported browser reports it without throwing; the UI discloses that the browser may process audio through its vendor's service.

### speech-output
- **Goal:** Speak replies with the browser voice by default, or through `/api/tts`.
- **Files:** `src/voice/speak.ts`, `server/app.ts`, `tests/client/speech-output.test.ts`, `tests/server/static.test.ts`
- **Definition of done:** `tests/client/speech-output.test.ts` passes with mocks: the browser provider never calls the backend; other providers do; a new reply cancels the previous one; Mute stops playback; a backend failure falls back to the browser voice. `tests/server/static.test.ts` passes: the CSP allows generated audio and still blocks remote sources.

### voice-controls
- **Goal:** Add Talk, Mute, and voice selector to the sidebar, plus Reply with voice, Hands-free, and microphone to the chat, and connect voice to the orb.
- **Files:** `src/components/VoiceControls.tsx`, `src/components/Sidebar.tsx`, `src/components/ChatPanel.tsx`, `src/views/HomeView.tsx`, `tests/client/voice-controls.test.tsx`
- **Definition of done:** `tests/client/voice-controls.test.tsx` passes: Talk and Mute call the voice modules; the selector lists available voices; orb state follows voice state; Reply with voice speaks replies only when on; Hands-free sends the final transcript.

### widget-mode
- **Goal:** Add Widget mode to the sidebar: a compact window with only the orb, status, and Talk button, using Document Picture-in-Picture with a popup fallback.
- **Files:** `src/widget/openWidget.ts`, `src/widget/WidgetView.tsx`, `src/components/Sidebar.tsx`, `tests/client/widget.test.tsx`
- **Definition of done:** `tests/client/widget.test.tsx` passes with mocks: Picture-in-Picture is used when available; the popup is used otherwise; a blocked popup shows a message; the widget renders only its three elements; closing it cleans up.

### docs-voice
- **Goal:** Document voice providers, `.env` setup, Settings, widget mode, and the browser speech disclosure.
- **Files:** `README.md`, `../docs/architecture.md`, `../docs/setup.md`
- **Definition of done:** the documents match the implemented behavior; a search of the changed files finds no personal data, keys, or local paths.

### m2-acceptance
- **Goal:** Check voice and widget in a real browser. Performed by the orchestrator, with the user for microphone steps.
- **Files:** none
- **Definition of done:** from a clean `npm ci`, all checks pass; hold Space to talk and browser voice output work; Settings persists after a restart; widget mode opens; no key or voice ID appears in browser responses; providers without keys are verified only through their mocked tests, and this is reported. Then follow "Closing a milestone".

### Milestone 3: chat with the orchestrator

### chat-isolation-check
- **Goal:** Verify on this machine what each CLI can reach with the exact chat flags, including how to launch each one without a shell on Windows. Performed by the orchestrator, not Codex.
- **Files:** `docs/chat-isolation.md`
- **Definition of done:** the document records the result of asking each CLI to read a canary file outside its working directory, write a file, and run a command. Claude Code must fail all three. If Codex can read the canary, Codex chat stays limited to local answers until the user decides.

### chat-prompt
- **Goal:** Build the capped prompt from the repo snapshot and chat history.
- **Files:** `server/chat/prompt.ts`, `tests/server/chat-prompt.test.ts`
- **Definition of done:** `tests/server/chat-prompt.test.ts` passes: repo content sits inside a marked untrusted block; closing markers inside repo content are neutralized; size and history limits are enforced; the read-only instruction is present.

### chat-runner
- **Goal:** Run the selected CLI with the isolation rules in the security model.
- **Files:** `server/chat/runner.ts`, `server/chat/models.ts`, `tests/server/chat-runner.test.ts`
- **Definition of done:** `tests/server/chat-runner.test.ts` passes with a mocked spawn: exact arguments for each CLI; `shell` is never true; the prompt is sent only through stdin; the working directory is empty and is removed afterwards; voice keys are absent from the child environment; a model outside the allowlist is rejected; timeout kills the process; output is capped; a missing CLI returns a typed error.

### chat-route
- **Goal:** Extend `POST /api/chat`: local answer first, then the saved orchestrator and model, which are added to the settings.
- **Files:** `server/routes/chat.ts`, `server/settings.ts`, `shared/api.ts`, `tests/server/chat-route.test.ts`, `tests/server/chat-local.test.ts`
- **Definition of done:** `tests/server/chat-route.test.ts` passes: a known question never spawns a CLI; a free-text question uses the saved orchestrator and model; a concurrent run returns 429; a missing CLI returns a clear message and local answers keep working; invalid bodies return 400. `tests/server/chat-local.test.ts` is updated so only the agent-free path is covered there.

### chat-panel-orchestrator
- **Goal:** Add the orchestrator model selector and a running state to the chat.
- **Files:** `src/components/ChatPanel.tsx`, `tests/client/chat-panel.test.tsx`
- **Definition of done:** `tests/client/chat-panel.test.tsx` passes: the selector lists only the models for the current orchestrator; a change is saved; a reply shows whether it was local or from the orchestrator; a missing CLI message is shown.

### docs-chat
- **Goal:** Document the orchestrator chat, its isolation, and its limits.
- **Files:** `README.md`, `../docs/architecture.md`, `../docs/setup.md`
- **Definition of done:** the documents match the implemented behavior and link to `docs/chat-isolation.md`; a search of the changed files finds no personal data or local paths.

### m3-acceptance
- **Goal:** Check the orchestrator chat in a real browser with each CLI. Performed by the orchestrator.
- **Files:** none
- **Definition of done:** from a clean `npm ci`, all checks pass; a free-text question is answered with repo data; no file changes in the repo after a chat; a prompt asking the agent to write a file does not change anything. Then follow "Closing a milestone".

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

## Phase 2: real agent execution

Not started. Requires explicit user approval and a new security review. The plan parser excludes this section from the board.

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
