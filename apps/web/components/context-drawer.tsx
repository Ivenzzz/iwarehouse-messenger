'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, formatBytes } from '@/lib/api';
import type { ConversationMemberInfo, ConversationSummary } from '@/lib/types';

type Tab = 'details' | 'tasks' | 'erp' | 'files' | 'members';

interface SharedItem {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  senderName: string;
}

// Right-side context panel for operational chats. Opens on demand; the parent
// auto-opens it for incident/project conversations.
export default function ContextDrawer({
  conversation,
  onClose,
}: {
  conversation: ConversationSummary;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('details');

  const { data: members } = useQuery<ConversationMemberInfo[]>({
    queryKey: ['members', conversation.id],
    queryFn: () => api.get(`/conversations/${conversation.id}/members`),
    enabled: tab === 'members' || tab === 'details',
  });
  const { data: files } = useQuery<SharedItem[]>({
    queryKey: ['shared', conversation.id, 'files'],
    queryFn: () => api.get(`/conversations/${conversation.id}/files`),
    enabled: tab === 'files',
  });

  const owner = members?.find((m) => m.role === 'OWNER');
  const tabs: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'erp', label: 'ERP' },
    { key: 'files', label: 'Files' },
    { key: 'members', label: 'Members' },
  ];

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-line bg-surface lg:flex">
      <header className="flex items-center justify-between border-b border-line px-3 py-3">
        <h3 className="text-sm font-semibold">Details</h3>
        <button onClick={onClose} aria-label="Close panel" className="text-soft hover:text-ink">
          ✕
        </button>
      </header>

      <div className="scrollbar-hide flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              tab === t.key ? 'bg-accent/10 text-accent' : 'text-soft hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
        {tab === 'details' && (
          <div className="space-y-3">
            <Field label="Name" value={conversation.title} />
            {conversation.description && (
              <Field label="Description" value={conversation.description} />
            )}
            <Field label="Type" value={conversation.type.replace('_', ' ')} />
            {conversation.priority && <Field label="Priority" value={conversation.priority} />}
            {conversation.branchCode && <Field label="Branch" value={conversation.branchCode} />}
            {conversation.departmentCode && (
              <Field label="Department" value={conversation.departmentCode} />
            )}
            {owner && <Field label="Owner" value={owner.displayName} />}
            <Field label="Members" value={String(conversation.memberCount)} />
          </div>
        )}

        {tab === 'tasks' && (
          <EmptyState
            title="No open tasks"
            body="Tasks raised from this conversation will appear here once the Tasks module goes live."
          />
        )}

        {tab === 'erp' && (
          <EmptyState
            title="No linked ERP records"
            body="Transfers, POs, GRNs, invoices, and RMA references attached here will show as cards. ERP linking arrives in a later update."
          />
        )}

        {tab === 'files' && (
          <div className="space-y-1">
            {!files && <p className="text-xs text-faint">Loading…</p>}
            {files?.map((f) => (
              <a
                key={f.id}
                href={`/api/files/${f.id}/download`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-raised"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised font-mono text-[9px] font-bold uppercase text-soft">
                  {f.originalName.split('.').pop()?.slice(0, 4)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{f.originalName}</span>
                  <span className="block text-[10px] text-faint">
                    {f.senderName} · {formatBytes(f.sizeBytes)}
                  </span>
                </span>
              </a>
            ))}
            {files && files.length === 0 && (
              <EmptyState title="No files yet" body="Documents shared here will be listed for quick access." />
            )}
          </div>
        )}

        {tab === 'members' && (
          <ul className="space-y-1">
            {members?.map((m) => (
              <li key={m.userId} className="flex items-center gap-2 px-1 py-1.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-raised text-[10px] font-semibold uppercase">
                  {m.displayName.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{m.displayName}</span>
                  <span className="block text-[10px] text-faint capitalize">
                    {m.role.toLowerCase()}
                  </span>
                </span>
                <span
                  className={`h-2 w-2 rounded-full ${
                    m.presence === 'ONLINE' ? 'bg-ok' : 'bg-line'
                  }`}
                  aria-hidden
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-line px-3 py-8 text-center">
      <p className="text-xs font-medium">{title}</p>
      <p className="mt-1 text-[11px] text-faint">{body}</p>
    </div>
  );
}
