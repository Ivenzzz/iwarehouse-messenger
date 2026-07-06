'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, Suspense, useState } from 'react';
import { api, ApiError } from '@/lib/api';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get('expired') === '1';
  const urlError = params.get('error');
  const { data: providers } = useQuery<{ password: boolean; google: boolean }>({
    queryKey: ['auth-providers'],
    queryFn: () => api.get('/auth/providers'),
    staleTime: 60_000,
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/auth/login', { email, password });
      router.push('/chats');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection.');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen">
      {/* Brand panel */}
      <aside className="hidden w-[44%] flex-col justify-between bg-[#181a1d] p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <LogoMark />
          <span className="text-sm font-semibold tracking-wide">iWarehouse Messenger</span>
        </div>
        <div>
          <p className="max-w-sm text-3xl font-semibold leading-snug tracking-tight">
            One secure workspace for every iWarehouse team.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {['HQ', 'WHS', 'BCD-MAIN', 'CDZ', 'DGT', 'RMA', 'FIN', 'AUDIT'].map((c) => (
              <span
                key={c}
                className="rounded-sm border border-white/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-white/60"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/40">
          Private company system · Hosted on iWarehouse infrastructure
        </p>
      </aside>

      {/* Form */}
      <section className="flex flex-1 items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark />
            <span className="text-sm font-semibold">iWarehouse Messenger</span>
          </div>

          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-soft">Use your company account.</p>

          <label className="mt-6 block text-xs font-medium text-soft" htmlFor="email">
            Work email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            placeholder="name@iwarehouse.ph"
          />

          <label className="mt-4 block text-xs font-medium text-soft" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />

          {urlError && !error && (
            <p className="mb-3 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
              {urlError === 'google' || urlError === 'google_not_configured'
                ? 'Google sign-in is not available right now.'
                : decodeURIComponent(urlError)}
            </p>
          )}
          {expired && !error && (
            <p className="mb-3 rounded-md border border-line bg-raised px-3 py-2 text-sm text-soft">
              Your session expired or was signed out. Please sign in again.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="mt-4 text-xs text-faint">
            Locked out? Ask your branch OIC or IT admin to reset your password.
          </p>
        </form>

        {providers?.google && (
          <>
            <div className="my-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs text-faint">or</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <a
              href="/api/auth/google"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-2.5 text-sm font-medium hover:bg-raised"
            >
              <GoogleMark />
              Continue with Google
            </a>
          </>
        )}
      </section>
    </main>
  );
}

function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect x="1" y="7" width="26" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M1 12h26" stroke="currentColor" strokeWidth="2" />
      <path d="M4 7l10-5 10 5" fill="none" stroke="rgb(232 111 30)" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="11" y="17" width="6" height="6" fill="rgb(232 111 30)" />
    </svg>
  );
}


function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M21.6 12.23c0-.68-.06-1.36-.19-2.02H12v3.83h5.4a4.6 4.6 0 01-2 3.02v2.5h3.23c1.9-1.74 2.97-4.3 2.97-7.33z"
        fill="#4285F4"
      />
      <path
        d="M12 21.5c2.7 0 4.96-.9 6.62-2.42l-3.23-2.5c-.9.6-2.05.95-3.39.95-2.6 0-4.8-1.76-5.6-4.12H3.07v2.58A10 10 0 0012 21.5z"
        fill="#34A853"
      />
      <path
        d="M6.4 13.4a6 6 0 010-3.8V7.02H3.07a10 10 0 000 8.96L6.4 13.4z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.46c1.47 0 2.79.5 3.83 1.5l2.86-2.87A9.98 9.98 0 003.07 7.02L6.4 9.6c.8-2.37 3-4.13 5.6-4.13z"
        fill="#EA4335"
      />
    </svg>
  );
}
