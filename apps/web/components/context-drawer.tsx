'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, formatBytes } from '@/lib/api';
import { StatusPill, isOverdue } from '@/components/task-drawer';
import { listConversationTasks } from '@/lib/ops-service';
import type { Task } from '@/lib/ops-types';
import type { ConversationMemberInfo, ConversationSummary, DirectoryUser, Me } from '@/lib/types';

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
  onOpenTask,
  me,
}: {
  conversation: ConversationSummary;
  onClose: () => void;
  onOpenTask?: (taskId: string) => void;
  me?: Me;
}) {
  const [tab, setTab] = useState<Tab>('details');

  const { data: members } = useQuery<ConversationMemberInfo[]>({
    queryKey: ['members', conversation.id],
    queryFn: () => api.get(`/conversations/${conversation.id}/members`),
    enabled: tab === 'members' || tab === 'details',
  });
  const { data: tasks } = useQuery<Task[]>({
    queryKey: ['tasks', 'conversation', conversation.id],
    queryFn: () => listConversationTasks(conversation.id),
    enabled: tab === 'tasks',
  });
  const { data: files } = useQuery<SharedItem[]>({
    queryKey: ['shared', conversation.id, 'files'],
    queryFn: () => api.get(`/conversations/${conversation.id}/files`),
    enabled: tab === 'files',
  });

  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [memberBusy, setMemberBusy] = useState(false);
  const myMember = members?.find((m) => m.userId === me?.id);
  const canManage =
    conversation.type !== 'DIRECT' &&
    (myMember?.role === 'OWNER' ||
      myMember?.role === 'ADMIN' ||
      me?.role === 'ADMIN' ||
      me?.role === 'SUPER_ADMIN');
  const { data: allUsers } = useQuery<{ items: DirectoryUser[] }>({
    queryKey: ['users-all'],
    queryFn: () => api.get('/users?limit=100'),
    enabled: adding,
  });
  const candidates = (allUsers?.items ?? []).filter(
    (u) => !members?.some((m) => m.userId === u.id),
  );

  async function addPicked() {
    if (pickedIds.length === 0) return;
    setMemberBusy(true);
    try {
      await api.post(`/conversations/${conversation.id}/members`, { userIds: pickedIds });
      queryClient.invalidateQueries({ queryKey: ['members', conversation.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setPickedIds([]);
      setAdding(false);
    } finally {
      setMemberBusy(false);
    }
  }

  async function removeMember(userId: string) {
    setMemberBusy(true);
    try {
      await api.del(`/conversations/${conversation.id}/members/${userId}`);
      queryClient.invalidateQueries({ queryKey: ['members', conversation.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } finally {
      setMemberBusy(false);
    }
  }

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
          <div className="space-y-1.5">
            {!tasks && <p className="text-xs text-faint">Loading…</p>}
            {tasks?.map((t) => (
              <button
                key={t.id}
                onClick={() => onOpenTask?.(t.id)}
                className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left hover:bg-raised ${
                  isOverdue(t) ? 'border-danger/40' : 'border-line'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{t.title}</span>
                  <span className="block text-[10px] text-faint">
                    {t.assignee ? `→ ${t.assignee.name}` : 'Unassigned'}
                    {t.dueAt ? ` · due ${new Date(t.dueAt).toLocaleDateString()}` : ''}
                  </span>
                </span>
                <StatusPill status={t.status} />
              </button>
            ))}
            {tasks && tasks.length === 0 && (
              <EmptyState
                title="No open tasks"
                body="Create one from any message (hover → task icon) or the Create Task button."
              />
            )}
          </div>
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

        {tab === 'members' && canManage && (
          <div className="mb-2">
            {!adding ? (
              <button
                onClick={() => setAdding(true)}
                className="w-full rounded-md border border-dashed border-line px-2 py-1.5 text-xs font-medium text-accent hover:bg-raised"
              >
                + Add people
              </button>
            ) : (
              <div className="rounded-md border border-line p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                  Add to this group
                </p>
                <div className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
                  {candidates.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-raised">
                      <input
                        type="checkbox"
                        checked={pickedIds.includes(u.id)}
                        onChange={(e) =>
                          setPickedIds((ids) =>
                            e.target.checked ? [...ids, u.id] : ids.filter((i) => i !== u.id),
                          )
                        }
                        className="h-3.5 w-3.5 accent-[#E86F1E]"
                      />
                      <span className="truncate">{u.profile?.displayName ?? u.username}</span>
                    </label>
                  ))}
                  {candidates.length === 0 && (
                    <p className="px-1 py-1 text-[11px] text-faint">Everyone is already here.</p>
                  )}
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setAdding(false);
                      setPickedIds([]);
                    }}
                    className="rounded-md border border-line px-2 py-1 text-[11px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addPicked}
                    disabled={memberBusy || pickedIds.length === 0}
                    className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-ink disabled:opacity-50"
                  >
                    Add {pickedIds.length > 0 ? pickedIds.length : ''}
                  </button>
                </div>
              </div>
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
                {m.role !== 'OWNER' &&
                  (canManage || m.userId === me?.id) &&
                  conversation.type !== 'DIRECT' && (
                    <button
                      onClick={() => removeMember(m.userId)}
                      disabled={memberBusy}
                      title={m.userId === me?.id ? 'Leave group' : `Remove ${m.displayName}`}
                      aria-label={m.userId === me?.id ? 'Leave group' : `Remove ${m.displayName}`}
                      className="text-xs text-faint hover:text-danger disabled:opacity-40"
                    >
                      ✕
                    </button>
                  )}
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
