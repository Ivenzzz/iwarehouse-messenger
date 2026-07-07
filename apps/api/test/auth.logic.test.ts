/*
 * Auth logic test suite — runs the REAL AuthService code (real argon2 hashing,
 * real JWT signing/verification) against an in-memory database stand-in.
 * Covers every login/refresh error branch. Run from apps/api:
 *   npx ts-node --transpile-only -r tsconfig-paths/register test/auth.logic.test.ts
 * (works without a running database; the docker smoke test covers HTTP-level)
 */
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.LOGIN_MAX_ATTEMPTS = '5';
process.env.LOGIN_LOCKOUT_MINUTES = '15';

import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as assert from 'assert';

// ── in-memory prisma stand-in (only the surface AuthService touches) ────────
interface UserRow {
  id: string; email: string; username: string; passwordHash: string;
  role: string; status: string; deletedAt: Date | null;
  failedLoginCount: number; lockedUntil: Date | null;
  branchId: null; departmentId: null; profile: { displayName: string; title: null; presence: string } | null;
  lastActiveAt?: Date;
}
interface SessionRow {
  id: string; userId: string; refreshTokenHash: string;
  expiresAt: Date; revokedAt: Date | null; lastUsedAt?: Date; ip?: string; userAgent?: string;
}

function makeDb() {
  const users = new Map<string, UserRow>();
  const sessions = new Map<string, SessionRow>();
  const prisma = {
    user: {
      findUnique: async ({ where }: any) => {
        if (where.email) return [...users.values()].find((u) => u.email === where.email) ?? null;
        return users.get(where.id) ?? null;
      },
      update: async ({ where, data }: any) => {
        const u = users.get(where.id)!;
        Object.assign(u, data);
        return u;
      },
    },
    session: {
      create: async ({ data }: any) => {
        const row: SessionRow = { revokedAt: null, ...data };
        sessions.set(data.id, row);
        return row;
      },
      findUnique: async ({ where }: any) => sessions.get(where.id) ?? null,
      update: async ({ where, data }: any) => {
        const s = sessions.get(where.id)!;
        Object.assign(s, data);
        return s;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const s of sessions.values()) {
          if ((where.id === undefined || s.id === where.id) && (where.userId === undefined || s.userId === where.userId)) {
            Object.assign(s, data);
            count++;
          }
        }
        return { count };
      },
      findMany: async () => [...sessions.values()],
    },
    _users: users,
    _sessions: sessions,
  };
  return prisma;
}

const auditLog: any[] = [];
const audit = { log: async (e: any) => { auditLog.push(e); } };

// Load the real service with its infra imports neutralized (the class only
// receives prisma/audit through the constructor; their modules would try to
// require the generated prisma client, which tests don't need).
import * as fs from 'fs';
import * as path from 'path';
const src = fs
  .readFileSync(path.join(__dirname, '../src/auth/auth.service.ts'), 'utf8')
  .replace("import { AuditService } from '../audit/audit.service';", 'type AuditService = any;')
  .replace("import { PrismaService } from '../prisma/prisma.service';", 'type PrismaService = any;')
  .replace("import { RealtimeService } from '../realtime/realtime.service';", 'type RealtimeService = any;');
const tmp = path.join(__dirname, '_auth.service.under-test.ts');
fs.writeFileSync(tmp, src);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthService } = require(tmp);

