# Security Guidelines for Claude

These rules apply whenever you are working in this repository. Follow them without exception unless the user explicitly overrides a specific rule with a clear reason.

## WebSocket input handling

- **Never trust inbound WebSocket message content.** Every message must be validated before acting on it: check that required fields are present, are the expected type, and fall within allowed values.
- **Never use `eval` or `new Function` on any client-supplied string.**
- Admin-only actions (`configure`, `advance_phase`, `reset`) must be enforced server-side by comparing `ws.participantId === session.adminId`. A client claiming to be the admin is not sufficient.
- Word selections must be validated against the session's current `wordList`. Reject any submitted word not in that list with an `error` message.
- Participant names and word list entries must be length-limited (max 200 chars) and stripped of leading/trailing whitespace. Never interpolate them into shell commands or file paths.
- `peerSelections` keys must be validated as participant IDs that actually exist in the session. Reject unknown IDs.

## Selection secrecy

- During the `select` phase, the server must **never** include any participant's `selfSelections` or `peerSelections` in any outbound broadcast — not even to the participant themselves. This prevents timing attacks where a browser dev tool could reveal what others have submitted.
- After `advance_phase` to `reveal`, selections may be broadcast to all participants.
- A participant's peer selections made by others must never be sent to the target participant before reveal.

## Pin handling

- Admin pins must be hashed with `bcryptjs` before being stored in session state. Never store or log a plaintext pin.
- The `adminPinHash` field must **never** appear in any outbound WebSocket message or HTTP response.
- Use `bcryptjs.compare()` for pin verification — never compare hashes directly with `===`.

## Session state

- Session state exists only in the server process's memory. It is never written to disk, logged, or sent to any external service.
- When a session is empty (all participants disconnected), clean it up from the in-memory map to avoid unbounded memory growth.
- Do not expose internal session IDs or participant IDs in error messages sent to other participants.

## File system

- The server only reads from `./public` (static files) and `node_modules`. It must not read from or write to any path derived from client input.
- Do not use `__dirname` concatenation with user-supplied strings to build file paths.
- Never serve files outside of the `STATIC_DIR` directory.

## HTTP

- The `POST /api/sessions` endpoint must validate all fields. Reject unknown or malformed input with a 400.
- Do not reflect user-supplied strings back in HTTP response bodies without sanitising them first.
- Do not log request bodies — they may contain admin pins.

## Dependencies

- Do not add new `npm` dependencies without a clear reason tied to an existing feature requirement.
- Do not pin dependencies to versions with known CVEs. Check `npm audit` before adding a new package.
- The production Docker image installs server deps with `npm ci --omit=dev`. Never include dev dependencies in the production image.

## Docker

- The Docker image must run as a non-root user. Add a `USER node` directive in the `runner` stage.
- Do not copy `.env` files, secrets, or credential files into the Docker image.
- The `.dockerignore` must exclude `node_modules`, `.git`, and any local config files.

## Git

- **Never force-push to `main`.**
- **Never commit secrets, tokens, or credentials** of any kind.
- The `.gitignore` must exclude `.env` and `*.local` files.
- Do not amend published commits on shared branches without user confirmation.

## What to do if uncertain

If an action could be destructive, irreversible, or exposes participant data (selections, names, session contents), **stop and ask the user for confirmation** before proceeding.
