'use client';

import { io, Socket } from 'socket.io-client';
import { forceLogin } from '@/lib/api';

// One shared socket for the whole app; cookies carry auth on the handshake.
let socket: Socket | null = null;
let authRetried = false;

// Conversation rooms this client wants to be in. Socket.IO rooms live on the
// server per-connection and are wiped on every reconnect (network blip, laptop
// sleep, idle-timeout drop, server redeploy). The gateway re-joins user:/session:
// rooms on connect, but conv: rooms are joined on demand — so we track them here
// and re-emit the joins whenever the socket (re)connects. Without this, a user
// sitting in a chat silently stops receiving message.new after any reconnect and
// new messages only appear on the next refetch.
const joinedConversations = new Set<string>();

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
      // Restore conversation-room memberships lost with the previous connection.
      for (const conversationId of joinedConversations) {
        socket?.emit('conversation.join', { conversationId });
      }
    });
  }
  return socket;
}

// Join a conversation room and remember it, so it survives reconnects. Use this
// instead of emitting 'conversation.join' directly.
export function joinConversation(conversationId: string) {
  joinedConversations.add(conversationId);
  getSocket().emit('conversation.join', { conversationId });
}

// Leave a conversation room and stop restoring it on reconnect.
export function leaveConversation(conversationId: string) {
  joinedConversations.delete(conversationId);
  getSocket().emit('conversation.leave', { conversationId });
}
