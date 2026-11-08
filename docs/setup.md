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

Choose **Sign in with ChatGPT**. Never use an OpenAI API key with this project: the harness runs on the fixed-price plan.

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

## Run the example app

```sh
cd example-app
npm ci
npm test
npm run typecheck
npm run dev
```

The API listens on port 3000 by default. Set `PORT` to change it.
