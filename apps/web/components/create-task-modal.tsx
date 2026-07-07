'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { createTask } from '@/lib/ops-service';
import type { DirectoryUser } from '@/lib/types';

// Task creation modal. Opens from a message's "Create task" action (prefilled
// from the message), the chat header button, or the composer + menu.
export default function CreateTaskModal({
  conversationId,
  sourceMessage,
  onClose,
  onCreated,
}: {
  conversationId?: string;
  sourceMessage?: { id: string; content: string; senderName?: string };
  onClose: () => void;
  onCreated?: (taskId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(
    sourceMessage ? sourceMessage.content.slice(0, 140) : '',
  );
  const [description, setDescription] = useState(
    sourceMessage?.senderName ? `From ${sourceMessage.senderName}'s message.` : '',
  );
  const [assigneeId, setAssigneeId] = useState('');
  const [verifierId, setVerifierId] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'>('NORMAL');
  const [dueAt, setDueAt] = useState('');
  const [independent, setIndependent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: users } = useQuery<{ items: DirectoryUser[] }>({
    queryKey: ['users-all'],
    queryFn: () => api.get('/users?limit=100'),
  });

  async function submit() {
    if (title.trim().length < 3) {
      setError('Give the task a title (at least 3 characters).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const task = await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        conversationId,
        sourceMessageId: sourceMessage?.id,
        assigneeId: assigneeId || undefined,
        verifierId: verifierId || undefined,
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        requiresIndependentVerifier: independent,
      });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      }
      onCreated?.(task.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the task.');
    } finally {
      setBusy(false);
    }
  }

  const people = users?.items ?? [];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Create task</h2>
          <button onClick={onClose} aria-label="Close" className="text-soft hover:text-ink">✕</button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {sourceMessage && (
            <p className="rounded-md border-l-2 border-accent bg-raised px-3 py-2 text-xs text-soft">
              From message: {sourceMessage.content.slice(0, 120)}
            </p>
          )}

          <label className="block">
            <span className="text-xs font-medium text-soft">Title</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Recount iPhone 15 stock at Cadiz"
              className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-soft">Details (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full resize-y rounded-md border border-line bg-canvas px-3 py-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-soft">Assign to</span>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {people.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.profile?.displayName ?? u.username}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-soft">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-2 text-sm"
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-soft">Due</span>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-soft">Verifier (optional)</span>
              <select
                value={verifierId}
                onChange={(e) => setVerifierId(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-2 text-sm"
              >
                <option value="">Creator verifies</option>
                {people.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.profile?.displayName ?? u.username}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-start gap-2 rounded-md border border-line bg-canvas px-3 py-2">
            <input
              type="checkbox"
              checked={independent}
              onChange={(e) => setIndependent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#E86F1E]"
            />
            <span>
              <span className="block text-xs font-medium">Requires independent verification</span>
              <span className="block text-[11px] text-faint">
                For finance, stock, delivery, RMA, audit, or refund tasks: the assignee cannot
                verify or close this task themselves.
              </span>
            </span>
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create task'}
          </button>
        </footer>
      </div>
    </div>
  );
}
