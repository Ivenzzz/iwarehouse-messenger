import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

const userInclude = { include: { profile: true } };
const taskInclude = {
  creator: userInclude,
  assignee: userInclude,
  verifier: userInclude,
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

// Which statuses count as "open work" for badges and filters.
export const OPEN_STATUSES: TaskStatus[] = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'BLOCKED',
  'SUBMITTED',
];

// Allowed workflow transitions: from → to[]
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'CLOSED'],
  ASSIGNED: ['IN_PROGRESS', 'BLOCKED', 'SUBMITTED', 'CLOSED'],
  IN_PROGRESS: ['BLOCKED', 'SUBMITTED', 'CLOSED'],
  BLOCKED: ['IN_PROGRESS', 'SUBMITTED', 'CLOSED'],
  SUBMITTED: ['VERIFIED', 'IN_PROGRESS', 'CLOSED'],
  VERIFIED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

const MANAGER_RANK = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'];

export interface TaskInput {
  title: string;
  description?: string;
  conversationId?: string;
  sourceMessageId?: string;
  assigneeId?: string;
  verifierId?: string;
  priority?: TaskPriority;
  dueAt?: string;
  requiresIndependentVerifier?: boolean;
  erpRef?: string;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── create ─────────────────────────────────────────────────────────────────

