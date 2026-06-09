import { writable } from 'svelte/store';

export const sessionState = writable(null);
export const wsError = writable(null);
export const myId = writable(null);
export const connected = writable(false);

let socket = null;

export function connect() {
  if (socket) {
    socket.onmessage = socket.onclose = null;
    socket.close();
    socket = null;
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  socket = ws;

  ws.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.type === 'state') {
      const { type, ...state } = msg;
      sessionState.set(state);
    } else if (msg.type === 'joined') {
      myId.set(msg.participantId);
    } else if (msg.type === 'error') {
      wsError.set(msg.message);
    }
  });

  ws.addEventListener('close', () => {
    connected.set(false);
    if (socket === ws) socket = null;
  });

  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      connected.set(true);
      wsError.set(null);
      resolve();
    });
    ws.addEventListener('error', () => {
      reject(new Error('Could not connect to server'));
    });
  });
}

export function send(type, payload = {}) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, ...payload }));
  }
}

export function disconnect() {
  if (socket) {
    socket.onmessage = socket.onclose = null;
    socket.close();
    socket = null;
  }
  connected.set(false);
}
