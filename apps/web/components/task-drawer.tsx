'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Avatar from '@/components/avatar';
import { ApiError } from '@/lib/api';
import { getTask, updateTask } from '@/lib/ops-service';
import type { Task, TaskStatus } from '@/lib/ops-types';
import type { Me } from '@/lib/types';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  BLOCKED: 'Blocked',
  SUBMITTED: 'Submitted',
  VERIFIED: 'Verified',
  CLOSED: 'Closed',
};

export function StatusPill({ status }: { status: TaskStatus }) {
  const tone: Record<TaskStatus, string> = {
    OPEN: 'bg-raised text-soft',
    ASSIGNED: 'bg-accent/10 text-accent',
    IN_PROGRESS: 'bg-accent/15 text-accent',
    BLOCKED: 'bg-danger/15 text-danger',
    SUBMITTED: 'bg-[#7A6CC8]/15 text-[#7A6CC8]',
    VERIFIED: 'bg-ok/15 text-ok',
    CLOSED: 'bg-raised text-faint',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function isOverdue(task: Pick<Task, 'dueAt' | 'status'>) {
  return (
    !!task.dueAt &&
    !['VERIFIED', 'CLOSED'].includes(task.status) &&
    new Date(task.dueAt) < new Date()
  );
}

// Which action buttons make sense for whom, in which state. The server is the
// authority (it re-checks everything); this only decides what to offer.
function availableActions(task: Task, me: Me) {
  const isCreator = task.creator.id === me.id;
  const isAssignee = task.assignee?.id === me.id;
  const isVerifier = task.verifier?.id === me.id || (!task.verifier && isCreator);
  const isManager = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(me.role);
  const worker = isAssignee || isCreator || isManager;
  const verifier = isVerifier || isCreator || isManager;
  const selfVerifyBlocked = task.requiresIndependentVerifier && isAssignee;

  const out: { to: TaskStatus; label: string; primary?: boolean; danger?: boolean }[] = [];
  const add = (to: TaskStatus, label: string, extra: object = {}) => out.push({ to, label, ...extra });

  switch (task.status) {
    case 'OPEN':
    case 'ASSIGNED':
      if (worker) add('IN_PROGRESS', 'Start work', { primary: true });
      break;
    case 'IN_PROGRESS':
      if (worker) {
        add('SUBMITTED', 'Submit for verification', { primary: true });
        add('BLOCKED', 'Mark blocked', { danger: true });
      }
      break;
    case 'BLOCKED':
      if (worker) {
        add('IN_PROGRESS', 'Resume', { primary: true });
        add('SUBMITTED', 'Submit for verification');
      }
      break;
    case 'SUBMITTED':
      if (verifier && !selfVerifyBlocked) add('VERIFIED', 'Verify', { primary: true });
      if (worker) add('IN_PROGRESS', 'Reopen');
      break;
    case 'VERIFIED':
      if (verifier && !selfVerifyBlocked) add('CLOSED', 'Close task', { primary: true });
      break;
    case 'CLOSED':
      break;
  }
  if (task.status !== 'CLOSED' && task.status !== 'VERIFIED' && (isCreator || isManager)) {
    if (!selfVerifyBlocked || !isAssignee) add('CLOSED', 'Cancel / close', { danger: true });
  }
  return out;
}

export default function TaskDrawer({
  taskId,
  me,
  onClose,
  onOpenChat,
}: {
  taskId: string;
  me: Me;
  onClose: () => void;
  onOpenChat?: (conversationId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: task } = useQuery<Task>({
    queryKey: ['tasks', 'detail', taskId],
    queryFn: () => getTask(taskId),
  });

  async function move(to: TaskStatus) {
    setBusy(true);
    setError(null);
    try {
      await updateTask(taskId, { status: to });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the task.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Task</h2>
          <button onClick={onClose} aria-label="Close" className="text-soft hover:text-ink">✕</button>
        </header>

        {!task ? (
          <p className="p-4 text-sm text-faint">Loading…</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold leading-snug">{task.title}</h3>
              <StatusPill status={task.status} />
            </div>

            {isOverdue(task) && (
              <p className="mt-2 rounded-md bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger">
                Overdue — was due {new Date(task.dueAt!).toLocaleString()}
              </p>
            )}

            {task.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-soft">{task.description}</p>
            )}

            <dl className="mt-4 space-y-2.5 text-sm">
              <Row label="Assignee">
                {task.assignee ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar userId={task.assignee.id} name={task.assignee.name} avatarKey={task.assignee.avatarKey} size="xs" />
                    {task.assignee.name}
                  </span>
                ) : (
                  <span className="text-faint">Unassigned</span>
                )}
              </Row>
              <Row label="Priority">
                <span className={task.priority === 'CRITICAL' ? 'font-semibold text-danger' : task.priority === 'HIGH' ? 'font-semibold text-accent' : ''}>
                  {task.priority.toLowerCase()}
                </span>
              </Row>
              <Row label="Due">
                {task.dueAt ? new Date(task.dueAt).toLocaleString() : <span className="text-faint">No due date</span>}
              </Row>
              <Row label="Verifier">
                {task.verifier?.name ?? <span className="text-faint">Creator ({task.creator.name})</span>}
              </Row>
              {task.requiresIndependentVerifier && (
                <p className="rounded-md bg-raised px-3 py-1.5 text-[11px] text-soft">
                  Independent verification required — the assignee cannot verify or close.
                </p>
              )}
              <Row label="Created by">{task.creator.name}</Row>
            </dl>

            {task.conversationId && onOpenChat && (
              <button
                onClick={() => onOpenChat(task.conversationId!)}
                className="mt-3 text-xs text-accent underline"
              >
                Open conversation
              </button>
            )}

            {error && <p className="mt-3 text-sm text-danger">{error}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              {availableActions(task, me).map((a) => (
                <button
                  key={a.to + a.label}
                  onClick={() => move(a.to)}
                  disabled={busy}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                    a.primary
                      ? 'bg-accent text-accent-ink'
                      : a.danger
                        ? 'border border-danger/40 text-danger'
                        : 'border border-line text-soft hover:text-ink'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>

            {task.activity && task.activity.length > 0 && (
              <div className="mt-6 border-t border-line pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">Activity</p>
                <ul className="mt-2 space-y-1.5">
                  {task.activity.map((a, i) => (
                    <li key={i} className="text-xs text-soft">
                      <span className="font-medium">{a.actorName}</span> {a.action}
                      {a.detail ? `: ${a.detail}` : ''}
                      <span className="text-faint"> · {new Date(a.at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
