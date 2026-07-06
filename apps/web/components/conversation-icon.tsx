'use client';

import Avatar from '@/components/avatar';
import type { ConversationSummary } from '@/lib/types';

// Unified line-icon system for conversation identity. Replaces emoji so the
// interface reads as an operations workspace, not a chat prototype.

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function DeptGlyph() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M4 7h16M4 7l1.5-2.5h13L20 7M5 7v11a1 1 0 001 1h12a1 1 0 001-1V7" />
    </svg>
  );
}
function AlertGlyph() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M12 4l9 16H3L12 4z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}
function MegaphoneGlyph() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M3 11v2a1 1 0 001 1h2l7 4V6L6 10H4a1 1 0 00-1 1z" />
      <path d="M16 9a3 3 0 010 6" />
    </svg>
  );
}
function ProjectGlyph() {
  return (
    <svg {...iconProps} aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16M9 20V9" />
    </svg>
  );
}
function GroupGlyph() {
  return (
    <svg {...iconProps} aria-hidden>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19c.7-2.7 3-4 5.5-4s4.8 1.3 5.5 4" />
      <circle cx="17" cy="10" r="2.2" />
      <path d="M16 15.2c1.9.2 3.4 1.4 4 3.3" />
    </svg>
  );
}

const BRANCH_ABBR: Record<string, string> = {
  'Bacolod Main': 'BCD',
  'Bacolod 888': '888',
  Cadiz: 'CDZ',
  Kabankalan: 'KBL',
  Dumaguete: 'DGT',
  'La Carlota': 'LCR',
  Silay: 'SLY',
  Escalante: 'ESC',
  Warehouse: 'WHS',
  'Head Office': 'HO',
};

export function branchAbbr(name?: string | null): string | null {
  if (!name) return null;
  return BRANCH_ABBR[name] ?? name.slice(0, 3).toUpperCase();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function ConversationIcon({
  conversation,
  size = 'md',
}: {
  conversation: Pick<
    ConversationSummary,
    'id' | 'type' | 'icon' | 'title' | 'otherUser' | 'priority' | 'branchCode'
  >;
  size?: 'sm' | 'md';
}) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';

  // An uploaded group photo wins over everything.
  if (conversation.icon?.startsWith('img:')) {
    return (
      <span
        className={`${box} block shrink-0 overflow-hidden rounded-md border border-line`}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/conversations/${conversation.id}/photo?v=${encodeURIComponent(conversation.icon)}`}
          alt=""
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  // A custom emoji icon, if the group owner set one, always wins.
  if (conversation.icon) {
    return (
      <span
        className={`${box} flex shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-base`}
        aria-hidden
      >
        {conversation.icon}
      </span>
    );
  }

  if (conversation.type === 'DIRECT') {
    return (
      <Avatar
        userId={conversation.otherUser?.id}
        name={conversation.otherUser?.displayName ?? conversation.title}
        avatarKey={conversation.otherUser?.avatarKey}
        size={size === 'sm' ? 'sm' : 'md'}
      />
    );
  }

  if (conversation.type === 'BRANCH') {
    return (
      <span
        className={`${box} flex shrink-0 items-center justify-center rounded-md border border-line bg-canvas font-mono text-[10px] font-bold tracking-wide text-soft`}
        aria-hidden
      >
        {conversation.branchCode ?? 'BR'}
      </span>
    );
  }

  if (conversation.type === 'INCIDENT') {
    const tone =
      conversation.priority === 'P1'
        ? 'border-danger/40 bg-danger/10 text-danger'
        : conversation.priority === 'P2'
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-line bg-raised text-soft';
    return (
      <span className={`${box} flex shrink-0 items-center justify-center rounded-md border ${tone}`}>
        <AlertGlyph />
      </span>
    );
  }

  const glyph =
    conversation.type === 'ANNOUNCEMENT' ? (
      <MegaphoneGlyph />
    ) : conversation.type === 'DEPARTMENT' ? (
      <DeptGlyph />
    ) : conversation.type === 'PROJECT' ? (
      <ProjectGlyph />
    ) : (
      <GroupGlyph />
    );

  return (
    <span
      className={`${box} flex shrink-0 items-center justify-center rounded-md border border-line bg-raised text-soft`}
    >
      {glyph}
    </span>
  );
}
