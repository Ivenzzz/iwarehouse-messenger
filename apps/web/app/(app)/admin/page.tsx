'use client';

import { useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Avatar from '@/components/avatar';
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

interface SystemStats {
  users: { total: number; active: number };
  sessionsActive: number;
  conversations: number;
  messages: number;
  uploads: { count: number; bytes: number };
  tasks: { open: number; byStatus: Record<string, number> };
  incidents: {
    byStatus: Record<string, number>;
    slaBreached: number;
    openByBranch: { branch: string; count: number }[];
  };
  databaseMb: number;
}

function formatGb(bytes: number) {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  return `${Math.round(bytes / 1_048_576)} MB`;
}

export default function AdminPage() {
  const { data: me } = useQuery<Me>({ queryKey: ['me'], queryFn: () => api.get('/me') });
  const isAdmin = me?.role === 'ADMIN' || me?.role === 'SUPER_ADMIN';

  const { data: overview, error } = useQuery<Overview>({
    queryKey: ['admin-overview'],
    queryFn: () => api.get('/admin/overview'),
    enabled: isAdmin,
  });
  const { data: system } = useQuery<SystemStats>({
    queryKey: ['admin-system'],
    queryFn: () => api.get('/admin/system'),
    enabled: isAdmin,
    refetchInterval: 60_000,
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
          Create accounts, manage roles and access, reset passwords, and review the audit trail.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {system && (
          <section className="mb-6">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-faint">System</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Active users" value={system.users.active} />
              <Stat label="Live sessions" value={system.sessionsActive} />
              <Stat label="Messages" value={system.messages} />
              <Stat label="Conversations" value={system.conversations} />
              <Stat label="Open tasks" value={system.tasks.open} />
              <Stat
                label="SLA breached"
                value={system.incidents.slaBreached}
                accent={system.incidents.slaBreached > 0}
              />
              <div className="rounded-md border border-line bg-surface px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">Files</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">
                  {formatGb(system.uploads.bytes)}
                </p>
                <p className="text-[10px] text-faint">{system.uploads.count} files</p>
              </div>
              <div className="rounded-md border border-line bg-surface px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">Database</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{system.databaseMb} MB</p>
                <p className="text-[10px] text-faint">PostgreSQL</p>
              </div>
            </div>
            {system.incidents.openByBranch.length > 0 && (
              <p className="mt-2 text-xs text-soft">
                Open incidents by branch:{' '}
                {system.incidents.openByBranch.map((b, i) => (
                  <span key={b.branch}>
                    {i > 0 && ' · '}
                    <span className="font-medium">{b.branch}</span> {b.count}
                  </span>
                ))}
              </p>
            )}
          </section>
        )}

        {me && <UsersSection meRole={me.role} />}

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


// ── Users management (Phase: account administration UI) ─────────────────────

interface AdminUserRow {
  id: string;
  email: string;
  username: string;
  role: string;
  status: string;
  branch?: { id: string; code: string } | null;
  department?: { id: string; code: string; name?: string } | null;
  profile?: { displayName: string; avatarKey?: string | null } | null;
}

interface ScopeOption { id: string; code?: string; name: string }

const ROLE_OPTIONS = ['READ_ONLY', 'MEMBER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'];

function UsersSection({ meRole }: { meRole: string }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: users } = useQuery<{ items: AdminUserRow[] }>({
    queryKey: ['admin-users', q],
    queryFn: () => api.get(`/users?limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });
  const { data: branches } = useQuery<ScopeOption[]>({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches'),
  });
  const { data: departments } = useQuery<ScopeOption[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments'),
  });

  async function patchUser(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/admin/users/${id}`, body);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(u: AdminUserRow) {
    const newPassword = window.prompt(
      `New password for ${u.profile?.displayName ?? u.username} (min 10 characters):`,
    );
    if (!newPassword) return;
    setBusyId(u.id);
    setError(null);
    try {
      await api.post(`/admin/users/${u.id}/reset-password`, { newPassword });
      window.alert('Password reset. Share it with the person securely — they should change it after signing in.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide text-faint">Users</h2>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email"
            className="rounded-md border border-line bg-canvas px-2.5 py-1 text-xs"
          />
          <button
            onClick={() => setCreating(true)}
            className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-ink"
          >
            + New user
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-2 overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="bg-raised text-[10px] uppercase tracking-wide text-faint">
            <tr>
              <th className="px-3 py-2">Person</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Branch</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users?.items.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <Avatar
                      userId={u.id}
                      name={u.profile?.displayName ?? u.username}
                      avatarKey={u.profile?.avatarKey}
                      size="xs"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {u.profile?.displayName ?? u.username}
                      </span>
                      <span className="block truncate text-[10px] text-faint">{u.email}</span>
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={u.role}
                    disabled={busyId === u.id || (u.role === 'SUPER_ADMIN' && meRole !== 'SUPER_ADMIN')}
                    onChange={(e) => patchUser(u.id, { role: e.target.value })}
                    className="rounded border border-line bg-canvas px-1.5 py-1 text-[11px]"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r.toLowerCase().replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-[11px]">{u.branch?.code ?? '—'}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      u.status === 'ACTIVE' ? 'bg-ok/15 text-ok' : 'bg-raised text-faint'
                    }`}
                  >
                    {u.status.toLowerCase()}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="flex justify-end gap-2">
                    <button
                      onClick={() => resetPassword(u)}
                      disabled={busyId === u.id}
                      className="text-[11px] text-soft underline hover:text-ink disabled:opacity-40"
                    >
                      Reset password
                    </button>
                    <button
                      onClick={() =>
                        patchUser(u.id, { status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
                      }
                      disabled={busyId === u.id}
                      className={`text-[11px] underline disabled:opacity-40 ${
                        u.status === 'ACTIVE' ? 'text-danger' : 'text-ok'
                      }`}
                    >
                      {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-faint">
        Deactivating signs the person out everywhere instantly. Only a super admin can grant or
        change admin roles. There is no self-registration — every account is created here.
      </p>

      {creating && (
        <CreateUserModal
          branches={branches ?? []}
          departments={departments ?? []}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
          }}
        />
      )}
    </section>
  );
}

function CreateUserModal({
  branches,
  departments,
  onClose,
  onCreated,
}: {
  branches: ScopeOption[];
  departments: ScopeOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    username: '',
    password: '',
    role: 'MEMBER',
    branchId: '',
    departmentId: '',
    title: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/admin/users', {
        displayName: form.displayName.trim(),
        email: form.email.trim().toLowerCase(),
        username: form.username.trim().toLowerCase(),
        password: form.password,
        role: form.role,
        branchId: form.branchId || undefined,
        departmentId: form.departmentId || undefined,
        title: form.title.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the user.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Create user</h2>
          <button onClick={onClose} aria-label="Close" className="text-soft hover:text-ink">✕</button>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <Field label="Full name">
            <input autoFocus value={form.displayName} onChange={(e) => set('displayName', e.target.value)}
              placeholder="Juan Dela Cruz" className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Work email">
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                placeholder="juan@iwarehouse.ph" className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
            </Field>
            <Field label="Username (for @mentions)">
              <input value={form.username} onChange={(e) => set('username', e.target.value)}
                placeholder="juan.delacruz" className="w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-sm" />
            </Field>
          </div>
          <Field label="Temporary password (min 10 characters)">
            <input value={form.password} onChange={(e) => set('password', e.target.value)}
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-sm" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Role">
              <select value={form.role} onChange={(e) => set('role', e.target.value)}
                className="w-full rounded-md border border-line bg-canvas px-2 py-2 text-sm">
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r.toLowerCase().replace('_', ' ')}</option>
                ))}
              </select>
            </Field>
            <Field label="Branch">
              <select value={form.branchId} onChange={(e) => set('branchId', e.target.value)}
                className="w-full rounded-md border border-line bg-canvas px-2 py-2 text-sm">
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.code ?? b.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Department">
              <select value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)}
                className="w-full rounded-md border border-line bg-canvas px-2 py-2 text-sm">
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.code ?? d.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Job title (optional)">
            <input value={form.title} onChange={(e) => set('title', e.target.value)}
              placeholder="Branch OIC" className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm">Cancel</button>
          <button
            onClick={submit}
            disabled={busy || !form.displayName || !form.email || !form.username || form.password.length < 10}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create user'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-soft">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
