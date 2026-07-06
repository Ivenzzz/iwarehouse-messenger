'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface Notification {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  data?: { conversationId?: string } | null;
  readAt?: string | null;
  createdAt: string;
}

export default function NotificationsBell({
  onOpenConversation,
}: {
  onOpenConversation: (conversationId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery<{ items: Notification[]; unread: number }>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications'),
  });

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
    socket.on('notification.new', refresh);
    return () => {
      socket.off('notification.new', refresh);
    };
  }, [queryClient]);

  async function openPanel() {
    setOpen((v) => !v);
    if (!open && (data?.unread ?? 0) > 0) {
      await api.post('/notifications/read-all').catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  }

  return (
    <div className="relative">
      <button
        onClick={openPanel}
        title="Notifications"
        aria-label="Notifications"
        className="relative rounded-md border border-line px-2 py-1 text-xs text-soft hover:text-ink"
      >
        🔔
        {(data?.unread ?? 0) > 0 && (
          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-ink">
            {data!.unread > 9 ? '9+' : data!.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1 max-h-80 w-72 overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
          {data?.items.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setOpen(false);
                if (n.data?.conversationId) onOpenConversation(n.data.conversationId);
              }}
              className={`block w-full border-b border-line/60 px-3 py-2.5 text-left hover:bg-raised ${
                n.readAt ? '' : 'bg-accent/5'
              }`}
            >
              <p className="text-xs font-medium">{n.title}</p>
              {n.body && <p className="mt-0.5 truncate text-xs text-soft">{n.body}</p>}
              <p className="mt-0.5 text-[10px] text-faint">
                {new Date(n.createdAt).toLocaleString()}
              </p>
            </button>
          ))}
          {data && data.items.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-faint">No notifications yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
