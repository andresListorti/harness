# Harness dashboard

A local web dashboard for Harness, with a React, TypeScript, and Vite front end and a small Node and Express backend. Everything is served on `127.0.0.1`; chat answers come from local repo data.

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

- **Harness:** an orb and chat with suggestions and local answers about pending tasks, work in progress, recent commits, the latest recorded run, and tests. Asking chat to launch agents, run commands, or change anything gets a clear reply that this
  version cannot do it and lists what it can answer. Unknown questions get the same limit and
  suggestions.
- **Agents:** historical cards derived from the plans and run log, showing source, task, status,
  and agent (an em dash when unknown). The Model and Time rows appear only when a value is
  recorded in the run-log rows `Codex model` and `Duration` and are hidden otherwise.
  Output is wrapped plain text limited to four lines
  (the full text is in the tooltip). Choose 1, 2x2, or 3x3 layouts with pagination.
- **Galaxy:** an animated canvas with the Harness core, Claude Code, Codex, Tasks, Commits, and Tests. Details use recorded tasks and attempts, recent commits, tracked test files, and recorded test results. Wheel to zoom, drag to pan, or click a planet; the button legend also opens details from the keyboard. Settings controls the orchestrator and worker roles; the defaults are Claude Code as orchestrator and Codex as worker.
- **Plan:** a Pending, In progress, and Done board with task details and the run log. The source selector switches between the dashboard and example-app plans. Future milestone tasks can appear as pending; Phase 2 is excluded from the board.

- **Settings:** choose the orchestrator and voice. The other agent becomes the worker. This changes Galaxy roles; Agents cards still describe recorded plans and runs. Unconfigured voice providers are disabled, and there is no key field. Settings are saved atomically in the ignored `dashboard/.data/settings.json`. A missing or corrupt file restores the default orchestrator and browser voice.

After a successful initial load, Agents and Plan refresh every 5 seconds. Refresh pauses while the tab is hidden and resumes when visible. Failed refreshes keep the last data.

### Voice controls and widget

The sidebar has Talk, Mute, and a voice selector. Talk toggles listening; hold Space to talk when focus is outside inputs, editable fields, buttons, and links. Chat also has a microphone button, **Reply with voice**, and **Hands-free**. Both switches start off and stay in memory only. Reply with voice speaks new replies; Hands-free sends a final transcript automatically. The orb follows listening and speaking.

Speech input uses the browser Web Speech API. Browser support varies. The UI shows this notice: "Your browser may send microphone audio to its vendor's speech service for transcription."

Widget mode opens a compact window containing only the orb, status, and Talk button, sharing the main window's voice state. It uses Document Picture-in-Picture when available, otherwise a popup. If opening fails or the popup is blocked, the UI shows: "The widget window was blocked. Allow pop-ups for this page and try again."

Chat history is restored on reload from the ignored `dashboard/.data/chat-history.json`. Saved history keeps at most 200 messages and 100,000 text characters, dropping the oldest messages first; each message is limited to 10,000 characters. **New chat** deletes saved history and clears the conversation after deletion succeeds. Missing or corrupt history loads as empty, and a history save failure never blocks an answer. Replies still come only from local answers.

## Voice setup

Browser voice is the default and needs no setup. Fish Audio, ElevenLabs, and OpenAI text-to-speech are optional. Copy the root `.env.example` to root `.env`, then uncomment and fill in both values for each provider you want:

- Fish Audio: `FISH_AUDIO_API_KEY` and `FISH_AUDIO_VOICE_ID`.
- ElevenLabs: `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`.
- OpenAI: `OPENAI_TTS_API_KEY` and `OPENAI_TTS_VOICE`.

Keep credentials in root `.env`, never in the browser or committed files. Process environment variables override file values. Both values must be non-empty for a provider to be available. The backend reads `.env` on each provider availability or synthesis request, so edits need no restart; reload the view to refresh its availability choices.

Only provider IDs and availability reach the browser, never keys or voice IDs. Provider failures return the generic message "Voice synthesis failed." without secrets. Failed provider requests or audio playback fall back to browser voice, where supported. Provider speech uses the first 1,000 characters of the trimmed reply. Provider adapters are covered by mocked tests; live services have not been verified by those tests.

## Data sources

The backend reads a fixed list of repo files: `dashboard/PLAN.md`, `example-app/PLAN.md`, and `docs/run-log.md`. It also reads `git log` and tracked test file names. In the run log, entries headed `## N. name` belong to example-app and `## DN. name` belong to the dashboard, where N is a number. The `Codex model` and `Duration` rows, present from D29 on, supply agent models and times. Test information is recorded history and file inventory; opening the dashboard does not run tests.

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

The new routes return these status codes after the shared guards pass:

| Route | Response and status |
|---|---|
| `GET /api/voice/providers` | 200: provider IDs and availability only. |
| `POST /api/tts` | Accepts only `provider` (`fish-audio`, `elevenlabs`, or `openai`) and trimmed `text` of 1-1000 characters. 200: MP3 audio; 400: invalid request; 409: provider not configured; 502: provider failure. |
| `GET /api/settings` | 200: `orchestrator`, `voice`, and derived `worker`, using defaults if storage cannot be read or validated. |
| `PUT /api/settings` | Accepts only `orchestrator` (`claude-code` or `codex`) and `voice` (`browser` or a provider ID). 200: saved settings and worker; 400: invalid request; 500: save failed. |
| `GET /api/chat/history` | 200: `messages`, empty if storage cannot be read or validated. |
| `DELETE /api/chat/history` | 200: empty `messages`; 500: deletion failed. |

Shared guards can return 403 for a forbidden Host or Origin, 415 for a non-JSON body on a state-changing request, 400 for malformed JSON, and 413 for an oversized JSON body. Unexpected server errors return a generic 500.

## Security

- The backend binds only to `127.0.0.1`. A Host allowlist for loopback names and configured ports guards against DNS rebinding.
- State-changing requests require an allowlisted Origin; bodies on those requests must use a JSON content type. These guards also cover voice, Settings, and history routes. JSON bodies have a 16 kb limit, and chat input is validated with a strict Zod schema.
- Repo data uses a fixed file allowlist, with no file path taken from requests. Git runs through `execFile` without a shell, using fixed argument structures and a bounded commit limit; author names and emails are never requested.
- The backend sends a strict Content Security Policy allowing resources and connections only from the same origin, with `media-src 'self' blob:` for generated audio. Remote sources remain blocked; objects and framing are blocked. It also sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `X-Frame-Options: DENY`.
- Voice keys stay on the server and are never sent to the browser. Optional synthesis sends reply text from the server to the selected provider. The browser speech disclosure above also applies to microphone input.
- Chat builds answers locally from repo data and launches no agent process. Its shared data reader can invoke the fixed read-only git commands above. Replies render as plain text, so reply content cannot become HTML.

## Project layout

```text
server/  Express app, security, static serving, routes, data readers, local answers
server/voice/  Provider configuration, adapters, and sanitized errors
shared/  Zod API schemas and TypeScript types
src/     React views, components, API client, styles, galaxy canvas
src/voice/  Shared voice state, browser speech input, and speech output with fallback
src/widget/  Compact widget view and window opening
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

Chat with the orchestrator agent remains planned for milestone 3. Real agent execution, including launching agents from the dashboard, remains planned for Phase 2. See the [roadmap](PLAN.md).
