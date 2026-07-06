'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { EmojiPicker } from '@/components/emoji';
import type { DirectoryUser, Me } from '@/lib/types';

export default function NewChatDialog({
  me,
  onClose,
  onCreated,
}: {
  me: Me;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [mode, setMode] = useState<'dm' | 'group'>('dm');
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState<string>('👥');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data } = useQuery<{ items: DirectoryUser[] }>({
    queryKey: ['users-picker', q],
    queryFn: () => api.get(`/users?limit=50${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });
  const users = (data?.items ?? []).filter((u) => u.id !== me.id && u.status === 'ACTIVE');

  const canCreateGroup = me.role !== 'READ_ONLY';

  async function startDm(userId: string) {
    setBusy(true);
    setError(null);
    try {
      const res: { id: string } = await api.post('/conversations', { type: 'DIRECT', userId });
      onCreated(res.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the conversation.');
      setBusy(false);
    }
  }

  async function createGroup() {
    if (!title.trim() || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res: { id: string } = await api.post('/conversations', {
        type: 'PRIVATE_GROUP',
        title: title.trim(),
        icon,
        memberIds: selected,
      });
      onCreated(res.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the group.');
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg border border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">New conversation</h2>
          <button onClick={onClose} aria-label="Close" className="text-soft hover:text-ink">
            ✕
          </button>
        </header>

        <div className="flex gap-1 border-b border-line px-4 py-2">
          <TabButton active={mode === 'dm'} onClick={() => setMode('dm')}>
            Direct message
          </TabButton>
          {canCreateGroup && (
            <TabButton active={mode === 'group'} onClick={() => setMode('group')}>
              Group
            </TabButton>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {mode === 'group' && (
            <div className="relative mb-3 flex items-center gap-2">
              <button
                onClick={() => setShowIconPicker((v) => !v)}
                title="Group icon"
                aria-label="Group icon"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-xl"
              >
                {icon}
              </button>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Group name"
                className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
              />
              {showIconPicker && (
                <div className="absolute left-0 top-full z-30 mt-1">
                  <div className="relative h-0">
                    <EmojiPicker
                      align="left"
                      direction="down"
                      onClose={() => setShowIconPicker(false)}
                      onPick={(e) => {
                        setIcon(e);
                        setShowIconPicker(false);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people"
            className="mb-3 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
          />
          <ul className="space-y-1">
            {users.map((u) => (
              <li key={u.id}>
                <button
                  disabled={busy}
                  onClick={() => (mode === 'dm' ? startDm(u.id) : toggle(u.id))}
                  className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-raised ${
                    mode === 'group' && selected.includes(u.id) ? 'bg-accent/10' : ''
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-raised text-xs font-semibold">
                    {(u.profile?.displayName ?? u.username).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {u.profile?.displayName ?? u.username}
                    </span>
                    <span className="block truncate text-xs text-faint">
                      {u.profile?.title ?? u.role}
                      {u.branch ? ` · ${u.branch.code}` : ''}
                    </span>
                  </span>
                  {mode === 'group' && (
                    <span className="text-xs text-accent">
                      {selected.includes(u.id) ? 'Added' : ''}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {users.length === 0 && (
              <li className="py-6 text-center text-sm text-faint">No people match your search.</li>
            )}
          </ul>
        </div>

        {error && <p className="px-4 pb-2 text-sm text-danger">{error}</p>}

        {mode === 'group' && (
          <footer className="border-t border-line p-3">
            <button
              onClick={createGroup}
              disabled={busy || !title.trim() || selected.length === 0}
              className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
            >
              Create group ({selected.length} {selected.length === 1 ? 'member' : 'members'})
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium ${
        active ? 'bg-accent/10 text-accent' : 'text-soft hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
