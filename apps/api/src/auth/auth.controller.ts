import {
  Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthService, TokenPair } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { AuthUser, CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';

const COOKIE_SECURE = process.env.COOKIE_SECURE !== 'false';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

function setAuthCookies(res: Response, tokens: TokenPair) {
  const base = {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax' as const,
    domain: COOKIE_DOMAIN,
    path: '/',
  };
  res.cookie('iwm_access', tokens.accessToken, { ...base, maxAge: tokens.accessTtl * 1000 });
  // The API is served under /api by NGINX (and the Next.js dev rewrite), so the
  // refresh cookie is scoped to the refresh route as the browser sees it.
  res.cookie('iwm_refresh', tokens.refreshToken, {
    ...base,
    path: '/api/auth',
    maxAge: tokens.refreshTtl * 1000,
  });
}

function clearAuthCookies(res: Response) {
  res.clearCookie('iwm_access', { path: '/' });
  res.clearCookie('iwm_refresh', { path: '/api/auth' });
}

const meta = (req: Request) => ({
  ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip,
  userAgent: req.headers['user-agent'],
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleAuthService,
  ) {}

  // Which sign-in methods the login page should offer.
  @Public()
  @Get('auth/providers')
  providers() {
    return { password: true, google: this.google.enabled };
  }

  @Public()
  @Get('auth/google')
  googleStart(@Res() res: Response) {
    if (!this.google.enabled) {
      res.redirect('/login?error=google_not_configured');
      return;
    }
    const state = randomUUID();
    res.cookie('iwm_oauth_state', state, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      path: '/',
    });
    res.redirect(this.google.buildAuthUrl(state));
  }

  @Public()
  @Get('auth/google/callback')
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      const expected = req.cookies?.iwm_oauth_state;
      res.clearCookie('iwm_oauth_state', { path: '/' });
      if (!code || !state || !expected || state !== expected) {
        res.redirect('/login?error=google');
        return;
      }
      const { tokens } = await this.google.handleCallback(code, meta(req));
      setAuthCookies(res, tokens);
      res.redirect('/chats');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      res.redirect(`/login?error=${encodeURIComponent(message)}`);
    }
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } }) // stricter limit on login
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, user } = await this.auth.login(dto.email, dto.password, meta(req));
    setAuthCookies(res, tokens);
    return { user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.refresh(req.cookies?.iwm_refresh, meta(req));
    setAuthCookies(res, tokens);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user.sessionId, user.id, meta(req));
    clearAuthCookies(res);
    return { ok: true };
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user.id);
  }

  @Delete('sessions/:id')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.auth.revokeSession(user.id, id, user.id, meta(req));
  }
}
