import 'server-only';
import { Types } from 'mongoose';
import User from '@/models/User';
import '@/models/Role';
import Conversation, { type IConversation } from '@/models/Conversation';
import type { ChatUser, ConversationSummary } from '@/lib/messaging';

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
  conversations: Array<Pick<IConversation, 'members' | 'lastMessage' | 'lastMessageAt'> & { _id: unknown }>
): Promise<ConversationSummary[]> {
  const otherIds = new Set<string>();
  for (const c of conversations) {
    const other = c.members.find((m) => String(m.user) !== meId);
    if (other) otherIds.add(String(other.user));
  }
  const users = await loadChatUsers(tenantObjectId, [...otherIds]);

  return conversations.map((c) => {
    const me = c.members.find((m) => String(m.user) === meId);
    const otherId = String(c.members.find((m) => String(m.user) !== meId)?.user ?? '');
    return {
      id: String(c._id),
      other: users.get(otherId) ?? { id: otherId, name: 'Former staff member', role: '' },
      lastMessage: c.lastMessage?.body
        ? {
            body: c.lastMessage.body,
            senderId: String(c.lastMessage.sender),
            createdAt: new Date(c.lastMessage.createdAt).toISOString(),
          }
        : null,
      lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt).toISOString() : null,
      unread: me?.unread ?? 0,
    };
  });
}
