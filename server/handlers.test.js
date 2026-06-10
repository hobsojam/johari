'use strict';
const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { MAX_ADMIN_PIN_ATTEMPTS, MAX_PARTICIPANTS, MAX_WORDS, sessions, createSession } = require('./sessions');
const { handleMessage } = require('./handlers');

const PIN = 'test-pin';
// 1 bcrypt round — fast for tests, still exercises the real compare path
const PIN_HASH = bcrypt.hashSync(PIN, 1);

function makeWs(overrides = {}) {
  const messages = [];
  return {
    readyState: 1,
    participantId: null,
    sessionId: null,
    send(data) { messages.push(JSON.parse(data)); },
    messages,
    last() { return messages.at(-1); },
    ...overrides,
  };
}

function makeWss(...clients) {
  return { clients: new Set(clients) };
}

function attachParticipant(session, ws, { id = 'p-test', name = 'Tester' } = {}) {
  session.participants.push({ id, name, submitted: false, selfSelections: [], peerSelections: {} });
  ws.participantId = id;
  ws.sessionId = session.id;
  return id;
}

function setupSession() {
  sessions.clear();
  const session = createSession(PIN_HASH);
  const ws = makeWs();
  const wss = makeWss(ws);
  attachParticipant(session, ws);
  return { session, ws, wss };
}

function setupAdminSession() {
  const result = setupSession();
  result.session.adminId = result.ws.participantId;
  return result;
}

describe('handleMessage dispatcher', () => {
  beforeEach(() => sessions.clear());

  test('errors on null message', async () => {
    const ws = makeWs();
    await handleMessage(ws, null, makeWss(ws));
    assert.equal(ws.last().type, 'error');
  });

  test('errors when type is not a string', async () => {
    const ws = makeWs();
    await handleMessage(ws, { type: 42 }, makeWss(ws));
    assert.equal(ws.last().type, 'error');
  });

  test('errors on unknown message type', async () => {
    const ws = makeWs();
    await handleMessage(ws, { type: 'launch_missiles' }, makeWss(ws));
    assert.equal(ws.last().type, 'error');
  });
});

describe('handleJoin', () => {
  beforeEach(() => sessions.clear());

  test('errors if sessionId is missing', async () => {
    const ws = makeWs();
    await handleMessage(ws, { type: 'join', name: 'Alice' }, makeWss(ws));
    assert.equal(ws.last().type, 'error');
  });

  test('errors if session does not exist', async () => {
    const ws = makeWs();
    await handleMessage(ws, { type: 'join', sessionId: 'ZZZZZZ', name: 'Alice' }, makeWss(ws));
    assert.equal(ws.last().type, 'error');
  });

  test('errors if name is empty', async () => {
    const session = createSession(PIN_HASH);
    const ws = makeWs();
    await handleMessage(ws, { type: 'join', sessionId: session.id, name: '   ' }, makeWss(ws));
    assert.equal(ws.last().type, 'error');
  });

  test('errors if name exceeds 200 chars', async () => {
    const session = createSession(PIN_HASH);
    const ws = makeWs();
    await handleMessage(ws, { type: 'join', sessionId: session.id, name: 'A'.repeat(201) }, makeWss(ws));
    assert.equal(ws.last().type, 'error');
  });

  test('errors on duplicate name (case-insensitive)', async () => {
    const session = createSession(PIN_HASH);
    session.participants.push({ id: 'p1', name: 'Alice', submitted: false, selfSelections: [], peerSelections: {} });
    const ws = makeWs();
    await handleMessage(ws, { type: 'join', sessionId: session.id, name: 'ALICE' }, makeWss(ws));
    assert.equal(ws.last().type, 'error');
  });

  test('errors if the session is full', async () => {
    const session = createSession(PIN_HASH);
    for (let i = 0; i < MAX_PARTICIPANTS; i += 1) {
      session.participants.push({
        id: `p${i}`,
        name: `Participant ${i}`,
        submitted: false,
        selfSelections: [],
        peerSelections: {},
      });
    }
    const ws = makeWs();

    await handleMessage(ws, { type: 'join', sessionId: session.id, name: 'Latecomer' }, makeWss(ws));

    assert.equal(ws.last().type, 'error');
    assert.match(ws.last().message, /Session is full/);
  });

  test('errors if ws is already in a session', async () => {
    const session = createSession(PIN_HASH);
    const ws = makeWs({ participantId: 'existing' });
    await handleMessage(ws, { type: 'join', sessionId: session.id, name: 'Bob' }, makeWss(ws));
    assert.equal(ws.last().type, 'error');
  });

  test('sends joined then state on valid join', async () => {
    const session = createSession(PIN_HASH);
    const ws = makeWs();
    await handleMessage(ws, { type: 'join', sessionId: session.id, name: 'Alice' }, makeWss(ws));
    assert.equal(ws.messages[0].type, 'joined');
    assert.ok(ws.messages[0].participantId, 'participantId should be set');
    assert.equal(ws.messages[1].type, 'state');
  });

  test('trims the name before storing', async () => {
    const session = createSession(PIN_HASH);
    const ws = makeWs();
    await handleMessage(ws, { type: 'join', sessionId: session.id, name: '  Alice  ' }, makeWss(ws));
    assert.equal(session.participants[0].name, 'Alice');
  });

  test('sets participantId and sessionId on ws', async () => {
    const session = createSession(PIN_HASH);
    const ws = makeWs();
    await handleMessage(ws, { type: 'join', sessionId: session.id, name: 'Alice' }, makeWss(ws));
    assert.ok(ws.participantId);
    assert.equal(ws.sessionId, session.id);
  });
});

