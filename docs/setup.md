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

## Orchestrator chat setup and limits

Known repo questions and action requests are answered locally, with no agent and no tokens; action requests are declined. Other questions go to Claude Code when it is the selected orchestrator. Claude Code is the only CLI the chat starts, using the model chosen in chat: `sonnet`, `opus`, or `haiku`.

For free-text answers, install Claude Code as shown above and start `claude` to log in with your own account. On Windows, the runner uses the native `claude.exe` inside the global npm package, without a shell. The server environment variable `HARNESS_CLAUDE_BIN` can point to another location of the Claude executable. If the CLI cannot be found, local answers keep working and chat shows "Claude Code CLI was not found. Local questions still work."

A free-text question sent to Claude Code sends the repo snapshot (pending and in-progress tasks, recent run-log notes, commits, and tracked test file names) and recent chat history to the selected model through your own Claude Code login. This uses that account's usage allowance or billing.

With Codex selected as orchestrator, chat gives local answers only and shows a notice explaining why, with a **Why?** link to the isolation document. The check found that its Windows sandbox allowed file reads outside the working directory and command execution. Codex could be enabled only in a future phase, if its reading can be limited to an empty folder.

Claude Code runs with no tools (`--tools ""`), `--strict-mcp-config`, `--safe-mode`, and `--no-session-persistence`. The prompt goes through stdin, no shell is used, and each run gets an empty temporary working directory that is removed afterward. Voice keys and voice configuration variables are removed from the child environment. The server allows only `sonnet`, `opus`, and `haiku`, imposes a 60-second timeout and a 256,000-byte combined stdout/stderr cap, and allows one model run at a time. Stderr is not included in replies. Repo data and history are escaped in a marked `<untrusted_context>` block, and tool-call markup in replies is replaced by "Tools are not available in this chat."

[The chat isolation report](chat-isolation.md) records one non-adversarial check on one Windows machine with specific CLI versions. It does not establish a general isolation guarantee; recheck when CLI versions change.

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
