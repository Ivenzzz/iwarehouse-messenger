'use client';

import { useEffect, useRef } from 'react';
import type { ConversationSummary } from '@/lib/types';

export const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: ['😀', '😄', '😂', '🤣', '😊', '😉', '😍', '😘', '😎', '🤔', '😅', '😢', '😭', '😡', '🥳', '😴', '🤯', '🙄', '😬', '🤝'],
  },
  {
    label: 'Gestures',
    emojis: ['👍', '👎', '👌', '✌️', '🙏', '👏', '💪', '🤙', '👉', '👈', '☝️', '✋', '🖐️', '🤞', '👋'],
  },
  {
    label: 'Work',
    emojis: ['✅', '❌', '⚠️', '📌', '📦', '🚚', '🏪', '🏭', '💰', '🧾', '📊', '📈', '📉', '🗂️', '📝', '🖨️', '💻', '📱', '🔧', '🔑', '🔒', '⏰', '📅', '📞'],
  },
  {
    label: 'Symbols',
    emojis: ['❤️', '🔥', '⭐', '🎉', '🎯', '💡', '🚨', '❓', '❗', '💯', '🆗', '🆕', '♻️'],
  },
];

export function EmojiPicker({
  onPick,
  onClose,
  align = 'left',
  direction = 'up',
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  align?: 'left' | 'right';
  direction?: 'up' | 'down';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute z-30 max-h-64 w-72 overflow-y-auto rounded-md border border-line bg-surface p-2 shadow-lg ${
        direction === 'up' ? 'bottom-full mb-2' : 'top-0 mt-1'
      } ${align === 'left' ? 'left-0' : 'right-0'}`}
    >
      {EMOJI_CATEGORIES.map((cat) => (
        <div key={cat.label} className="mb-1">
          <p className="px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
            {cat.label}
          </p>
          <div className="grid grid-cols-8">
            {cat.emojis.map((e) => (
              <button
                key={e}
                onClick={() => onPick(e)}
                className="rounded p-1 text-lg leading-none hover:bg-raised"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const TYPE_FALLBACK: Record<string, string> = {
  DIRECT: '💬',
  PRIVATE_GROUP: '👥',
  DEPARTMENT: '🗂️',
  BRANCH: '🏪',
  ANNOUNCEMENT: '📢',
  PROJECT: '🎯',
  INCIDENT: '🚨',
};

// Icon shown next to a conversation: custom emoji if set, otherwise a
// sensible default for the conversation type, with initials for DMs.
export function ConversationIcon({
  conversation,
  size = 'md',
}: {
  conversation: Pick<ConversationSummary, 'type' | 'icon' | 'title' | 'otherUser'>;
  size?: 'sm' | 'md';
}) {
  const cls =
    size === 'sm'
      ? 'h-8 w-8 rounded-md text-base'
      : 'h-9 w-9 rounded-md text-lg';

  if (conversation.type === 'DIRECT') {
    const name = conversation.otherUser?.displayName ?? conversation.title;
    return (
      <span
        className={`${cls} flex shrink-0 items-center justify-center bg-raised text-xs font-semibold uppercase`}
        aria-hidden
      >
        {initials(name)}
      </span>
    );
  }
  return (
    <span
      className={`${cls} flex shrink-0 items-center justify-center border border-line bg-canvas`}
      aria-hidden
    >
      {conversation.icon || TYPE_FALLBACK[conversation.type] || '👥'}
    </span>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}
