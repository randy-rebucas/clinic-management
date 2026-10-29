'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DELETED_MESSAGE_PREVIEW, type ChatMessage, type ConversationSummary } from '@/lib/messaging';
import { startVisiblePoll } from '@/lib/visible-poll';

// The conversation list refreshes every 30 s while the tab is in use, every 5 min once idle.
const POLL_MS = 30_000;
const IDLE_POLL_MS = 300_000;
// How many chat windows the floating dock keeps open side by side
const MAX_OPEN_CHATS = 2;

interface OpenChat {
  id: string;
  minimized: boolean;
}

interface MessagingContextValue {
  /** False until the user is known, or when the account has no clinic (messaging unavailable). */
  enabled: boolean;
  meId: string | null;
  conversations: ConversationSummary[];
  totalUnread: number;
  loaded: boolean;
  refresh: () => Promise<void>;
  /** Find or create the conversation with a staff member. */
  startConversation: (userId: string) => Promise<ConversationSummary | null>;
  markRead: (conversationId: string) => void;
  /** Record a message the user just sent, so the list reorders without waiting for the next poll. */
  noteSent: (conversationId: string, message: ChatMessage) => void;
  /** Record an edit or delete, so the list preview follows if it was the last message. */
  noteChanged: (conversationId: string, message: ChatMessage) => void;
  /** Flag the conversation unread. It stays unread until the thread is opened again. */
  markUnread: (conversationId: string) => void;
  /** Allow an open thread to mark itself read again after markUnread. */
  releaseUnread: (conversationId: string) => void;
  /** Delete the conversation for the current user. Resolves false if the server refused. */
  deleteConversation: (conversationId: string) => Promise<boolean>;
  /** Make sure a conversation is in the list (e.g. one opened by URL or started fresh). */
  upsertConversation: (conversation: ConversationSummary) => void;
  // Floating dock windows
  openChats: OpenChat[];
  openChat: (conversationId: string) => void;
  closeChat: (conversationId: string) => void;
  toggleMinimized: (conversationId: string) => void;
}

const MessagingContext = createContext<MessagingContextValue | null>(null);

type ConversationsResult = { conversations: ConversationSummary[]; totalUnread: number } | 'unavailable' | null;

async function fetchConversations(): Promise<ConversationsResult> {
  try {
    const res = await fetch('/api/messages/conversations');
    if (res.status === 401 || res.status === 403) return 'unavailable';
    const data = await res.json();
    if (!data.success) return null;
    return { conversations: data.data.conversations, totalUnread: data.data.totalUnread || 0 };
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return null;
  }
}

export function useMessaging() {
  const ctx = useContext(MessagingContext);
  if (!ctx) throw new Error('useMessaging must be used within MessagingProvider');
  return ctx;
}

