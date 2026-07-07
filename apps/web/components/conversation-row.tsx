'use client';

import { ConversationIcon } from '@/components/conversation-icon';
import { CONVERSATION_TYPE_LABEL, type ConversationSummary } from '@/lib/types';

// Compact operational conversation row. Operational badges (branch, dept,
// type, priority) render only where they apply so plain DMs stay clean.
export default function ConversationRow({
  conversation,
  active,
  onClick,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onClick: () => void;
}) {
  const c = conversation;
  const isOperational = c.type !== 'DIRECT';
  const time = c.lastMessage
    ? new Date(c.lastMessage.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <button
      onClick={onClick}
      className={`relative flex w-full items-start gap-2.5 border-b border-line/60 px-3 py-2 text-left hover:bg-raised ${
        active ? 'bg-accent/5' : ''
      }`}
    >
      {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden />}

      <span className="relative mt-0.5">
        <ConversationIcon conversation={c} size="sm" />
        {c.type === 'DIRECT' && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${
              c.otherUser?.presence === 'ONLINE' ? 'bg-ok' : 'bg-line'
            }`}
            aria-hidden
          />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</span>
          {c.pinnedAt && (
            <span title="Pinned" className="text-[10px] text-accent" aria-hidden>
              ●
            </span>
          )}
          {c.mutedUntil && (
            <span title="Muted" className="text-[10px] text-faint" aria-hidden>
              ⦸
            </span>
          )}
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-faint">{time}</span>
        </span>

        {isOperational && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            {c.branchCode && <span className="stamp">{c.branchCode}</span>}
            {c.departmentCode && <span className="stamp">{c.departmentCode}</span>}
            <span className="stamp">{CONVERSATION_TYPE_LABEL[c.type] ?? c.type}</span>
            {c.priority && <PriorityBadge priority={c.priority} />}
            {(c.openTaskCount ?? 0) > 0 && (
              <span className="stamp" title="Open tasks">
                {c.openTaskCount} task{c.openTaskCount === 1 ? '' : 's'}
              </span>
            )}
          </span>
        )}

        <span className="mt-0.5 flex items-center gap-1.5">
          {c.lastMessage ? (
            <span className="min-w-0 flex-1 truncate text-xs text-soft">
              <span className="text-faint">{c.lastMessage.senderName}:</span>{' '}
              {c.lastMessage.content}
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-xs text-faint">No messages yet</span>
          )}
          {c.hasUnreadMention && (
            <span
              title="You were mentioned"
              className="shrink-0 rounded-full bg-accent/15 px-1.5 text-[10px] font-bold text-accent"
            >
              @
            </span>
          )}
          {c.unreadCount > 0 && (
            <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-ink">
              {c.unreadCount > 99 ? '99+' : c.unreadCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export function PriorityBadge({ priority }: { priority: 'P1' | 'P2' | 'P3' }) {
  const tone =
    priority === 'P1'
      ? 'bg-danger/15 text-danger'
      : priority === 'P2'
        ? 'bg-accent/15 text-accent'
        : 'bg-raised text-soft';
  return (
    <span className={`rounded-sm px-1 py-0.5 font-mono text-[10px] font-bold ${tone}`}>
      {priority}
    </span>
  );
}
