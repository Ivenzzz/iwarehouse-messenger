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
