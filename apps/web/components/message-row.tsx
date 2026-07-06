'use client';

import { useRef, useState } from 'react';
import Avatar from '@/components/avatar';
import AttachmentList from '@/components/attachment-list';
import type { ChatMessage } from '@/lib/types';

const QUICK_EMOJI = ['👍', '✅', '❌', '❤️', '😂', '😮'];

export interface MessageActions {
  onReply: (m: ChatMessage) => void;
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
          {message.content && (
            <span className="whitespace-pre-wrap break-words">
              {renderWithMentions(message.content, memberUsernames, mine)}
            </span>
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
