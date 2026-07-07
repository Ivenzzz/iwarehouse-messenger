'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';

interface Scope {
  id: string;
  code?: string;
  name: string;
}

// Post once, reach exactly the right people: everyone, selected branches, or
// selected departments. The server maintains one durable announcement channel
// per scope, keeps its membership synced to current staff, and every post
// carries "Seen by N" acknowledgement tracking automatically.
export default function AnnouncementComposer({
  onClose,
  onPosted,
}: {
  onClose: () => void;
  onPosted: (first: { conversationId: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'everyone' | 'branches' | 'departments'>('everyone');
  const [picked, setPicked] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: branches } = useQuery<Scope[]>({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches'),
  });
  const { data: departments } = useQuery<Scope[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments'),
  });

  const list = mode === 'branches' ? branches : mode === 'departments' ? departments : [];

  async function post() {
    if (content.trim().length < 5) {
      setError('Write the announcement first.');
      return;
    }
    if (mode !== 'everyone' && picked.length === 0) {
      setError(`Pick at least one ${mode === 'branches' ? 'branch' : 'department'}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result: { posted: { conversationId: string; title: string; recipients: number }[] } =
        await api.post('/announcements', {
          content: content.trim(),
          audience:
            mode === 'everyone'
              ? { everyone: true }
              : mode === 'branches'
                ? { branchIds: picked }
                : { departmentIds: picked },
        });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (result.posted[0]) onPosted(result.posted[0]);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not post the announcement.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">📣 Post announcement</h2>
          <button onClick={onClose} aria-label="Close" className="text-soft hover:text-ink">✕</button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div>
            <span className="text-xs font-medium text-soft">Audience</span>
            <div className="mt-1 flex gap-1">
              {(
                [
                  ['everyone', 'Everyone'],
                  ['branches', 'Branches'],
                  ['departments', 'Departments'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => {
                    setMode(k);
                    setPicked([]);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    mode === k ? 'bg-accent/10 text-accent' : 'text-soft hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mode !== 'everyone' && (
            <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-line p-2">
              {(list ?? []).map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-raised">
                  <input
                    type="checkbox"
                    checked={picked.includes(s.id)}
                    onChange={(e) =>
                      setPicked((ids) =>
                        e.target.checked ? [...ids, s.id] : ids.filter((i) => i !== s.id),
                      )
                    }
                    className="h-3.5 w-3.5 accent-[#E86F1E]"
                  />
                  <span className="truncate">
                    {s.code ? `${s.code} — ` : ''}
                    {s.name}
                  </span>
                </label>
              ))}
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-soft">Announcement</span>
            <textarea
              autoFocus
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="e.g. New IMEI double-check policy starts Monday: every release must be scanned twice before handover…"
              className="mt-1 w-full resize-y rounded-md border border-line bg-canvas px-3 py-2 text-sm"
            />
          </label>

          <p className="rounded-md bg-raised px-3 py-2 text-[11px] text-soft">
            Posts into the audience's announcement channel with "Mark as read" tracking, so you can
            see exactly who has seen it. Everyone in scope is added automatically — including people
            hired since the last announcement.
          </p>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={post}
            disabled={busy}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            {busy ? 'Posting…' : 'Post announcement'}
          </button>
        </footer>
      </div>
    </div>
  );
}