export default function MessagingProvider({ meId, children }: { meId: string | null; children: ReactNode }) {
  const [available, setAvailable] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [openChats, setOpenChats] = useState<OpenChat[]>([]);
  // Conversations started locally that have no messages yet, so the server list omits them
  const pendingRef = useRef<Map<string, ConversationSummary>>(new Map());
  // Conversations the user marked unread; an open thread must not clear them until reopened
  const heldUnreadRef = useRef<Set<string>>(new Set());
  // Conversations deleted this session; keeps a stale ?c= link from re-adding them
  const deletedRef = useRef<Set<string>>(new Set());
  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const enabled = Boolean(meId) && available;

  const applyResult = useCallback((result: ConversationsResult) => {
    if (result === 'unavailable') {
      setAvailable(false);
      return;
    }
    if (!result) return;
    for (const c of result.conversations) {
      pendingRef.current.delete(c.id);
      // Back on the server list: someone messaged after it was deleted
      deletedRef.current.delete(c.id);
    }
    setConversations([...pendingRef.current.values(), ...result.conversations]);
    setTotalUnread(result.totalUnread);
    setLoaded(true);
  }, []);

  const refresh = useCallback(() => fetchConversations().then(applyResult), [applyResult]);

  useEffect(() => {
    if (!meId || !available) return;
    refresh();
    return startVisiblePoll(refresh, { activeMs: POLL_MS, idleMs: IDLE_POLL_MS });
  }, [meId, available, refresh]);

  const upsertConversation = useCallback((conversation: ConversationSummary) => {
    if (deletedRef.current.has(conversation.id)) return;
    setConversations((prev) => {
      if (prev.some((c) => c.id === conversation.id)) return prev;
      if (!conversation.lastMessageAt) pendingRef.current.set(conversation.id, conversation);
      return [conversation, ...prev];
    });
  }, []);

  const startConversation = useCallback(
    async (userId: string) => {
      try {
        const res = await fetch('/api/messages/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        const data = await res.json();
        if (!data.success) return null;
        deletedRef.current.delete(data.data.id);
        upsertConversation(data.data);
        return data.data as ConversationSummary;
      } catch (error) {
        console.error('Error starting conversation:', error);
        return null;
      }
    },
    [upsertConversation]
  );

  const markRead = useCallback((conversationId: string) => {
    if (heldUnreadRef.current.has(conversationId)) return;
    const cleared = conversationsRef.current.find((c) => c.id === conversationId)?.unread ?? 0;
    if (cleared > 0) {
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)));
      setTotalUnread((n) => Math.max(0, n - cleared));
    }
    fetch(`/api/messages/conversations/${conversationId}/read`, { method: 'POST' }).catch((error) =>
      console.error('Error marking conversation read:', error)
    );
  }, []);

  const noteSent = useCallback((conversationId: string, message: ChatMessage) => {
    pendingRef.current.delete(conversationId);
    setConversations((prev) => {
      const current = prev.find((c) => c.id === conversationId);
      if (!current) return prev;
      const updated: ConversationSummary = {
        ...current,
        lastMessage: { body: message.body, senderId: message.senderId, createdAt: message.createdAt },
        lastMessageAt: message.createdAt,
      };
      return [updated, ...prev.filter((c) => c.id !== conversationId)];
    });
  }, []);

  const noteChanged = useCallback((conversationId: string, message: ChatMessage) => {
    setConversations((prev) =>
      prev.map((c) => {
        const last = c.lastMessage;
        if (c.id !== conversationId || !last) return c;
        if (last.senderId !== message.senderId || new Date(last.createdAt).getTime() !== new Date(message.createdAt).getTime()) return c;
        return { ...c, lastMessage: { ...last, body: message.deleted ? DELETED_MESSAGE_PREVIEW : message.body } };
      })
    );
  }, []);

  const markUnread = useCallback((conversationId: string) => {
    heldUnreadRef.current.add(conversationId);
    const current = conversationsRef.current.find((c) => c.id === conversationId);
    if (current && current.unread === 0) {
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, unread: 1 } : c)));
      setTotalUnread((n) => n + 1);
    }
    fetch(`/api/messages/conversations/${conversationId}/read`, { method: 'DELETE' }).catch((error) =>
      console.error('Error marking conversation unread:', error)
    );
  }, []);

  const releaseUnread = useCallback((conversationId: string) => {
    heldUnreadRef.current.delete(conversationId);
  }, []);

  const closeChat = useCallback((conversationId: string) => {
    setOpenChats((prev) => prev.filter((c) => c.id !== conversationId));
  }, []);

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        const res = await fetch(`/api/messages/conversations/${conversationId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) return false;
      } catch (error) {
        console.error('Error deleting conversation:', error);
        return false;
      }
      const removed = conversationsRef.current.find((c) => c.id === conversationId);
      pendingRef.current.delete(conversationId);
      heldUnreadRef.current.delete(conversationId);
      deletedRef.current.add(conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (removed?.unread) setTotalUnread((n) => Math.max(0, n - removed.unread));
      closeChat(conversationId);
      return true;
    },
    [closeChat]
  );

  const openChat = useCallback((conversationId: string) => {
    setOpenChats((prev) => {
      const rest = prev.filter((c) => c.id !== conversationId);
      return [{ id: conversationId, minimized: false }, ...rest].slice(0, MAX_OPEN_CHATS);
    });
  }, []);

  const toggleMinimized = useCallback((conversationId: string) => {
    setOpenChats((prev) => prev.map((c) => (c.id === conversationId ? { ...c, minimized: !c.minimized } : c)));
  }, []);

  const value = useMemo<MessagingContextValue>(
    () => ({
      enabled,
      meId,
      conversations,
      totalUnread,
      loaded,
      refresh,
      startConversation,
      markRead,
      noteSent,
      noteChanged,
      markUnread,
      releaseUnread,
      deleteConversation,
      upsertConversation,
      openChats,
      openChat,
      closeChat,
      toggleMinimized,
    }),
    [enabled, meId, conversations, totalUnread, loaded, refresh, startConversation, markRead, noteSent, noteChanged, markUnread, releaseUnread, deleteConversation, upsertConversation, openChats, openChat, closeChat, toggleMinimized]
  );

  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>;
}
