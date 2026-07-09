'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, formatBytes, uploadFile, type UploadedInfo } from '@/lib/api';
import { ConversationIcon } from '@/components/conversation-icon';
import ContextDrawer from '@/components/context-drawer';
import CreateTaskModal from '@/components/create-task-modal';
import IncidentDrawer from '@/components/incident-drawer';
import RaiseIncidentModal from '@/components/raise-incident-modal';
import TaskDrawer from '@/components/task-drawer';
import { PriorityBadge } from '@/components/conversation-row';
import { EmojiPicker } from '@/components/emoji';
import MessageRow from '@/components/message-row';
import SharedFilesPanel from '@/components/shared-files-panel';
import StampedCamera, { cameraAvailable, type CaptureMeta } from '@/components/stamped-camera';
import {
  VoiceRecorderBar,
  dictationAvailable,
  useDictation,
  voiceRecordingAvailable,
} from '@/components/voice-recorder';
import { getSocket } from '@/lib/socket';
import type {
  ChatMessage,
  ConversationMemberInfo,
  ConversationSummary,
  Me,
} from '@/lib/types';

interface MessagesPage {
  items: ChatMessage[];
  nextCursor: string | null;
  savedIds: string[];
}

interface PendingUpload {
  key: string;
  name: string;
  size: number;
  percent: number;
  info?: UploadedInfo;
  error?: string;
  cancel: () => void;
}