describe('handleClaimAdmin', () => {
  let session, ws, wss;

  beforeEach(() => { ({ session, ws, wss } = setupSession()); });

  test('errors if not yet joined', async () => {
    const stranger = makeWs();
    await handleMessage(stranger, { type: 'claim_admin', pin: PIN }, makeWss(stranger));
    assert.equal(stranger.last().type, 'error');
  });

  test('errors on wrong pin', async () => {
    await handleMessage(ws, { type: 'claim_admin', pin: 'wrong' }, wss);
    assert.equal(ws.last().type, 'error');
    assert.equal(session.adminId, null);
  });

  test('rate limits repeated wrong pin attempts', async () => {
    for (let i = 0; i < MAX_ADMIN_PIN_ATTEMPTS; i += 1) {
      await handleMessage(ws, { type: 'claim_admin', pin: 'wrong' }, wss);
      assert.equal(ws.last().message, 'Incorrect PIN');
    }

    await handleMessage(ws, { type: 'claim_admin', pin: PIN }, wss);

    assert.equal(ws.last().type, 'error');
    assert.match(ws.last().message, /Too many incorrect PIN attempts/);
    assert.equal(session.adminId, null);
  });

  test('errors if admin is already claimed', async () => {
    session.adminId = 'someone-else';
    await handleMessage(ws, { type: 'claim_admin', pin: PIN }, wss);
    assert.equal(ws.last().type, 'error');
  });

  test('errors if pin is not a string', async () => {
    await handleMessage(ws, { type: 'claim_admin', pin: 1234 }, wss);
    assert.equal(ws.last().type, 'error');
  });

  test('sets adminId and broadcasts on valid pin', async () => {
    await handleMessage(ws, { type: 'claim_admin', pin: PIN }, wss);
    assert.equal(session.adminId, ws.participantId);
    assert.equal(ws.last().type, 'state');
  });
});

