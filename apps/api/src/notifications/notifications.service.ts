import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
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
