# johari — Project Context

@CLAUDE_SECURITY.md
@CLAUDE_ACCESSIBILITY.md

## Project Overview

A self-hosted, real-time web tool for running the Johari Window activity with a group. An admin creates a session, defines the word list, and controls phase transitions. Participants secretly select adjectives for themselves and each other. At reveal, each participant sees their personal four-quadrant Johari Window.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, `ws` |
| Frontend | Svelte 4, Vite |
| Real-time | WebSockets (native, no Socket.io) |
| Deployment | Docker (single container, single port) |
| Pin hashing | `bcryptjs` |

No database. No external services. Session state is in-memory and ephemeral.

## Project Structure

```
johari/
├── Dockerfile
├── docker-compose.yml
├── server/
│   ├── package.json        # express, ws, uuid, bcryptjs
│   ├── index.js            # Express + WebSocket server, port 3000
│   ├── sessions.js         # In-memory session state (Map)
│   └── handlers.js         # WebSocket message handlers
└── client/
    ├── package.json        # svelte, vite, @sveltejs/vite-plugin-svelte
    ├── vite.config.js      # WS proxy to :3000 in dev
    ├── index.html
    └── src/
        ├── main.js
        ├── App.svelte          # Routing: Home / Session
        ├── ws.js               # WS client + sessionState / wsError stores
        └── lib/
            ├── JoinForm.svelte
            ├── AdminPanel.svelte   # Word list config, timer, phase control
            ├── SelectPhase.svelte  # Private selection screen per participant
            ├── RevealPhase.svelte  # Four-quadrant Johari window display
            └── WordGrid.svelte     # Reusable adjective picker grid
```

## Architecture

```
┌─────────────────────────────────────┐
│             Docker Container        │
│                                     │
│  Express (HTTP + static files)      │
│    └── WS upgrade → ws server      │
│                                     │
│  In-memory: Map<sessionId, Session> │
└─────────────────────────────────────┘
```

The Svelte app is compiled at Docker build time and served as static files by Express. WebSocket connections share port 3000 via HTTP upgrade.

## Session State Shape

```js
{
  id: string,                  // uuid
  phase: 'lobby' | 'select' | 'reveal',
  adminId: string | null,
  adminPinHash: string | null, // bcryptjs hash — never sent to clients
  wordList: string[],          // adjectives, admin-defined
  timerDuration: number | null,   // seconds; null = no timer
  timerStartedAt: number | null,  // Date.now() when select phase begins
  participants: [{
    id: string,
    name: string,
    submitted: boolean,
    selfSelections: string[],               // words they chose for themselves
    peerSelections: { [targetId]: string[] } // words they chose for each peer
  }]
}
```

When broadcasting state to clients:
- Always omit `adminPinHash`
- During `select` phase: omit all `selfSelections` and `peerSelections` from every participant (selections are secret until reveal)
- During `reveal` phase: include full selections so each client can compute its own four quadrants client-side
- A participant's own `peerSelections` chosen by others must never be sent to them before reveal

## Johari Quadrant Logic (client-side)

For a given participant P, computed after reveal:

| Quadrant | Rule |
|---|---|
| **Open** | Words P selected for themselves AND at least one peer also selected for P |
| **Blind Spot** | Words P did NOT select for themselves, but at least one peer selected for P |
| **Hidden** | Words P selected for themselves, but no peer selected for P |
| **Unknown** | Words neither P nor any peer selected for P |

## WebSocket Message Protocol

All messages are JSON. Inbound (client → server):

| type | Payload | Notes |
|---|---|---|
| `join` | `{ name }` | Joins the session in the lobby |
| `claim_admin` | `{ pin }` | Verify with bcryptjs; first joiner with correct pin becomes admin |
| `configure` | `{ wordList, timerDuration }` | Admin only; sets word list and optional timer |
| `submit_selections` | `{ selfSelections, peerSelections }` | Select phase only; participant submits their choices |
| `advance_phase` | — | Admin only; lobby→select or select→reveal |
| `reset` | — | Admin only; returns to lobby, clears all selections |

Outbound (server → client):

| type | Payload |
|---|---|
| `state` | Full sanitised session state |
| `error` | `{ message }` |

## Development Commands

Run server and client in separate terminals:

```bash
# Terminal 1 — backend
cd server && npm install && node index.js

# Terminal 2 — frontend (Vite dev server with WS proxy)
cd client && npm install && npm run dev
```

Vite proxies WebSocket connections to `localhost:3000` so the dev server works against the local Node backend without CORS issues.

When changing client UI or any Svelte source, verify the production build before opening a PR:

```bash
cd client && npm run build
```

Do not commit generated static bundles. Docker and CI recreate them from source at build time; for local direct-server checks, build the client first and point `STATIC_DIR` at the output directory.

## Testing

```bash
# Server unit tests
cd server && npm test

# Client component tests (install browser once)
cd client && npx playwright install chromium && npm test

# End-to-end tests (build client and start server first)
cd client && npm run build
cd server && node index.js &
cd e2e && npx playwright install chromium && npm test
```

## Docker

```bash
# Build and run
docker build -t johari .
docker run -p 3000:3000 johari

# Or with compose
docker compose up
```

The Dockerfile is a two-stage build:
1. `builder` stage: Node alpine, builds the Svelte client (`npm run build`)
2. `runner` stage: Node alpine, installs server prod deps only, copies compiled client into the server's public directory

Static files are served from the `STATIC_DIR` path (defaults to a `public` subdirectory inside the server directory). The `STATIC_DIR` env var overrides this.

## Conventions

- Plain JavaScript throughout — no TypeScript
- No comments unless the WHY is non-obvious
- No external cloud dependencies — all runtime deps must be `npm` packages only
- Server code never sends `adminPinHash` to any client under any circumstance
- Selections are completely hidden from all clients during the `select` phase — the sanitised state broadcast must omit them entirely
- All inbound WebSocket messages must be validated before acting on them (check required fields, types, allowed values)
- Admin actions require `ws.participantId === session.adminId` server-side — never trust client-side claims

## Dependency changes

When adding or removing npm packages, do all installs and uninstalls in one pass, then verify the lock file is clean before committing:

```bash
# Good — single pass
npm install pkg-a pkg-b && npm uninstall pkg-c

# If you've made multiple separate npm calls, regenerate the lock file:
rm package-lock.json && npm install
```

Always commit both `package.json` and `package-lock.json` together.

The client CI steps use `npm install` rather than `npm ci`. The lock file is generated on Windows and does not contain Linux-specific optional packages that `npm ci` on Linux requires. `npm install` uses the lock file for exact versions of everything it can, and resolves platform-specific optional packages for the current environment.

## Git Workflow

- Feature work on `feat/<short-description>` branches, PRs targeting `main`
- Never commit directly to `main`
- Always include the co-author trailer in commit messages:
  ```
  Co-Authored-By: Claude Code <noreply@anthropic.com>
  ```
- Never force-push to `main`

## Shell tool selection (Windows)

This project runs on Windows with PowerShell as the login shell.

**Decision rule — pick one tool per operation:**

| What you need | Use |
|---|---|
| `git`, `gh`, `npm`, `node`, `docker` | `Bash` tool (POSIX shell, same commands on any OS) |
| File ops: search, read, edit, write | Dedicated tools (`Grep`, `Read`, `Edit`, `Write`, `Glob`) — never `Bash` or `PowerShell` |
| Windows-only tasks (registry, COM, etc.) | `PowerShell` tool |
| Everything else | `Bash` tool first; fall back to `PowerShell` only if Bash fails |

Do **not** mix shells in a single logical operation.