export default function ChatView({
  conversation,
  me,
  onBack,
}: {
  conversation: ConversationSummary;
  me: Me;
  onBack: () => void;
}) {
  // Context drawer auto-opens for incident/project chats, on demand otherwise.
  const [showDrawer, setShowDrawer] = useState(
    conversation.type === 'INCIDENT' || conversation.type === 'PROJECT',
  );
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [typers, setTypers] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [showShared, setShowShared] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [acksFor, setAcksFor] = useState<ChatMessage | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [taskModal, setTaskModal] = useState<
    { open: true; sourceMessage?: { id: string; content: string; senderName?: string } } | null
  >(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [incidentModal, setIncidentModal] = useState(false);
  const [erpModal, setErpModal] = useState(false);
  const [pollModal, setPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollMulti, setPollMulti] = useState(false);
  const [pollBusy, setPollBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const dictation = useDictation((text) => {
    onDraftChange((draftRef.current ? draftRef.current.replace(/\s*$/, ' ') : '') + text);
  });
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const [erpKind, setErpKind] = useState('TRANSFER');
  const [erpRef, setErpRef] = useState('');
  const [erpNote, setErpNote] = useState('');
  const [erpBusy, setErpBusy] = useState(false);
  const [openIncidentId, setOpenIncidentId] = useState<string | null>(null);
  const [captureMeta, setCaptureMeta] = useState<CaptureMeta | null>(null);
  const [convPinned, setConvPinned] = useState<boolean>(Boolean(conversation.pinnedAt));
  const [muted, setMuted] = useState<boolean>(Boolean(conversation.mutedUntil));
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  async function uploadConversationPhoto(file: File) {
    setShowIconPicker(false);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/conversations/${conversation.id}/photo`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.message ?? 'Could not upload the photo.');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }
  const textRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAnnouncement = conversation.type === 'ANNOUNCEMENT';
  const canPin =
    conversation.type === 'DIRECT' ||
    conversation.myRole === 'OWNER' ||
    conversation.myRole === 'ADMIN';
  const canPost =
    conversation.myRole !== 'READ_ONLY' &&
    (!isAnnouncement || conversation.myRole === 'OWNER' || conversation.myRole === 'ADMIN');

  const { data: initial } = useQuery<MessagesPage>({
    queryKey: ['messages', conversation.id],
    queryFn: () => api.get(`/conversations/${conversation.id}/messages?limit=50`),
  });
  const { data: members } = useQuery<ConversationMemberInfo[]>({
    queryKey: ['members', conversation.id],
    queryFn: () => api.get(`/conversations/${conversation.id}/members`),
  });
  const { data: pinned } = useQuery<ChatMessage[]>({
    queryKey: ['pinned', conversation.id],
    queryFn: () => api.get(`/conversations/${conversation.id}/pinned`),
  });

  const memberUsernames = useMemo(() => {
    const set = new Set<string>();
    for (const m of members ?? []) set.add(usernameOf(m));
    return set;
  }, [members]);

  useEffect(() => {
    if (initial) {
      setMessages(initial.items);
      setNextCursor(initial.nextCursor);
      setSavedIds(new Set(initial.savedIds));
    }
  }, [initial]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('conversation.join', { conversationId: conversation.id });
    api.post(`/conversations/${conversation.id}/read`).catch(() => undefined);

    const inThis = (p: { conversationId: string }) => p.conversationId === conversation.id;

    const onNew = (m: ChatMessage) => {
      if (!inThis(m)) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      if (m.sender?.id !== me.id) {
        api.post(`/conversations/${conversation.id}/read`).catch(() => undefined);
        setTypers((t) => {
          if (!m.sender) return t;
          const { [m.sender.id]: _g, ...rest } = t;
          return rest;
        });
      }
    };
    const onUpdated = (m: ChatMessage) => {
      if (!inThis(m)) return;
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
    };
    const onDeleted = (p: { id: string; conversationId: string }) => {
      if (!inThis(p)) return;
      setMessages((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? {
                ...x,
                content: 'Message deleted',
                deletedAt: new Date().toISOString(),
                attachments: [],
                reactions: [],
              }
            : x,
        ),
      );
    };
    const onTypingStart = (p: { conversationId: string; userId: string; displayName: string }) => {
      if (!inThis(p) || p.userId === me.id) return;
      setTypers((t) => ({ ...t, [p.userId]: p.displayName }));
    };
    const onTypingStop = (p: { conversationId: string; userId: string }) => {
      if (!inThis(p)) return;
      setTypers((t) => {
        const { [p.userId]: _g, ...rest } = t;
        return rest;
      });
    };
    const onReactionAdd = (p: {
      conversationId: string;
      messageId: string;
      emoji: string;
      userId: string;
      displayName: string;
    }) => {
      if (!inThis(p)) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== p.messageId) return m;
          const reactions = m.reactions ?? [];
          if (reactions.some((r) => r.userId === p.userId && r.emoji === p.emoji)) return m;
          return {
            ...m,
            reactions: [...reactions, { emoji: p.emoji, userId: p.userId, displayName: p.displayName }],
          };
        }),
      );
    };
    const onReactionRemove = (p: {
      conversationId: string;
      messageId: string;
      emoji: string;
      userId: string;
    }) => {
      if (!inThis(p)) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === p.messageId
            ? {
                ...m,
                reactions: (m.reactions ?? []).filter(
                  (r) => !(r.userId === p.userId && r.emoji === p.emoji),
                ),
              }
            : m,
        ),
      );
    };
    const onPinned = (p: { conversationId: string; messageId: string; pinned: boolean }) => {
      if (!inThis(p)) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === p.messageId ? { ...m, isPinned: p.pinned } : m)),
      );
      queryClient.invalidateQueries({ queryKey: ['pinned', conversation.id] });
    };
    const onAcked = (p: { conversationId: string; messageId: string; userId: string }) => {
      if (!inThis(p)) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== p.messageId) return m;
          const ackedBy = m.ackedBy ?? [];
          if (ackedBy.includes(p.userId)) return m;
          return { ...m, ackedBy: [...ackedBy, p.userId], ackCount: (m.ackCount ?? 0) + 1 };
        }),
      );
    };

    socket.on('message.new', onNew);
    socket.on('message.updated', onUpdated);
    socket.on('message.deleted', onDeleted);
    socket.on('typing.start', onTypingStart);
    socket.on('typing.stop', onTypingStop);
    socket.on('reaction.add', onReactionAdd);
    socket.on('reaction.remove', onReactionRemove);
    socket.on('message.pinned', onPinned);
    socket.on('message.acked', onAcked);
    const onRefresh = (p: { conversationId: string }) => {
      if (!inThis(p)) return;
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    };
    const onTaskUpdated = (p: { conversationId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      if (p.conversationId === conversation.id) {
        queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
      }
    };
    const onIncidentUpdated = (p: { conversationId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      if (p.conversationId === conversation.id) {
        queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
      }
    };
    socket.on('conversation.refresh', onRefresh);
    socket.on('task.updated', onTaskUpdated);
    socket.on('incident.updated', onIncidentUpdated);
    return () => {
      socket.off('conversation.refresh', onRefresh);
      socket.off('task.updated', onTaskUpdated);
      socket.off('incident.updated', onIncidentUpdated);
      socket.emit('conversation.leave', { conversationId: conversation.id });
      socket.off('message.new', onNew);
      socket.off('message.updated', onUpdated);
      socket.off('message.deleted', onDeleted);
      socket.off('typing.start', onTypingStart);
      socket.off('typing.stop', onTypingStop);
      socket.off('reaction.add', onReactionAdd);
      socket.off('reaction.remove', onReactionRemove);
      socket.off('message.pinned', onPinned);
      socket.off('message.acked', onAcked);
    };
  }, [conversation.id, me.id, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, Object.keys(typers).length]);

  async function loadEarlier() {
    if (!nextCursor) return;
    const page: MessagesPage = await api.get(
      `/conversations/${conversation.id}/messages?limit=50&cursor=${nextCursor}`,
    );
    setMessages((prev) => [...page.items, ...prev]);
    setNextCursor(page.nextCursor);
    setSavedIds((prev) => new Set([...prev, ...page.savedIds]));
  }

  function notifyTyping() {
    const socket = getSocket();
    socket.emit('typing.start', { conversationId: conversation.id });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(
      () => socket.emit('typing.stop', { conversationId: conversation.id }),
      2500,
    );
  }

  function onDraftChange(value: string) {
    setDraft(value);
    notifyTyping();
    const caretWord =
      value.slice(0, textRef.current?.selectionStart ?? value.length).split(/\s/).pop() ?? '';
    setMentionQuery(caretWord.startsWith('@') ? caretWord.slice(1).toLowerCase() : null);
  }

  function insertMention(username: string) {
    const el = textRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(/@[\w.\-]*$/, `@${username} `);
    setDraft(before + draft.slice(caret));
    setMentionQuery(null);
    el?.focus();
  }

  function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      const { promise, cancel } = uploadFile(file, (percent) =>
        setPending((prev) => prev.map((u) => (u.key === key ? { ...u, percent } : u))),
      );
      setPending((prev) => [...prev, { key, name: file.name, size: file.size, percent: 0, cancel }]);
      promise
        .then((info) =>
          setPending((prev) => prev.map((u) => (u.key === key ? { ...u, info, percent: 100 } : u))),
        )
        .catch((err) =>
          setPending((prev) =>
            prev.map((u) =>
              u.key === key
                ? { ...u, error: err instanceof ApiError ? err.message : 'Upload failed' }
                : u,
            ),
          ),
        );
    }
  }

  function removePending(key: string) {
    setPending((prev) => {
      const item = prev.find((u) => u.key === key);
      if (item && !item.info && !item.error) item.cancel();
      return prev.filter((u) => u.key !== key);
    });
  }

  async function send() {
    const content = draft.trim();
    const ready = pending.filter((u) => u.info);
    if (pending.some((u) => !u.info && !u.error)) return;
    if (!content && ready.length === 0) return;
    const attachmentIds = ready.map((u) => u.info!.id);
    const replyToMessageId = replyTo?.id;
    const replySnapshot = replyTo;
    setPending([]);
    setDraft('');
    setReplyTo(null);
    setMentionQuery(null);
    getSocket().emit('typing.stop', { conversationId: conversation.id });

    const tempId = `tmp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      conversationId: conversation.id,
      content: content || `Sending ${ready.length} file(s)…`,
      contentType: 'TEXT',
      createdAt: new Date().toISOString(),
      sender: { id: me.id, displayName: me.profile?.displayName ?? me.username },
      replyTo: replySnapshot
        ? {
            id: replySnapshot.id,
            content: replySnapshot.content,
            senderName: replySnapshot.sender?.displayName ?? '',
          }
        : null,
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const saved: ChatMessage = await api.post(`/conversations/${conversation.id}/messages`, {
        content: content || undefined,
        attachmentIds,
        replyToMessageId,
        capture: captureMeta ?? undefined,
      });
      setCaptureMeta(null);
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === saved.id) ? withoutTemp : [...withoutTemp, saved];
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
      );
    }
  }

  const actions = {
    onCreateTask: (m: ChatMessage) =>
      setTaskModal({
        open: true,
        sourceMessage: { id: m.id, content: m.content, senderName: m.sender?.displayName },
      }),
    onOpenTask: (taskId: string) => setOpenTaskId(taskId),
    onOpenIncident: (incidentId: string) => setOpenIncidentId(incidentId),
    onReply: (m: ChatMessage) => {
      setReplyTo(m);
      textRef.current?.focus();
    },
    onReact: (m: ChatMessage, emoji: string) => {
      const mine = (m.reactions ?? []).some((r) => r.userId === me.id && r.emoji === emoji);
      const call = mine
        ? api.del(`/messages/${m.id}/reactions/${encodeURIComponent(emoji)}`)
        : api.post(`/messages/${m.id}/reactions`, { emoji });
      call.catch((err) => err instanceof ApiError && alert(err.message));
    },
    onTogglePin: (m: ChatMessage) => {
      const call = m.isPinned ? api.del(`/messages/${m.id}/pin`) : api.post(`/messages/${m.id}/pin`);
      call.catch((err) => err instanceof ApiError && alert(err.message));
    },
    onToggleSave: (m: ChatMessage) => {
      const isSaved = savedIds.has(m.id);
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.delete(m.id);
        else next.add(m.id);
        return next;
      });
      const call = isSaved ? api.del(`/messages/${m.id}/save`) : api.post(`/messages/${m.id}/save`);
      call.catch(() => undefined);
    },
    onDelete: (id: string) =>
      api.del(`/messages/${id}`).catch((err) => err instanceof ApiError && alert(err.message)),
    onRetry: (m: ChatMessage) => {
      setMessages((prev) => prev.filter((x) => x.id !== m.id));
      setDraft(m.content);
    },
    onAck: (m: ChatMessage) => api.post(`/messages/${m.id}/ack`).catch(() => undefined),
    onShowAcks: (m: ChatMessage) => setAcksFor(m),
  };

  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    try {
      if (next) await api.post(`/conversations/${conversation.id}/mute`, {});
      else await api.del(`/conversations/${conversation.id}/mute`);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch {
      setMuted(!next);
    }
  }

  const typerNames = Object.values(typers);
  const mentionMatches =
    mentionQuery !== null
      ? (members ?? [])
          .filter((m) => m.userId !== me.id && usernameOf(m).includes(mentionQuery))
          .slice(0, 5)
      : [];
  const latestPin = pinned?.[0];

  const subtitle = [
    conversation.branchCode,
    conversation.departmentCode,
    conversation.type !== 'DIRECT' ? conversation.type.replace('_', ' ') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex h-full min-w-0 flex-1">
    <section className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
        <button onClick={onBack} className="text-soft md:hidden" aria-label="Back to chats">
          ←
        </button>
        <div className="relative">
          <button
            onClick={() => canPin && conversation.type !== 'DIRECT' && setShowIconPicker((v) => !v)}
            title={
              canPin && conversation.type !== 'DIRECT'
                ? 'Change conversation icon'
                : conversation.title
            }
            aria-label="Conversation icon"
            className={canPin && conversation.type !== 'DIRECT' ? 'cursor-pointer' : 'cursor-default'}
          >
            <ConversationIcon conversation={conversation} />
          </button>
          {showIconPicker && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              onClick={() => setShowIconPicker(false)}
            >
              <div className="relative w-72" onClick={(e) => e.stopPropagation()}>
                <p className="mb-2 rounded-md bg-surface px-3 py-2 text-center text-xs text-soft">
                  Pick an emoji, or upload a group photo
                </p>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="mb-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-raised"
                >
                  📷 Upload photo…
                </button>
                <div className="relative h-0">
                  <EmojiPicker
                    align="left"
                    direction="down"
                    onClose={() => setShowIconPicker(false)}
                    onPick={async (emoji) => {
                      setShowIconPicker(false);
                      await api
                        .patch(`/conversations/${conversation.id}`, { icon: emoji })
                        .catch((err) => err instanceof ApiError && alert(err.message));
                      queryClient.invalidateQueries({ queryKey: ['conversations'] });
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold tracking-tight">{conversation.title}</h2>
            {conversation.priority && <PriorityBadge priority={conversation.priority} />}
          </div>
          <p className="truncate text-xs text-faint">
            {conversation.type === 'DIRECT'
              ? conversation.otherUser?.presence === 'ONLINE'
                ? 'Online'
                : 'Offline'
              : subtitle
                ? `${subtitle} · ${conversation.memberCount} members`
                : `${conversation.memberCount} members`}
          </p>
        </div>
        <button
          onClick={() => setTaskModal({ open: true })}
          className="hidden rounded-md border border-line px-2.5 py-1 text-xs font-medium text-soft hover:text-ink md:inline-flex"
          title="Create a task in this conversation"
        >
          Create Task
        </button>
        {conversation.type !== 'DIRECT' && (
          <button
            onClick={() => setIncidentModal(true)}
            className="hidden rounded-md border border-danger/40 px-2.5 py-1 text-xs font-medium text-danger md:inline-flex"
            title="Raise a structured incident in this conversation"
          >
            Raise Incident
          </button>
        )}
        <HeaderIcon
          label="Files"
          onClick={() => setShowShared(true)}
        >
          <FilesGlyph />
        </HeaderIcon>
        {canPin && conversation.type !== 'DIRECT' && (
          <select
            value={conversation.priority ?? ''}
            onChange={async (e) => {
              await api
                .patch(`/conversations/${conversation.id}`, { priority: e.target.value })
                .catch((err) => err instanceof ApiError && alert(err.message));
              queryClient.invalidateQueries({ queryKey: ['conversations'] });
            }}
            title="Set priority"
            aria-label="Conversation priority"
            className="hidden rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-soft md:block"
          >
            <option value="">Priority…</option>
            <option value="P1">P1 — Critical</option>
            <option value="P2">P2 — High</option>
            <option value="P3">P3 — Normal</option>
          </select>
        )}
        <HeaderIcon
          label={convPinned ? 'Unpin conversation' : 'Pin conversation'}
          active={convPinned}
          onClick={async () => {
            const next = !convPinned;
            setConvPinned(next);
            const call = next
              ? api.post(`/conversations/${conversation.id}/pin-conversation`)
              : api.del(`/conversations/${conversation.id}/pin-conversation`);
            await call.catch(() => setConvPinned(!next));
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
          }}
        >
          <PinHeaderGlyph />
        </HeaderIcon>
        <HeaderIcon
          label={muted ? 'Unmute' : 'Mute'}
          active={muted}
          onClick={toggleMute}
        >
          <BellGlyph muted={muted} />
        </HeaderIcon>
        <HeaderIcon
          label={showDrawer ? 'Hide details' : 'Show details'}
          active={showDrawer}
          onClick={() => setShowDrawer((v) => !v)}
          className="hidden lg:inline-flex"
        >
          <PanelGlyph />
        </HeaderIcon>
      </header>

      {latestPin && (
        <button
          onClick={() => setShowPins(true)}
          className="flex items-center gap-2 border-b border-line bg-accent/5 px-4 py-1.5 text-left"
        >
          <span className="text-accent">📌</span>
          <span className="min-w-0 flex-1 truncate text-xs">
            <span className="font-medium">{latestPin.sender?.displayName}: </span>
            {latestPin.content || latestPin.attachments?.[0]?.originalName || 'Attachment'}
          </span>
          {(pinned?.length ?? 0) > 1 && (
            <span className="text-[11px] text-faint">+{pinned!.length - 1} more</span>
          )}
        </button>
      )}

      <div
        className={`relative min-h-0 flex-1 overflow-y-auto ${
          dragOver ? 'ring-2 ring-inset ring-accent' : ''
        }`}
        onDragOver={(e) => {
          if (canPost) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!canPost) return;
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
      >
        <div className="mx-auto w-full max-w-[820px] px-4 py-3">
        {nextCursor && (
          <div className="mb-3 text-center">
            <button
              onClick={loadEarlier}
              className="rounded-md border border-line bg-surface px-3 py-1 text-xs text-soft hover:text-ink"
            >
              Load earlier messages
            </button>
          </div>
        )}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showDate =
            !prev ||
            new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          // Group consecutive messages from the same sender within 5 minutes:
          // show the name/timestamp only once per group.
          const grouped =
            !showDate &&
            !!prev &&
            prev.contentType !== 'SYSTEM' &&
            m.contentType !== 'SYSTEM' &&
            prev.sender?.id === m.sender?.id &&
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          return (
            <div key={m.id}>
              {showDate && (
                <div className="my-3 text-center">
                  <span className="stamp">{new Date(m.createdAt).toDateString()}</span>
                </div>
              )}
              <MessageRow
                message={m}
                grouped={grouped}
                showAvatar
                mine={m.sender?.id === me.id}
                meId={me.id}
                canPin={canPin}
                isAnnouncement={isAnnouncement}
                isSaved={savedIds.has(m.id)}
                memberUsernames={memberUsernames}
                actions={actions}
              />
            </div>
          );
        })}

        {typerNames.length > 0 && (
          <p className="mt-2 text-xs text-faint">
            {typerNames.join(', ')} {typerNames.length === 1 ? 'is' : 'are'} typing…
          </p>
        )}
        <div ref={bottomRef} />
        </div>
      </div>

      <footer className="relative border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-[820px] p-3">
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate text-xs text-soft">
              Replying to <span className="font-medium">{replyTo.sender?.displayName}</span>:{' '}
              {replyTo.content.slice(0, 80)}
            </span>
            <button onClick={() => setReplyTo(null)} aria-label="Cancel reply">
              ✕
            </button>
          </div>
        )}

        {pending.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pending.map((u) => (
              <span
                key={u.key}
                className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                  u.error ? 'border-danger text-danger' : 'border-line'
                }`}
              >
                <span className="max-w-[160px] truncate">{u.name}</span>
                <span className="text-faint">
                  {u.error ? u.error : u.info ? formatBytes(u.size) : `${u.percent}%`}
                </span>
                {!u.info && !u.error && (
                  <span className="h-1 w-16 overflow-hidden rounded bg-raised">
                    <span
                      className="block h-full bg-accent transition-all"
                      style={{ width: `${u.percent}%` }}
                    />
                  </span>
                )}
                <button onClick={() => removePending(u.key)} aria-label="Remove file">
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-3 z-20 mb-1 w-64 rounded-md border border-line bg-surface shadow">
            {mentionMatches.map((m) => (
              <button
                key={m.userId}
                onClick={() => insertMention(usernameOf(m))}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-raised"
              >
                <span className="font-medium">{m.displayName}</span>
                <span className="text-xs text-faint">@{usernameOf(m)}</span>
              </button>
            ))}
          </div>
        )}

        {canPost ? (
          <>
          {recording && (
            <div className="mb-2">
              <VoiceRecorderBar
                onCancel={() => setRecording(false)}
                onSend={(file) => {
                  setRecording(false);
                  addFiles([file]);
                }}
              />
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={photoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) uploadConversationPhoto(e.target.files[0]);
                e.target.value = '';
              }}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="relative">
              <button
                onClick={() => setShowPlusMenu((v) => !v)}
                aria-label="Add attachment or action"
                title="Add"
                className="rounded-md border border-line px-3 py-2 text-sm text-soft hover:text-ink"
              >
                +
              </button>
              {showPlusMenu && (
                <div className="absolute bottom-full left-0 z-30 mb-2 w-56 rounded-md border border-line bg-surface py-1 shadow-lg">
                  <PlusItem
                    label="Upload file"
                    icon="📎"
                    onClick={() => {
                      setShowPlusMenu(false);
                      fileInputRef.current?.click();
                    }}
                  />
                  <PlusItem
                    label="Take photo"
                    icon="📷"
                    onClick={() => {
                      setShowPlusMenu(false);
                      if (cameraAvailable()) setShowCamera(true);
                      else cameraInputRef.current?.click();
                    }}
                  />
                  <PlusItem
                    label="Record video"
                    icon="🎥"
                    onClick={() => {
                      setShowPlusMenu(false);
                      videoInputRef.current?.click();
                    }}
                  />
                  <div className="my-1 border-t border-line" />
                  <PlusItem
                    label="Create task"
                    icon="🗂️"
                    onClick={() => {
                      setShowPlusMenu(false);
                      setTaskModal({ open: true });
                    }}
                  />
                  <PlusItem
                    label="Raise incident"
                    icon="🚨"
                    onClick={() => {
                      setShowPlusMenu(false);
                      setIncidentModal(true);
                    }}
                  />
                  <PlusItem
                    label="Create poll"
                    icon="📊"
                    onClick={() => {
                      setShowPlusMenu(false);
                      setPollQuestion('');
                      setPollOptions(['', '']);
                      setPollMulti(false);
                      setPollModal(true);
                    }}
                  />
                  <PlusItem label="Request approval" icon="✅" soon />
                  <PlusItem
                    label="Attach ERP record"
                    icon="🧾"
                    onClick={() => {
                      setShowPlusMenu(false);
                      setErpModal(true);
                    }}
                  />
                  <PlusItem label="Share location" icon="📍" soon />
                </div>
              )}
            </div>
            <div className="relative min-w-0 flex-1">
              <textarea
                ref={textRef}
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder={`Message ${conversation.title}`}
                className="max-h-32 min-h-[38px] w-full resize-y rounded-md border border-line bg-canvas py-2 pl-3 pr-24 text-sm md:pr-20"
              />
              {/* Quiet tools INSIDE the box — visible, out of the way */}
              <div className="absolute bottom-[7px] right-1.5 flex items-center">
                <button
                  onClick={() => {
                    if (cameraAvailable()) setShowCamera(true);
                    else cameraInputRef.current?.click();
                  }}
                  aria-label="Take photo"
                  title="Take photo"
                  className="rounded p-1 text-soft hover:bg-raised hover:text-ink md:hidden"
                >
                  <CameraGlyph />
                </button>
                {dictationAvailable() && (
                  <button
                    onClick={dictation.toggle}
                    onDoubleClick={dictation.switchLang}
                    aria-label={dictation.listening ? 'Stop dictation' : 'Dictate message'}
                    title={`${dictation.listening ? 'Stop dictation' : 'Dictate (speech to text)'} — ${
                      dictation.lang === 'fil-PH' ? 'Filipino' : 'English'
                    }. Double-tap to switch language.`}
                    className={`rounded p-1 hover:bg-raised ${
                      dictation.listening ? 'text-danger' : 'text-soft hover:text-ink'
                    }`}
                  >
                    <DictationGlyph active={dictation.listening} />
                  </button>
                )}
                <button
                  onClick={() => setShowEmoji((v) => !v)}
                  aria-label="Insert emoji"
                  title="Insert emoji"
                  className="rounded p-1 text-soft hover:bg-raised hover:text-ink"
                >
                  <SmileGlyph />
                </button>
              </div>
              {showEmoji && (
                <EmojiPicker
                  align="right"
                  onClose={() => setShowEmoji(false)}
                  onPick={(emoji) => {
                    const el = textRef.current;
                    const caret = el?.selectionStart ?? draft.length;
                    setDraft(draft.slice(0, caret) + emoji + draft.slice(caret));
                    el?.focus();
                  }}
                />
              )}
            </div>
            {/* One primary action: Send when there's something to send, mic otherwise */}
            {draft.trim() || pending.length > 0 || !voiceRecordingAvailable() ? (
              <button
                onClick={send}
                disabled={
                  (!draft.trim() && !pending.some((u) => u.info)) ||
                  pending.some((u) => !u.info && !u.error)
                }
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
              >
                Send
              </button>
            ) : recording ? null : (
              <button
                onClick={() => setRecording(true)}
                aria-label="Record voice note"
                title="Record voice note"
                className="rounded-md bg-accent px-3.5 py-2 text-accent-ink"
              >
                <MicGlyph />
              </button>
            )}
          </div>
          </>
        ) : (
          <p className="py-1 text-center text-xs text-faint">
            Only admins can post in this channel. You can read, react, and acknowledge.
          </p>
        )}
        </div>
      </footer>

      {showShared && (
        <SharedFilesPanel conversationId={conversation.id} onClose={() => setShowShared(false)} />
      )}

      {showPins && pinned && (
        <ListModal title="Pinned messages" onClose={() => setShowPins(false)}>
          {pinned.map((m) => (
            <div key={m.id} className="border-b border-line/60 px-4 py-3">
              <p className="text-xs text-faint">
                {m.sender?.displayName} · {new Date(m.createdAt).toLocaleString()}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">
                {m.content || m.attachments?.[0]?.originalName || 'Attachment'}
              </p>
            </div>
          ))}
        </ListModal>
      )}

      {acksFor && <AcksModal message={acksFor} onClose={() => setAcksFor(null)} />}

      {taskModal && (
        <CreateTaskModal
          conversationId={conversation.id}
          sourceMessage={taskModal.sourceMessage}
          onClose={() => setTaskModal(null)}
          onCreated={(taskId) => setOpenTaskId(taskId)}
        />
      )}

      {openTaskId && (
        <TaskDrawer taskId={openTaskId} me={me} onClose={() => setOpenTaskId(null)} />
      )}

      {pollModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPollModal(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-lg border border-line bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold">📊 Create poll</h2>
              <button onClick={() => setPollModal(false)} aria-label="Close" className="text-soft hover:text-ink">✕</button>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <label className="block">
                <span className="text-xs font-medium text-soft">Question</span>
                <input
                  autoFocus
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="e.g. Which branch can absorb 5 units of IP15-128?"
                  className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
                />
              </label>
              <div>
                <span className="text-xs font-medium text-soft">Options</span>
                <div className="mt-1 space-y-1.5">
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        value={opt}
                        onChange={(e) =>
                          setPollOptions((os) => os.map((o, j) => (j === i ? e.target.value : o)))
                        }
                        placeholder={`Option ${i + 1}`}
                        className="w-full rounded-md border border-line bg-canvas px-3 py-1.5 text-sm"
                      />
                      {pollOptions.length > 2 && (
                        <button
                          onClick={() => setPollOptions((os) => os.filter((_, j) => j !== i))}
                          aria-label="Remove option"
                          className="text-faint hover:text-danger"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {pollOptions.length < 10 && (
                  <button
                    onClick={() => setPollOptions((os) => [...os, ''])}
                    className="mt-1.5 text-xs text-accent underline"
                  >
                    + Add option
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pollMulti}
                  onChange={(e) => setPollMulti(e.target.checked)}
                  className="h-4 w-4 accent-[#E86F1E]"
                />
                Allow choosing multiple options
              </label>
            </div>
            <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">
              <button onClick={() => setPollModal(false)} className="rounded-md border border-line px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button
                disabled={
                  pollBusy ||
                  pollQuestion.trim().length < 3 ||
                  pollOptions.filter((o) => o.trim()).length < 2
                }
                onClick={async () => {
                  setPollBusy(true);
                  try {
                    await api.post(`/conversations/${conversation.id}/polls`, {
                      question: pollQuestion.trim(),
                      options: pollOptions.map((o) => o.trim()).filter(Boolean),
                      multi: pollMulti,
                    });
                    queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
                    setPollModal(false);
                  } finally {
                    setPollBusy(false);
                  }
                }}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50"
              >
                {pollBusy ? 'Creating…' : 'Create poll'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {erpModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setErpModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-line bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold">Attach ERP record</h2>
              <button onClick={() => setErpModal(false)} aria-label="Close" className="text-soft hover:text-ink">✕</button>
            </header>
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-soft">Type</span>
                  <select
                    value={erpKind}
                    onChange={(e) => setErpKind(e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-2 text-sm"
                  >
                    <option value="TRANSFER">Stock Transfer</option>
                    <option value="GRN">Goods Receipt (GRN)</option>
                    <option value="INVOICE">Invoice</option>
                    <option value="RMA">RMA</option>
                    <option value="PO">Purchase Order</option>
                    <option value="SO">Sales Order</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-soft">Reference no.</span>
                  <input
                    autoFocus
                    value={erpRef}
                    onChange={(e) => setErpRef(e.target.value)}
                    placeholder="TR-2026-00844"
                    className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-sm"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-soft">Note (optional)</span>
                <input
                  value={erpNote}
                  onChange={(e) => setErpNote(e.target.value)}
                  placeholder="e.g. the transfer with the variance"
                  className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
                />
              </label>
            </div>
            <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">
              <button onClick={() => setErpModal(false)} className="rounded-md border border-line px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button
                disabled={erpBusy || erpRef.trim().length < 2}
                onClick={async () => {
                  setErpBusy(true);
                  try {
                    await api.post(`/conversations/${conversation.id}/messages`, {
                      content: `${erpKind} ${erpRef.trim()}`,
                      erp: { kind: erpKind, ref: erpRef.trim(), note: erpNote.trim() || undefined },
                    });
                    queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
                    setErpModal(false);
                    setErpRef('');
                    setErpNote('');
                  } finally {
                    setErpBusy(false);
                  }
                }}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50"
              >
                {erpBusy ? 'Attaching…' : 'Attach'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {incidentModal && (
        <RaiseIncidentModal
          conversationId={conversation.id}
          onClose={() => setIncidentModal(false)}
          onCreated={(id) => setOpenIncidentId(id)}
        />
      )}

      {openIncidentId && (
        <IncidentDrawer incidentId={openIncidentId} me={me} onClose={() => setOpenIncidentId(null)} />
      )}

      {showCamera && (
        <StampedCamera
          me={me}
          onClose={() => setShowCamera(false)}
          onCapture={(file, meta) => {
            setShowCamera(false);
            setCaptureMeta(meta);
            addFiles([file]);
          }}
        />
      )}
    </section>
    {showDrawer && (
      <ContextDrawer
        conversation={conversation}
        onClose={() => setShowDrawer(false)}
        onOpenTask={(id) => setOpenTaskId(id)}
        me={me}
      />
    )}
    </div>
  );
}

function HeaderIcon({
  label,
  onClick,
  active,
  className = '',
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-md border border-line ${
        active ? 'text-accent' : 'text-soft hover:text-ink'
      } ${className}`}
    >
      {children}
    </button>
  );
}

