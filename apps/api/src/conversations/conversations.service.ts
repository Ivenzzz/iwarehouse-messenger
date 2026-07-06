import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConversationType, MemberRole, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

const messageInclude = {
  sender: { include: { profile: true } },
  replyTo: { include: { sender: { include: { profile: true } } } },
  attachments: true,
  reactions: { include: { user: { include: { profile: true } } } },
  pins: true,
  readReceipts: true,
} satisfies Prisma.MessageInclude;

type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── listing ────────────────────────────────────────────────────────────────

  async listForUser(userId: string) {
    const rows = await this.prisma.conversation.findMany({
      where: { isArchived: false, members: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
      include: {
        members: { include: { user: { include: { profile: true } } } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { include: { profile: true } } },
        },
      },
    });

    // Org tags for the sidebar (BranchCode · DEPT). Conversations store the
    // ids; resolve codes in one pass rather than adding FKs.
    const branchIds = [...new Set(rows.map((c) => c.branchId).filter(Boolean))] as string[];
    const deptIds = [...new Set(rows.map((c) => c.departmentId).filter(Boolean))] as string[];
    const [branches, departments, unreadMentions] = await Promise.all([
      branchIds.length
        ? this.prisma.branch.findMany({ where: { id: { in: branchIds } } })
        : Promise.resolve([]),
      deptIds.length
        ? this.prisma.department.findMany({ where: { id: { in: deptIds } } })
        : Promise.resolve([]),
      this.prisma.notification.findMany({
        where: { userId, kind: 'mention', readAt: null },
        select: { data: true },
      }),
    ]);
    const branchCode = new Map(branches.map((b) => [b.id, b.code]));
    const deptCode = new Map(departments.map((d) => [d.id, d.code]));
    const mentionConvos = new Set(
      unreadMentions
        .map((n) => (n.data as { conversationId?: string } | null)?.conversationId)
        .filter(Boolean),
    );

    return Promise.all(
      rows.map(async (c) => {
        const me = c.members.find((m) => m.userId === userId)!;
        const others = c.members.filter((m) => m.userId !== userId);
        const last = c.messages[0];
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: c.id,
            deletedAt: null,
            senderId: { not: userId },
            createdAt: { gt: me.lastReadAt ?? me.joinedAt },
          },
        });
        const other = c.type === 'DIRECT' ? others[0] : null;
        return {
          id: c.id,
          type: c.type,
          title:
            c.title ??
            others.map((m) => m.user.profile?.displayName ?? m.user.username).join(', '),
          description: c.description,
          icon: c.avatarKey,
          priority: c.priority,
          branchCode: c.branchId ? (branchCode.get(c.branchId) ?? null) : null,
          departmentCode: c.departmentId ? (deptCode.get(c.departmentId) ?? null) : null,
          memberCount: c.members.length,
          myRole: me.role,
          mutedUntil: me.mutedUntil && me.mutedUntil > new Date() ? me.mutedUntil : null,
          pinnedAt: me.pinnedAt,
          hasUnreadMention: mentionConvos.has(c.id),
          unreadCount,
          otherUser: other
            ? {
                id: other.userId,
                displayName: other.user.profile?.displayName ?? other.user.username,
                presence: other.user.profile?.presence ?? 'OFFLINE',
                avatarKey: other.user.profile?.avatarKey ?? null,
              }
            : null,
          lastMessage: last
            ? {
                content: last.deletedAt ? 'Message deleted' : last.content,
                senderName: last.sender?.profile?.displayName ?? 'System',
                createdAt: last.createdAt,
              }
            : null,
          updatedAt: c.updatedAt,
        };
      }),
    );
  }

  private async assertMember(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: { conversation: true },
    });
    if (!member) throw new ForbiddenException('You are not a member of this conversation');
    return member;
  }

  private serialize(m: MessageRow) {
    return {
      id: m.id,
      conversationId: m.conversationId,
      content: m.deletedAt ? 'Message deleted' : m.content,
      contentType: m.contentType,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
      deletedAt: m.deletedAt,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            content: m.replyTo.deletedAt ? 'Message deleted' : m.replyTo.content,
            senderName:
              m.replyTo.sender?.profile?.displayName ?? m.replyTo.sender?.username ?? 'System',
          }
        : null,
      sender: m.sender
        ? {
            id: m.sender.id,
            displayName: m.sender.profile?.displayName ?? m.sender.username,
            avatarKey: m.sender.profile?.avatarKey ?? null,
          }
        : null,
      attachments: m.deletedAt
        ? []
        : m.attachments.map((a) => ({
            id: a.id,
            originalName: a.originalName,
            mimeType: a.mimeType,
            sizeBytes: Number(a.sizeBytes),
          })),
      reactions: m.deletedAt
        ? []
        : m.reactions.map((r) => ({
            emoji: r.emoji,
            userId: r.userId,
            displayName: r.user.profile?.displayName ?? r.user.username,
          })),
      isPinned: m.pins.length > 0,
      ackCount: m.readReceipts.length,
      ackedBy: m.readReceipts.map((r) => r.userId),
    };
  }

  async messages(conversationId: string, userId: string, limit: number, cursor?: string) {
    await this.assertMember(conversationId, userId);
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: messageInclude,
    });
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    const saved = await this.prisma.savedMessage.findMany({
      where: { userId, messageId: { in: rows.map((m) => m.id) } },
      select: { messageId: true },
    });
    return {
      items: rows.map((m) => this.serialize(m)).reverse(),
      nextCursor: hasMore ? rows[rows.length - 1]?.id : null,
      savedIds: saved.map((s) => s.messageId),
    };
  }

  // ── creating conversations ────────────────────────────────────────────────

  async createDirect(userId: string, otherUserId: string) {
    if (userId === otherUserId) throw new BadRequestException('Pick another person');
    const other = await this.prisma.user.findFirst({
      where: { id: otherUserId, deletedAt: null, status: 'ACTIVE' },
    });
    if (!other) throw new NotFoundException('User not found');

    // Reuse an existing DM between exactly these two people.
    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: otherUserId } } },
        ],
      },
    });
    if (existing) return { id: existing.id, existing: true };

    const convo = await this.prisma.conversation.create({
      data: {
        type: 'DIRECT',
        createdById: userId,
        members: {
          create: [{ userId }, { userId: otherUserId }],
        },
      },
    });
    this.realtime.emitToUsers([userId, otherUserId], 'conversation.updated', {
      conversationId: convo.id,
    });
    return { id: convo.id, existing: false };
  }

  async createGroup(
    userId: string,
    input: {
      title: string;
      description?: string;
      memberIds: string[];
      type?: ConversationType;
      icon?: string;
    },
  ) {
    const type = input.type ?? 'PRIVATE_GROUP';
    if (type === 'DIRECT') throw new BadRequestException('Use the direct-message endpoint');
    const memberIds = [...new Set(input.memberIds.filter((id) => id !== userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: memberIds }, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });

    const convo = await this.prisma.conversation.create({
      data: {
        type,
        title: input.title,
        description: input.description,
        avatarKey: input.icon,
        createdById: userId,
        members: {
          create: [
            { userId, role: 'OWNER' as MemberRole },
            ...users.map((u) => ({
              userId: u.id,
              role: (type === 'ANNOUNCEMENT' ? 'READ_ONLY' : 'MEMBER') as MemberRole,
            })),
          ],
        },
      },
    });
    await this.systemMessage(convo.id, 'Group created');
    this.realtime.emitToUsers([userId, ...users.map((u) => u.id)], 'conversation.updated', {
      conversationId: convo.id,
    });
    return { id: convo.id };
  }

  // ── messaging ──────────────────────────────────────────────────────────────

  private canPost(member: { role: MemberRole; conversation: { type: ConversationType } }) {
    if (member.role === 'READ_ONLY') return false;
    if (member.conversation.type === 'ANNOUNCEMENT') {
      return member.role === 'OWNER' || member.role === 'ADMIN';
    }
    return true;
  }

  async sendMessage(
    conversationId: string,
    userId: string,
    input: {
      content?: string;
      replyToMessageId?: string;
      attachmentIds?: string[];
      capture?: { capturedAt: string; lat?: number; lng?: number; accuracyM?: number };
    },
  ) {
    const member = await this.assertMember(conversationId, userId);
    if (!this.canPost(member)) {
      throw new ForbiddenException('You cannot post in this conversation');
    }
    const content = input.content?.trim() ?? '';
    const attachmentIds = [...new Set(input.attachmentIds ?? [])].slice(0, 10);
    if (!content && attachmentIds.length === 0) {
      throw new BadRequestException('Message is empty');
    }
    if (content.length > 8000) throw new BadRequestException('Message is too long');

    // Attachments must be this user's own completed uploads, not yet attached
    // to another message.
    const uploads = attachmentIds.length
      ? await this.prisma.upload.findMany({
          where: { id: { in: attachmentIds }, userId, status: 'COMPLETE' },
        })
      : [];
    if (uploads.length !== attachmentIds.length) {
      throw new BadRequestException('One of the attachments is not ready');
    }

    if (input.replyToMessageId) {
      const target = await this.prisma.message.findFirst({
        where: { id: input.replyToMessageId, conversationId },
      });
      if (!target) throw new BadRequestException('Replied message not found');
    }

    const contentType =
      uploads.length === 0
        ? 'TEXT'
        : uploads.every((u) => u.mimeType.startsWith('image/'))
          ? 'IMAGE'
          : uploads.every((u) => u.mimeType.startsWith('video/'))
            ? 'VIDEO'
            : uploads.every((u) => u.mimeType.startsWith('audio/'))
              ? 'AUDIO'
              : 'FILE';

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        content,
        contentType,
        replyToMessageId: input.replyToMessageId,
        deliveryStatus: 'SENT',
        metadata: input.capture
          ? ({ capture: input.capture } as Prisma.InputJsonValue)
          : undefined,
        attachments: {
          create: uploads.map((u) => ({
            storageKey: u.storageKey,
            originalName: u.originalName,
            mimeType: u.mimeType,
            sizeBytes: u.sizeBytes,
            sha256: u.sha256 ?? '',
            scanStatus: u.scanStatus,
            uploadedBy: userId,
          })),
        },
      },
      include: messageInclude,
    });
    if (uploads.length) {
      await this.prisma.upload.updateMany({
        where: { id: { in: attachmentIds } },
        data: { status: 'ATTACHED' },
      });
    }
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    // Sender's own read pointer moves with their message.
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });

    const payload = this.serialize(message);
    this.realtime.emitToConversation(conversationId, 'message.new', payload);
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      include: { user: { include: { profile: true } } },
    });
    await this.handleMentions(message.conversationId, message.id, userId, content, members);
    this.realtime.emitToUsers(
      members.map((m) => m.userId),
      'conversation.updated',
      { conversationId, senderId: userId, kind: 'message' },
    );
    return payload;
  }

  private async handleMentions(
    conversationId: string,
    messageId: string,
    senderId: string,
    content: string,
    members: { userId: string; user: { username: string; profile: { displayName: string } | null } }[],
  ) {
    const usernames = new Set(
      [...content.matchAll(/@([\w.\-]+)/g)].map((m) => m[1].toLowerCase()),
    );
    if (usernames.size === 0) return;
    const sender = members.find((m) => m.userId === senderId);
    const senderName = sender?.user.profile?.displayName ?? sender?.user.username ?? 'Someone';
    for (const member of members) {
      if (member.userId === senderId) continue;
      if (!usernames.has(member.user.username.toLowerCase())) continue;
      await this.notifications.notify(
        member.userId,
        'mention',
        `${senderName} mentioned you`,
        content.slice(0, 120),
        { conversationId, messageId },
      );
    }
  }

  async editMessage(messageId: string, userId: string, content: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }
    const trimmed = content?.trim();
    if (!trimmed) throw new BadRequestException('Message is empty');

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: trimmed, editedAt: new Date() },
      include: messageInclude,
    });
    const payload = this.serialize(updated);
    this.realtime.emitToConversation(message.conversationId, 'message.updated', payload);
    return payload;
  }

  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');

    if (message.senderId !== userId) {
      const member = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: { conversationId: message.conversationId, userId },
        },
      });
      const canModerate = member && (member.role === 'OWNER' || member.role === 'ADMIN');
      if (!canModerate) throw new ForbiddenException('You cannot delete this message');
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
    this.realtime.emitToConversation(message.conversationId, 'message.deleted', {
      id: messageId,
      conversationId: message.conversationId,
    });
    return { ok: true };
  }

  async markRead(conversationId: string, userId: string) {
    await this.assertMember(conversationId, userId);
    const at = new Date();
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: at },
    });
    this.realtime.emitToConversation(conversationId, 'receipt.read', {
      conversationId,
      userId,
      at,
    });
    return { ok: true };
  }

  async readState(conversationId: string, userId: string) {
    await this.assertMember(conversationId, userId);
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      include: { user: { include: { profile: true } } },
    });
    return members.map((m) => ({
      userId: m.userId,
      username: m.user.username,
      displayName: m.user.profile?.displayName ?? m.user.username,
      presence: m.user.profile?.presence ?? 'OFFLINE',
      avatarKey: m.user.profile?.avatarKey ?? null,
      role: m.role,
      lastReadAt: m.lastReadAt,
    }));
  }

  async sharedFiles(conversationId: string, userId: string, kind: 'media' | 'files') {
    await this.assertMember(conversationId, userId);
    const mediaFilter = [{ mimeType: { startsWith: 'image/' } }, { mimeType: { startsWith: 'video/' } }];
    const rows = await this.prisma.messageAttachment.findMany({
      where: {
        message: { conversationId, deletedAt: null },
        ...(kind === 'media' ? { OR: mediaFilter } : { NOT: { OR: mediaFilter } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { message: { include: { sender: { include: { profile: true } } } } },
    });
    return rows.map((a) => ({
      id: a.id,
      originalName: a.originalName,
      mimeType: a.mimeType,
      sizeBytes: Number(a.sizeBytes),
      createdAt: a.createdAt,
      senderName:
        a.message.sender?.profile?.displayName ?? a.message.sender?.username ?? 'System',
    }));
  }

  async updateConversation(
    conversationId: string,
    userId: string,
    input: {
      title?: string;
      description?: string;
      icon?: string | null;
      priority?: string | null;
    },
  ) {
    const member = await this.assertMember(conversationId, userId);
    if (member.conversation.type === 'DIRECT') {
      throw new BadRequestException('Direct messages cannot be customized');
    }
    if (member.role !== 'OWNER' && member.role !== 'ADMIN') {
      throw new ForbiddenException('Only group admins can edit this conversation');
    }
    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.icon !== undefined ? { avatarKey: input.icon } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      },
    });
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    this.realtime.emitToUsers(
      members.map((m) => m.userId),
      'conversation.updated',
      { conversationId },
    );
    return { id: updated.id, title: updated.title, icon: updated.avatarKey };
  }

  // ── reactions ──────────────────────────────────────────────────────────────

  private async messageForMember(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    await this.assertMember(message.conversationId, userId);
    return message;
  }

  async addReaction(messageId: string, userId: string, emoji: string) {
    const clean = emoji.trim().slice(0, 16);
    if (!clean) throw new BadRequestException('Missing emoji');
    const message = await this.messageForMember(messageId, userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    await this.prisma.messageReaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji: clean } },
      create: { messageId, userId, emoji: clean },
      update: {},
    });
    this.realtime.emitToConversation(message.conversationId, 'reaction.add', {
      messageId,
      conversationId: message.conversationId,
      emoji: clean,
      userId,
      displayName: user?.profile?.displayName ?? user?.username ?? '',
    });
    return { ok: true };
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    const message = await this.messageForMember(messageId, userId);
    await this.prisma.messageReaction
      .delete({
        where: { messageId_userId_emoji: { messageId, userId, emoji } },
      })
      .catch(() => undefined);
    this.realtime.emitToConversation(message.conversationId, 'reaction.remove', {
      messageId,
      conversationId: message.conversationId,
      emoji,
      userId,
    });
    return { ok: true };
  }

  // ── pins ───────────────────────────────────────────────────────────────────

  private async assertCanPin(conversationId: string, userId: string) {
    const member = await this.assertMember(conversationId, userId);
    const isDm = member.conversation.type === 'DIRECT';
    if (!isDm && member.role !== 'OWNER' && member.role !== 'ADMIN') {
      throw new ForbiddenException('Only group admins can pin messages');
    }
    return member;
  }

  async pinMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    await this.assertCanPin(message.conversationId, userId);
    await this.prisma.pinnedMessage.upsert({
      where: {
        conversationId_messageId: { conversationId: message.conversationId, messageId },
      },
      create: { conversationId: message.conversationId, messageId, pinnedById: userId },
      update: {},
    });
    this.realtime.emitToConversation(message.conversationId, 'message.pinned', {
      messageId,
      conversationId: message.conversationId,
      pinned: true,
    });
    return { ok: true };
  }

  async unpinMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    await this.assertCanPin(message.conversationId, userId);
    await this.prisma.pinnedMessage
      .delete({
        where: {
          conversationId_messageId: { conversationId: message.conversationId, messageId },
        },
      })
      .catch(() => undefined);
    this.realtime.emitToConversation(message.conversationId, 'message.pinned', {
      messageId,
      conversationId: message.conversationId,
      pinned: false,
    });
    return { ok: true };
  }

  async pinnedMessages(conversationId: string, userId: string) {
    await this.assertMember(conversationId, userId);
    const pins = await this.prisma.pinnedMessage.findMany({
      where: { conversationId },
      orderBy: { pinnedAt: 'desc' },
      include: { message: { include: messageInclude } },
    });
    return pins
      .filter((p) => !p.message.deletedAt)
      .map((p) => this.serialize(p.message));
  }

  // ── saved messages ─────────────────────────────────────────────────────────

  async saveMessage(messageId: string, userId: string) {
    await this.messageForMember(messageId, userId);
    await this.prisma.savedMessage.upsert({
      where: { userId_messageId: { userId, messageId } },
      create: { userId, messageId },
      update: {},
    });
    return { ok: true };
  }

  async unsaveMessage(messageId: string, userId: string) {
    await this.prisma.savedMessage
      .delete({ where: { userId_messageId: { userId, messageId } } })
      .catch(() => undefined);
    return { ok: true };
  }

  async savedMessages(userId: string) {
    const rows = await this.prisma.savedMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        message: { include: { ...messageInclude, conversation: true } },
      },
    });
    return rows
      .filter((r) => !r.message.deletedAt)
      .map((r) => ({
        ...this.serialize(r.message as any),
        conversationTitle: r.message.conversation.title ?? 'Direct message',
        savedAt: r.createdAt,
      }));
  }

  // ── announcement acknowledgement ───────────────────────────────────────────

  async acknowledge(messageId: string, userId: string) {
    const message = await this.messageForMember(messageId, userId);
    await this.prisma.readReceipt.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId },
      update: {},
    });
    this.realtime.emitToConversation(message.conversationId, 'message.acked', {
      messageId,
      conversationId: message.conversationId,
      userId,
    });
    return { ok: true };
  }

  async acknowledgements(messageId: string, userId: string) {
    await this.messageForMember(messageId, userId);
    const receipts = await this.prisma.readReceipt.findMany({
      where: { messageId },
      include: { user: { include: { profile: true } } },
      orderBy: { readAt: 'asc' },
    });
    return receipts.map((r) => ({
      userId: r.userId,
      displayName: r.user.profile?.displayName ?? r.user.username,
      readAt: r.readAt,
    }));
  }

  // ── mute ───────────────────────────────────────────────────────────────────

  async iconFor(conversationId: string, userId: string): Promise<string | null> {
    const member = await this.assertMember(conversationId, userId);
    return member.conversation.avatarKey;
  }

  async pinConversation(conversationId: string, userId: string, pinned: boolean) {
    await this.assertMember(conversationId, userId);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { pinnedAt: pinned ? new Date() : null },
    });
    return { ok: true, pinned };
  }

  async muteConversation(conversationId: string, userId: string, hours?: number) {
    await this.assertMember(conversationId, userId);
    const until = hours
      ? new Date(Date.now() + hours * 3600 * 1000)
      : new Date('2999-12-31T00:00:00Z');
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { mutedUntil: until },
    });
    return { ok: true, mutedUntil: until };
  }

  async unmuteConversation(conversationId: string, userId: string) {
    await this.assertMember(conversationId, userId);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { mutedUntil: null },
    });
    return { ok: true };
  }

  // ── search ─────────────────────────────────────────────────────────────────

  async searchMessages(userId: string, q: string, conversationId?: string) {
    const term = q.trim();
    if (term.length < 2) return { items: [] };
    const rows = await this.prisma.message.findMany({
      where: {
        deletedAt: null,
        contentType: { not: 'SYSTEM' },
        content: { contains: term, mode: 'insensitive' },
        conversation: {
          isArchived: false,
          members: { some: { userId } },
          ...(conversationId ? { id: conversationId } : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        sender: { include: { profile: true } },
        conversation: { include: { members: { include: { user: { include: { profile: true } } } } } },
      },
    });
    return {
      items: rows.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        conversationTitle:
          m.conversation.title ??
          m.conversation.members
            .filter((mm) => mm.userId !== userId)
            .map((mm) => mm.user.profile?.displayName ?? mm.user.username)
            .join(', '),
        content: m.content,
        senderName: m.sender?.profile?.displayName ?? 'System',
        createdAt: m.createdAt,
      })),
    };
  }

  async searchFiles(userId: string, q: string) {
    const term = q.trim();
    if (term.length < 2) return { items: [] };
    const rows = await this.prisma.messageAttachment.findMany({
      where: {
        originalName: { contains: term, mode: 'insensitive' },
        message: {
          deletedAt: null,
          conversation: { isArchived: false, members: { some: { userId } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { message: { include: { conversation: true } } },
    });
    return {
      items: rows.map((a) => ({
        id: a.id,
        originalName: a.originalName,
        mimeType: a.mimeType,
        sizeBytes: Number(a.sizeBytes),
        conversationId: a.message.conversationId,
        conversationTitle: a.message.conversation.title ?? 'Direct message',
        createdAt: a.createdAt,
      })),
    };
  }

  private async systemMessage(conversationId: string, content: string) {
    await this.prisma.message.create({
      data: { conversationId, content, contentType: 'SYSTEM', deliveryStatus: 'SENT' },
    });
  }
}
