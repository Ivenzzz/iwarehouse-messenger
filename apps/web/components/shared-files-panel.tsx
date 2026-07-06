'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, formatBytes } from '@/lib/api';

interface SharedItem {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  senderName: string;
}

export default function SharedFilesPanel({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'media' | 'files'>('media');
  const { data, isLoading } = useQuery<SharedItem[]>({
    queryKey: ['shared', conversationId, tab],
    queryFn: () => api.get(`/conversations/${conversationId}/${tab}`),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Shared in this conversation</h2>
          <button onClick={onClose} aria-label="Close" className="text-soft hover:text-ink">✕</button>
        </header>
        <div className="flex gap-1 border-b border-line px-4 py-2">
          {(['media', 'files'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                tab === t ? 'bg-accent/10 text-accent' : 'text-soft hover:text-ink'
              }`}
            >
              {t === 'media' ? 'Photos and videos' : 'Documents'}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {isLoading && <p className="text-sm text-faint">Loading…</p>}
          {data && data.length === 0 && (
            <p className="py-8 text-center text-sm text-faint">
              Nothing shared here yet.
            </p>
          )}

          {tab === 'media' ? (
            <div className="grid grid-cols-3 gap-2">
              {data?.map((item) =>
                item.mimeType.startsWith('image/') ? (
                  <a key={item.id} href={`/api/files/${item.id}/raw`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/files/${item.id}/raw`}
                      alt={item.originalName}
                      className="aspect-square w-full rounded-md border border-line object-cover"
                      loading="lazy"
                    />
                  </a>
                ) : (
                  <video
                    key={item.id}
                    src={`/api/files/${item.id}/raw`}
                    className="aspect-square w-full rounded-md border border-line object-cover"
                    preload="metadata"
                  />
                ),
              )}
            </div>
          ) : (
            <ul className="space-y-1">
              {data?.map((item) => (
                <li key={item.id}>
                  <a
                    href={`/api/files/${item.id}/download`}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-raised"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-raised text-[10px] font-bold uppercase text-soft">
                      {item.originalName.split('.').pop()?.slice(0, 4)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{item.originalName}</span>
                      <span className="block text-xs text-faint">
                        {item.senderName} · {formatBytes(item.sizeBytes)} ·{' '}
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
