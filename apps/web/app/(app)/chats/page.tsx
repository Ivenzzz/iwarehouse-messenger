'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ChatView from '@/components/chat-view';
import NewChatDialog from '@/components/new-chat-dialog';
import ConversationRow from '@/components/conversation-row';
import FilterTabs from '@/components/filter-tabs';
import AnnouncementComposer from '@/components/announcement-composer';
import NotificationsBell from '@/components/notifications-bell';
import SearchOverlay from '@/components/search-overlay';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { type ConversationSummary, type Me } from '@/lib/types';

type ListFilter =
  | 'all'
  | 'unread'
  | 'mentions'
  | 'assigned'
  | 'incidents'
  | 'announcements'
  | 'pinned';

interface ConversationUpdatedEvent {
  conversationId: string;
  senderId?: string;
  kind?: string;
  updatedAt?: string;
  lastMessage?: ConversationSummary['lastMessage'];
}

const FILTERS: { key: ListFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'mentions', label: 'Mentions' },
  { key: 'assigned', label: 'Assigned to Me' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'pinned', label: 'Pinned' },
];

function applyFilter(list: ConversationSummary[], filter: ListFilter) {
  switch (filter) {
    case 'unread':
      return list.filter((c) => c.unreadCount > 0);
    case 'mentions':
      return list.filter((c) => c.hasUnreadMention);
    case 'incidents':
      return list.filter((c) => c.type === 'INCIDENT' || c.priority);
    case 'announcements':
      return list.filter((c) => c.type === 'ANNOUNCEMENT');
    case 'pinned':
      return list.filter((c) => c.pinnedAt);
    case 'assigned':
      return list.filter((c) => (c.myOpenTaskCount ?? 0) > 0);
    default:
      return list;
  }
}

export default function ChatsPage() {
  return (
    <Suspense>
      <Chats />
    </Suspense>
  );
}

function Chats() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const selectedId = params.get('c');
  const [showNew, setShowNew] = useState(false);
  const [showAnnounce, setShowAnnounce] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [filter, setFilter] = useState<ListFilter>('all');

  const { data: me } = useQuery<Me>({ queryKey: ['me'], queryFn: () => api.get('/me') });
  const { data: conversations, isLoading } = useQuery<ConversationSummary[]>({
    queryKey: ['conversations'],
    queryFn: () => api.get('/conversations'),
  });

  // Live sidebar: apply message activity immediately, then refetch to reconcile
  // derived fields such as unread mentions and task counts.
  useEffect(() => {
    const socket = getSocket();
    const refresh = (event?: ConversationUpdatedEvent) => {
      if (event?.kind === 'message' && event.updatedAt && event.lastMessage) {
        queryClient.setQueryData<ConversationSummary[]>(['conversations'], (current) =>
          current?.map((conversation) =>
            conversation.id === event.conversationId
              ? {
                  ...conversation,
                  updatedAt: event.updatedAt!,
                  lastMessage: event.lastMessage!,
                  unreadCount:
                    event.senderId === me?.id || event.conversationId === selectedId
                      ? 0
                      : conversation.unreadCount + 1,
                }
              : conversation,
          ),
        );
      }
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };
    const refreshPresence = () =>
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    socket.on('conversation.updated', refresh);
    socket.on('presence.update', refreshPresence);
    return () => {
      socket.off('conversation.updated', refresh);
      socket.off('presence.update', refreshPresence);
    };
  }, [me?.id, queryClient, selectedId]);

  const selected = useMemo(
    () => conversations?.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const visible = useMemo(() => {
    const filtered = applyFilter(conversations ?? [], filter);
    // Pinned conversations first, then most recent activity.
    return [...filtered].sort((a, b) => {
      if (Boolean(a.pinnedAt) !== Boolean(b.pinnedAt)) return a.pinnedAt ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [conversations, filter]);

  function open(id: string) {
    router.push(`/chats?c=${id}`);
  }

  return (
    <div className="flex h-full">
      <aside
        className={`w-full flex-col border-r border-line bg-surface md:flex md:w-80 ${
          selectedId ? 'hidden' : 'flex'
        }`}
      >
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h1 className="flex-1 text-sm font-semibold tracking-tight">Chats</h1>
          <button
            onClick={() => setShowSearch(true)}
            title="Search messages and files"
            aria-label="Search"
            className="rounded-md border border-line px-2 py-1 text-xs text-soft hover:text-ink"
          >
            🔍
          </button>
          {me && ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(me.role) && (
            <button
              onClick={() => setShowAnnounce(true)}
              title="Post announcement"
              aria-label="Post announcement"
              className="rounded-md border border-line px-2 py-1 text-xs text-soft hover:text-ink"
            >
              📣
            </button>
          )}
          <NotificationsBell onOpenConversation={(id) => open(id)} />
          <button
            onClick={() => setShowNew(true)}
            className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-ink"
          >
            New
          </button>
        </header>

        <FilterTabs tabs={FILTERS} active={filter} onChange={setFilter} primaryCount={4} />

        <ul className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && <li className="p-4 text-sm text-faint">Loading conversations…</li>}
          {visible.map((c) => (
            <li key={c.id}>
              <ConversationRow
                conversation={c}
                active={selectedId === c.id}
                onClick={() => open(c.id)}
              />
            </li>
          ))}
          {conversations && visible.length === 0 && (
            <li className="p-6 text-center text-sm text-faint">
              {filter === 'assigned'
                ? 'No conversations with tasks assigned to you.'
                : filter === 'all'
                  ? 'No conversations yet. Start one with New.'
                  : 'Nothing matches this filter.'}
            </li>
          )}
        </ul>
      </aside>

      <div className={`min-w-0 flex-1 ${selectedId ? 'flex' : 'hidden md:flex'}`}>
        {selected && me ? (
          <ChatView
            key={selected.id}
            conversation={selected}
            me={me}
            onBack={() => router.push('/chats')}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-faint">
            Select a conversation to start reading.
          </div>
        )}
      </div>

      {showSearch && (
        <SearchOverlay
          onClose={() => setShowSearch(false)}
          onOpenConversation={(id) => {
            setShowSearch(false);
            open(id);
          }}
        />
      )}

      {showAnnounce && (
        <AnnouncementComposer
          onClose={() => setShowAnnounce(false)}
          onPosted={({ conversationId }) => open(conversationId)}
        />
      )}

      {showNew && me && (
        <NewChatDialog
          me={me}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            open(id);
          }}
        />
      )}
    </div>
  );
}
