'use client';

import { io, Socket } from 'socket.io-client';
import { forceLogin } from '@/lib/api';

// One shared socket for the whole app; cookies carry auth on the handshake.
let socket: Socket | null = null;
let authRetried = false;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    // The gateway emits { message: 'Unauthorized' } and disconnects when the
    // session behind the cookie is dead. Try one silent refresh; if that
    // fails, stop reconnect spam and send the user to sign in again.
    socket.on('error', async (payload: { message?: string }) => {
      if (payload?.message !== 'Unauthorized') return;
      if (!authRetried) {
        authRetried = true;
        const refreshed = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        }).catch(() => null);
        if (refreshed?.ok) {
          socket?.disconnect().connect();
          return;
        }
      }
      socket?.disconnect();
      forceLogin();
    });
    socket.on('connect', () => {
      authRetried = false;
    });
  }
  return socket;
}
