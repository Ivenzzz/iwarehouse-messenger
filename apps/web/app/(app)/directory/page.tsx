'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { DirectoryUser, Me } from '@/lib/types';
import Avatar from '@/components/avatar';

interface OrgUnit {
  id: string;
  name: string;
  code: string;
}

export default function DirectoryPage() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery<Me>({ queryKey: ['me'], queryFn: () => api.get('/me') });
  const isAdmin = me?.role === 'ADMIN' || me?.role === 'SUPER_ADMIN';
  const photoTarget = useRef<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);

  async function adminSetPhoto(file: File) {
    const userId = photoTarget.current;
    if (!userId) return;
    setPhotoBusy(userId);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/admin/users/${userId}/avatar`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    setPhotoBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.message ?? 'Could not set the photo.');
      return;
    }
    queryClient.invalidateQueries();
  }

  const [q, setQ] = useState('');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [role, setRole] = useState('');

  const { data: branches } = useQuery<OrgUnit[]>({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches'),
  });
  const { data: departments } = useQuery<OrgUnit[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments'),
  });

  const search = new URLSearchParams({ limit: '100' });
  if (q) search.set('q', q);
  if (branchId) search.set('branchId', branchId);
  if (departmentId) search.set('departmentId', departmentId);
  if (role) search.set('role', role);

  const { data, isLoading } = useQuery<{ items: DirectoryUser[] }>({
    queryKey: ['users', q, branchId, departmentId, role],
    queryFn: () => api.get(`/users?${search.toString()}`),
  });

  return (
    <div className="flex h-full flex-col">
      <input
        ref={photoInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) adminSetPhoto(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <header className="border-b border-line bg-surface px-4 py-3">
        <h1 className="text-sm font-semibold tracking-tight">Directory</h1>
        <p className="text-xs text-soft">Everyone at iWarehouse, by branch and department.</p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-line bg-surface px-4 py-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email"
          className="w-56 rounded-md border border-line bg-canvas px-3 py-1.5 text-sm"
          aria-label="Search people"
        />
        <Select value={branchId} onChange={setBranchId} label="All branches" options={branches} />
        <Select
          value={departmentId}
          onChange={setDepartmentId}
          label="All departments"
          options={departments}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-md border border-line bg-canvas px-2 py-1.5 text-sm"
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'MEMBER', 'READ_ONLY'].map((r) => (
            <option key={r} value={r}>
              {r.replace('_', ' ').toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading && <p className="text-sm text-soft">Loading people…</p>}
        {data?.items.length === 0 && (
          <p className="text-sm text-soft">No one matches these filters. Try clearing them.</p>
        )}
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {data?.items.map((u) => (
            <li key={u.id} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    type="button"
                    disabled={!isAdmin || photoBusy === u.id}
                    title={isAdmin ? 'Set this person\u2019s photo' : undefined}
                    onClick={() => {
                      if (!isAdmin) return;
                      photoTarget.current = u.id;
                      photoInput.current?.click();
                    }}
                    className={isAdmin ? 'cursor-pointer' : 'cursor-default'}
                  >
                    <Avatar
                      userId={u.id}
                      name={u.profile?.displayName ?? u.username}
                      avatarKey={u.profile?.avatarKey}
                      size="md"
                    />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {u.profile?.displayName ?? u.username}
                    </p>
                    <p className="truncate text-xs text-soft">{u.profile?.title ?? u.email}</p>
                  </div>
                </div>
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    u.status === 'ACTIVE' ? 'bg-ok' : 'bg-faint'
                  }`}
                  title={u.status === 'ACTIVE' ? 'Active account' : 'Inactive account'}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {u.branch && <span className="stamp">{u.branch.code}</span>}
                {u.department && <span className="stamp">{u.department.code}</span>}
                <span className="stamp stamp-accent">{u.role.replace('_', ' ')}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options?: OrgUnit[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-line bg-canvas px-2 py-1.5 text-sm"
      aria-label={label}
    >
      <option value="">{label}</option>
      {options?.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}


function EditableAvatar({ user, canEdit }: { user: DirectoryUser; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function uploadFor(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/admin/users/${user.id}/avatar`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.message ?? 'Could not upload the photo.');
      }
      await queryClient.invalidateQueries();
    } finally {
      setBusy(false);
    }
  }

  const avatar = (
    <Avatar
      userId={user.id}
      name={user.profile?.displayName ?? user.username}
      avatarKey={user.profile?.avatarKey}
      size="md"
    />
  );

  if (!canEdit) return avatar;

  return (
    <span className="group/av relative shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) uploadFor(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title={`Upload photo for ${user.profile?.displayName ?? user.username}`}
        aria-label={`Upload photo for ${user.profile?.displayName ?? user.username}`}
        className="block"
      >
        {avatar}
        {/* Desktop: hover overlay */}
        <span
          className={`absolute inset-0 hidden items-center justify-center rounded-full bg-black/45 text-[9px] font-semibold text-white ${
            busy ? 'md:flex' : 'md:hidden md:group-hover/av:flex'
          }`}
        >
          {busy ? '…' : 'EDIT'}
        </span>
        {/* Touch: persistent corner badge (audit U-1) */}
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-surface bg-accent text-[8px] text-accent-ink md:hidden"
          aria-hidden
        >
          {busy ? '…' : '✎'}
        </span>
      </button>
    </span>
  );
}
