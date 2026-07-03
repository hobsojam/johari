const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { sessions, createSession, removeParticipant } = require('./sessions');
const { handleMessage, broadcast } = require('./handlers');

const app = express();
app.use(express.json({ limit: '16kb' }));

const SESSION_CREATION_WINDOW_MS = 60 * 1000;
const MAX_SESSION_CREATIONS_PER_WINDOW = 20;
const sessionCreationAttempts = new Map();

const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, 'public');
app.use(express.static(STATIC_DIR));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/sessions', async (req, res) => {
  if (isSessionCreationRateLimited(req.ip)) {
    return res.status(429).json({ error: 'Too many session creation attempts. Try again later.' });
  }
  const { adminPin } = req.body ?? {};
  if (typeof adminPin !== 'string' || adminPin.trim().length < 1 || adminPin.length > 100) {
    return res.status(400).json({ error: 'adminPin required (1–100 chars)' });
  }
  const hash = await bcrypt.hash(adminPin.trim(), 10);
  try {
    const session = createSession(hash);
    res.json({ sessionId: session.id });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

function isSessionCreationRateLimited(clientId, now = Date.now()) {
  const current = sessionCreationAttempts.get(clientId);
  if (!current || current.resetAt <= now) {
    sessionCreationAttempts.set(clientId, { count: 1, resetAt: now + SESSION_CREATION_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_SESSION_CREATIONS_PER_WINDOW;
}

// Cached at startup so the SPA fallback does no per-request fs access;
// the file is a build artifact that never changes while the server runs.
let spaIndexHtml = null;
try {
  spaIndexHtml = fs.readFileSync(path.join(STATIC_DIR, 'index.html'));
} catch {
  console.warn(`No index.html found in ${STATIC_DIR}; SPA fallback disabled`);
}

app.get(/.*/, (_req, res) => {
  if (!spaIndexHtml) return res.status(404).json({ error: 'Not found' });
  res.type('html').send(spaIndexHtml);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws) => {
  ws.participantId = null;
  ws.sessionId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }
    handleMessage(ws, msg, wss);
  });

  ws.on('close', () => {
    if (!ws.sessionId || !ws.participantId) return;
    const session = sessions.get(ws.sessionId);
    if (!session) return;
    removeParticipant(session, ws.participantId);
    if (session.participants.length === 0) {
      if (session._timerTimeout) clearTimeout(session._timerTimeout);
      sessions.delete(ws.sessionId);
    } else {
      broadcast(wss, ws.sessionId, session);
    }
  });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  server.listen(PORT, () => console.log(`Johari server running on :${PORT}`));
}

module.exports = { server };
