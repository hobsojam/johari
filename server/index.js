const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const bcrypt = require('bcryptjs');
const { sessions, createSession, removeParticipant } = require('./sessions');
const { handleMessage, broadcast } = require('./handlers');

const app = express();
app.use(express.json());

const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, 'public');
app.use(express.static(STATIC_DIR));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/sessions', async (req, res) => {
  const { adminPin } = req.body ?? {};
  if (typeof adminPin !== 'string' || adminPin.trim().length < 1 || adminPin.length > 100) {
    return res.status(400).json({ error: 'adminPin required (1–100 chars)' });
  }
  const hash = await bcrypt.hash(adminPin.trim(), 10);
  const session = createSession(hash);
  res.json({ sessionId: session.id });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

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
server.listen(PORT, () => console.log(`Johari server running on :${PORT}`));
