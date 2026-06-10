const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const sessions = new Map();

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
    participants: [],
  };
  sessions.set(id, session);
  return session;
}

function removeParticipant(session, participantId) {
  session.participants = session.participants.filter(p => p.id !== participantId);
  if (session.adminId === participantId) {
    session.adminId = null;
  }
}

function sanitize(session) {
  const { adminPinHash, _timerTimeout, participants, ...rest } = session;
  const sanitizedParticipants = participants.map(({ selfSelections, peerSelections, ...p }) => {
    if (session.phase === 'reveal') {
      return { ...p, selfSelections, peerSelections };
    }
    return p;
  });
  return { ...rest, participants: sanitizedParticipants };
}

module.exports = { sessions, DEFAULT_WORD_LIST, createSession, removeParticipant, sanitize };
