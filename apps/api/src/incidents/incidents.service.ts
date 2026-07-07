import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IncidentPriority, IncidentStatus, IncidentType, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

const userInclude = { include: { profile: true } };
const incidentInclude = {
  reporter: userInclude,
  owner: userInclude,
  escalation: userInclude,
} satisfies Prisma.IncidentInclude;

type IncidentRow = Prisma.IncidentGetPayload<{ include: typeof incidentInclude }>;

export const INCIDENT_OPEN: IncidentStatus[] = [
  'OPEN',
  'ACKNOWLEDGED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
];

const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  OPEN: ['ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'CLOSED'],
  ACKNOWLEDGED: ['ASSIGNED', 'IN_PROGRESS', 'CLOSED'],
  ASSIGNED: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['VERIFIED', 'IN_PROGRESS', 'CLOSED'],
  VERIFIED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

const MANAGER_RANK = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'];

export interface IncidentInput {
  type: IncidentType;
  description: string;
  priority?: IncidentPriority;
  sku?: string;
  imei?: string;
  erpRef?: string;
  resolutionDeadline?: string;
  conversationId?: string;
  sourceMessageId?: string;
  ownerId?: string;
  escalationId?: string;
}

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(actor: { id: string; role: string }, input: IncidentInput) {
    let conversation: { id: string; branchId: string | null; departmentId: string | null } | null =
      null;
    if (input.conversationId) {
      const member = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: { conversationId: input.conversationId, userId: actor.id },
        },
        include: { conversation: true },
      });
      if (!member) throw new ForbiddenException('Not a member of that conversation');
      conversation = member.conversation;
    }
    if (input.ownerId) await this.assertActiveUser(input.ownerId, 'Owner');
    if (input.escalationId) await this.assertActiveUser(input.escalationId, 'Escalation contact');

    const incident = await this.prisma.incident.create({
      data: {
        type: input.type,
        description: input.description.trim(),
        priority: input.priority ?? 'P2',
        sku: input.sku?.trim() || null,
        imei: input.imei?.trim() || null,
        erpRef: input.erpRef?.trim() || null,
        resolutionDeadline: input.resolutionDeadline ? new Date(input.resolutionDeadline) : null,
        conversationId: conversation?.id,
        sourceMessageId: input.sourceMessageId,
        reporterId: actor.id,
        ownerId: input.ownerId,
        escalationId: input.escalationId,
        branchId: conversation?.branchId,
        departmentId: conversation?.departmentId,
        status: input.ownerId ? 'ASSIGNED' : 'OPEN',
      },
      include: incidentInclude,
    });

    await this.logActivity(incident.id, actor.id, 'reported', this.typeLabel(incident.type));
    if (input.ownerId) {
      await this.logActivity(incident.id, actor.id, 'assigned', this.nameOf(incident.owner));
      if (input.ownerId !== actor.id) {
        await this.notifications.notify(
          input.ownerId,
          'incident',
          `${incident.priority} incident assigned to you`,
          this.typeLabel(incident.type),
          { conversationId: conversation?.id, incidentId: incident.id } as any,
        );
      }
    }
    if (input.escalationId && input.escalationId !== actor.id) {
      await this.notifications.notify(
        input.escalationId,
        'incident',
        `You are the escalation contact for a ${incident.priority} incident`,
        this.typeLabel(incident.type),
        { conversationId: conversation?.id, incidentId: incident.id } as any,
      );
    }

    if (conversation) {
      const card = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: actor.id,
          content: `Incident: ${this.typeLabel(incident.type)}`,
          contentType: 'TEXT',
          deliveryStatus: 'SENT',
          metadata: { incident: this.cardSnapshot(incident) } as Prisma.InputJsonValue,
        },
      });
      await this.prisma.incident.update({
        where: { id: incident.id },
        data: { cardMessageId: card.id },
      });
      this.realtime.emitToConversation(conversation.id, 'conversation.refresh', {
        conversationId: conversation.id,
      });
    }

    this.emitEvent(incident);
    return this.serialize(incident);
  }

  async list(actor: { id: string; role: string }, opts: { conversationId?: string; includeClosed?: boolean }) {
    let where: Prisma.IncidentWhereInput;
    if (opts.conversationId) {
      const member = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: { conversationId: opts.conversationId, userId: actor.id },
        },
      });
      if (!member) throw new ForbiddenException('Not a member of that conversation');
      where = { conversationId: opts.conversationId };
    } else if (MANAGER_RANK.includes(actor.role)) {
      where = {}; // managers see the whole incident board
    } else {
      // Non-managers: incidents they're directly involved in. (Conversation
      // members still see the in-chat cards and the drawer list.)
      where = {
        OR: [{ reporterId: actor.id }, { ownerId: actor.id }, { escalationId: actor.id }],
      };
    }
    if (!opts.includeClosed) where = { AND: [where, { status: { not: 'CLOSED' } }] };
    const rows = await this.prisma.incident.findMany({
      where,
      include: incidentInclude,
      orderBy: [
        { priority: 'asc' },
        { resolutionDeadline: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      take: 200,
    });
    return rows.map((i) => this.serialize(i));
  }

  async detail(actor: { id: string; role: string }, id: string) {
    const incident = await this.incidentOrThrow(id);
    await this.assertCanView(incident, actor);
    const activity = await this.prisma.incidentActivity.findMany({
      where: { incidentId: id },
      orderBy: { createdAt: 'asc' },
      include: { actor: userInclude },
    });
    return {
      ...this.serialize(incident),
      activity: activity.map((a) => ({
        at: a.createdAt,
        actorName: a.actor ? this.nameOf(a.actor as any) : 'System',
        action: a.action,
        detail: a.detail,
      })),
    };
  }

  async update(
    actor: { id: string; role: string },
    id: string,
    input: Partial<IncidentInput> & { status?: IncidentStatus },
  ) {
    let incident = await this.incidentOrThrow(id);
    await this.assertCanView(incident, actor);
    const isReporter = incident.reporterId === actor.id;
    const isOwner = incident.ownerId === actor.id;
    const isEscalation = incident.escalationId === actor.id;
    const isManager = MANAGER_RANK.includes(actor.role);
    if (!isReporter && !isOwner && !isEscalation && !isManager) {
      throw new ForbiddenException('Only the reporter, owner, escalation contact, or a manager can update this incident');
    }

    const data: Prisma.IncidentUpdateInput = {};
    const logs: { action: string; detail?: string }[] = [];

    if (input.description !== undefined && (isReporter || isManager)) {
      data.description = input.description.trim();
      logs.push({ action: 'edited', detail: 'description' });
    }
    if (input.priority !== undefined && (isReporter || isManager || isEscalation)) {
      data.priority = input.priority;
      logs.push({ action: 'priority', detail: input.priority });
    }
    if (input.resolutionDeadline !== undefined && (isReporter || isManager || isEscalation)) {
      data.resolutionDeadline = input.resolutionDeadline
        ? new Date(input.resolutionDeadline)
        : null;
      logs.push({ action: 'deadline', detail: input.resolutionDeadline ?? 'cleared' });
    }
    for (const key of ['sku', 'imei', 'erpRef'] as const) {
      if (input[key] !== undefined && (isReporter || isOwner || isManager)) {
        (data as any)[key] = input[key]?.trim() || null;
      }
    }
    if (input.ownerId !== undefined && (isReporter || isManager || isEscalation || isOwner)) {
      if (input.ownerId) {
        await this.assertActiveUser(input.ownerId, 'Owner');
        data.owner = { connect: { id: input.ownerId } };
        if (['OPEN', 'ACKNOWLEDGED'].includes(incident.status)) data.status = 'ASSIGNED';
        logs.push({ action: 'assigned' });
      } else {
        data.owner = { disconnect: true };
        logs.push({ action: 'unassigned' });
      }
    }
    if (input.escalationId !== undefined && (isReporter || isManager)) {
      data.escalation = input.escalationId
        ? { connect: { id: input.escalationId } }
        : { disconnect: true };
      logs.push({ action: 'escalation contact set' });
    }

    if (input.status !== undefined && input.status !== incident.status) {
      this.assertTransition(incident, actor, input.status);
      data.status = input.status;
      if (input.status === 'CLOSED') data.closedAt = new Date();
      logs.push({ action: input.status.toLowerCase().replace('_', ' ') });
    }

    incident = await this.prisma.incident.update({
      where: { id },
      data,
      include: incidentInclude,
    });
    for (const log of logs) await this.logActivity(id, actor.id, log.action, log.detail);
    await this.notifyChanges(incident, actor.id, input);
    await this.refreshCard(incident);
    this.emitEvent(incident);
    return this.serialize(incident);
  }

  // ── rules ──────────────────────────────────────────────────────────────────

  private assertTransition(
    incident: IncidentRow,
    actor: { id: string; role: string },
    to: IncidentStatus,
  ) {
    if (!TRANSITIONS[incident.status].includes(to)) {
      throw new BadRequestException(`Cannot move a ${incident.status} incident to ${to}`);
    }
    const isReporter = incident.reporterId === actor.id;
    const isOwner = incident.ownerId === actor.id;
    const isEscalation = incident.escalationId === actor.id;
    const isManager = MANAGER_RANK.includes(actor.role);

    if (to === 'ACKNOWLEDGED' || to === 'IN_PROGRESS' || to === 'RESOLVED') {
      if (!isOwner && !isReporter && !isManager && !isEscalation) {
        throw new ForbiddenException('Only the owner can work this incident');
      }
    }
    if (to === 'VERIFIED' || (to === 'CLOSED' && incident.status !== 'VERIFIED')) {
      const mayVerify = isReporter || isEscalation || isManager;
      if (!mayVerify) {
        throw new ForbiddenException('Only the reporter, escalation contact, or a manager can verify or close');
      }
      // The critical rule: whoever resolved it doesn't get to confirm it.
      if (actor.id === incident.ownerId) {
        throw new ForbiddenException(
          'The incident owner cannot verify or close their own resolution — an independent person must confirm.',
        );
      }
    }
  }

  private async assertCanView(incident: IncidentRow, actor: { id: string; role: string }) {
    if (
      [incident.reporterId, incident.ownerId, incident.escalationId].includes(actor.id) ||
      MANAGER_RANK.includes(actor.role)
    ) {
      return;
    }
    if (incident.conversationId) {
      const member = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: { conversationId: incident.conversationId, userId: actor.id },
        },
      });
      if (member) return;
    }
    throw new ForbiddenException('No access to this incident');
  }

  private async assertActiveUser(id: string, label: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null, status: 'ACTIVE' },
    });
    if (!user) throw new BadRequestException(`${label} is not an active user`);
  }

  private async incidentOrThrow(id: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: incidentInclude,
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  // ── side effects ───────────────────────────────────────────────────────────

  private async notifyChanges(
    incident: IncidentRow,
    actorId: string,
    input: Partial<IncidentInput> & { status?: IncidentStatus },
  ) {
    const targets = new Map<string, string>();
    if (input.ownerId && input.ownerId !== actorId) {
      targets.set(input.ownerId, `${incident.priority} incident assigned to you`);
    }
    if (input.status === 'RESOLVED') {
      for (const id of [incident.reporterId, incident.escalationId]) {
        if (id && id !== actorId) targets.set(id, 'Incident resolved — needs verification');
      }
    }
    if (input.status === 'VERIFIED' || input.status === 'CLOSED') {
      for (const id of [incident.ownerId, incident.reporterId]) {
        if (id && id !== actorId) targets.set(id, `Incident ${input.status.toLowerCase()}`);
      }
    }
    for (const [userId, title] of targets) {
      await this.notifications.notify(userId, 'incident', title, this.typeLabel(incident.type), {
        conversationId: incident.conversationId ?? undefined,
        incidentId: incident.id,
      } as any);
    }
  }

  private async refreshCard(incident: IncidentRow) {
    if (!incident.cardMessageId || !incident.conversationId) return;
    await this.prisma.message
      .update({
        where: { id: incident.cardMessageId },
        data: { metadata: { incident: this.cardSnapshot(incident) } as Prisma.InputJsonValue },
      })
      .catch(() => undefined);
    this.realtime.emitToConversation(incident.conversationId, 'conversation.refresh', {
      conversationId: incident.conversationId,
    });
  }

  private emitEvent(incident: IncidentRow) {
    const payload = {
      incidentId: incident.id,
      conversationId: incident.conversationId,
      status: incident.status,
    };
    for (const id of new Set(
      [incident.reporterId, incident.ownerId, incident.escalationId].filter(Boolean) as string[],
    )) {
      this.realtime.emitToUser(id, 'incident.updated', payload);
    }
    if (incident.conversationId) {
      this.realtime.emitToConversation(incident.conversationId, 'incident.updated', payload);
    }
  }

  private async logActivity(incidentId: string, actorId: string, action: string, detail?: string) {
    await this.prisma.incidentActivity.create({ data: { incidentId, actorId, action, detail } });
  }

  // ── serialization ──────────────────────────────────────────────────────────

  typeLabel(type: IncidentType) {
    return type
      .toLowerCase()
      .split('_')
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ');
  }

  private nameOf(u: { username: string; profile: { displayName: string } | null } | null) {
    return u ? (u.profile?.displayName ?? u.username) : undefined;
  }

  private cardSnapshot(incident: IncidentRow) {
    return {
      id: incident.id,
      type: incident.type,
      typeLabel: this.typeLabel(incident.type),
      status: incident.status,
      priority: incident.priority,
      sku: incident.sku,
      imei: incident.imei,
      ownerName: this.nameOf(incident.owner) ?? null,
      resolutionDeadline: incident.resolutionDeadline?.toISOString() ?? null,
    };
  }

  serialize(i: IncidentRow) {
    return {
      id: i.id,
      type: i.type,
      typeLabel: this.typeLabel(i.type),
      status: i.status,
      priority: i.priority,
      description: i.description,
      sku: i.sku,
      imei: i.imei,
      erpRef: i.erpRef,
      resolutionDeadline: i.resolutionDeadline,
      conversationId: i.conversationId,
      sourceMessageId: i.sourceMessageId,
      reporter: { id: i.reporterId, name: this.nameOf(i.reporter)! },
      owner: i.owner
        ? { id: i.owner.id, name: this.nameOf(i.owner)!, avatarKey: i.owner.profile?.avatarKey ?? null }
        : null,
      escalation: i.escalation ? { id: i.escalation.id, name: this.nameOf(i.escalation)! } : null,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      closedAt: i.closedAt,
    };
  }
}
