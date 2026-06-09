import { writable } from 'svelte/store';

export const sessionState = writable(null);
export const wsError = writable(null);
export const myId = writable(null);
export const connected = writable(false);

let socket = null;

export function connect() {
  if (socket) socket.close();
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.onopen = () => {
    connected.set(true);
    wsError.set(null);
  };

  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.type === 'state') {
      const { type, ...state } = msg;
      sessionState.set(state);
    } else if (msg.type === 'joined') {
      myId.set(msg.participantId);
    } else if (msg.type === 'error') {
      wsError.set(msg.message);
    }
  };

  socket.onclose = () => {
    connected.set(false);
    socket = null;
  };
}

export function send(type, payload = {}) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, ...payload }));
  }
}

export function disconnect() {
  socket?.close();
  socket = null;
}
