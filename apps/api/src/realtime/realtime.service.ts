import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

// Thin holder around the Socket.IO server so other modules (e.g. conversations)
// can broadcast without importing the gateway and creating circular deps.
@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  emitToConversation(conversationId: string, event: string, payload: unknown) {
    this.server?.to(`conv:${conversationId}`).emit(event, payload);
  }

  // Kill live sockets the moment their session/user is revoked (audit F-1),
  // so deactivation and remote sign-out take effect instantly, not on the
  // next reconnect.
  disconnectSession(sessionId: string) {
    this.server?.in(`session:${sessionId}`).disconnectSockets(true);
  }

  disconnectUser(userId: string) {
    this.server?.in(`user:${userId}`).disconnectSockets(true);
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown) {
    for (const id of userIds) this.emitToUser(id, event, payload);
  }

  broadcast(event: string, payload: unknown) {
    this.server?.emit(event, payload);
  }
}