const jwt = new JwtService({});
const realtimeStub = { disconnectSession: () => undefined, disconnectUser: () => undefined };
const meta = { ip: '127.0.0.1', userAgent: 'test' };

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${(err as Error).message}`);
  }
}
async function expectError(p: Promise<any>, contains: string, status?: number) {
  try {
    await p;
    throw new Error(`expected error containing "${contains}", got success`);
  } catch (err: any) {
    if (err.message.startsWith('expected error')) throw err;
    const msg = err?.response?.message ?? err.message;
    assert.ok(String(msg).includes(contains), `message "${msg}" should contain "${contains}"`);
    if (status) assert.strictEqual(err.getStatus?.(), status, `status should be ${status}`);
  }
}

async function main() {
  const prisma = makeDb();
  const svc = new AuthService(prisma, jwt, audit, realtimeStub);
  const hash = await argon2.hash('Correct#123', { type: argon2.argon2id });
  prisma._users.set('u1', {
    id: 'u1', email: 'michael.yap@iwarehouse.ph', username: 'michael.yap',
    passwordHash: hash, role: 'SUPER_ADMIN', status: 'ACTIVE', deletedAt: null,
    failedLoginCount: 0, lockedUntil: null, branchId: null, departmentId: null,
    profile: { displayName: 'Michael Yap', title: null, presence: 'OFFLINE' },
  });
  prisma._users.set('u2', {
    id: 'u2', email: 'inactive@iwarehouse.ph', username: 'inactive',
    passwordHash: hash, role: 'MEMBER', status: 'INACTIVE', deletedAt: null,
    failedLoginCount: 0, lockedUntil: null, branchId: null, departmentId: null, profile: null,
  });

  console.log('\nLOGIN ERROR BRANCHES');
  await test('unknown email → 401 "Incorrect email or password"', () =>
    expectError(svc.login('nobody@iwarehouse.ph', 'x', meta), 'Incorrect email or password', 401));

  await test('wrong password → 401 same message (no user enumeration)', () =>
    expectError(svc.login('michael.yap@iwarehouse.ph', 'WRONG', meta), 'Incorrect email or password', 401));

  await test('wrong password increments failedLoginCount', async () => {
    assert.strictEqual(prisma._users.get('u1')!.failedLoginCount, 1);
  });

  await test('5th failure sets lockedUntil ≈ 15 minutes ahead', async () => {
    for (let i = 0; i < 4; i++) {
      await svc.login('michael.yap@iwarehouse.ph', 'WRONG', meta).catch(() => undefined);
    }
    const u = prisma._users.get('u1')!;
    assert.strictEqual(u.failedLoginCount, 5);
    assert.ok(u.lockedUntil && u.lockedUntil > new Date(), 'lockedUntil should be in the future');
    const mins = (u.lockedUntil!.getTime() - Date.now()) / 60000;
    assert.ok(mins > 14 && mins <= 15.1, `lockout ≈15min, got ${mins.toFixed(1)}`);
  });

  await test('locked account → 403 "Account temporarily locked…" even with CORRECT password', () =>
    expectError(svc.login('michael.yap@iwarehouse.ph', 'Correct#123', meta), 'Account temporarily locked', 403));

  await test('inactive account → 403 "deactivated"', () =>
    expectError(svc.login('inactive@iwarehouse.ph', 'Correct#123', meta), 'deactivated', 403));

  console.log('\nLOGIN SUCCESS PATH');
  prisma._users.get('u1')!.lockedUntil = null; // admin unlock
  let loginResult: any;
  await test('correct password → tokens + user payload', async () => {
    loginResult = await svc.login('michael.yap@iwarehouse.ph', 'Correct#123', meta);
    assert.ok(loginResult.tokens.accessToken && loginResult.tokens.refreshToken);
    assert.strictEqual(loginResult.user.email, 'michael.yap@iwarehouse.ph');
    assert.strictEqual(loginResult.user.displayName, 'Michael Yap');
  });
  await test('success resets failedLoginCount and lockedUntil', async () => {
    const u = prisma._users.get('u1')!;
    assert.strictEqual(u.failedLoginCount, 0);
    assert.strictEqual(u.lockedUntil, null);
  });
  await test('access token verifies with ACCESS secret and carries sub/role/sid', async () => {
    const p: any = jwt.verify(loginResult.tokens.accessToken, { secret: 'test-access-secret' });
    assert.strictEqual(p.sub, 'u1');
    assert.strictEqual(p.role, 'SUPER_ADMIN');
    assert.ok(p.sid);
  });
  await test('session stored with HASHED refresh token (not plaintext)', async () => {
    const s = [...prisma._sessions.values()][0];
    assert.notStrictEqual(s.refreshTokenHash, loginResult.tokens.refreshToken);
    assert.strictEqual(s.refreshTokenHash.length, 64); // sha256 hex
  });

  console.log('\nREFRESH / SESSION BRANCHES');
  let rotated: any;
  await test('refresh happy path rotates the stored hash', async () => {
    const before = [...prisma._sessions.values()][0].refreshTokenHash;
    rotated = await svc.refresh(loginResult.tokens.refreshToken, meta);
    const after = [...prisma._sessions.values()][0].refreshTokenHash;
    assert.ok(rotated.accessToken && rotated.refreshToken);
    assert.notStrictEqual(before, after, 'hash must rotate');
  });
  await test('REUSE of the old refresh token → 401 "Session revoked" + session revoked', async () => {
    await expectError(svc.refresh(loginResult.tokens.refreshToken, meta), 'Session revoked', 401);
    assert.ok([...prisma._sessions.values()][0].revokedAt, 'session must be revoked');
    assert.ok(auditLog.some((e) => e.action === 'auth.refresh_reuse_detected'));
  });
  await test('refresh on revoked session → 401 "Session expired"', () =>
    expectError(svc.refresh(rotated.refreshToken, meta), 'Session expired', 401));
  await test('garbage refresh token → 401 "Invalid refresh token"', () =>
    expectError(svc.refresh('not-a-jwt', meta), 'Invalid refresh token', 401));
  await test('missing refresh token → 401 "Missing refresh token"', () =>
    expectError(svc.refresh(undefined, meta), 'Missing refresh token', 401));
  await test('refresh for a user who became INACTIVE → 401 "Account disabled"', async () => {
    const fresh = await svc.login('michael.yap@iwarehouse.ph', 'Correct#123', meta);
    prisma._users.get('u1')!.status = 'INACTIVE';
    await expectError(svc.refresh(fresh.tokens.refreshToken, meta), 'Account disabled', 401);
    prisma._users.get('u1')!.status = 'ACTIVE';
  });
  await test('logout revokes only the caller\'s own session', async () => {
    const fresh = await svc.login('michael.yap@iwarehouse.ph', 'Correct#123', meta);
    const sid = (jwt.decode(fresh.tokens.refreshToken) as any).sid;
    await svc.logout(sid, 'someone-else', meta); // wrong owner: no-op
    assert.strictEqual(prisma._sessions.get(sid)!.revokedAt, null);
    await svc.logout(sid, 'u1', meta);
    assert.ok(prisma._sessions.get(sid)!.revokedAt);
  });

  await test('audit trail recorded FAILURE/DENIED/SUCCESS entries', async () => {
    const results = new Set(auditLog.map((e) => e.result ?? 'SUCCESS'));
    assert.ok(results.has('FAILURE') && results.has('DENIED'));
    assert.ok(auditLog.some((e) => e.action === 'auth.login' && (e.result ?? 'SUCCESS') === 'SUCCESS'));
  });

  fs.unlinkSync(tmp);
  console.log(`\nRESULT: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
