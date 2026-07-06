export interface Me {
  id: string;
  email: string;
  username: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'READ_ONLY';
  branch?: { id: string; name: string; code: string } | null;
  department?: { id: string; name: string; code: string } | null;
  profile?: { displayName: string; title?: string | null; presence: string; avatarKey?: string | null } | null;
}

export interface ConversationSummary {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  priority?: 'P1' | 'P2' | 'P3' | null;
  branchCode?: string | null;
  departmentCode?: string | null;
  pinnedAt?: string | null;
  hasUnreadMention?: boolean;
  memberCount: number;
  myRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'READ_ONLY';
  mutedUntil: string | null;
  unreadCount: number;
  otherUser: { id: string; displayName: string; presence: string; avatarKey?: string | null } | null;
  lastMessage: { content: string; senderName: string; createdAt: string } | null;
  updatedAt: string;
}

export interface MessageReaction {
  emoji: string;
  userId: string;
  displayName: string;
}

export interface MessageAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  content: string;
  contentType: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  replyTo?: { id: string; content: string; senderName: string } | null;
  sender: { id: string; displayName: string; avatarKey?: string | null } | null;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  isPinned?: boolean;
  ackCount?: number;
  ackedBy?: string[];
  // client-only flags for optimistic sending
  pending?: boolean;
  failed?: boolean;
}

export interface ConversationMemberInfo {
  userId: string;
  username: string;
  displayName: string;
  presence: string;
  avatarKey?: string | null;
  role: string;
  lastReadAt: string | null;
}

export interface DirectoryUser {
  id: string;
  email: string;
  username: string;
  role: string;
  status: string;
  lastActiveAt?: string | null;
  branch?: { id: string; name: string; code: string } | null;
  department?: { id: string; name: string; code: string } | null;
  profile?: { displayName: string; title?: string | null; presence: string; avatarKey?: string | null } | null;
}

export const CONVERSATION_TYPE_LABEL: Record<string, string> = {
  DIRECT: 'DM',
  PRIVATE_GROUP: 'GROUP',
  DEPARTMENT: 'DEPT',
  BRANCH: 'BRANCH',
  ANNOUNCEMENT: 'ANNC',
  PROJECT: 'PROJ',
  INCIDENT: 'INCIDENT',
};
