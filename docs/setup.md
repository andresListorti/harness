# Setup

## Requirements

- Node.js 22 or later (the example app is tested on Node.js 24)
- Git
- A Claude plan for Claude Code
- A ChatGPT plan for Codex

## 1. Install Claude Code and the Codex CLI

```sh
npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex
codex --version
```

## 2. Log in to Codex with ChatGPT

```sh
codex login
```

Choose **Sign in with ChatGPT**. Use the fixed-price plan for agent login. Optional dashboard speech providers are configured separately below.

## 3. Install the plugin

Inside Claude Code, run these commands one at a time:

```text
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

`/codex:setup` should report that Codex is ready and that the ChatGPT login is active.

## 4. Allow Codex to write

Codex needs write access to the workspace. Add this to the user-level Codex config, `~/.codex/config.toml`:

```toml
sandbox_mode = "workspace-write"
```

## Windows

Without the elevated sandbox, Codex can stay read-only and its commands fail with `blocked by policy`.

1. Open a terminal as administrator and run:

   ```sh
   codex sandbox setup --elevated --current-user
   ```

2. Make sure `%USERPROFILE%\.codex\config.toml` contains the following. Top-level keys must come before the `[windows]` table:

   ```toml
   sandbox_mode = "workspace-write"

   [windows]
   sandbox = "elevated"
   ```

3. Confirm that it works by asking Codex to create a file in a scratch folder:

   ```sh
   codex exec --skip-git-repo-check "Create a file named hello.txt containing the word hi"
   ```

## Run the dashboard

Use Node 24 (the version used by dashboard CI) and npm. From the repo root:

```sh
cd dashboard
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:3001`. Set `PORT` to change the backend port. No API key is needed for local chat or the default browser voice.

See [the dashboard guide](../dashboard/README.md) for development mode, views, security, and what is not built yet.

## Voice (optional)

Browser voice needs no setup. To enable an optional provider:

1. Copy `.env.example` to `.env` at the repo root. Keep `.env` private and ignored by git; leave `.env.example` empty.
2. Uncomment and fill in both variables for the chosen provider: `FISH_AUDIO_API_KEY` and `FISH_AUDIO_VOICE_ID` for Fish Audio; `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` for ElevenLabs; or `OPENAI_TTS_API_KEY` and `OPENAI_TTS_VOICE` for OpenAI text-to-speech.
3. Open Settings and choose an available voice. There is no key field; unconfigured providers are disabled. Enable Reply with voice in chat to hear new replies.

Both provider values must be set. Process environment variables override `.env`. The backend reads the file on each availability or synthesis request, so edits need no restart; reload the view to update its choices. Provider failures fall back to browser voice. See [the dashboard guide](../dashboard/README.md) for controls, the browser speech privacy notice, and widget behavior.

## Run the example app

```sh
cd example-app
npm ci
npm test
npm run typecheck
npm run dev
```

The API listens on port 3000 by default. Set `PORT` to change it.