describe('handleConfigure', () => {
  let session, ws, wss;

  beforeEach(() => { ({ session, ws, wss } = setupAdminSession()); });

  test('errors if not admin', async () => {
    session.adminId = 'someone-else';
    await handleMessage(ws, { type: 'configure', wordList: ['a', 'b'], timerDuration: null }, wss);
    assert.equal(ws.last().type, 'error');
  });

  test('errors if not in lobby phase', async () => {
    session.phase = 'select';
    await handleMessage(ws, { type: 'configure', wordList: ['a', 'b'], timerDuration: null }, wss);
    assert.equal(ws.last().type, 'error');
  });

  test('errors if wordList has fewer than 2 entries', async () => {
    await handleMessage(ws, { type: 'configure', wordList: ['only-one'], timerDuration: null }, wss);
    assert.equal(ws.last().type, 'error');
  });

  test('errors if wordList exceeds the maximum size', async () => {
    await handleMessage(ws, {
      type: 'configure',
      wordList: Array.from({ length: MAX_WORDS + 1 }, (_, i) => `word-${i}`),
      timerDuration: null,
    }, wss);
    assert.equal(ws.last().type, 'error');
  });

  test('errors if a word exceeds 200 chars', async () => {
    await handleMessage(ws, { type: 'configure', wordList: ['ok', 'X'.repeat(201)], timerDuration: null }, wss);
    assert.equal(ws.last().type, 'error');
  });

  test('errors if timerDuration is below 60', async () => {
    await handleMessage(ws, { type: 'configure', wordList: ['a', 'b'], timerDuration: 30 }, wss);
    assert.equal(ws.last().type, 'error');
  });

  test('errors if timerDuration exceeds 3600', async () => {
    await handleMessage(ws, { type: 'configure', wordList: ['a', 'b'], timerDuration: 3601 }, wss);
    assert.equal(ws.last().type, 'error');
  });

  test('accepts null timerDuration', async () => {
    await handleMessage(ws, { type: 'configure', wordList: ['brave', 'calm'], timerDuration: null }, wss);
    assert.equal(ws.last().type, 'state');
    assert.equal(session.timerDuration, null);
  });

  test('trims words and updates session on valid configure', async () => {
    await handleMessage(ws, { type: 'configure', wordList: [' brave ', ' calm '], timerDuration: 300 }, wss);
    assert.deepEqual(session.wordList, ['brave', 'calm']);
    assert.equal(session.timerDuration, 300);
    assert.equal(ws.last().type, 'state');
  });
});

describe('handleSubmitSelections', () => {
  let session, ws, wss, peer;

  beforeEach(() => {
    sessions.clear();
    session = createSession(PIN_HASH);
    session.phase = 'select';
    ws = makeWs();
    wss = makeWss(ws);
    attachParticipant(session, ws, { id: 'submitter', name: 'Alice' });
    peer = { id: 'peer-id', name: 'Bob', submitted: false, selfSelections: [], peerSelections: {} };
    session.participants.push(peer);
  });

  test('errors if not in select phase', async () => {
    session.phase = 'lobby';
    await handleMessage(ws, { type: 'submit_selections', selfSelections: [], peerSelections: {} }, wss);
    assert.equal(ws.last().type, 'error');
  });

  test('errors if already submitted', async () => {
    session.participants[0].submitted = true;
    await handleMessage(ws, { type: 'submit_selections', selfSelections: [], peerSelections: {} }, wss);
    assert.equal(ws.last().type, 'error');
  });

  const invalidPayloads = [
    { description: 'selfSelections contains a word not in wordList',        payload: { selfSelections: ['not-a-real-word'], peerSelections: { 'peer-id': ['calm'] } } },
    { description: 'peerSelections references an unknown participant',      payload: { selfSelections: ['calm'], peerSelections: { 'ghost-id': ['bold'] } } },
    { description: 'peerSelections contains a word not in wordList',        payload: { selfSelections: ['calm'], peerSelections: { 'peer-id': ['not-a-real-word'] } } },
    { description: 'participant tries to submit selections for themselves', payload: { selfSelections: ['calm'], peerSelections: { 'submitter': ['bold'] } } },
    { description: 'selfSelections contains duplicates',                    payload: { selfSelections: ['calm', 'calm'], peerSelections: { 'peer-id': ['bold'] } } },
    { description: 'peerSelections contains duplicates',                    payload: { selfSelections: ['calm'], peerSelections: { 'peer-id': ['bold', 'bold'] } } },
  ];
  for (const { description, payload } of invalidPayloads) {
    test(`errors if ${description}`, async () => {
      await handleMessage(ws, { type: 'submit_selections', ...payload }, wss);
      assert.equal(ws.last().type, 'error');
    });
  }

  test('marks participant submitted and stores selections on valid submit', async () => {
    await handleMessage(ws, {
      type: 'submit_selections',
      selfSelections: ['calm'],
      peerSelections: { 'peer-id': ['bold'] },
    }, wss);
    const p = session.participants[0];
    assert.equal(p.submitted, true);
    assert.deepEqual(p.selfSelections, ['calm']);
    assert.deepEqual(p.peerSelections, { 'peer-id': ['bold'] });
    assert.equal(ws.last().type, 'state');
  });
});

