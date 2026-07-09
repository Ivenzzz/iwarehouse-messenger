import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

// Polls live inside chat as live-updating cards (same pattern as task and
// incident cards): the poll's current results are written into the card
// message's metadata on every vote, and a conversation.refresh event tells
// every member's client to re-pull. Votes are stored relationally so
// concurrent votes can't clobber each other.
@Injectable()
export class PollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(
    actorId: string,
    conversationId: string,
    input: { question: string; options: string[]; multi?: boolean },
  ) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: actorId } },
      include: { conversation: true },
    });
    if (!member) throw new ForbiddenException('Not a member of that conversation');

    const texts = input.options.map((o) => o.trim()).filter(Boolean);
    if (texts.length < 2) throw new BadRequestException('A poll needs at least 2 options');
    if (texts.length > 10) throw new BadRequestException('Maximum 10 options');

    const poll = await this.prisma.poll.create({
      data: {
        conversationId,
        question: input.question.trim(),
        multi: input.multi ?? false,
        createdBy: actorId,
        options: { create: texts.map((text, ord) => ({ text, ord })) },
      },
      include: { options: { orderBy: { ord: 'asc' } } },
    });

    const card = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: actorId,
        content: `Poll: ${poll.question}`,
        contentType: 'TEXT',
        deliveryStatus: 'SENT',
        metadata: { poll: await this.snapshot(poll.id) } as Prisma.InputJsonValue,
      },
    });
    await this.prisma.poll.update({ where: { id: poll.id }, data: { messageId: card.id } });
    this.realtime.emitToConversation(conversationId, 'conversation.refresh', { conversationId });
    // Sidebar previews + unread badges for everyone.
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    this.realtime.emitToUsers(
      members.map((m) => m.userId),
      'conversation.updated',
      { conversationId, senderId: actorId, kind: 'message' },
    );
    return { pollId: poll.id, messageId: card.id };
  }

  async vote(actorId: string, pollId: string, optionIds: string[]) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true },
    });
    if (!poll) throw new NotFoundException('Poll not found');
    if (poll.closedAt) throw new BadRequestException('This poll is closed');
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: poll.conversationId, userId: actorId } },
    });
    if (!member) throw new ForbiddenException('Not a member of that conversation');

    const valid = new Set(poll.options.map((o) => o.id));
    const picked = [...new Set(optionIds)].filter((id) => valid.has(id));
    if (!poll.multi && picked.length > 1) {
      throw new BadRequestException('This poll allows a single choice');
    }

    await this.prisma.$transaction([
      this.prisma.pollVote.deleteMany({ where: { pollId, userId: actorId } }),
      this.prisma.pollVote.createMany({
        data: picked.map((optionId) => ({ pollId, optionId, userId: actorId })),
      }),
    ]);

    await this.refreshCard(pollId);
    return { ok: true };
  }

  private async refreshCard(pollId: string) {
    const poll = await this.prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll?.messageId) return;
    await this.prisma.message
      .update({
        where: { id: poll.messageId },
        data: { metadata: { poll: await this.snapshot(pollId) } as Prisma.InputJsonValue },
      })
      .catch(() => undefined);
    this.realtime.emitToConversation(poll.conversationId, 'conversation.refresh', {
      conversationId: poll.conversationId,
    });
  }

  async snapshot(pollId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: { orderBy: { ord: 'asc' } },
        votes: true,
      },
    });
    if (!poll) return null;
    // PollVote has no direct `user` relation, so resolve voter display names
    // in a single follow-up query keyed by userId.
    const voterIds = [...new Set(poll.votes.map((v) => v.userId))];
    const voters = await this.prisma.user.findMany({
      where: { id: { in: voterIds } },
      select: { id: true, username: true, profile: { select: { displayName: true } } },
    });
    const nameById = new Map(
      voters.map((u) => [u.id, u.profile?.displayName ?? u.username]),
    );
    const byOption = new Map<string, { id: string; name: string }[]>();
    for (const v of poll.votes) {
      const list = byOption.get(v.optionId) ?? [];
      list.push({
        id: v.userId,
        name: nameById.get(v.userId) ?? v.userId,
      });
      byOption.set(v.optionId, list);
    }
    return {
      id: poll.id,
      question: poll.question,
      multi: poll.multi,
      closed: Boolean(poll.closedAt),
      totalVoters: new Set(poll.votes.map((v) => v.userId)).size,
      options: poll.options.map((o) => ({
        id: o.id,
        text: o.text,
        voters: byOption.get(o.id) ?? [],
      })),
    };
  }
}
