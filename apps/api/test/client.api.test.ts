/*
 * Client API interceptor tests — runs the REAL apps/web/lib/api.ts request
 * logic with a mocked fetch and window. Verifies the login-error unmasking
 * fix and the expired-session redirect. Run from apps/api (shares ts-node):
 *   npx ts-node --transpile-only test/client.api.test.ts
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

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

type Handler = (url: string, init?: any) => { status: number; body?: any };

function makeFetch(handlers: Handler) {
  const calls: { url: string; method: string }[] = [];
  const fetchMock = async (url: string, init: any = {}) => {
    calls.push({ url, method: init.method ?? 'GET' });
    const r = handlers(url, init);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? {},
      text: async () => JSON.stringify(r.body ?? {}),
    };
  };
  return { fetchMock, calls };
}

function loadApi(fetchMock: any, pathname = '/chats') {
  const locations: string[] = [];
  (global as any).window = {
    isSecureContext: false,
    localStorage: { getItem: () => null, setItem: () => undefined },
    location: {
      pathname,
      get href() {
        return locations[locations.length - 1] ?? pathname;
      },
      set href(v: string) {
        locations.push(v);
      },
    },
  };
  (global as any).fetch = fetchMock;
  // Fresh module each time (module keeps a `redirecting` latch).
  const src = fs.readFileSync(
    path.join(__dirname, '../../web/lib/api.ts'),
    'utf8',
  );
  const tmp = path.join(__dirname, '_api.under-test.ts');
  fs.writeFileSync(tmp, src.replace(/^'use client';\n/, ''));
  delete require.cache[require.resolve(tmp)];
  const mod = require(tmp);
  return { mod, locations, cleanup: () => fs.unlinkSync(tmp) };
}

async function main() {
  console.log('\nCLIENT INTERCEPTOR — LOGIN ERROR SURFACING (regression for the masking bug)');

  await test('login 401 shows the SERVER message, not "Session expired", and never calls refresh', async () => {
    const { fetchMock, calls } = makeFetch((url) => {
      if (url === '/api/auth/login') return { status: 401, body: { message: 'Incorrect email or password' } };
      return { status: 500 };
    });
    const { mod, cleanup } = loadApi(fetchMock, '/login');
    try {
      await assert.rejects(
        mod.api.post('/auth/login', { email: 'x', password: 'y' }),
        (e: any) => e.message === 'Incorrect email or password',
      );
      assert.ok(!calls.some((c) => c.url === '/api/auth/refresh'), 'must not attempt refresh for /auth/*');
    } finally {
      cleanup();
    }
  });

  await test('login 403 lockout message surfaces verbatim', async () => {
    const { fetchMock } = makeFetch((url) =>
      url === '/api/auth/login'
        ? { status: 403, body: { message: 'Account temporarily locked after repeated failed sign-ins. Try again later.' } }
        : { status: 500 },
    );
    const { mod, cleanup } = loadApi(fetchMock, '/login');
    try {
      await assert.rejects(
        mod.api.post('/auth/login', {}),
        (e: any) => e.message.includes('Account temporarily locked'),
      );
    } finally {
      cleanup();
    }
  });

  console.log('\nCLIENT INTERCEPTOR — SILENT REFRESH & FORCED RE-LOGIN');

  await test('data 401 → refresh succeeds → original request retried once → data returned', async () => {
    let convCalls = 0;
    const { fetchMock, calls } = makeFetch((url) => {
      if (url === '/api/conversations') {
        convCalls++;
        return convCalls === 1 ? { status: 401, body: {} } : { status: 200, body: [{ id: 'c1' }] };
      }
      if (url === '/api/auth/refresh') return { status: 200, body: {} };
      return { status: 500 };
    });
    const { mod, cleanup } = loadApi(fetchMock);
    try {
      const data = await mod.api.get('/conversations');
      assert.deepStrictEqual(data, [{ id: 'c1' }]);
      assert.strictEqual(convCalls, 2, 'original request retried exactly once');
      assert.strictEqual(calls.filter((c) => c.url === '/api/auth/refresh').length, 1);
    } finally {
      cleanup();
    }
  });

  await test('data 401 → refresh FAILS → logout called + redirected to /login?expired=1', async () => {
    const { fetchMock, calls } = makeFetch((url) => {
      if (url === '/api/conversations') return { status: 401, body: {} };
      if (url === '/api/auth/refresh') return { status: 401, body: {} };
      if (url === '/api/auth/logout') return { status: 200, body: {} };
      return { status: 500 };
    });
    const { mod, locations, cleanup } = loadApi(fetchMock, '/chats');
    try {
      await assert.rejects(mod.api.get('/conversations'), (e: any) => e.message === 'Session expired');
      assert.ok(calls.some((c) => c.url === '/api/auth/logout'), 'stale cookies must be cleared');
      assert.strictEqual(locations[locations.length - 1], '/login?expired=1');
    } finally {
      cleanup();
    }
  });

  await test('already on /login → dead session does NOT redirect-loop', async () => {
    const { fetchMock, calls } = makeFetch((url) => {
      if (url === '/api/auth/refresh') return { status: 401, body: {} };
      return { status: 401, body: {} };
    });
    const { mod, locations, cleanup } = loadApi(fetchMock, '/login');
    try {
      await assert.rejects(mod.api.get('/me'));
      assert.strictEqual(locations.length, 0, 'no navigation while on /login');
      assert.ok(!calls.some((c) => c.url === '/api/auth/logout'));
    } finally {
      cleanup();
    }
  });

  await test('non-401 errors pass through with server message (e.g. 429 rate limit)', async () => {
    const { fetchMock } = makeFetch(() => ({ status: 429, body: { message: 'Too many requests' } }));
    const { mod, cleanup } = loadApi(fetchMock);
    try {
      await assert.rejects(mod.api.post('/conversations/x/messages', {}), (e: any) =>
        e.message.includes('Too many'),
      );
    } finally {
      cleanup();
    }
  });

  console.log(`\nRESULT: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
