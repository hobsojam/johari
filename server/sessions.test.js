'use strict';
const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  sessions,
  createSession,
  pruneExpiredSessions,
  removeParticipant,
  sanitize,
  DEFAULT_WORD_LIST,
  SESSION_TTL_MS,
  MAX_SESSIONS,
  MAX_ADMIN_PIN_ATTEMPTS,
} = require('./sessions');

const VALID_CHARS = new Set('ABCDEFGHJKLMNPQRSTUVWXYZ23456789');

function makeParticipant(overrides = {}) {
  return {
    id: 'p1',
    name: 'Alice',
    submitted: false,
    selfSelections: ['bold', 'calm'],
    peerSelections: { p2: ['kind'] },
    ...overrides,
  };
}

describe('createSession', () => {
  beforeEach(() => sessions.clear());

  test('returns session with correct initial shape', () => {
    const session = createSession('hashed-pin');
    assert.equal(session.phase, 'lobby');
    assert.equal(session.adminId, null);
    assert.equal(session.adminPinHash, 'hashed-pin');
    assert.equal(session.timerDuration, null);
    assert.equal(session.timerStartedAt, null);
    assert.equal(session._timerTimeout, null);
    assert(session._adminPinAttempts instanceof Map);
    assert.deepEqual(session.participants, []);
    assert.deepEqual(session.wordList, DEFAULT_WORD_LIST);
  });

  test('generates a 6-character ID using only unambiguous characters', () => {
    const session = createSession('hash');
    assert.equal(session.id.length, 6);
    for (const ch of session.id) {
      assert(VALID_CHARS.has(ch), `unexpected char: ${ch}`);
    }
    assert(!/[O0I1]/.test(session.id), 'ID must not contain ambiguous chars');
  });

  test('adds session to the sessions map', () => {
    const session = createSession('hash');
    assert(sessions.has(session.id));
    assert.equal(sessions.get(session.id), session);
  });

  test('stores an internal creation timestamp', () => {
    const before = Date.now();
    const session = createSession('hash');
    assert.ok(session._createdAt >= before);
  });

  test('generates unique IDs across multiple sessions', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createSession('hash').id));
    assert.equal(ids.size, 20);
  });

  test('errors when session capacity is reached', () => {
    for (let i = 0; i < MAX_SESSIONS; i += 1) {
      createSession('hash');
    }

    assert.throws(() => createSession('hash'), /Session capacity reached/);
  });
});

describe('pruneExpiredSessions', () => {
  beforeEach(() => sessions.clear());

  test('removes sessions older than the TTL', () => {
    const expired = createSession('hash');
    const current = createSession('hash');
    expired._createdAt = Date.now() - SESSION_TTL_MS;

    pruneExpiredSessions(Date.now());

    assert(!sessions.has(expired.id));
    assert(sessions.has(current.id));
  });
});

describe('removeParticipant', () => {
  beforeEach(() => sessions.clear());

  test('removes the participant from the session', () => {
    const session = createSession('hash');
    session.participants.push(
      makeParticipant({ id: 'p1', name: 'Alice' }),
      makeParticipant({ id: 'p2', name: 'Bob' }),
    );

    removeParticipant(session, 'p1');

    assert.deepEqual(session.participants.map(p => p.id), ['p2']);
  });

  test('clears adminId when the admin leaves', () => {
    const session = createSession('hash');
    session.adminId = 'admin-id';
    session.participants.push(
      makeParticipant({ id: 'admin-id', name: 'Admin' }),
      makeParticipant({ id: 'p2', name: 'Bob' }),
    );

    removeParticipant(session, 'admin-id');

    assert.equal(session.adminId, null);
  });

  test('keeps adminId when a non-admin leaves', () => {
    const session = createSession('hash');
    session.adminId = 'admin-id';
    session.participants.push(
      makeParticipant({ id: 'admin-id', name: 'Admin' }),
      makeParticipant({ id: 'p2', name: 'Bob' }),
    );

    removeParticipant(session, 'p2');

    assert.equal(session.adminId, 'admin-id');
  });
});

describe('sanitize', () => {
  beforeEach(() => sessions.clear());

  test('always strips adminPinHash', () => {
    const session = createSession('super-secret');
    const result = sanitize(session);
    assert(!('adminPinHash' in result));
  });

  test('always strips _timerTimeout', () => {
    const session = createSession('hash');
    session._timerTimeout = setTimeout(() => {}, 60000);
    const result = sanitize(session);
    assert(!('_timerTimeout' in result));
    clearTimeout(session._timerTimeout);
  });

  test('always strips _createdAt', () => {
    const session = createSession('hash');
    const result = sanitize(session);
    assert(!('_createdAt' in result));
  });

  test('always strips _adminPinAttempts', () => {
    const session = createSession('hash');
    session._adminPinAttempts.set('p1', { count: MAX_ADMIN_PIN_ATTEMPTS });
    const result = sanitize(session);
    assert(!('_adminPinAttempts' in result));
  });

  test('omits selfSelections and peerSelections in lobby phase', () => {
    const session = createSession('hash');
    session.participants.push(makeParticipant());
    const result = sanitize(session);
    const p = result.participants[0];
    assert(!('selfSelections' in p));
    assert(!('peerSelections' in p));
  });

  test('omits selfSelections and peerSelections in select phase', () => {
    const session = createSession('hash');
    session.phase = 'select';
    session.participants.push(makeParticipant({ submitted: true }));
    const result = sanitize(session);
    const p = result.participants[0];
    assert(!('selfSelections' in p));
    assert(!('peerSelections' in p));
  });

  test('includes selections in reveal phase', () => {
    const session = createSession('hash');
    session.phase = 'reveal';
    session.participants.push(makeParticipant());
    const result = sanitize(session);
    const p = result.participants[0];
    assert.deepEqual(p.selfSelections, ['bold', 'calm']);
    assert.deepEqual(p.peerSelections, { p2: ['kind'] });
  });

  test('preserves non-sensitive fields in all phases', () => {
    const session = createSession('hash');
    session.participants.push(makeParticipant());
    const result = sanitize(session);
    assert.equal(result.phase, 'lobby');
    assert.equal(result.participants[0].id, 'p1');
    assert.equal(result.participants[0].name, 'Alice');
    assert.equal(result.participants[0].submitted, false);
  });
});
