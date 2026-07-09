'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import Avatar from '@/components/avatar';
import AttachmentList from '@/components/attachment-list';
import type { ChatMessage } from '@/lib/types';

const QUICK_EMOJI = ['👍', '✅', '❌', '❤️', '😂', '😮'];

export interface MessageActions {
  onReply: (m: ChatMessage) => void;
  onCreateTask: (m: ChatMessage) => void;
  onOpenTask: (taskId: string) => void;
  onOpenIncident: (incidentId: string) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onTogglePin: (m: ChatMessage) => void;
  onToggleSave: (m: ChatMessage) => void;
  onDelete: (id: string) => void;
  onRetry: (m: ChatMessage) => void;
  onAck: (m: ChatMessage) => void;
  onShowAcks: (m: ChatMessage) => void;
}

export default function MessageRow({
  message,
  grouped = false,
  showAvatar = false,
  mine,
  meId,
  canPin,
  isAnnouncement,
  isSaved,
  memberUsernames,
  actions,
}: {
  message: ChatMessage;
  grouped?: boolean;
  showAvatar?: boolean;
  mine: boolean;
  meId: string;
  canPin: boolean;
  isAnnouncement: boolean;
  isSaved: boolean;
  memberUsernames: Set<string>;
  actions: MessageActions;
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  // Touch devices have no hover: long-press (450ms) toggles the toolbar.
  const [touchActions, setTouchActions] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onTouchStart() {
    pressTimer.current = setTimeout(() => setTouchActions((v) => !v), 450);
  }
  function onTouchEnd() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      /* clipboard unavailable over plain HTTP on some browsers */
    }
  }

  if (message.contentType === 'SYSTEM') {
    return <div className="my-2 text-center text-xs text-faint">{message.content}</div>;
  }

  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const reactionGroups = groupReactions(message, meId);
  const acked = message.ackedBy?.includes(meId) ?? false;
  const deletable = mine || canPin;

  return (
    <div
      className={`group flex items-end gap-2 ${grouped ? 'mb-0.5' : 'mb-2'} ${mine ? 'justify-end' : 'justify-start'}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchEnd}
    >
      {showAvatar && !mine && (
        <span className="mb-0.5 shrink-0">
          {grouped ? (
            <span className="block h-8 w-8" aria-hidden />
          ) : (
            <Avatar
              userId={message.sender?.id}
              name={message.sender?.displayName ?? 'System'}
              avatarKey={message.sender?.avatarKey}
              size="sm"
            />
          )}
        </span>
      )}
      <div className={`relative max-w-[78%] ${mine ? 'text-right' : ''}`}>
        {!grouped && (
          <p className="text-[11px] text-faint">
            {message.isPinned && <span className="mr-1 text-accent">📌</span>}
            {mine ? '' : `${message.sender?.displayName ?? 'System'} · `}
            {time}
            {message.editedAt && !message.deletedAt ? ' · edited' : ''}
          </p>
        )}
        {grouped && message.isPinned && (
          <p className="text-[11px] text-accent">📌 pinned</p>
        )}

        <div
          className={`mt-0.5 inline-block rounded-md px-3 py-2 text-left text-sm leading-relaxed ${
            message.deletedAt
              ? 'border border-line italic text-faint'
              : mine
                ? 'bg-[rgb(43,46,51)] text-[rgb(240,240,238)]'
                : 'border border-line bg-surface'
          } ${message.pending ? 'opacity-60' : ''}`}
        >
          {message.replyTo && (
            <p className={`mb-1 border-l-2 border-accent pl-2 text-xs ${mine ? 'text-canvas/70' : 'text-faint'}`}>
              {message.replyTo.senderName}: {message.replyTo.content.slice(0, 80)}
            </p>
          )}
          {message.metadata?.poll ? (
            <PollCardInline
              poll={message.metadata.poll}
              meId={meId}
              mine={mine}
            />
          ) : message.metadata?.erp ? (
            <ErpCardInline erp={message.metadata.erp} mine={mine} />
          ) : message.metadata?.incident ? (
            <IncidentCardInline
              incident={message.metadata.incident}
              mine={mine}
              onOpen={() => actions.onOpenIncident(message.metadata!.incident!.id)}
            />
          ) : message.metadata?.task ? (
            <TaskCardInline
              task={message.metadata.task}
              mine={mine}
              onOpen={() => actions.onOpenTask(message.metadata!.task!.id)}
            />
          ) : (
            message.content && (
              <span className="whitespace-pre-wrap break-words">
                {renderWithMentions(message.content, memberUsernames, mine)}
              </span>
            )
          )}
          {message.attachments && message.attachments.length > 0 && (
            <AttachmentList attachments={message.attachments} mine={mine} />
          )}
        </div>

        {/* Reactions */}
        {reactionGroups.length > 0 && (
          <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : ''}`}>
            {reactionGroups.map((g) => (
              <button
                key={g.emoji}
                onClick={() => actions.onReact(message, g.emoji)}
                title={g.names.join(', ')}
                className={`rounded-full border px-1.5 py-0.5 text-xs ${
                  g.mine ? 'border-accent bg-accent/10' : 'border-line bg-surface'
                }`}
              >
                {g.emoji} {g.count}
              </button>
            ))}
          </div>
        )}

        {/* Announcement acknowledgement */}
        {isAnnouncement && !message.deletedAt && !message.pending && (
          <div className={`mt-1 flex gap-2 text-[11px] ${mine ? 'justify-end' : ''}`}>
            {!mine && (
              <button
                onClick={() => actions.onAck(message)}
                disabled={acked}
                className={acked ? 'text-ok' : 'text-accent underline'}
              >
                {acked ? '✓ Acknowledged' : 'Mark as read'}
              </button>
            )}
            <button onClick={() => actions.onShowAcks(message)} className="text-faint underline">
              Seen by {message.ackCount ?? 0}
            </button>
          </div>
        )}

        {message.failed && (
          <p className="mt-1 text-xs text-danger">
            Not sent.{' '}
            <button onClick={() => actions.onRetry(message)} className="underline">
              Retry
            </button>
          </p>
        )}

        {/* Hover toolbar */}
        {!message.deletedAt && !message.pending && !message.failed && (
          <div
            className={`absolute -top-3.5 z-10 items-center gap-0.5 rounded-full border border-line bg-surface px-1 py-0.5 shadow-sm group-hover:inline-flex ${
              touchActions ? 'inline-flex' : 'hidden'
            } ${mine ? 'right-1' : 'left-1'}`}
          >
            <ToolbarButton label="Reply" onClick={() => actions.onReply(message)}>
              <ReplyGlyph />
            </ToolbarButton>
            <ToolbarButton label="React" onClick={() => setShowEmoji((v) => !v)}>
              <SmileGlyph />
            </ToolbarButton>
            {canPin && (
              <ToolbarButton
                label={message.isPinned ? 'Unpin' : 'Pin'}
                onClick={() => actions.onTogglePin(message)}
              >
                <PinGlyph />
              </ToolbarButton>
            )}
            <ToolbarButton
              label={isSaved ? 'Remove from saved' : 'Save'}
              onClick={() => actions.onToggleSave(message)}
            >
              <BookmarkGlyph filled={isSaved} />
            </ToolbarButton>
            {!message.metadata?.task && (
              <ToolbarButton label="Create task from message" onClick={() => actions.onCreateTask(message)}>
                <TaskGlyph />
              </ToolbarButton>
            )}
            {message.content && (
              <ToolbarButton label="Copy" onClick={copyText}>
                <CopyGlyph />
              </ToolbarButton>
            )}
            {deletable && (
              <ToolbarButton label="Delete" onClick={() => actions.onDelete(message.id)}>
                <TrashGlyph />
              </ToolbarButton>
            )}
          </div>
        )}

        {showEmoji && (
          <div
            className={`absolute z-20 flex gap-1 rounded-md border border-line bg-surface p-1 shadow ${
              mine ? 'left-0' : 'right-0'
            } -top-12`}
          >
            {QUICK_EMOJI.map((e) => (
              <button
                key={e}
                className="rounded px-1 text-lg hover:bg-raised"
                onClick={() => {
                  setShowEmoji(false);
                  actions.onReact(message, e);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center rounded-full text-soft hover:bg-raised hover:text-ink"
    >
      {children}
    </button>
  );
}

const g = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
function ReplyGlyph() {
  return (
    <svg {...g} aria-hidden>
      <path d="M9 7L4 12l5 5" />
      <path d="M4 12h11a5 5 0 015 5v1" />
    </svg>
  );
}
function SmileGlyph() {
  return (
    <svg {...g} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01M15 9h.01" />
    </svg>
  );
}
function PinGlyph() {
  return (
    <svg {...g} aria-hidden>
      <path d="M12 17v5" />
      <path d="M7 4h10l-1 6 3 3H5l3-3-1-6z" />
    </svg>
  );
}
function BookmarkGlyph({ filled }: { filled: boolean }) {
  return (
    <svg {...g} fill={filled ? 'currentColor' : 'none'} aria-hidden>
      <path d="M7 4h10v16l-5-4-5 4V4z" />
    </svg>
  );
}
function CopyGlyph() {
  return (
    <svg {...g} aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h8" />
    </svg>
  );
}
function TrashGlyph() {
  return (
    <svg {...g} aria-hidden>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  );
}

function TaskGlyph() {
  return (
    <svg {...g} aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

const CARD_STATUS_TONE: Record<string, string> = {
  OPEN: 'text-soft',
  ASSIGNED: 'text-accent',
  IN_PROGRESS: 'text-accent',
  BLOCKED: 'text-danger',
  SUBMITTED: 'text-[#7A6CC8]',
  VERIFIED: 'text-ok',
  CLOSED: 'text-faint',
};

function TaskCardInline({
  task,
  mine,
  onOpen,
}: {
  task: NonNullable<NonNullable<ChatMessage['metadata']>['task']>;
  mine: boolean;
  onOpen: () => void;
}) {
  const overdue =
    !!task.dueAt && !['VERIFIED', 'CLOSED'].includes(task.status) && new Date(task.dueAt) < new Date();
  return (
    <button
      onClick={onOpen}
      className={`block w-64 max-w-full rounded-md border p-2.5 text-left ${
        mine ? 'border-white/25' : 'border-line bg-canvas'
      }`}
    >
      <p className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${mine ? 'text-white/70' : 'text-faint'}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 12l3 3 5-6" />
        </svg>
        Task ·{' '}
        <span className={mine ? '' : CARD_STATUS_TONE[task.status] ?? ''}>
          {task.status.replace('_', ' ').toLowerCase()}
        </span>
      </p>
      <p className={`mt-1 text-sm font-medium leading-snug ${mine ? 'text-white' : ''}`}>{task.title}</p>
      <p className={`mt-1 text-[11px] ${mine ? 'text-white/70' : 'text-faint'}`}>
        {task.assigneeName ? `→ ${task.assigneeName}` : 'Unassigned'}
        {task.dueAt && (
          <span className={overdue ? ' font-semibold text-danger' : ''}>
            {' · due '}
            {new Date(task.dueAt).toLocaleDateString()}
          </span>
        )}
        {task.priority !== 'NORMAL' ? ` · ${task.priority.toLowerCase()}` : ''}
      </p>
      <p className={`mt-1.5 text-[11px] underline ${mine ? 'text-white/80' : 'text-accent'}`}>Open task</p>
    </button>
  );
}

function PollCardInline({
  poll,
  meId,
  mine,
}: {
  poll: NonNullable<NonNullable<ChatMessage['metadata']>['poll']>;
  meId: string;
  mine: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const myPicks = new Set(
    poll.options.filter((o) => o.voters.some((v) => v.id === meId)).map((o) => o.id),
  );
  const max = Math.max(1, ...poll.options.map((o) => o.voters.length));

  async function pick(optionId: string) {
    if (poll.closed || busy) return;
    setBusy(true);
    try {
      const next = poll.multi
        ? myPicks.has(optionId)
          ? [...myPicks].filter((id) => id !== optionId)
          : [...myPicks, optionId]
        : myPicks.has(optionId)
          ? []
          : [optionId];
      await api.post(`/polls/${poll.id}/vote`, { optionIds: next });
      // card refreshes via the conversation.refresh socket event
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`block w-72 max-w-full rounded-md border p-2.5 ${mine ? 'border-white/25' : 'border-line bg-canvas'}`}>
      <span className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${mine ? 'text-white/70' : 'text-faint'}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M5 20V10M12 20V4M19 20v-7" />
        </svg>
        Poll{poll.multi ? ' · multiple choice' : ''} · {poll.totalVoters} voted
      </span>
      <span className={`mt-1 block text-sm font-medium leading-snug ${mine ? 'text-white' : ''}`}>
        {poll.question}
      </span>
      <span className="mt-2 block space-y-1.5">
        {poll.options.map((o) => {
          const picked = myPicks.has(o.id);
          const pct = (o.voters.length / max) * 100;
          return (
            <button
              key={o.id}
              onClick={() => pick(o.id)}
              disabled={busy || poll.closed}
              className={`relative block w-full overflow-hidden rounded-md border px-2.5 py-1.5 text-left text-xs ${
                picked
                  ? 'border-accent'
                  : mine
                    ? 'border-white/25'
                    : 'border-line'
              } ${busy ? 'opacity-60' : ''}`}
            >
              <span
                className="absolute inset-y-0 left-0 bg-accent/15"
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <span className={`relative flex items-center justify-between gap-2 ${mine ? 'text-white' : ''}`}>
                <span className="min-w-0 truncate">
                  {picked ? '✓ ' : ''}
                  {o.text}
                </span>
                <span className={`shrink-0 font-mono ${mine ? 'text-white/70' : 'text-faint'}`}>
                  {o.voters.length}
                </span>
              </span>
              {o.voters.length > 0 && (
                <span className={`relative mt-0.5 block truncate text-[10px] ${mine ? 'text-white/60' : 'text-faint'}`}>
                  {o.voters.map((v) => v.name).join(', ')}
                </span>
              )}
            </button>
          );
        })}
      </span>
      <span className={`mt-1.5 block text-[10px] ${mine ? 'text-white/50' : 'text-faint'}`}>
        Tap an option to vote{poll.multi ? '' : ' · tap again to unvote'}
      </span>
    </span>
  );
}

const ERP_KIND_LABEL: Record<string, string> = {
  TRANSFER: 'Stock Transfer',
  GRN: 'Goods Receipt',
  INVOICE: 'Invoice',
  RMA: 'RMA',
  PO: 'Purchase Order',
  SO: 'Sales Order',
  OTHER: 'ERP Record',
};

function ErpCardInline({
  erp,
  mine,
}: {
  erp: NonNullable<NonNullable<ChatMessage['metadata']>['erp']>;
  mine: boolean;
}) {
  return (
    <span
      className={`block w-64 max-w-full rounded-md border p-2.5 text-left ${
        mine ? 'border-white/25' : 'border-line bg-canvas'
      }`}
    >
      <span className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${mine ? 'text-white/70' : 'text-faint'}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
          <path d="M14 3v6h6M9 13h6M9 17h6" />
        </svg>
        {ERP_KIND_LABEL[erp.kind] ?? 'ERP Record'}
      </span>
      <button
        onClick={() => navigator.clipboard?.writeText(erp.ref)}
        title="Copy reference"
        className={`mt-1 block font-mono text-sm font-semibold ${mine ? 'text-white' : 'text-ink'} hover:underline`}
      >
        {erp.ref}
      </button>
      {erp.note && (
        <span className={`mt-1 block text-[11px] ${mine ? 'text-white/70' : 'text-soft'}`}>{erp.note}</span>
      )}
      <span className={`mt-1 block text-[10px] ${mine ? 'text-white/50' : 'text-faint'}`}>
        Tap the number to copy · opens in ERP later
      </span>
    </span>
  );
}

function IncidentCardInline({
  incident,
  mine,
  onOpen,
}: {
  incident: NonNullable<NonNullable<ChatMessage['metadata']>['incident']>;
  mine: boolean;
  onOpen: () => void;
}) {
  const active = !['RESOLVED', 'VERIFIED', 'CLOSED'].includes(incident.status);
  const overdue =
    !!incident.resolutionDeadline && active && new Date(incident.resolutionDeadline) < new Date();
  const pTone =
    incident.priority === 'P1' ? 'text-danger' : incident.priority === 'P2' ? 'text-accent' : '';
  return (
    <button
      onClick={onOpen}
      className={`block w-64 max-w-full rounded-md border p-2.5 text-left ${
        mine ? 'border-white/25' : overdue ? 'border-danger/50 bg-canvas' : 'border-line bg-canvas'
      }`}
    >
      <p className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${mine ? 'text-white/70' : 'text-faint'}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
          <path d="M12 4l9 16H3L12 4z" />
          <path d="M12 10v4M12 17h.01" strokeLinecap="round" />
        </svg>
        <span className={mine ? '' : pTone}>{incident.priority}</span>
        Incident · {incident.status.replace('_', ' ').toLowerCase()}
      </p>
      <p className={`mt-1 text-sm font-medium leading-snug ${mine ? 'text-white' : ''}`}>
        {incident.typeLabel}
      </p>
      <p className={`mt-1 text-[11px] ${mine ? 'text-white/70' : 'text-faint'}`}>
        {incident.sku ? `SKU ${incident.sku} · ` : ''}
        {incident.ownerName ? `owner ${incident.ownerName}` : 'unassigned'}
        {incident.resolutionDeadline && (
          <span className={overdue ? ' font-semibold text-danger' : ''}>
            {overdue ? ' · SLA breached' : ` · due ${new Date(incident.resolutionDeadline).toLocaleDateString()}`}
          </span>
        )}
      </p>
      <p className={`mt-1.5 text-[11px] underline ${mine ? 'text-white/80' : 'text-accent'}`}>Open incident</p>
    </button>
  );
}

function groupReactions(message: ChatMessage, meId: string) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean; names: string[] }>();
  for (const r of message.reactions ?? []) {
    const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, names: [] };
    g.count += 1;
    g.names.push(r.displayName);
    if (r.userId === meId) g.mine = true;
    map.set(r.emoji, g);
  }
  return [...map.values()];
}

function renderWithMentions(content: string, usernames: Set<string>, mine: boolean) {
  const parts = content.split(/(@[\w.\-]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@') && usernames.has(part.slice(1).toLowerCase())) {
      return (
        <span
          key={i}
          className={`rounded px-0.5 font-semibold ${
            mine ? 'bg-accent/40 text-canvas' : 'bg-accent/15 text-accent'
          }`}
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
