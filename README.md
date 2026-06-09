[![Quality gate](https://sonarcloud.io/api/project_badges/quality_gate?project=hobsojam_johari)](https://sonarcloud.io/summary/new_code?id=hobsojam_johari)

# johari

A lightweight, self-hosted web tool for running the Johari Window activity with a group.

## What is the Johari Window?

The Johari Window is a self-awareness exercise developed by psychologists Joseph Luft and Harrington Ingham. Each person selects adjectives they feel describe themselves; peers independently select adjectives they feel describe that person. The overlap and differences are mapped into four quadrants:

| | Known to self | Unknown to self |
|---|---|---|
| **Known to others** | Open | Blind Spot |
| **Unknown to others** | Hidden | Unknown |

The result sparks conversation about self-perception, how others see us, and what we might not know about ourselves — making it a useful tool for team-building, coaching, and leadership development.

## Objectives

- Real-time, phase-based facilitation with a private selection step so participants cannot see each other's choices mid-session
- Admin controls for word list customisation and optional countdown timer
- No external cloud dependencies — runs in a single Docker container

## Features

- Responsive layout for desktop, tablet, and phone browsers

### Session flow

- Admin creates a session and shares a 6-character join code with participants (e.g. `AB3K7P`)
- Participants join with a display name and wait in a lobby
- Admin configures the word list (or uses the default set) and an optional countdown timer, then starts the session
- **Select phase**: each participant privately picks adjectives for themselves and for every other participant; choices are hidden from everyone until reveal
- **Reveal phase**: each participant sees their personal four-quadrant Johari Window, computed from their own selections and what their peers chose for them

### Admin controls

- Customisable adjective word list (add, remove, reset to defaults)
- Optional countdown timer (auto-advances to reveal when it expires)
- Manual phase advance and session reset

### Privacy

- During the select phase the server withholds all selection data from every client — even from the participant who made the selections
- After reveal, each client computes its own quadrants locally from the broadcast state

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, `ws` |
| Frontend | Svelte 4 (compiled to static files, served by Express) |
| Real-time | WebSockets (single port, no Socket.io) |
| Deployment | Docker (single container, single port) |
| Pin hashing | `bcryptjs` |
| ID generation | `crypto.randomUUID()` (Node.js built-in) |

No external services. No database. No cloud dependencies.

## Architecture

```
┌─────────────────────────────────────┐
│             Docker Container        │
│                                     │
│  Express (HTTP)                     │
│    ├── GET /          → Svelte SPA  │
│    └── WS upgrade     → ws server  │
│                                     │
│  In-memory session state            │
│    └── Map<sessionId, Session>      │
└─────────────────────────────────────┘
```

The Svelte app is built at Docker image build time and served as static files. WebSocket connections share the same port as HTTP via an HTTP upgrade.

### WebSocket Message Protocol

All messages are JSON. Direction noted as C→S (client to server) or S→C (server to client).
Admin actions require the participant to hold the admin role for that session.

| Message | Direction | Description |
|---|---|---|
| `join` | C→S | Join a session: `{ sessionId, name }` |
| `claim_admin` | C→S | Claim admin role: `{ pin }` |
| `configure` | C→S | Admin sets word list and optional timer: `{ wordList, timerDuration }` |
| `submit_selections` | C→S | Submit selections: `{ selfSelections, peerSelections }` |
| `advance_phase` | C→S | Admin moves lobby→select or select→reveal |
| `reset` | C→S | Admin resets to lobby and clears all selections |
| `joined` | S→C | Sent to the joining client only: `{ participantId }` |
| `state` | S→C | Full sanitised session state broadcast to all participants |
| `error` | S→C | `{ message }` |

### Session State Shape

The `state` message sent to clients contains the sanitised session (pin hash and selection data are withheld during the select phase):

```js
{
  id: string,
  phase: 'lobby' | 'select' | 'reveal',
  adminId: string | null,
  wordList: string[],
  timerDuration: number | null,   // seconds; null = no timer
  timerStartedAt: number | null,  // Unix ms; null when not running
  participants: [{
    id: string,
    name: string,
    submitted: boolean,
    // selfSelections and peerSelections omitted during select phase;
    // present for all participants after reveal so each client can
    // compute its own quadrants locally
    selfSelections: string[],
    peerSelections: { [targetId: string]: string[] }
  }]
}
```

## Project Structure

```
johari/
├── Dockerfile
├── docker-compose.yml
├── server/
│   ├── package.json
│   ├── index.js          # Express + ws setup, POST /api/sessions
│   ├── sessions.js       # In-memory session state, sanitize()
│   └── handlers.js       # WebSocket message handlers, broadcast()
└── client/
    ├── package.json
    ├── vite.config.js    # Proxies /api and /ws to :3000 in dev
    ├── index.html
    └── src/
        ├── main.js
        ├── App.svelte        # Phase routing: lobby / select / reveal
        ├── ws.js             # WebSocket client + Svelte stores
        └── lib/
            ├── JoinForm.svelte     # Create session (admin) or join by code
            ├── AdminPanel.svelte   # Word list editor, timer, phase controls
            ├── WordGrid.svelte     # Reusable togglable adjective chip grid
            ├── SelectPhase.svelte  # Private selection screen
            └── RevealPhase.svelte  # Four-quadrant window + participant switcher
```

## Running Locally

```bash
# Server
cd server && npm install && node index.js

# Client (separate terminal)
cd client && npm install && npm run dev
```

If you change client UI and plan to run the Express server without the Vite dev server, rebuild the client and point `STATIC_DIR` at `client/dist`. Do not commit generated static bundles; Docker and CI should create them from source.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP and WebSocket listen port |
| `STATIC_DIR` | `server/public` | Directory to serve static files from (populated by Docker build) |

Session state is ephemeral and lost on server restart — this is acceptable for live facilitated sessions.

## Docker

```bash
docker build -t johari .
docker run -p 3000:3000 johari
```

Or with docker-compose:

```bash
docker compose up
```

