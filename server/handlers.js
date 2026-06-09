const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const { sessions, sanitize } = require('./sessions');

function send(ws, type, payload = {}) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function broadcast(wss, sessionId, session) {
  const msg = JSON.stringify({ type: 'state', ...sanitize(session) });
  for (const client of wss.clients) {
    if (client.sessionId === sessionId && client.readyState === 1) {
      client.send(msg);
    }
  }
}

async function handleMessage(ws, msg, wss) {
  if (!msg || typeof msg.type !== 'string') {
    return send(ws, 'error', { message: 'Invalid message' });
  }
  switch (msg.type) {
    case 'join':              return handleJoin(ws, msg, wss);
    case 'claim_admin':       return handleClaimAdmin(ws, msg, wss);
    case 'configure':         return handleConfigure(ws, msg, wss);
    case 'submit_selections': return handleSubmitSelections(ws, msg, wss);
    case 'advance_phase':     return handleAdvancePhase(ws, msg, wss);
    case 'reset':             return handleReset(ws, msg, wss);
    default:                  return send(ws, 'error', { message: 'Unknown message type' });
  }
}

function handleJoin(ws, msg, wss) {
  const { sessionId, name } = msg;
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return send(ws, 'error', { message: 'sessionId required' });
  }
  if (typeof name !== 'string' || name.trim().length < 1 || name.length > 200) {
    return send(ws, 'error', { message: 'name required (1–200 chars)' });
  }
  if (ws.participantId) {
    return send(ws, 'error', { message: 'Already joined a session' });
  }
  const session = sessions.get(sessionId.trim().toUpperCase());
  if (!session) {
    return send(ws, 'error', { message: 'Session not found' });
  }
  const trimmed = name.trim();
  if (session.participants.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
    return send(ws, 'error', { message: 'Name already taken in this session' });
  }

  const participantId = randomUUID();
  session.participants.push({
    id: participantId,
    name: trimmed,
    submitted: false,
    selfSelections: [],
    peerSelections: {},
  });
  ws.participantId = participantId;
  ws.sessionId = session.id;

  send(ws, 'joined', { participantId });
  broadcast(wss, session.id, session);
}

async function handleClaimAdmin(ws, msg, wss) {
  const session = getJoinedSession(ws);
  if (!session) return send(ws, 'error', { message: 'Join a session first' });
  if (session.adminId) return send(ws, 'error', { message: 'Admin already claimed' });
  const { pin } = msg;
  if (typeof pin !== 'string') return send(ws, 'error', { message: 'pin required' });
  const valid = await bcrypt.compare(pin, session.adminPinHash);
  if (!valid) return send(ws, 'error', { message: 'Incorrect PIN' });
  session.adminId = ws.participantId;
  broadcast(wss, session.id, session);
}

function handleConfigure(ws, msg, wss) {
  const session = getJoinedSession(ws);
  if (!session) return send(ws, 'error', { message: 'Join a session first' });
  if (session.adminId !== ws.participantId) return send(ws, 'error', { message: 'Admin only' });
  if (session.phase !== 'lobby') return send(ws, 'error', { message: 'Can only configure in lobby' });

  const { wordList, timerDuration } = msg;
  if (!Array.isArray(wordList) || wordList.length < 2) {
    return send(ws, 'error', { message: 'wordList must have at least 2 entries' });
  }
  for (const w of wordList) {
    if (typeof w !== 'string' || w.trim().length < 1 || w.length > 200) {
      return send(ws, 'error', { message: 'Each word must be a non-empty string (max 200 chars)' });
    }
  }
  if (timerDuration != null) {
    if (!Number.isInteger(timerDuration) || timerDuration < 60 || timerDuration > 3600) {
      return send(ws, 'error', { message: 'timerDuration must be 60–3600 seconds, or null' });
    }
  }

  session.wordList = wordList.map(w => w.trim());
  session.timerDuration = timerDuration ?? null;
  broadcast(wss, session.id, session);
}

function handleSubmitSelections(ws, msg, wss) {
  const session = getJoinedSession(ws);
  if (!session) return send(ws, 'error', { message: 'Join a session first' });
  if (session.phase !== 'select') return send(ws, 'error', { message: 'Not in select phase' });

  const participant = session.participants.find(p => p.id === ws.participantId);
  if (participant.submitted) return send(ws, 'error', { message: 'Already submitted' });

  const { selfSelections, peerSelections } = msg;
  if (!Array.isArray(selfSelections)) {
    return send(ws, 'error', { message: 'selfSelections must be an array' });
  }
  for (const w of selfSelections) {
    if (!session.wordList.includes(w)) return send(ws, 'error', { message: `Unknown word: ${w}` });
  }
  if (typeof peerSelections !== 'object' || peerSelections === null || Array.isArray(peerSelections)) {
    return send(ws, 'error', { message: 'peerSelections must be an object' });
  }
  const peers = session.participants.filter(p => p.id !== ws.participantId);
  for (const [targetId, words] of Object.entries(peerSelections)) {
    if (!peers.some(p => p.id === targetId)) {
      return send(ws, 'error', { message: `Unknown participant: ${targetId}` });
    }
    if (!Array.isArray(words)) {
      return send(ws, 'error', { message: 'peerSelections values must be arrays' });
    }
    for (const w of words) {
      if (!session.wordList.includes(w)) return send(ws, 'error', { message: `Unknown word: ${w}` });
    }
  }

  participant.selfSelections = selfSelections;
  participant.peerSelections = peerSelections;
  participant.submitted = true;
  broadcast(wss, session.id, session);
}

function handleAdvancePhase(ws, msg, wss) {
  const session = getJoinedSession(ws);
  if (!session) return send(ws, 'error', { message: 'Join a session first' });
  if (session.adminId !== ws.participantId) return send(ws, 'error', { message: 'Admin only' });

  if (session.phase === 'lobby') {
    session.phase = 'select';
    if (session.timerDuration) {
      session.timerStartedAt = Date.now();
      session._timerTimeout = setTimeout(() => {
        if (session.phase === 'select') {
          session.phase = 'reveal';
          session.timerStartedAt = null;
          session._timerTimeout = null;
          broadcast(wss, session.id, session);
        }
      }, session.timerDuration * 1000);
    }
  } else if (session.phase === 'select') {
    if (session._timerTimeout) {
      clearTimeout(session._timerTimeout);
      session._timerTimeout = null;
    }
    session.phase = 'reveal';
    session.timerStartedAt = null;
  } else {
    return send(ws, 'error', { message: 'Cannot advance from reveal phase' });
  }

  broadcast(wss, session.id, session);
}

function handleReset(ws, msg, wss) {
  const session = getJoinedSession(ws);
  if (!session) return send(ws, 'error', { message: 'Join a session first' });
  if (session.adminId !== ws.participantId) return send(ws, 'error', { message: 'Admin only' });

  if (session._timerTimeout) {
    clearTimeout(session._timerTimeout);
    session._timerTimeout = null;
  }
  session.phase = 'lobby';
  session.timerStartedAt = null;
  for (const p of session.participants) {
    p.submitted = false;
    p.selfSelections = [];
    p.peerSelections = {};
  }
  broadcast(wss, session.id, session);
}

function getJoinedSession(ws) {
  if (!ws.participantId || !ws.sessionId) return null;
  return sessions.get(ws.sessionId) ?? null;
}

module.exports = { handleMessage, broadcast };
