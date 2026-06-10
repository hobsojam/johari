const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const sessions = new Map();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_SESSIONS = 100;
const MAX_PARTICIPANTS = 50;
const MAX_WORDS = 200;
const ADMIN_PIN_WINDOW_MS = 5 * 60 * 1000;
const MAX_ADMIN_PIN_ATTEMPTS = 5;

const DEFAULT_WORD_LIST = [
  'able', 'accepting', 'adaptable', 'bold', 'brave', 'calm', 'caring', 'cheerful',
  'clever', 'complex', 'confident', 'dependable', 'dignified', 'energetic', 'extroverted',
  'friendly', 'giving', 'happy', 'helpful', 'idealistic', 'independent', 'ingenious',
  'intelligent', 'introverted', 'kind', 'knowledgeable', 'logical', 'loving', 'mature',
  'modest', 'nervous', 'observant', 'organised', 'patient', 'powerful', 'proud',
  'quiet', 'reflective', 'relaxed', 'religious', 'responsive', 'searching', 'self-assertive',
  'self-conscious', 'sensible', 'sentimental', 'shy', 'silly', 'smart', 'spontaneous',
  'sympathetic', 'tense', 'trustworthy', 'warm', 'wise', 'witty',
];

function generateId() {
  let id;
  do {
    id = Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
  } while (sessions.has(id));
  return id;
}

function createSession(adminPinHash) {
  pruneExpiredSessions();
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error('Session capacity reached');
  }
  const id = generateId();
  const session = {
    id,
    phase: 'lobby',
    adminId: null,
    adminPinHash,
    wordList: [...DEFAULT_WORD_LIST],
    timerDuration: null,
    timerStartedAt: null,
    _timerTimeout: null,
    _createdAt: Date.now(),
    _adminPinAttempts: new Map(),
    participants: [],
  };
  sessions.set(id, session);
  return session;
}

function pruneExpiredSessions(now = Date.now()) {
  for (const [id, session] of sessions) {
    if (now - session._createdAt >= SESSION_TTL_MS) {
      if (session._timerTimeout) clearTimeout(session._timerTimeout);
      sessions.delete(id);
    }
  }
}

function sanitize(session) {
  const { adminPinHash, _timerTimeout, _createdAt, _adminPinAttempts, participants, ...rest } = session;
  const sanitizedParticipants = participants.map(({ selfSelections, peerSelections, ...p }) => {
    if (session.phase === 'reveal') {
      return { ...p, selfSelections, peerSelections };
    }
    return p;
  });
  return { ...rest, participants: sanitizedParticipants };
}

module.exports = {
  sessions,
  DEFAULT_WORD_LIST,
  SESSION_TTL_MS,
  MAX_SESSIONS,
  MAX_PARTICIPANTS,
  MAX_WORDS,
  ADMIN_PIN_WINDOW_MS,
  MAX_ADMIN_PIN_ATTEMPTS,
  createSession,
  pruneExpiredSessions,
  sanitize,
};
