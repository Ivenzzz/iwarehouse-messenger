import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, RequestMeta } from './auth.service';

// "Continue with Google" — authorization-code flow against Google Identity.
// Enabled only when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set in .env.
//
// Account rules:
// - A Google account whose email matches an existing ACTIVE user signs in as
//   that user (no password needed).
// - Unknown emails are only auto-registered when GOOGLE_AUTO_CREATE=true,
//   and (if set) the email domain matches GOOGLE_ALLOWED_DOMAIN. New users
//   get the MEMBER role; an admin can adjust role/branch/department after.

interface GoogleTokens {
  access_token?: string;
  id_token?: string;
  error?: string;
}

interface GoogleUserInfo {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger('GoogleAuth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  get enabled(): boolean {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  private redirectUri(): string {
    const base = (process.env.APP_URL ?? 'http://localhost').replace(/\/$/, '');
    return `${base}/api/auth/google/callback`;
  }

  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(code: string, meta: RequestMeta) {
    // 1) Exchange the code for tokens.
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    const tokens = (await tokenRes.json()) as GoogleTokens;
    if (!tokenRes.ok || !tokens.access_token) {
      this.logger.warn(`token exchange failed: ${tokens.error ?? tokenRes.status}`);
      throw new UnauthorizedException('Google sign-in failed. Try again.');
    }

    // 2) Fetch the verified profile.
    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = (await infoRes.json()) as GoogleUserInfo;
    const email = info.email?.toLowerCase();
    if (!infoRes.ok || !email || info.email_verified === false) {
      throw new UnauthorizedException('Google did not return a verified email.');
    }

    // 3) Match or create the local user.
    let user = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (user?.deletedAt) user = null;

    if (user && user.status === 'INACTIVE') {
      throw new ForbiddenException(
        'This account has been deactivated. Contact your administrator.',
      );
    }

    if (!user) {
      const autoCreate = (process.env.GOOGLE_AUTO_CREATE ?? 'false') === 'true';
      const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN?.toLowerCase();
      const domain = email.split('@')[1];
      if (!autoCreate || (allowedDomain && domain !== allowedDomain)) {
        await this.audit.log({
          actorId: null,
          action: 'auth.google_denied',
          target: email,
          result: 'DENIED',
          metadata: { reason: autoCreate ? 'domain_not_allowed' : 'auto_create_disabled' },
          ...meta,
        });
        throw new ForbiddenException(
          'No iWarehouse account exists for this Google email. Ask your administrator to create one.',
        );
      }

      const username = await this.uniqueUsername(email.split('@')[0]);
      user = await this.prisma.user.create({
        data: {
          email,
          username,
          // Random password: the account is Google-only until an admin resets it.
          passwordHash: await argon2.hash(randomUUID() + randomUUID()),
          role: 'MEMBER',
          profile: {
            create: { displayName: info.name?.slice(0, 80) || username },
          },
          notificationPreference: { create: {} },
        },
        include: { profile: true },
      });
      await this.audit.log({
        actorId: user.id,
        action: 'auth.google_signup',
        target: email,
        result: 'SUCCESS',
        ...meta,
      });
    }

    // 4) Same session + cookies as a password login.
    const tokensPair = await this.auth.createSessionFor(user.id, user.email, user.role, meta);
    await this.audit.log({
      actorId: user.id,
      action: 'auth.login',
      target: user.email,
      result: 'SUCCESS',
      metadata: { method: 'google' },
      ...meta,
    });
    return { tokens: tokensPair };
  }

  private async uniqueUsername(base: string): Promise<string> {
    const clean = base.replace(/[^a-z0-9.\-_]/gi, '').toLowerCase() || 'user';
    let candidate = clean;
    for (let i = 0; i < 20; i++) {
      const exists = await this.prisma.user.findUnique({ where: { username: candidate } });
      if (!exists) return candidate;
      candidate = `${clean}${Math.floor(Math.random() * 1000)}`;
    }
    return `${clean}-${randomUUID().slice(0, 6)}`;
  }
}
