import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Conversation from '@/models/Conversation';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { findMemberConversation, serializeConversations } from '../../_lib/conversations';

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

    const conversation = await findMemberConversation(tenantObjectId, session.userId, id);
    if (!conversation) return notFound('Conversation');

    const [summary] = await serializeConversations(tenantObjectId, session.userId, [conversation.toObject()]);
    return NextResponse.json({ success: true, data: summary });
  } catch (error: any) {
    console.error('Error fetching conversation:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch conversation' }, { status: 500 });
  }
}

/**
 * Delete the conversation for the caller: clears its history from their view and drops it from
 * their list. The other member keeps theirs, and a new message brings it back (empty) for both.
 */
export async function DELETE(
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

    const now = new Date();
    const result = await Conversation.updateOne(
      { _id: id, tenantId: tenantObjectId, 'members.user': new Types.ObjectId(session.userId) },
      {
        $set: {
          'members.$.clearedAt': now,
          'members.$.hidden': true,
          'members.$.unread': 0,
          'members.$.lastReadAt': now,
        },
      }
    );
    if (result.matchedCount === 0) return notFound('Conversation');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting conversation:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete conversation' }, { status: 500 });
  }
}
