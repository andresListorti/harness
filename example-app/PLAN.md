# PLAN

A to-do REST API built with TypeScript, Node, Express, and Vitest. Tasks are stored in memory.

**Task shape:** `id` (UUID), `title` (string, 1-200 characters after trimming), `description` (optional string, up to 2000 characters), `completed` (boolean), `createdAt` and `updatedAt` (ISO 8601 strings).

**Error shape:** `{ "error": { "code": string, "message": string, "details"?: unknown } }`

**Every definition of done also requires:** `npm test` passes in full and `npm run typecheck` reports no errors, both run by the orchestrator from `example-app/`.

## Pending

### error-handling
- **Goal:** Return the standard error shape for malformed JSON, unknown routes, and unexpected errors.
- **Files:** `src/errors.ts`, `src/app.ts`, `tests/errors.test.ts`
- **Definition of done:** `tests/errors.test.ts` passes: malformed JSON returns 400 with code `INVALID_JSON`; an unknown route returns 404 with code `ROUTE_NOT_FOUND`; an unexpected error returns 500 with code `INTERNAL_ERROR` and does not expose the stack trace or original message.

### ci
- **Goal:** Run install, tests, and typecheck automatically on every push and pull request with GitHub Actions.
- **Files:** `.github/workflows/ci.yml`, `example-app/package-lock.json`
- **Definition of done:** the workflow is valid YAML, runs `npm ci`, `npm test`, and `npm run typecheck` inside `example-app/` on `push` and `pull_request`, and the same three commands pass locally from `example-app/`. `package-lock.json` is committed.

## In progress

_None._

## Done

### project-setup
- **Goal:** Scaffold the project and expose `GET /health`, with the app factory kept separate from the server entry point.
- **Files:** `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `src/app.ts`, `src/server.ts`, `tests/health.test.ts`
- **Definition of done:** `tests/health.test.ts` passes: `GET /health` returns 200 with `{ "status": "ok" }`; importing `createApp` does not open a port.
- **Result:** done. 2 tests pass, typecheck clean, verified from a clean `npm ci`.

### task-validation
- **Goal:** Define the `Task` type and Zod schemas for create and update input.
- **Files:** `src/validation.ts`, `tests/validation.test.ts`
- **Definition of done:** `tests/validation.test.ts` passes: valid input accepted and title trimmed; empty, whitespace-only, too-long, and non-string titles rejected; too-long description rejected; unknown fields rejected; an empty update rejected.
- **Result:** done. 48 tests pass, typecheck clean.

### task-store
- **Goal:** Implement an in-memory store with create, list, get, update, and delete.
- **Files:** `src/store.ts`, `tests/store.test.ts`
- **Definition of done:** `tests/store.test.ts` passes: create assigns a unique ID, `completed: false`, and timestamps; list keeps insertion order; get, update, and delete return `undefined` or `false` for unknown IDs; update changes `updatedAt` but not `id` or `createdAt`; each store instance is isolated.
- **Result:** done. 55 tests pass, typecheck clean.

### create-task
- **Goal:** Add `POST /tasks` using the validation schema and the store.
- **Files:** `src/routes/tasks.ts`, `src/errors.ts`, `src/app.ts`, `src/store.ts`, `tests/create-task.test.ts`
- **Definition of done:** `tests/create-task.test.ts` passes: valid body returns 201 with the created task; invalid body returns 400 with code `VALIDATION_ERROR` and details; nothing is stored after a rejected request.
- **Result:** done. 62 tests pass, typecheck clean.

### list-and-get-tasks
- **Goal:** Add `GET /tasks`, with an optional `completed` filter, and `GET /tasks/:id`.
- **Files:** `src/routes/tasks.ts`, `tests/list-tasks.test.ts`
- **Definition of done:** `tests/list-tasks.test.ts` passes: empty list returns `[]`; list returns all tasks in insertion order; `completed=true` and `completed=false` filter correctly; any other filter value returns 400; a known ID returns 200; an unknown ID returns 404 with code `TASK_NOT_FOUND`.
- **Result:** done. 79 tests pass, typecheck clean.

### edit-task
- **Goal:** Add `PATCH /tasks/:id` to edit `title` and `description`.
- **Files:** `src/routes/tasks.ts`, `tests/edit-task.test.ts`
- **Definition of done:** `tests/edit-task.test.ts` passes: partial updates leave other fields unchanged and refresh `updatedAt`; invalid or empty body returns 400; attempts to set `id` or `completed` return 400; an unknown ID returns 404.
- **Result:** done. 93 tests pass, typecheck clean.

### complete-task
- **Goal:** Add `POST /tasks/:id/complete` as an idempotent operation.
- **Files:** `src/store.ts`, `src/routes/tasks.ts`, `tests/complete-task.test.ts`, `tests/store.test.ts`, `tests/list-tasks.test.ts`
- **Definition of done:** `tests/complete-task.test.ts` passes: returns 200 with `completed: true`; a repeated call returns 200 and does not change `updatedAt`; an unknown ID returns 404.
- **Result:** done. 97 tests pass, typecheck clean.

### delete-task
- **Goal:** Add `DELETE /tasks/:id`.
- **Files:** `src/routes/tasks.ts`, `tests/delete-task.test.ts`
- **Definition of done:** `tests/delete-task.test.ts` passes: returns 204 with an empty body; the task no longer appears in get or list; an unknown ID returns 404.
- **Result:** done. 100 tests pass, typecheck clean.
