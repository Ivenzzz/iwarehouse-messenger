import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

// Web Push delivery. Enabled only when VAPID keys are present in the
// environment (generate once with: npx web-push generate-vapid-keys).
// Notifications still work in-app without keys; this adds delivery to
// phones/desktops even when the browser tab is closed.
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;

  constructor(private readonly prisma: PrismaService) {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    this.enabled = Boolean(pub && priv);
    if (this.enabled) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT ?? 'mailto:it@iwarehouse.ph',
        pub!,
        priv!,
      );
    } else {
      this.logger.log('Web push disabled (no VAPID keys set)');
    }
  }

  status() {
    return { enabled: this.enabled, publicKey: process.env.VAPID_PUBLIC_KEY ?? null };
  }

  async subscribe(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent,
      },
      // Endpoint reused (e.g. another account on the same browser profile):
      // reassign it to the current user.
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
    });
    return { ok: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { ok: true };
  }

  // Fire-and-forget: failures must never break the request that triggered
  // the notification. Dead endpoints (404/410) are pruned as we meet them.
  async sendToUser(
    userId: string,
    payload: {
      title: string;
      body?: string | null;
      url?: string;
      tag?: string;
      kind?: string;
      conversationId?: string;
    },
  ) {
    if (!this.enabled) return;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(payload),
            { TTL: 3600 },
          );
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await this.prisma.pushSubscription
              .delete({ where: { id: s.id } })
              .catch(() => undefined);
          } else {
            this.logger.warn(`push failed (${err?.statusCode ?? 'unknown'})`);
          }
        }
      }),
    );
  }
}
