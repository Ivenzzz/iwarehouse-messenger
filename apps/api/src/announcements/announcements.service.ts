import { BadRequestException, Injectable } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { ConversationsService } from '../conversations/conversations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

// Targeted announcements: post once, reach exactly the right people.
// Audience → durable scoped ANNOUNCEMENT channels, one per scope:
// - company-wide: type ANNOUNCEMENT, branchId & departmentId both null
// - per-branch:   type ANNOUNCEMENT, branchId set
// - per-department: type ANNOUNCEMENT, departmentId set
// Posting syncs membership (every matching ACTIVE employee is added as
// READ_ONLY, so nobody is missed and new hires get picked up on the next
// post), then sends through the normal message pipeline so read tracking,
// "Seen by N" acknowledgements, unread badges, and realtime all just work.

export interface AnnouncementAudience {
  everyone?: boolean;
  branchIds?: string[];
  departmentIds?: string[];
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  async post(
    actor: { id: string; role: string },
    input: { content: string; audience: AnnouncementAudience },
  ) {
    const scopes = await this.resolveScopes(input.audience);
    if (scopes.length === 0) {
      throw new BadRequestException('Pick an audience: everyone, branches, or departments');
    }

    const posted: { conversationId: string; title: string; recipients: number }[] = [];
    for (const scope of scopes) {
      const conversationId = await this.ensureChannel(actor.id, scope);
      const recipients = await this.syncMembers(conversationId, actor.id, scope);
      const message = await this.conversations.sendMessage(conversationId, actor.id, {
        content: input.content,
      });
      await this.notifyMembers(conversationId, actor.id, scope.title, input.content, message.id);
      posted.push({ conversationId, title: scope.title, recipients });
    }
    return { posted };
  }

  private async resolveScopes(audience: AnnouncementAudience) {
    const scopes: {
      title: string;
      branchId: string | null;
      departmentId: string | null;
    }[] = [];
    if (audience.everyone) {
      scopes.push({ title: 'Company Announcements', branchId: null, departmentId: null });
      return scopes; // everyone supersedes narrower picks
    }
    if (audience.branchIds?.length) {
      const branches = await this.prisma.branch.findMany({
        where: { id: { in: audience.branchIds } },
      });
      for (const b of branches) {
        scopes.push({ title: `Announcements — ${b.code}`, branchId: b.id, departmentId: null });
      }
    }
    if (audience.departmentIds?.length) {
      const departments = await this.prisma.department.findMany({
        where: { id: { in: audience.departmentIds } },
      });
      for (const d of departments) {
        scopes.push({ title: `Announcements — ${d.name}`, branchId: null, departmentId: d.id });
      }
    }
    return scopes;
  }

  private async ensureChannel(
    actorId: string,
    scope: { title: string; branchId: string | null; departmentId: string | null },
  ) {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: 'ANNOUNCEMENT',
        branchId: scope.branchId,
        departmentId: scope.departmentId,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing.id;
    const created = await this.prisma.conversation.create({
      data: {
        type: 'ANNOUNCEMENT',
        title: scope.title,
        branchId: scope.branchId,
        departmentId: scope.departmentId,
        createdBy: actorId,
        members: { create: { userId: actorId, role: 'OWNER' } },
      },
    });
    return created.id;
  }

  private async syncMembers(
    conversationId: string,
    actorId: string,
    scope: { branchId: string | null; departmentId: string | null },
  ) {
    const where: any = { deletedAt: null, status: 'ACTIVE' };
    if (scope.branchId) where.branchId = scope.branchId;
    if (scope.departmentId) where.departmentId = scope.departmentId;
    const targets = await this.prisma.user.findMany({ where, select: { id: true } });

    const existing = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true, role: true },
    });
    const existingIds = new Set(existing.map((m) => m.userId));
    const newcomers = targets.filter((u) => !existingIds.has(u.id) && u.id !== actorId);
    if (newcomers.length) {
      await this.prisma.conversationMember.createMany({
        data: newcomers.map((u) => ({
          conversationId,
          userId: u.id,
          role: 'READ_ONLY' as MemberRole,
        })),
        skipDuplicates: true,
      });
      this.realtime.emitToUsers(
        newcomers.map((u) => u.id),
        'conversation.updated',
        { conversationId },
      );
    }
    // The poster must be able to post in an ANNOUNCEMENT channel.
    await this.prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId, userId: actorId } },
      create: { conversationId, userId: actorId, role: 'ADMIN' },
      update: { role: existing.find((m) => m.userId === actorId)?.role === 'OWNER' ? 'OWNER' : 'ADMIN' },
    });
    return targets.length;
  }

  private async notifyMembers(
    conversationId: string,
    actorId: string,
    channelTitle: string,
    content: string,
    messageId: string,
  ) {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: actorId } },
      select: { userId: true, mutedUntil: true },
    });
    const now = new Date();
    const preview = content.length > 120 ? `${content.slice(0, 117)}…` : content;
    for (const m of members) {
      if (m.mutedUntil && m.mutedUntil > now) continue;
      await this.notifications.notify(m.userId, 'announcement', channelTitle, preview, {
        conversationId,
        messageId,
      } as any);
    }
  }
}
