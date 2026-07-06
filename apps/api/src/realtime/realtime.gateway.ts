import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from './realtime.service';

interface SocketUser {
  id: string;
  displayName: string;
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger('Realtime');
  // userId -> number of open sockets, so presence flips OFFLINE only when the
  // last tab closes.
  private readonly connections = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.setServer(server);
  }

  async handleConnection(socket: Socket) {
    try {
      const token = parseCookie(socket.handshake.headers.cookie, 'iwm_access');
      if (!token) throw new Error('missing token');
      const payload = this.jwt.verify<{ sub: string; sid: string }>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      const session = await this.prisma.session.findUnique({ where: { id: payload.sid } });
      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw new Error('session invalid');
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { profile: true },
      });
      if (!user || user.status !== 'ACTIVE') throw new Error('account disabled');

      const su: SocketUser = {
        id: user.id,
        displayName: user.profile?.displayName ?? user.username,
      };
      socket.data.user = su;
      await socket.join(`user:${su.id}`);

      const count = (this.connections.get(su.id) ?? 0) + 1;
      this.connections.set(su.id, count);
      if (count === 1) await this.setPresence(su.id, 'ONLINE');
    } catch (err) {
      this.logger.warn(`socket rejected: ${(err as Error).message}`);
      socket.emit('error', { message: 'Unauthorized' });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket) {
    const su: SocketUser | undefined = socket.data.user;
    if (!su) return;
    const count = (this.connections.get(su.id) ?? 1) - 1;
    if (count <= 0) {
      this.connections.delete(su.id);
      await this.setPresence(su.id, 'OFFLINE');
    } else {
      this.connections.set(su.id, count);
    }
  }

  private async setPresence(userId: string, presence: 'ONLINE' | 'OFFLINE') {
    await this.prisma.userProfile
      .update({ where: { userId }, data: { presence } })
      .catch(() => undefined);
    if (presence === 'OFFLINE') {
      await this.prisma.user
        .update({ where: { id: userId }, data: { lastActiveAt: new Date() } })
        .catch(() => undefined);
    }
    this.server.emit('presence.update', { userId, presence });
  }

  @SubscribeMessage('conversation.join')
  async onJoin(socket: Socket, body: { conversationId: string }) {
    const su: SocketUser | undefined = socket.data.user;
    if (!su || !body?.conversationId) return { ok: false };
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId: body.conversationId, userId: su.id },
      },
    });
    if (!member) return { ok: false, error: 'Not a member' };
    await socket.join(`conv:${body.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('conversation.leave')
  async onLeave(socket: Socket, body: { conversationId: string }) {
    if (body?.conversationId) await socket.leave(`conv:${body.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('typing.start')
  onTypingStart(socket: Socket, body: { conversationId: string }) {
    this.relayTyping(socket, body?.conversationId, true);
  }

  @SubscribeMessage('typing.stop')
  onTypingStop(socket: Socket, body: { conversationId: string }) {
    this.relayTyping(socket, body?.conversationId, false);
  }

  private relayTyping(socket: Socket, conversationId: string | undefined, typing: boolean) {
    const su: SocketUser | undefined = socket.data.user;
    if (!su || !conversationId) return;
    // Only relay for rooms the socket actually joined (membership was checked then).
    if (!socket.rooms.has(`conv:${conversationId}`)) return;
    socket.to(`conv:${conversationId}`).emit(typing ? 'typing.start' : 'typing.stop', {
      conversationId,
      userId: su.id,
      displayName: su.displayName,
    });
  }
}
