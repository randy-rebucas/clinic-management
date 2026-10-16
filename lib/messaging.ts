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
  body: string;
  createdAt: string;
}

export const MESSAGE_MAX_LENGTH = 4000;

export function chatInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}
