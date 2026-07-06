'use client';

import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { Me } from '@/lib/types';

interface Overview {
  users: number;
  activeUsers: number;
  branches: number;
  departments: number;
  activeSessions: number;
}

interface AuditRow {
  id: string;
  action: string;
  target?: string | null;
  result: string;
  ip?: string | null;
  createdAt: string;
  actor?: { username: string; email: string } | null;
}

export default function AdminPage() {
  const { data: me } = useQuery<Me>({ queryKey: ['me'], queryFn: () => api.get('/me') });
  const isAdmin = me?.role === 'ADMIN' || me?.role === 'SUPER_ADMIN';

  const { data: overview, error } = useQuery<Overview>({
    queryKey: ['admin-overview'],
    queryFn: () => api.get('/admin/overview'),
    enabled: isAdmin,
  });
  const { data: logs, isLoading: logsLoading } = useQuery<AuditRow[]>({
    queryKey: ['audit-logs'],
    queryFn: () => api.get('/admin/audit-logs?limit=50'),
    enabled: isAdmin,
  });

  if (me && !isAdmin) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <p className="text-sm font-medium">Admin access required</p>
          <p className="mt-1 max-w-xs text-xs text-soft">
            This area is for administrators. Ask IT if you believe you should have access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line bg-surface px-4 py-3">
        <h1 className="text-sm font-semibold tracking-tight">Administration</h1>
        <p className="text-xs text-soft">
          Accounts, sessions, and the audit trail. User creation runs through{' '}
          <code className="font-mono">POST /admin/users</code> — see the API docs at{' '}
          <code className="font-mono">/api/docs</code>.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error instanceof ApiError && (
          <p className="mb-4 text-sm text-danger">Could not load admin data: {error.message}</p>
        )}

        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Users" value={overview?.users} />
          <Stat label="Active users" value={overview?.activeUsers} accent />
          <Stat label="Branches" value={overview?.branches} />
          <Stat label="Departments" value={overview?.departments} />
          <Stat label="Live sessions" value={overview?.activeSessions} />
        </div>

        <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-soft">
          Audit log
        </h2>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs text-soft">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logsLoading && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-soft">
                    Loading audit events…
                  </td>
                </tr>
              )}
              {logs?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-soft">
                    No audit events yet. Sign-ins and admin actions will appear here.
                  </td>
                </tr>
              )}
              {logs?.map((r) => (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-soft">
                    {new Date(r.createdAt).toLocaleString('en-PH', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-3 py-2">{r.actor?.username ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-xs text-soft">
                    {r.target ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`stamp ${
                        r.result === 'SUCCESS' ? '' : 'stamp-accent'
                      }`}
                    >
                      {r.result}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-soft">{r.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value?: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-xs text-soft">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? 'text-accent' : ''}`}>
        {value ?? '—'}
      </p>
    </div>
  );
}
