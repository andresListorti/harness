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