describe('handleAdvancePhase', () => {
  let session, ws, wss;

  beforeEach(() => { ({ session, ws, wss } = setupAdminSession()); });

  test('errors if not admin', async () => {
    session.adminId = 'someone-else';
    await handleMessage(ws, { type: 'advance_phase' }, wss);
    assert.equal(ws.last().type, 'error');
  });

  test('advances lobby → select', async () => {
    await handleMessage(ws, { type: 'advance_phase' }, wss);
    assert.equal(session.phase, 'select');
    assert.equal(ws.last().type, 'state');
  });

  test('advances select → reveal', async () => {
    session.phase = 'select';
    await handleMessage(ws, { type: 'advance_phase' }, wss);
    assert.equal(session.phase, 'reveal');
    assert.equal(ws.last().type, 'state');
  });

  test('errors if already in reveal phase', async () => {
    session.phase = 'reveal';
    await handleMessage(ws, { type: 'advance_phase' }, wss);
    assert.equal(ws.last().type, 'error');
  });

  test('sets timerStartedAt when timerDuration is configured', async () => {
    session.timerDuration = 300;
    const before = Date.now();
    await handleMessage(ws, { type: 'advance_phase' }, wss);
    assert.ok(session.timerStartedAt >= before);
    assert.ok(session._timerTimeout, 'timer handle should be set');
    clearTimeout(session._timerTimeout);
  });

  test('clears timer handle when advancing select → reveal', async () => {
    session.phase = 'select';
    session._timerTimeout = setTimeout(() => {}, 60000);
    await handleMessage(ws, { type: 'advance_phase' }, wss);
    assert.equal(session._timerTimeout, null);
    assert.equal(session.timerStartedAt, null);
  });
});

describe('handleReset', () => {
  let session, ws, wss;

  beforeEach(() => {
    sessions.clear();
    session = createSession(PIN_HASH);
    session.phase = 'reveal';
    ws = makeWs();
    wss = makeWss(ws);
    attachParticipant(session, ws, { id: 'admin-id', name: 'Admin' });
    session.adminId = 'admin-id';
    const peer = { id: 'peer-id', name: 'Bob', submitted: true, selfSelections: ['calm'], peerSelections: { 'admin-id': ['bold'] } };
    session.participants.push(peer);
  });

  test('errors if not admin', async () => {
    session.adminId = 'someone-else';
    await handleMessage(ws, { type: 'reset' }, wss);
    assert.equal(ws.last().type, 'error');
  });

  test('resets phase to lobby', async () => {
    await handleMessage(ws, { type: 'reset' }, wss);
    assert.equal(session.phase, 'lobby');
  });

  test('clears all participant selections and submitted flags', async () => {
    await handleMessage(ws, { type: 'reset' }, wss);
    for (const p of session.participants) {
      assert.equal(p.submitted, false);
      assert.deepEqual(p.selfSelections, []);
      assert.deepEqual(p.peerSelections, {});
    }
  });

  test('clears timer handle if one is running', async () => {
    session._timerTimeout = setTimeout(() => {}, 60000);
    await handleMessage(ws, { type: 'reset' }, wss);
    assert.equal(session._timerTimeout, null);
    assert.equal(session.timerStartedAt, null);
  });

  test('broadcasts updated state after reset', async () => {
    await handleMessage(ws, { type: 'reset' }, wss);
    assert.equal(ws.last().type, 'state');
    assert.equal(ws.last().phase, 'lobby');
  });
});
