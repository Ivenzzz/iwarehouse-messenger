import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

interface Actor {
  id: string;
  role: string;
}

export interface CreateUserInput {
  email: string;
  username: string;
  password: string;
  displayName: string;
  role: Role;
  branchId?: string;
  departmentId?: string;
  title?: string;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  // Only SUPER_ADMIN may create or modify other admins.
  private assertCanManageRole(actor: Actor, targetRole: Role) {
    if (
      (targetRole === 'ADMIN' || targetRole === 'SUPER_ADMIN') &&
      actor.role !== 'SUPER_ADMIN'
    ) {
      throw new ForbiddenException('Only a super admin can manage admin accounts');
    }
  }

  async createUser(actor: Actor, input: CreateUserInput) {
    this.assertCanManageRole(actor, input.role);
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email: input.email.toLowerCase() }, { username: input.username }] },
    });
    if (exists) throw new ConflictException('Email or username already in use');

    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        username: input.username,
        passwordHash: await argon2.hash(input.password),
        role: input.role,
        branchId: input.branchId,
        departmentId: input.departmentId,
        profile: {
          create: { displayName: input.displayName, title: input.title },
        },
      },
      include: { profile: true },
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'admin.user_created',
      target: user.id,
      metadata: { email: user.email, role: user.role },
    });
    return { id: user.id, email: user.email, username: user.username, role: user.role };
  }

  async updateUser(
    actor: Actor,
    id: string,
    data: { role?: Role; branchId?: string | null; departmentId?: string | null; status?: 'ACTIVE' | 'INACTIVE' },
  ) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    this.assertCanManageRole(actor, target.role);
    if (data.role) this.assertCanManageRole(actor, data.role);
    if (id === actor.id && data.status === 'INACTIVE') {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    const updated = await this.prisma.user.update({ where: { id }, data });

    // Deactivation immediately kills every session for the account.
    if (data.status === 'INACTIVE') {
      await this.prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.realtime.disconnectUser(id);
    }

    await this.audit.log({
      actorId: actor.id,
      action: data.status ? `admin.user_${data.status.toLowerCase()}` : 'admin.user_updated',
      target: id,
      metadata: data as any,
    });
    return { id: updated.id, role: updated.role, status: updated.status };
  }

  async resetPassword(actor: Actor, id: string, newPassword: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    this.assertCanManageRole(actor, target.role);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await argon2.hash(newPassword), failedLoginCount: 0, lockedUntil: null },
    });
    // Password reset invalidates existing sessions.
    await this.prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({ actorId: actor.id, action: 'admin.password_reset', target: id });
    return { ok: true };
  }

  async revokeSessions(actor: Actor, id: string) {
    const result = await this.prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'admin.sessions_revoked',
      target: id,
      metadata: { count: result.count },
    });
    return { revoked: result.count };
  }

  overview() {
    return this.prisma.$transaction(async (tx) => {
      const [users, active, branches, departments, sessions] = await Promise.all([
        tx.user.count({ where: { deletedAt: null } }),
        tx.user.count({ where: { status: 'ACTIVE', deletedAt: null } }),
        tx.branch.count({ where: { isActive: true } }),
        tx.department.count({ where: { isActive: true } }),
        tx.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      ]);
      return { users, activeUsers: active, branches, departments, activeSessions: sessions };
    });
  }

  // System dashboard (Phase 5): one call, everything a manager wants to see.
  async systemStats() {
    const OPEN_TASK: any[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'SUBMITTED'];
    const [
      usersTotal, usersActive, sessionsActive, conversations, messages,
      uploadsAgg, tasksByStatus, incidentsByStatus, slaBreached,
      incidentsByBranch, dbSize,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.conversation.count(),
      this.prisma.message.count({ where: { deletedAt: null } }),
      this.prisma.upload.aggregate({ _count: { _all: true }, _sum: { sizeBytes: true } }),
      this.prisma.task.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.incident.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.incident.count({
        where: {
          resolutionDeadline: { lt: new Date() },
          status: { in: ['OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS'] as any },
        },
      }),
      this.prisma.incident.groupBy({
        by: ['branchId'],
        where: { status: { not: 'CLOSED' } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`,
    ]);
    const branches = await this.prisma.branch.findMany({ select: { id: true, code: true } });
    const branchCode = new Map(branches.map((b) => [b.id, b.code]));
    return {
      users: { total: usersTotal, active: usersActive },
      sessionsActive,
      conversations,
      messages,
      uploads: {
        count: uploadsAgg._count._all,
        bytes: Number(uploadsAgg._sum.sizeBytes ?? 0),
      },
      tasks: {
        open: tasksByStatus
          .filter((g) => OPEN_TASK.includes(g.status))
          .reduce((a, g) => a + g._count._all, 0),
        byStatus: Object.fromEntries(tasksByStatus.map((g) => [g.status, g._count._all])),
      },
      incidents: {
        byStatus: Object.fromEntries(incidentsByStatus.map((g) => [g.status, g._count._all])),
        slaBreached,
        openByBranch: incidentsByBranch
          .filter((g) => g.branchId)
          .map((g) => ({ branch: branchCode.get(g.branchId!) ?? '—', count: g._count._all })),
      },
      databaseMb: Math.round(Number(dbSize[0]?.size ?? 0) / 1_048_576),
      serverTime: new Date().toISOString(),
    };
  }

}