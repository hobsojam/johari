'use strict';
const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { sessions, createSession, removeParticipant, sanitize, DEFAULT_WORD_LIST } = require('./sessions');

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

  test('generates unique IDs across multiple sessions', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createSession('hash').id));
    assert.equal(ids.size, 20);
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
