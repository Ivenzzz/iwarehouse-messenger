import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
  ) {}

  // Creates + pushes a notification unless the user muted that conversation.
  async notify(
    userId: string,
    kind: string,
    title: string,
    body: string | null,
    data: { conversationId?: string; messageId?: string } = {},
  ) {
    if (data.conversationId) {
      const member = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: { conversationId: data.conversationId, userId },
        },
      });
      if (member?.mutedUntil && member.mutedUntil > new Date()) return;
    }
    const notification = await this.prisma.notification.create({
      data: { userId, kind, title, body, data: data as Prisma.InputJsonValue },
    });
    this.realtime.emitToUser(userId, 'notification.new', {
      id: notification.id,
      kind,
      title,
      body,
      data,
      createdAt: notification.createdAt,
    });
    // Deliver to phones/desktops even when the tab is closed. Never await
    // into the request path.
    void this.push.sendToUser(userId, {
      title,
      body,
      tag: kind,
      url: data.conversationId ? `/chats?c=${data.conversationId}` : '/chats',
    });
  }

  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
