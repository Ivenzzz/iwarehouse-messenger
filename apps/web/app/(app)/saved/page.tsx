'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { ChatMessage } from '@/lib/types';

type SavedItem = ChatMessage & { conversationTitle: string; savedAt: string };

export default function SavedPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<SavedItem[]>({
    queryKey: ['saved-messages'],
    queryFn: () => api.get('/saved'),
  });

  async function unsave(id: string) {
    await api.del(`/messages/${id}/save`).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ['saved-messages'] });
  }

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto px-4 py-6">
      <h1 className="text-lg font-semibold tracking-tight">Saved messages</h1>
      <p className="mt-1 text-sm text-soft">
        Messages you bookmarked from any conversation. Only you can see this list.
      </p>

      <div className="mt-4 space-y-2">
        {isLoading && <p className="text-sm text-faint">Loading…</p>}
        {data?.map((m) => (
          <div key={m.id} className="rounded-md border border-line bg-surface px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-xs text-faint">
                <span className="font-medium text-soft">{m.sender?.displayName ?? 'System'}</span>{' '}
                in {m.conversationTitle} · {new Date(m.createdAt).toLocaleString()}
              </p>
              <div className="flex shrink-0 gap-2 text-xs">
                <button
                  onClick={() => router.push(`/chats?c=${m.conversationId}`)}
                  className="text-accent underline"
                >
                  Open chat
                </button>
                <button onClick={() => unsave(m.id)} className="text-faint underline">
                  Remove
                </button>
              </div>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {m.content || m.attachments?.[0]?.originalName || 'Attachment'}
            </p>
          </div>
        ))}
        {data && data.length === 0 && (
          <p className="rounded-md border border-dashed border-line px-4 py-10 text-center text-sm text-faint">
            Nothing saved yet. Hover any message in a chat and tap the bookmark to keep it here.
          </p>
        )}
      </div>
    </div>
  );
}
