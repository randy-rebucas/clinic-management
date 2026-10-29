import 'server-only';
import { Types } from 'mongoose';
import User from '@/models/User';
import '@/models/Role';
import Conversation, { type IConversation } from '@/models/Conversation';
import { SUPPORT_CONTACT, SUPPORT_ID, type ChatMessage, type ChatUser, type ConversationSummary } from '@/lib/messaging';

export function toChatMessage(m: any): ChatMessage {
  const deleted = Boolean(m.deletedAt);
  return {
    id: String(m._id),
    senderId: m.fromSupport ? SUPPORT_ID : String(m.sender),
    body: deleted ? '' : m.body,
    createdAt: new Date(m.createdAt).toISOString(),
    updatedAt: new Date(m.updatedAt ?? m.createdAt).toISOString(),
    editedAt: m.editedAt && !deleted ? new Date(m.editedAt).toISOString() : null,
    deleted,
  };
}

/** Messages in a conversation the caller can see: not deleted for them, not before they cleared it. */
export function visibleMessagesFilter(conversation: Pick<IConversation, 'members' | 'tenantId'> & { _id: unknown }, userId: string) {
  const me = new Types.ObjectId(userId);
  const clearedAt = conversation.members.find((m) => String(m.user) === userId)?.clearedAt;
  return {
    tenantId: conversation.tenantId,
    conversation: conversation._id,
    hiddenFor: { $ne: me },
    ...(clearedAt ? { createdAt: { $gt: clearedAt } } : {}),
  } as Record<string, any>;
}

/** Fetch a conversation only when the caller is one of its members. */
export async function findMemberConversation(
  tenantObjectId: Types.ObjectId,
  userId: string,
  conversationId: string
) {
  return Conversation.findOne({
    _id: conversationId,
    tenantId: tenantObjectId,
    'members.user': new Types.ObjectId(userId),
  });
}

async function loadChatUsers(tenantObjectId: Types.ObjectId, ids: string[]) {
  const users = (await User.find({ _id: { $in: ids }, tenantId: tenantObjectId })
    .select('name role')
    .populate('role', 'name displayName')
    .lean()) as any[];
  const byId = new Map<string, ChatUser>();
  for (const u of users) {
    byId.set(String(u._id), {
      id: String(u._id),
      name: u.name,
      role: u.role?.displayName || u.role?.name || '',
    });
  }
  return byId;
}

/** Shape conversations for the caller: the other member's profile, last message, own unread count. */
export async function serializeConversations(
  tenantObjectId: Types.ObjectId,
  meId: string,
  conversations: Array<Pick<IConversation, 'members' | 'lastMessage' | 'lastMessageAt' | 'kind'> & { _id: unknown }>
): Promise<ConversationSummary[]> {
  const otherIds = new Set<string>();
  for (const c of conversations) {
    if (c.kind === 'support') continue;
    const other = c.members.find((m) => String(m.user) !== meId);
    if (other) otherIds.add(String(other.user));
  }
  const users = await loadChatUsers(tenantObjectId, [...otherIds]);

  return conversations.map((c) => {
    const me = c.members.find((m) => String(m.user) === meId);
    const otherId = String(c.members.find((m) => String(m.user) !== meId)?.user ?? '');
    // Nothing sent since the caller deleted the conversation: it reads as empty to them
    const cleared = Boolean(me?.clearedAt && c.lastMessageAt && c.lastMessageAt <= me.clearedAt);
    return {
      id: String(c._id),
      other: c.kind === 'support' ? SUPPORT_CONTACT : users.get(otherId) ?? { id: otherId, name: 'Former staff member', role: '' },
      lastMessage: c.lastMessage?.body && !cleared
        ? {
            body: c.lastMessage.body,
            senderId: c.lastMessage.sender ? String(c.lastMessage.sender) : SUPPORT_ID,
            createdAt: new Date(c.lastMessage.createdAt).toISOString(),
          }
        : null,
      lastMessageAt: c.lastMessageAt && !cleared ? new Date(c.lastMessageAt).toISOString() : null,
      unread: me?.unread ?? 0,
    };
  });
}