const hg = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
function FilesGlyph() {
  return (
    <svg {...hg} aria-hidden>
      <path d="M4 5h5l2 2h9v11a1 1 0 01-1 1H4a1 1 0 01-1-1V5z" />
    </svg>
  );
}
function PinHeaderGlyph() {
  return (
    <svg {...hg} aria-hidden>
      <path d="M12 17v5M7 4h10l-1 6 3 3H5l3-3-1-6z" />
    </svg>
  );
}
function BellGlyph({ muted }: { muted: boolean }) {
  return (
    <svg {...hg} aria-hidden>
      <path d="M6 8a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 20a2 2 0 004 0" />
      {muted && <path d="M3 3l18 18" />}
    </svg>
  );
}
function PanelGlyph() {
  return (
    <svg {...hg} aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </svg>
  );
}
function SmileGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 10h.01M15 10h.01" />
    </svg>
  );
}

function MicGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function DictationGlyph({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" opacity={active ? 1 : 0.85} />
    </svg>
  );
}

function CameraGlyph() {
  return (
    <svg {...hg} aria-hidden>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

function PlusItem({
  label,
  icon,
  onClick,
  soon,
}: {
  label: string;
  icon: string;
  onClick?: () => void;
  soon?: boolean;
}) {
  return (
    <button
      onClick={soon ? undefined : onClick}
      disabled={soon}
      title={soon ? `${label} — coming in an upcoming update` : label}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
        soon ? 'cursor-not-allowed text-faint' : 'hover:bg-raised'
      }`}
    >
      <span aria-hidden>{icon}</span>
      <span className="flex-1">{label}</span>
      {soon && <span className="text-[10px] uppercase tracking-wide text-faint">soon</span>}
    </button>
  );
}

function usernameOf(m: ConversationMemberInfo) {
  return m.username.toLowerCase();
}

function ListModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-soft hover:text-ink">
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function AcksModal({ message, onClose }: { message: ChatMessage; onClose: () => void }) {
  const { data } = useQuery<{ userId: string; displayName: string; readAt: string }[]>({
    queryKey: ['acks', message.id],
    queryFn: () => api.get(`/messages/${message.id}/acks`),
  });
  return (
    <ListModal title={`Seen by ${data?.length ?? '…'}`} onClose={onClose}>
      {data?.map((a) => (
        <div
          key={a.userId}
          className="flex items-center justify-between border-b border-line/60 px-4 py-2.5"
        >
          <span className="text-sm">{a.displayName}</span>
          <span className="text-xs text-faint">{new Date(a.readAt).toLocaleString()}</span>
        </div>
      ))}
      {data && data.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-faint">No acknowledgements yet.</p>
      )}
    </ListModal>
  );
}
