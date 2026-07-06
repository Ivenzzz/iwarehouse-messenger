import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('operations')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  async ready() {
    const checks: Record<string, string> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = 'up';
    } catch {
      checks.postgres = 'down';
    }

    if (process.env.REDIS_URL) {
      const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
      try {
        await redis.connect();
        await redis.ping();
        checks.redis = 'up';
      } catch {
        checks.redis = 'down';
      } finally {
        redis.disconnect();
      }
    }

    const healthy = Object.values(checks).every((v) => v === 'up');
    return { status: healthy ? 'ready' : 'degraded', checks, ts: new Date().toISOString() };
  }
}
