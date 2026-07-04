const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const {
  ADMIN_PIN_WINDOW_MS,
  MAX_ADMIN_PIN_ATTEMPTS,
  MAX_PARTICIPANTS,
  MAX_WORDS,
  SESSION_CODE_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PIN_LENGTH,
  sessions,
  sanitize,
} = require('./sessions');

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
  const code = typeof sessionId === 'string' ? sessionId.trim().toUpperCase() : '';
  if (code.length < 1 || code.length > SESSION_CODE_LENGTH) {
    return send(ws, 'error', { message: 'Invalid session code' });
  }
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length < 1 || trimmed.length > MAX_NAME_LENGTH) {
    return send(ws, 'error', { message: `name required (1–${MAX_NAME_LENGTH} chars)` });
  }
  if (ws.participantId) {
    return send(ws, 'error', { message: 'Already joined a session' });
  }
  const session = sessions.get(code);
  if (!session) {
    return send(ws, 'error', { message: 'Session not found' });
  }
  if (session.participants.length >= MAX_PARTICIPANTS) {
    return send(ws, 'error', { message: `Session is full (max ${MAX_PARTICIPANTS} participants)` });
  }
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
  if (typeof pin !== 'string' || pin.length < 1 || pin.length > MAX_PIN_LENGTH) {
    return send(ws, 'error', { message: `pin required (1–${MAX_PIN_LENGTH} chars)` });
  }
  if (isAdminPinRateLimited(session, ws.participantId)) {
    return send(ws, 'error', { message: 'Too many incorrect PIN attempts. Try again later.' });
  }
  const valid = await bcrypt.compare(pin, session.adminPinHash);
  if (!valid) {
    recordFailedAdminPinAttempt(session, ws.participantId);
    return send(ws, 'error', { message: 'Incorrect PIN' });
  }
  session._adminPinAttempts.delete(ws.participantId);
  session.adminId = ws.participantId;
  broadcast(wss, session.id, session);
}

function isAdminPinRateLimited(session, participantId, now = Date.now()) {
  const attempt = session._adminPinAttempts.get(participantId);
  return Boolean(attempt?.blockedUntil && attempt.blockedUntil > now);
}

function recordFailedAdminPinAttempt(session, participantId, now = Date.now()) {
  const current = session._adminPinAttempts.get(participantId);
  if (!current || current.resetAt <= now) {
    session._adminPinAttempts.set(participantId, {
      count: 1,
      resetAt: now + ADMIN_PIN_WINDOW_MS,
      blockedUntil: null,
    });
    return;
  }

  current.count += 1;
  if (current.count >= MAX_ADMIN_PIN_ATTEMPTS) {
    current.blockedUntil = current.resetAt;
  }
}

function handleConfigure(ws, msg, wss) {
  const session = getJoinedSession(ws);
  if (!session) return send(ws, 'error', { message: 'Join a session first' });
  if (session.adminId !== ws.participantId) return send(ws, 'error', { message: 'Admin only' });
  if (session.phase !== 'lobby') return send(ws, 'error', { message: 'Can only configure in lobby' });

  const { wordList, timerDuration } = msg;
  if (!Array.isArray(wordList) || wordList.length < 2 || wordList.length > MAX_WORDS) {
    return send(ws, 'error', { message: `wordList must have 2–${MAX_WORDS} entries` });
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
  const peers = session.participants.filter(p => p.id !== ws.participantId);

  const selfError = validateSelfSelections(selfSelections, session.wordList);
  if (selfError) return send(ws, 'error', { message: selfError });

  const peerError = validatePeerSelections(peerSelections, peers, session.wordList);
  if (peerError) return send(ws, 'error', { message: peerError });

  participant.selfSelections = selfSelections;
  participant.peerSelections = peerSelections;
  participant.submitted = true;
  broadcast(wss, session.id, session);
}

function validateSelfSelections(selfSelections, wordList) {
  if (!Array.isArray(selfSelections)) {
    return 'selfSelections must be an array';
  }
  if (selfSelections.length > wordList.length) {
    return 'Too many self selections';
  }
  if (hasDuplicates(selfSelections)) {
    return 'selfSelections must not contain duplicates';
  }
  return validateKnownWords(selfSelections, wordList);
}

function validatePeerSelections(peerSelections, peers, wordList) {
  if (typeof peerSelections !== 'object' || peerSelections === null || Array.isArray(peerSelections)) {
    return 'peerSelections must be an object';
  }

  const peerIds = new Set(peers.map(p => p.id));
  const peerEntries = Object.entries(peerSelections);
  if (peerEntries.length > peers.length) {
    return 'Too many peer selection targets';
  }

  for (const [targetId, words] of peerEntries) {
    const error = validatePeerTargetSelections(targetId, words, peerIds, wordList);
    if (error) return error;
  }

  return null;
}

function validatePeerTargetSelections(targetId, words, peerIds, wordList) {
  if (!peerIds.has(targetId)) {
    return `Unknown participant: ${targetId}`;
  }
  if (!Array.isArray(words)) {
    return 'peerSelections values must be arrays';
  }
  if (words.length > wordList.length) {
    return 'Too many peer selections';
  }
  if (hasDuplicates(words)) {
    return 'peerSelections values must not contain duplicates';
  }
  return validateKnownWords(words, wordList);
}

function validateKnownWords(words, wordList) {
  for (const w of words) {
    if (!wordList.includes(w)) return `Unknown word: ${w}`;
  }
  return null;
}

function hasDuplicates(values) {
  return new Set(values).size !== values.length;
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
