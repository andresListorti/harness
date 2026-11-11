# AGENTS.md

Instructions for Codex (or any coding agent) working in this repository. Read this file fully before touching anything, then read `dashboard/PLAN.md` and the end of `docs/run-log.md`.

## Where the project stands

- Harness is a public demo of a plan-delegate-verify loop between two coding agents. It has two parts: `example-app/` (the original Express demo) and `dashboard/` (a local web dashboard: React, TypeScript, Vite front end; Node and Express backend bound to `127.0.0.1`).
- Dashboard Milestones 1 (dashboard visible), 2 (voice and widget), and 3 (chat with the orchestrator) are done, merged to `main`, pushed, and CI is green. About 960 tests pass.
- `dashboard/PLAN.md` has no pending or in-progress tasks. The only remaining section is **Phase 2: real agent execution** (`codex-chat-sandbox`, `run-audit-log`, `run-session-token`, `run-worktree`, `run-launcher`, and more). **Do not start Phase 2 without explicit approval from the user in the current conversation**, and it needs a new security review first.
- Work so far was orchestrated by Claude Code, with Codex as the worker. From now on Codex may do both roles. The discipline below still applies: it is what makes the work verifiable.

## Hard rules for a public repo

1. Everything in the repo is written in English: code, docs, commit messages, UI text.
2. Never write local machine paths, emails, personal names, client or product names, tokens, or keys anywhere. `.env` is git-ignored; only `.env.example` is tracked.
3. Do not read, copy, or modify anything outside this folder (including your own global config).
4. No photos, avatars, or images of the author anywhere.
5. Commit messages must not contain `Claude-Session` lines or session links. Keep commits authored with the GitHub noreply address already configured in git; check with `git log` before any push.
6. **Never `git push` unless the user explicitly says "push".** Before every commit, show the user what will be committed (`git status` and `git diff --stat`). Commits themselves do not need a separate question once the user has asked for the task.
7. Never move, delete, back up, or overwrite `dashboard/.data/` (it holds the user's real chat history and settings). Tests must never touch it either: use `os.tmpdir()` and the helpers in `dashboard/tests/test-app.ts`. Never create temporary folders inside `dashboard/`.

## The working loop

1. Split work into small tasks: one file or function plus its test.
2. Each task gets its own branch `task/<short-name>` created from `main`.
3. At the start of a task, move it from Pending to In progress in `dashboard/PLAN.md` and commit that on `main` (the dashboard displays the board). Each task entry has: **Goal**, **Files**, **Definition of done**, and later **Result**.
4. Write the test first when fixing a defect and confirm it fails before the fix.
5. Implement. Keep the change minimal and inside the files named in the task.
6. A task is done only when all of these pass from `dashboard/`: `npm test`, `npm run typecheck`, `npm run build`. Run them yourself and read the output. Do not report success from memory.
7. Merge to `main` with a merge commit (`git merge --no-ff task/<name>`), then move the task to Done in `dashboard/PLAN.md` with a one-line **Result**.
8. Add an entry to `docs/run-log.md` (see below).
9. After a large feature, ask the user to review the changes (they may run a Codex review) before any push.

## Run log conventions (`docs/run-log.md`)

- Dashboard entries are `## D<n>. <task-name>`. Check the last entry and use the next number (the last one at the time of writing is D69, so the next is D70).
- Each entry has a table with: `Branch`, `Codex attempts`, `Codex model`, `Duration`, `Result`, followed by bullets: **Why**, **Attempt N**, **Orchestrator check**.
- `Codex model`: write the model name only if it is actually shown to you; otherwise `not reported`. `Duration` is the wall time of the task (like `1m 54s`).
- Count an attempt every time a verification failed and the work had to be redone.
- Be honest: record failures and defects found during verification.

## Technical pitfalls learned the hard way

- **UTF-8 without BOM and LF line endings** for every file you write. On Windows, editors and shells sometimes add a BOM; check for one after each task (for example, search the first bytes of changed files for `EF BB BF`).
- Use `npm.cmd` instead of `npm` in Windows PowerShell if script execution is blocked. The sandbox may have no network: do not try to install dependencies mid-task; if one is needed, stop and tell the user.
- Tests run in parallel workers. Never share state between test files, never write to the real `dashboard/.data`, and after `findBy*` use `waitFor` for effects that settle in `useEffect`.
- Real defects found during earlier verification (so you do not repeat them): environment variables ignored when `.env` is missing; tests writing the real `.data` files; a setting not syncing after saving in Settings; a text in a task that said ".data must not exist" made an agent move the user's real data. Read task text literally but protect the user's data first.
- Browser screenshots in the test environment can be unreliable; prefer DOM checks.

## Product and security rules (from `dashboard/PLAN.md`; read the Security model there)

- The product is called **Harness**. Claude Code and Codex are the only agents mentioned. The interface is in English.
- A UI control appears only in the milestone that makes it work. No disabled placeholders.
- Bundled fonts and inline SVG icons only: no CDN requests, no external network calls from the front end.
- The server binds to `127.0.0.1` only, checks `Host` and `Origin`, requires JSON content type for state-changing requests, and validates bodies with Zod. No file path ever comes from a request. `git` runs through `execFile` with fixed arguments and no shell.
- Voice keys are read only from `.env` in the backend and are never returned by the API.
- The orchestrator chat uses only Claude Code, with no tools, an empty working directory, the prompt over stdin, and `--safe-mode`. **Codex is never started by the chat**, because `docs/chat-isolation.md` showed its Windows read-only sandbox does not contain it. This can only change in Phase 2 task `codex-chat-sandbox`, and only with a repeated, documented isolation check.

## Before you finish any session

- `git status` is clean or the remaining changes are explained to the user.
- `dashboard/PLAN.md` and `docs/run-log.md` match what really happened.
- Nothing was pushed unless the user said "push". After a pushed milestone, check CI with `gh run watch` and report a red run honestly.
- Tell the user, in plain words, what was done, what was verified, and what is left. Reply in the language the user writes in; repo content stays English.
