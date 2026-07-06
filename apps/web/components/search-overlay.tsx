'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, formatBytes } from '@/lib/api';

interface MessageHit {
  id: string;
  conversationId: string;
  conversationTitle: string;
  content: string;
  senderName: string;
  createdAt: string;
}

interface FileHit {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  conversationId: string;
  conversationTitle: string;
  createdAt: string;
}

export default function SearchOverlay({
  onClose,
  onOpenConversation,
}: {
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
}) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'messages' | 'files'>('messages');
  const enabled = q.trim().length >= 2;

  const { data: messageHits, isFetching: loadingMessages } = useQuery<{ items: MessageHit[] }>({
    queryKey: ['search-messages', q],
    queryFn: () => api.get(`/search/messages?q=${encodeURIComponent(q)}`),
    enabled: enabled && tab === 'messages',
  });
  const { data: fileHits, isFetching: loadingFiles } = useQuery<{ items: FileHit[] }>({
    queryKey: ['search-files', q],
    queryFn: () => api.get(`/search/files?q=${encodeURIComponent(q)}`),
    enabled: enabled && tab === 'files',
  });

  const loading = tab === 'messages' ? loadingMessages : loadingFiles;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16" onClick={onClose}>
      <div
        className="flex max-h-[75vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line p-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages and files…"
            className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
          />
          <div className="mt-2 flex gap-1">
            {(['messages', 'files'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                  tab === t ? 'bg-accent/10 text-accent' : 'text-soft hover:text-ink'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!enabled && (
            <p className="px-4 py-10 text-center text-sm text-faint">
              Type at least 2 characters to search everything you have access to.
            </p>
          )}
          {enabled && loading && <p className="px-4 py-6 text-sm text-faint">Searching…</p>}

          {enabled && tab === 'messages' &&
            messageHits?.items.map((hit) => (
              <button
                key={hit.id}
                onClick={() => onOpenConversation(hit.conversationId)}
                className="block w-full border-b border-line/60 px-4 py-3 text-left hover:bg-raised"
              >
                <p className="text-xs text-faint">
                  {hit.senderName} in <span className="font-medium">{hit.conversationTitle}</span> ·{' '}
                  {new Date(hit.createdAt).toLocaleString()}
                </p>
                <p className="mt-0.5 truncate text-sm">{highlight(hit.content, q)}</p>
              </button>
            ))}

          {enabled && tab === 'files' &&
            fileHits?.items.map((hit) => (
              <div key={hit.id} className="flex items-center gap-3 border-b border-line/60 px-4 py-3">
                <button
                  onClick={() => onOpenConversation(hit.conversationId)}
                  className="min-w-0 flex-1 text-left hover:underline"
                >
                  <p className="truncate text-sm">{highlight(hit.originalName, q)}</p>
                  <p className="text-xs text-faint">
                    {hit.conversationTitle} · {formatBytes(hit.sizeBytes)} ·{' '}
                    {new Date(hit.createdAt).toLocaleDateString()}
                  </p>
                </button>
                <a
                  href={`/api/files/${hit.id}/download`}
                  className="shrink-0 text-xs text-accent underline"
                >
                  Download
                </a>
              </div>
            ))}

          {enabled && !loading && tab === 'messages' && messageHits?.items.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-faint">No messages match.</p>
          )}
          {enabled && !loading && tab === 'files' && fileHits?.items.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-faint">No files match.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function highlight(text: string, q: string) {
  const idx = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (idx < 0) return text;
  const start = Math.max(0, idx - 30);
  return (
    <>
      {start > 0 && '…'}
      {text.slice(start, idx)}
      <mark className="rounded bg-accent/25 px-0.5">{text.slice(idx, idx + q.trim().length)}</mark>
      {text.slice(idx + q.trim().length, idx + q.trim().length + 60)}
    </>
  );
}
