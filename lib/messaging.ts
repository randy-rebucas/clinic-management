// Shared (client + server) types and events for in-app staff messaging.

export interface ChatUser {
  id: string;
  name: string;
  role: string;
}

export interface ConversationSummary {
  id: string;
  other: ChatUser;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  lastMessageAt: string | null;
  unread: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  /** Empty when the message was deleted for everyone. */
  body: string;
  createdAt: string;
  /** Changes on edit and delete; clients poll on it to pick those up. */
  updatedAt: string;
  editedAt: string | null;
  deleted: boolean;
}

export const MESSAGE_MAX_LENGTH = 4000;
/** How long after sending a message its sender may still edit it. */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
/** Conversation-list preview for a message deleted for everyone. */
export const DELETED_MESSAGE_PREVIEW = 'Message deleted';

export function canEditMessage(message: Pick<ChatMessage, 'createdAt' | 'deleted'>, now = Date.now()) {
  return !message.deleted && now - new Date(message.createdAt).getTime() < MESSAGE_EDIT_WINDOW_MS;
}

export function chatInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}
