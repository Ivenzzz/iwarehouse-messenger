'use client';

import { useQuery } from '@tanstack/react-query';
import { listMyTasks } from '@/lib/ops-service';
import type { Task } from '@/lib/ops-types';

export default function TasksPage() {
  const { data, isLoading } = useQuery<Task[]>({
    queryKey: ['my-tasks'],
    queryFn: listMyTasks,
  });

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto px-4 py-6">
      <h1 className="text-lg font-semibold tracking-tight">Assigned to me</h1>
      <p className="mt-1 text-sm text-soft">
        Tasks created from chat messages land here with their due dates, priority, and
        verification state.
      </p>

      {isLoading && <p className="mt-6 text-sm text-faint">Loading…</p>}

      {data && data.length === 0 && (
        <div className="mt-6 rounded-md border border-dashed border-line px-4 py-12 text-center">
          <p className="text-2xl">🗂️</p>
          <p className="mt-2 text-sm font-medium">No tasks assigned</p>
          <p className="mt-1 text-xs text-faint">
            Task creation from messages arrives in the next update. When a teammate turns a
            message into a task and assigns it to you, it will appear here.
          </p>
        </div>
      )}
    </div>
  );
}
