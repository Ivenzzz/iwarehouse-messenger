import { Injectable, Logger } from '@nestjs/common';
import { AuditResult, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  target?: string | null;
  result?: AuditResult;
  ip?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(private readonly prisma: PrismaService) {}

  // Auditing must never break the primary action, so failures are logged and swallowed.
  async log(entry: AuditEntry) {
    try {
      await this.prisma.auditEvent.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          target: entry.target ?? null,
          result: entry.result ?? 'SUCCESS',
          ip: entry.ip,
          userAgent: entry.userAgent,
          metadata: entry.metadata,
        },
      });
    } catch (err) {
      this.logger.error(`audit write failed: ${entry.action}`, err as Error);
    }
  }

  list(params: { limit: number; cursor?: string; action?: string; actorId?: string }) {
    return this.prisma.auditEvent.findMany({
      take: params.limit,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
      where: {
        ...(params.action ? { action: { contains: params.action } } : {}),
        ...(params.actorId ? { actorId: params.actorId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { username: true, email: true } } },
    });
  }
}
