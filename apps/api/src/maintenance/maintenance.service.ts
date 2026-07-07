import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

// Nightly housekeeping so the system stays lean unattended (audit S-4/D-3):
// - sessions: expired or revoked >30 days ago
// - notifications: older than 90 days
// - orphaned uploads: completed >24h ago but never attached to a message
//   (user canceled the send) — object + row removed
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Cron('0 3 * * *')
  async nightly() {
    const now = Date.now();
    const days = (n: number) => new Date(now - n * 86_400_000);

    const sessions = await this.prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: days(30) } }, { revokedAt: { lt: days(30) } }],
      },
    });

    const notifications = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: days(90) } },
    });

    const orphans = await this.prisma.upload.findMany({
      where: { status: 'COMPLETE', completedAt: { lt: days(1) } },
      select: { id: true, storageKey: true },
      take: 500,
    });
    let removed = 0;
    for (const o of orphans) {
      const attached = await this.prisma.messageAttachment.findFirst({
        where: { storageKey: o.storageKey },
        select: { id: true },
      });
      const isAvatar = o.storageKey.startsWith('avatars/');
      if (!attached && !isAvatar) {
        await this.storage.remove(o.storageKey).catch(() => undefined);
        await this.prisma.upload.delete({ where: { id: o.id } }).catch(() => undefined);
        removed++;
      }
    }

    this.logger.log(
      `nightly cleanup: ${sessions.count} sessions, ${notifications.count} notifications, ${removed} orphaned uploads`,
    );
  }
}
