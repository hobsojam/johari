import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/sessions', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessionId: 'ABC234' }),
    });
  });

  await page.addInitScript(() => {
    window.__wsInstances = [];
    window.__wsMessages = [];

    class MockWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor(url) {
        super();
        this.url = url;
        this.readyState = MockWebSocket.CONNECTING;
        window.__wsInstances.push(this);
        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.dispatchEvent(new Event('open'));
        }, 0);
      }

      send(raw) {
        const message = JSON.parse(raw);
        window.__wsMessages.push(message);
        window.__handleWsMessage?.(this, message);
      }

      close() {
        this.readyState = MockWebSocket.CLOSED;
        this.dispatchEvent(new Event('close'));
      }

      receive(message) {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
      }
    }

    window.WebSocket = MockWebSocket;
  });
});

test('clears stale session identity before a new join attempt', async ({ page }) => {
  await page.addInitScript(() => {
    let firstJoin = true;
    window.__handleWsMessage = (socket, message) => {
      if (message.type === 'join' && firstJoin) {
        firstJoin = false;
        socket.receive({ type: 'joined', participantId: 'alice-id' });
        socket.receive({
          type: 'state',
          id: message.sessionId,
          phase: 'lobby',
          adminId: null,
          wordList: ['bold', 'calm'],
          timerDuration: null,
          timerStartedAt: null,
          participants: [{ id: 'alice-id', name: message.name, submitted: false }],
        });
      } else if (message.type === 'join') {
        socket.receive({ type: 'error', message: 'Session not found' });
      } else if (message.type === 'claim_admin') {
        socket.receive({
          type: 'state',
          id: 'ABC234',
          phase: 'lobby',
          adminId: 'alice-id',
          wordList: ['bold', 'calm'],
          timerDuration: null,
          timerStartedAt: null,
          participants: [{ id: 'alice-id', name: 'Alice', submitted: false }],
        });
      }
    };
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'Facilitate' }).click();
  await page.locator('#create-name').fill('Alice');
  await page.locator('#admin-pin').fill('secret');
  await page.getByRole('button', { name: 'Create & join' }).click();

  await expect(page.getByText('Session code:')).toBeVisible();

  await page.evaluate(() => window.__wsInstances.at(-1).close());

  await expect(page.getByRole('button', { name: 'Join' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Session code' }).fill('BAD999');
  await page.locator('#join-name').fill('Bob');
  await page.getByRole('button', { name: 'Join' }).click();

  await expect(page.getByRole('alert')).toContainText('Session not found');
  await expect(page.getByText('Session code:')).toBeHidden();
});
