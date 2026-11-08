# Run log

One entry per task in `example-app/PLAN.md`: how many attempts Codex needed, which tests passed, and the result. The orchestrator (Claude Code) runs the tests itself after every attempt.

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
