import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

const ACCESS_TTL = Number(process.env.JWT_ACCESS_TTL ?? 900);
// Sessions are SLIDING: every silent refresh extends expiry, so an active
// device stays signed in indefinitely — sign-out happens only when the user
// chooses (or an admin deactivates them). The TTL below is the idle limit:
// how long an untouched device stays valid. Default: 1 year.
const REFRESH_TTL = Number(process.env.JWT_REFRESH_TTL ?? 31_536_000);
const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);
const LOCKOUT_MIN = Number(process.env.LOGIN_LOCKOUT_MINUTES ?? 15);

export interface TokenPair {
  remember: boolean;
  accessToken: string;
  refreshToken: string;
  accessTtl: number;
  refreshTtl: number;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

// Refresh tokens are stored hashed so a database leak does not leak sessions.
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async login(email: string, password: string, meta: RequestMeta, remember = true) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { profile: true },
    });

    const fail = async (reason: string) => {
      await this.audit.log({
        actorId: user?.id ?? null,
        action: 'auth.login',
        target: email,
        result: 'FAILURE',
        metadata: { reason },
        ...meta,
      });
      throw new UnauthorizedException('Incorrect email or password');
    };

    if (!user || user.deletedAt) return fail('unknown_user');
    if (user.status === 'INACTIVE') {
      await this.audit.log({
        actorId: user.id, action: 'auth.login', target: email,
        result: 'DENIED', metadata: { reason: 'inactive' }, ...meta,
      });
      throw new ForbiddenException('This account has been deactivated. Contact your administrator.');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        'Account temporarily locked after repeated failed sign-ins. Try again later.',
      );
    }

    const valid = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!valid) {
      const failedLoginCount = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount,
          lockedUntil:
            failedLoginCount >= MAX_ATTEMPTS
              ? new Date(Date.now() + LOCKOUT_MIN * 60_000)
              : null,
        },
      });
      return fail('bad_password');
    }

    // Successful sign-in: reset counters, create session, issue tokens.
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastActiveAt: new Date() },
    });

    const tokens = await this.createSession(user.id, user.email, user.role, meta, remember);
    await this.audit.log({
      actorId: user.id, action: 'auth.login', target: user.email, result: 'SUCCESS', ...meta,
    });

    return {
      tokens,
      user: this.publicUser(user),
    };
  }

  async refresh(refreshToken: string | undefined, meta: RequestMeta) {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');
    let payload: { sub: string; sid: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.session.findUnique({ where: { id: payload.sid } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }
    // Rotation with reuse detection: a token that doesn't match the stored hash
    // was already rotated — treat the whole session as compromised.
    if (session.refreshTokenHash !== hashToken(refreshToken)) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({
        actorId: session.userId, action: 'auth.refresh_reuse_detected',
        target: session.id, result: 'DENIED', ...meta,
      });
      this.realtime.disconnectSession(session.id);
      throw new UnauthorizedException('Session revoked');
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Account disabled');

    const remember = (payload as { rm?: boolean }).rm !== false;
    const tokens = this.issueTokens(user.id, user.email, user.role, session.id, remember);
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: hashToken(tokens.refreshToken),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + REFRESH_TTL * 1000),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return tokens;
  }

  async logout(sessionId: string, actorId: string, meta: RequestMeta) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId: actorId },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({ actorId, action: 'auth.logout', target: sessionId, ...meta });
    this.realtime.disconnectSession(sessionId);
  }

  async listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, ip: true, userAgent: true, createdAt: true, lastUsedAt: true },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string, actorId: string, meta: RequestMeta) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      actorId, action: 'auth.session_revoked', target: sessionId, ...meta,
    });
    this.realtime.disconnectSession(sessionId);
  }

  // Used by Google sign-in after it has fully authenticated the user.
  createSessionFor(userId: string, email: string, role: string, meta: RequestMeta) {
    return this.createSession(userId, email, role, meta);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async createSession(
    userId: string,
    email: string,
    role: string,
    meta: RequestMeta,
    remember = true,
  ): Promise<TokenPair> {
    const sessionId = randomUUID();
    const tokens = this.issueTokens(userId, email, role, sessionId, remember);
    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: hashToken(tokens.refreshToken),
        ip: meta.ip,
        userAgent: meta.userAgent,
        expiresAt: new Date(Date.now() + REFRESH_TTL * 1000),
      },
    });
    return tokens;
  }

  private issueTokens(sub: string, email: string, role: string, sid: string, remember = true): TokenPair {
    const accessToken = this.jwt.sign(
      { sub, email, role, sid },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: ACCESS_TTL },
    );
    const refreshToken = this.jwt.sign(
      // jti makes every token unique even within the same second, so rotation
      // always rotates and reuse detection can never confuse a replay with
      // the current token.
      { sub, sid, jti: randomUUID(), rm: remember },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: REFRESH_TTL },
    );
    return { accessToken, refreshToken, accessTtl: ACCESS_TTL, refreshTtl: REFRESH_TTL, remember };
  }

  publicUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      branchId: user.branchId,
      departmentId: user.departmentId,
      displayName: user.profile?.displayName ?? user.username,
      title: user.profile?.title ?? null,
      presence: user.profile?.presence ?? 'OFFLINE',
    };
  }
}
