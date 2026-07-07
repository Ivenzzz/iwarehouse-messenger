'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Avatar from '@/components/avatar';
import TaskDrawer, { StatusPill, isOverdue } from '@/components/task-drawer';
import { api } from '@/lib/api';
import { listCreatedTasks, listMyTasks } from '@/lib/ops-service';
import type { Task } from '@/lib/ops-types';
import type { Me } from '@/lib/types';
import { getSocket } from '@/lib/socket';

export default function TasksPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'assigned' | 'created'>('assigned');
  const [includeClosed, setIncludeClosed] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const { data: me } = useQuery<Me>({ queryKey: ['me'], queryFn: () => api.get('/me') });
  const { data, isLoading, refetch } = useQuery<Task[]>({
    queryKey: ['tasks', tab, includeClosed],
    queryFn: () => (tab === 'assigned' ? listMyTasks(includeClosed) : listCreatedTasks(includeClosed)),
  });

  useEffect(() => {
    const socket = getSocket();
    const onTask = () => refetch();
    socket.on('task.updated', onTask);
    return () => {
      socket.off('task.updated', onTask);
    };
  }, [refetch]);

  const overdue = (data ?? []).filter((t) => isOverdue(t));
  const rest = (data ?? []).filter((t) => !isOverdue(t));

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
        <label className="flex items-center gap-1.5 text-xs text-soft">
          <input
            type="checkbox"
            checked={includeClosed}
            onChange={(e) => setIncludeClosed(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#E86F1E]"
          />
          Show closed
        </label>
      </div>

      <div className="mt-3 flex gap-1">
        {(['assigned', 'created'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              tab === k ? 'bg-accent/10 text-accent' : 'text-soft hover:text-ink'
            }`}
          >
            {k === 'assigned' ? 'Assigned to me' : 'Created by me'}
          </button>
        ))}
      </div>

      {isLoading && <p className="mt-6 text-sm text-faint">Loading…</p>}

      {data && data.length === 0 && (
        <div className="mt-6 rounded-md border border-dashed border-line px-4 py-12 text-center">
          <p className="text-sm font-medium">
            {tab === 'assigned' ? 'No tasks assigned' : 'No tasks created yet'}
          </p>
          <p className="mt-1 text-xs text-faint">
            Hover any chat message and tap the task icon, or use Create Task in a chat header.
          </p>
        </div>
      )}

      {overdue.length > 0 && (
        <>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-wide text-danger">Overdue</p>
          <div className="mt-1.5 space-y-1.5">
            {overdue.map((t) => (
              <TaskRow key={t.id} task={t} onOpen={() => setOpenTaskId(t.id)} />
            ))}
          </div>
        </>
      )}
      {rest.length > 0 && (
        <>
          {overdue.length > 0 && (
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-wide text-faint">Everything else</p>
          )}
          <div className="mt-1.5 space-y-1.5">
            {rest.map((t) => (
              <TaskRow key={t.id} task={t} onOpen={() => setOpenTaskId(t.id)} />
            ))}
          </div>
        </>
      )}

      {openTaskId && me && (
        <TaskDrawer
          taskId={openTaskId}
          me={me}
          onClose={() => setOpenTaskId(null)}
          onOpenChat={(cid) => router.push(`/chats?c=${cid}`)}
        />
      )}
    </div>
  );
}

function TaskRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const late = isOverdue(task);
  return (
    <button
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left hover:bg-raised ${
        late ? 'border-danger/40' : 'border-line bg-surface'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{task.title}</span>
        <span className="mt-0.5 block text-xs text-faint">
          {task.assignee ? `→ ${task.assignee.name}` : 'Unassigned'}
          {task.dueAt && (
            <span className={late ? 'font-semibold text-danger' : ''}>
              {' · due '}
              {new Date(task.dueAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          )}
          {task.priority !== 'NORMAL' ? ` · ${task.priority.toLowerCase()}` : ''}
        </span>
      </span>
      {task.assignee && (
        <Avatar userId={task.assignee.id} name={task.assignee.name} avatarKey={task.assignee.avatarKey} size="sm" />
      )}
      <StatusPill status={task.status} />
    </button>
  );
}
