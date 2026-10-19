import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Message from '@/models/Message';
import Conversation from '@/models/Conversation';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { DELETED_MESSAGE_PREVIEW, MESSAGE_MAX_LENGTH, canEditMessage } from '@/lib/messaging';
import { findMemberConversation, toChatMessage, visibleMessagesFilter } from '../../../../_lib/conversations';

type Params = { params: Promise<{ id: string; messageId: string }> };

const editMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message is empty').max(MESSAGE_MAX_LENGTH),
});

/** The conversation and one message in it the caller can see, or a 404 response. */
async function loadMessage(params: Params['params']) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  await connectDB();
  const { id, messageId } = await params;
  if (!isValidId(id)) return notFound('Conversation');
  const conversation = await findMemberConversation(tenantObjectId, session.userId, id);
  if (!conversation) return notFound('Conversation');
  if (!isValidId(messageId)) return notFound('Message');

  const message = await Message.findOne({ ...visibleMessagesFilter(conversation, session.userId), _id: messageId });
  if (!message) return notFound('Message');
  return { session, tenantObjectId, conversation, message };
}

/** Keep the conversation-list preview in step when its last message changes. */
function syncLastMessage(conversationId: unknown, tenantObjectId: Types.ObjectId, message: any, body: string) {
  return Conversation.updateOne(
    {
      _id: conversationId,
      tenantId: tenantObjectId,
      'lastMessage.createdAt': message.createdAt,
      'lastMessage.sender': message.sender,
    },
    { $set: { 'lastMessage.body': body.slice(0, 280) } }
  );
}

/** Edit your own message, shortly after sending it. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const loaded = await loadMessage(params);
    if (loaded instanceof NextResponse) return loaded;
    const { session, tenantObjectId, conversation, message } = loaded;

    if (String(message.sender) !== session.userId) {
      return NextResponse.json({ success: false, error: 'You can only edit your own messages' }, { status: 403 });
    }
    if (!canEditMessage({ createdAt: message.createdAt.toISOString(), deleted: Boolean(message.deletedAt) })) {
      return NextResponse.json({ success: false, error: 'This message can no longer be edited' }, { status: 409 });
    }

    const parsed = await parseBody(request, editMessageSchema);
    if (isValidationError(parsed)) return parsed;

    if (parsed.data.body !== message.body) {
      message.body = parsed.data.body;
      message.editedAt = new Date();
      await message.save();
      await syncLastMessage(conversation._id, tenantObjectId, message, message.body);
    }

    return NextResponse.json({ success: true, data: toChatMessage(message) });
  } catch (error: any) {
    console.error('Error editing message:', error);
    return NextResponse.json({ success: false, error: 'Failed to edit message' }, { status: 500 });
  }
}

/**
 * Delete a message.
 * - `?for=everyone`: the sender removes it for both members (shown as "Message deleted").
 * - otherwise: removes it from the caller's view only.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const loaded = await loadMessage(params);
    if (loaded instanceof NextResponse) return loaded;
    const { session, tenantObjectId, conversation, message } = loaded;
    const me = new Types.ObjectId(session.userId);

    if (request.nextUrl.searchParams.get('for') !== 'everyone') {
      await Message.updateOne({ _id: message._id }, { $addToSet: { hiddenFor: me } });
      return NextResponse.json({ success: true, data: null });
    }

    if (String(message.sender) !== session.userId) {
      return NextResponse.json({ success: false, error: 'You can only delete your own messages for everyone' }, { status: 403 });
    }

    if (!message.deletedAt) {
      message.deletedAt = new Date();
      await message.save();
      await syncLastMessage(conversation._id, tenantObjectId, message, DELETED_MESSAGE_PREVIEW);
      // Don't leave the recipient with an unread badge for a message they can no longer see
      await Conversation.updateOne(
        { _id: conversation._id, tenantId: tenantObjectId },
        { $inc: { 'members.$[other].unread': -1 } },
        {
          arrayFilters: [
            {
              'other.user': { $ne: me },
              'other.unread': { $gt: 0 },
              'other.lastReadAt': { $not: { $gte: message.createdAt } },
            },
          ],
        }
      );
    }

    return NextResponse.json({ success: true, data: toChatMessage(message) });
  } catch (error: any) {
    console.error('Error deleting message:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete message' }, { status: 500 });
  }
}
