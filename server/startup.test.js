'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const STARTUP_TIMEOUT_MS = 15000;

test('server process starts and responds on /health', async () => {
  const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Server did not report listening within ${STARTUP_TIMEOUT_MS}ms.\nOutput:\n${output}`)),
        STARTUP_TIMEOUT_MS,
      );
      const onData = (chunk) => {
        output += chunk;
        const match = output.match(/running on :(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(Number(match[1]));
        }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', (code, signal) => {
        clearTimeout(timeout);
        reject(new Error(`Server exited before listening (code ${code}, signal ${signal}).\nOutput:\n${output}`));
      });
    });

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    child.kill();
  }
});
