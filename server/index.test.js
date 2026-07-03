'use strict';
const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { server } = require('./index');
const { sessions } = require('./sessions');

let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

beforeEach(() => sessions.clear());

after(async () => {
  sessions.clear();
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

test('POST /api/sessions hashes the trimmed admin PIN before storing it', async () => {
  const adminPin = 'correct horse battery staple';
  const response = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ adminPin: `  ${adminPin}  ` }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['sessionId']);

  const session = sessions.get(body.sessionId);
  assert.ok(session);
  assert.notEqual(session.adminPinHash, adminPin);
  assert.equal(await bcrypt.compare(adminPin, session.adminPinHash), true);
});
