import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Message from '@/models/Message';
import Conversation from '@/models/Conversation';
import User from '@/models/User';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { sendPushToUser } from '@/lib/push-notifications';
import { MESSAGE_MAX_LENGTH, type ChatMessage } from '@/lib/messaging';
import { findMemberConversation } from '../../../_lib/conversations';

const PAGE_LIMIT = 30;

const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message is empty').max(MESSAGE_MAX_LENGTH),
});

function toChatMessage(m: any): ChatMessage {
  return {
    id: String(m._id),
    senderId: String(m.sender),
    body: m.body,
    createdAt: new Date(m.createdAt).toISOString(),
  };
}

function parseDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Messages in a conversation, oldest first.
 * - `after` (ISO date): messages at or after that time, for polling. Callers dedupe by id.
 * - `before` (ISO date): the page of older messages before that time.
 * - neither: the latest page.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Conversation');
    if (!(await findMemberConversation(tenantObjectId, session.userId, id))) return notFound('Conversation');

    const sp = request.nextUrl.searchParams;
    const after = parseDate(sp.get('after'));
    const before = parseDate(sp.get('before'));
    const filter: Record<string, unknown> = { tenantId: tenantObjectId, conversation: new Types.ObjectId(id) };

    if (after) {
      filter.createdAt = { $gte: after };
      const rows = await Message.find(filter).sort({ createdAt: 1, _id: 1 }).limit(200).lean();
      return NextResponse.json({ success: true, data: { messages: rows.map(toChatMessage), hasMore: false } });
    }

    if (before) filter.createdAt = { $lt: before };
    const rows = await Message.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(PAGE_LIMIT + 1)
      .lean();
    const hasMore = rows.length > PAGE_LIMIT;
    const messages = rows.slice(0, PAGE_LIMIT).reverse().map(toChatMessage);
    return NextResponse.json({ success: true, data: { messages, hasMore } });
  } catch (error: any) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Conversation');

    const conversation = await findMemberConversation(tenantObjectId, session.userId, id);
    if (!conversation) return notFound('Conversation');

    const parsed = await parseBody(request, sendMessageSchema);
    if (isValidationError(parsed)) return parsed;

    const me = new Types.ObjectId(session.userId);
    const message = await Message.create({
      tenantId: tenantObjectId,
      conversation: conversation._id,
      sender: me,
      body: parsed.data.body,
    });

    await Conversation.updateOne(
      { _id: conversation._id, tenantId: tenantObjectId },
      {
        $set: {
          lastMessage: { body: message.body.slice(0, 280), sender: me, createdAt: message.createdAt },
          lastMessageAt: message.createdAt,
          'members.$[self].unread': 0,
          'members.$[self].lastReadAt': message.createdAt,
        },
        $inc: { 'members.$[other].unread': 1 },
      },
      { arrayFilters: [{ 'self.user': me }, { 'other.user': { $ne: me } }] }
    );

    // Best-effort push to the recipient; never fail the send over it.
    const recipient = conversation.members.find((m: any) => String(m.user) !== session.userId);
    if (recipient) {
      User.findById(session.userId)
        .select('name')
        .lean()
        .then((sender: any) =>
          sendPushToUser(
            String(recipient.user),
            {
              title: sender?.name || 'New message',
              body: message.body.length > 120 ? `${message.body.slice(0, 117)}...` : message.body,
              url: `/messages?c=${id}`,
              tag: `message-${id}`,
            },
            tenantId
          )
        )
        .catch((err) => console.error('Error sending message push:', err));
    }

    return NextResponse.json({ success: true, data: toChatMessage(message) }, { status: 201 });
  } catch (error: any) {
    console.error('Error sending message:', error);
    return NextResponse.json({ success: false, error: 'Failed to send message' }, { status: 500 });
  }
}