  async create(actor: { id: string; role: string }, input: TaskInput) {
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

    if (input.sourceMessageId) {
      const source = await this.prisma.message.findUnique({
        where: { id: input.sourceMessageId },
      });
      if (!source || (conversation && source.conversationId !== conversation.id)) {
        throw new BadRequestException('Source message not found in that conversation');
      }
    }

    if (input.assigneeId) await this.assertActiveUser(input.assigneeId, 'Assignee');
    if (input.verifierId) await this.assertActiveUser(input.verifierId, 'Verifier');

    const task = await this.prisma.task.create({
      data: {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        conversationId: conversation?.id,
        sourceMessageId: input.sourceMessageId,
        creatorId: actor.id,
        assigneeId: input.assigneeId,
        verifierId: input.verifierId,
        priority: input.priority ?? 'NORMAL',
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        requiresIndependentVerifier: input.requiresIndependentVerifier ?? false,
        erpRef: input.erpRef,
        branchId: conversation?.branchId,
        departmentId: conversation?.departmentId,
        status: input.assigneeId ? 'ASSIGNED' : 'OPEN',
      },
      include: taskInclude,
    });

    await this.logActivity(task.id, actor.id, 'created', task.title);
    if (input.assigneeId) {
      await this.logActivity(task.id, actor.id, 'assigned', this.nameOf(task.assignee));
      if (input.assigneeId !== actor.id) {
        await this.notifications.notify(
          input.assigneeId,
          'task',
          'You were assigned a task',
          task.title,
          { conversationId: conversation?.id, taskId: task.id } as any,
        );
      }
    }

    // Drop a live task card into the conversation.
    if (conversation) {
      const card = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: actor.id,
          content: `Task: ${task.title}`,
          contentType: 'TEXT',
          deliveryStatus: 'SENT',
          metadata: { task: this.cardSnapshot(task) } as Prisma.InputJsonValue,
        },
      });
      await this.prisma.task.update({ where: { id: task.id }, data: { cardMessageId: card.id } });
      this.emitCardRefresh(conversation.id);
    }

    this.emitTaskEvent(task);
    return this.serialize(task);
  }

  // ── read ───────────────────────────────────────────────────────────────────

  async list(
    actorId: string,
    filter: 'assigned' | 'created' | 'conversation',
    opts: { conversationId?: string; includeClosed?: boolean },
  ) {
    let where: Prisma.TaskWhereInput;
    if (filter === 'conversation') {
      if (!opts.conversationId) throw new BadRequestException('conversationId required');
      const member = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: { conversationId: opts.conversationId, userId: actorId },
        },
      });
      if (!member) throw new ForbiddenException('Not a member of that conversation');
      where = { conversationId: opts.conversationId };
    } else if (filter === 'created') {
      where = { creatorId: actorId };
    } else {
      where = { OR: [{ assigneeId: actorId }, { verifierId: actorId, status: 'SUBMITTED' }] };
    }
    if (!opts.includeClosed) {
      where = { AND: [where, { status: { notIn: ['CLOSED'] } }] };
    }
    const rows = await this.prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ status: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((t) => this.serialize(t));
  }

  async detail(actorId: string, taskId: string) {
    const task = await this.taskOrThrow(taskId);
    await this.assertCanView(task, actorId);
    const activity = await this.prisma.taskActivity.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
      include: { actor: userInclude },
    });
    return {
      ...this.serialize(task),
      activity: activity.map((a) => ({
        at: a.createdAt,
        actorName: a.actor ? this.nameOf(a.actor as any) : 'System',
        action: a.action,
        detail: a.detail,
      })),
    };
  }

  // ── update ─────────────────────────────────────────────────────────────────

  async update(
    actor: { id: string; role: string },
    taskId: string,
    input: Partial<TaskInput> & { status?: TaskStatus },
  ) {
    let task = await this.taskOrThrow(taskId);
    await this.assertCanView(task, actor.id);
    const isCreator = task.creatorId === actor.id;
    const isAssignee = task.assigneeId === actor.id;
    const isManager = MANAGER_RANK.includes(actor.role);
    const canEdit = isCreator || isAssignee || isManager;
    if (!canEdit) throw new ForbiddenException('Only the creator, assignee, or a manager can update this task');

    const data: Prisma.TaskUpdateInput = {};
    const logs: { action: string; detail?: string }[] = [];

    if (input.title !== undefined && (isCreator || isManager)) {
      data.title = input.title.trim();
      logs.push({ action: 'edited', detail: 'title' });
    }
    if (input.description !== undefined && (isCreator || isManager)) {
      data.description = input.description?.trim() || null;
    }
    if (input.priority !== undefined && (isCreator || isManager)) {
      data.priority = input.priority;
      logs.push({ action: 'priority', detail: input.priority });
    }
    if (input.dueAt !== undefined && (isCreator || isManager)) {
      data.dueAt = input.dueAt ? new Date(input.dueAt) : null;
      logs.push({ action: 'due date', detail: input.dueAt ?? 'cleared' });
    }
    if (input.verifierId !== undefined && (isCreator || isManager)) {
      if (input.verifierId) await this.assertActiveUser(input.verifierId, 'Verifier');
      data.verifier = input.verifierId
        ? { connect: { id: input.verifierId } }
        : { disconnect: true };
    }

    if (input.assigneeId !== undefined && (isCreator || isManager || isAssignee)) {
      if (input.assigneeId) {
        await this.assertActiveUser(input.assigneeId, 'Assignee');
        data.assignee = { connect: { id: input.assigneeId } };
        if (task.status === 'OPEN') data.status = 'ASSIGNED';
        logs.push({ action: 'assigned' });
      } else {
        data.assignee = { disconnect: true };
        logs.push({ action: 'unassigned' });
      }
    }

    if (input.status !== undefined && input.status !== task.status) {
      this.assertTransition(task, actor, input.status);
      data.status = input.status;
      if (input.status === 'CLOSED') data.closedAt = new Date();
      logs.push({ action: input.status.toLowerCase().replace('_', ' ') });
    }

    task = await this.prisma.task.update({ where: { id: taskId }, data, include: taskInclude });

    for (const log of logs) await this.logActivity(taskId, actor.id, log.action, log.detail);
    await this.notifyChanges(task, actor.id, input);
    await this.refreshCard(task);
    this.emitTaskEvent(task);
    return this.serialize(task);
  }

  private async taskOrThrow(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: taskInclude,
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  // ── rules ──────────────────────────────────────────────────────────────────

  private assertTransition(
    task: TaskRow,
    actor: { id: string; role: string },
    to: TaskStatus,
  ) {
    if (!TRANSITIONS[task.status].includes(to)) {
      throw new BadRequestException(`Cannot move a ${task.status} task to ${to}`);
    }
    const isCreator = task.creatorId === actor.id;
    const isAssignee = task.assigneeId === actor.id;
    const isVerifier = task.verifierId === actor.id;
    const isManager = MANAGER_RANK.includes(actor.role);

    if (to === 'IN_PROGRESS' || to === 'BLOCKED' || to === 'SUBMITTED') {
      if (!isAssignee && !isCreator && !isManager) {
        throw new ForbiddenException('Only the assignee can work this task');
      }
    }
    if (to === 'VERIFIED' || (to === 'CLOSED' && task.status !== 'VERIFIED')) {
      const mayVerify = isVerifier || isCreator || isManager;
      if (!mayVerify) throw new ForbiddenException('Only the verifier, creator, or a manager can verify or close');
      // The critical rule: no self-verification on flagged tasks.
      if (task.requiresIndependentVerifier && actor.id === task.assigneeId) {
        throw new ForbiddenException(
          'This task requires independent verification — the assignee cannot verify or close it.',
        );
      }
    }
  }

  private async assertCanView(task: TaskRow, actorId: string) {
    if (
      task.creatorId === actorId ||
      task.assigneeId === actorId ||
      task.verifierId === actorId
    ) {
      return;
    }
    if (task.conversationId) {
      const member = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: { conversationId: task.conversationId, userId: actorId },
        },
      });
      if (member) return;
    }
    const user = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (user && MANAGER_RANK.includes(user.role)) return;
    throw new ForbiddenException('No access to this task');
  }

  private async assertActiveUser(id: string, label: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null, status: 'ACTIVE' },
    });
    if (!user) throw new BadRequestException(`${label} is not an active user`);
  }

  // ── side effects ───────────────────────────────────────────────────────────

  private async notifyChanges(
    task: TaskRow,
    actorId: string,
    input: Partial<TaskInput> & { status?: TaskStatus },
  ) {
    const targets = new Map<string, string>();
    if (input.assigneeId && input.assigneeId !== actorId) {
      targets.set(input.assigneeId, 'You were assigned a task');
    }
    if (input.status === 'SUBMITTED') {
      const verifier = task.verifierId ?? task.creatorId;
      if (verifier !== actorId) targets.set(verifier, 'A task was submitted for verification');
    }
    if (input.status === 'VERIFIED' || input.status === 'CLOSED') {
      for (const id of [task.assigneeId, task.creatorId]) {
        if (id && id !== actorId) targets.set(id, `Task ${input.status.toLowerCase()}`);
      }
    }
    if (input.status === 'BLOCKED' && task.creatorId !== actorId) {
      targets.set(task.creatorId, 'A task was marked blocked');
    }
    for (const [userId, title] of targets) {
      await this.notifications.notify(userId, 'task', title, task.title, {
        conversationId: task.conversationId ?? undefined,
        taskId: task.id,
      } as any);
    }
  }

  private async refreshCard(task: TaskRow) {
    if (!task.cardMessageId || !task.conversationId) return;
    await this.prisma.message
      .update({
        where: { id: task.cardMessageId },
        data: { metadata: { task: this.cardSnapshot(task) } as Prisma.InputJsonValue },
      })
      .catch(() => undefined);
    this.emitCardRefresh(task.conversationId);
  }

  private emitCardRefresh(conversationId: string) {
    this.realtime.emitToConversation(conversationId, 'conversation.refresh', { conversationId });
  }

  private emitTaskEvent(task: TaskRow) {
    const payload = { taskId: task.id, conversationId: task.conversationId, status: task.status };
    for (const id of new Set(
      [task.creatorId, task.assigneeId, task.verifierId].filter(Boolean) as string[],
    )) {
      this.realtime.emitToUser(id, 'task.updated', payload);
    }
    if (task.conversationId) {
      this.realtime.emitToConversation(task.conversationId, 'task.updated', payload);
    }
  }

  private async logActivity(taskId: string, actorId: string, action: string, detail?: string) {
    await this.prisma.taskActivity.create({ data: { taskId, actorId, action, detail } });
  }

  // ── serialization ──────────────────────────────────────────────────────────

  private nameOf(u: { username: string; profile: { displayName: string } | null } | null) {
    return u ? (u.profile?.displayName ?? u.username) : undefined;
  }

  private cardSnapshot(task: TaskRow) {
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt?.toISOString() ?? null,
      assigneeName: this.nameOf(task.assignee) ?? null,
    };
  }

  serialize(t: TaskRow) {
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueAt: t.dueAt,
      requiresIndependentVerifier: t.requiresIndependentVerifier,
      erpRef: t.erpRef,
      conversationId: t.conversationId,
      sourceMessageId: t.sourceMessageId,
      creator: { id: t.creatorId, name: this.nameOf(t.creator)! },
      assignee: t.assignee
        ? {
            id: t.assignee.id,
            name: this.nameOf(t.assignee)!,
            avatarKey: t.assignee.profile?.avatarKey ?? null,
          }
        : null,
      verifier: t.verifier ? { id: t.verifier.id, name: this.nameOf(t.verifier)! } : null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      closedAt: t.closedAt,
    };
  }
}
