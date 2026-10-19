import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Conversation, { conversationMemberKey } from '@/models/Conversation';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { serializeConversations } from '../_lib/conversations';

const LIST_LIMIT = 50;

const startConversationSchema = z.object({ userId: zObjectId });

/** The caller's conversations, most recent first, plus their total unread message count. */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  try {
    await connectDB();
    const me = new Types.ObjectId(session.userId);

    const [rows, unreadAgg] = await Promise.all([
      Conversation.find({
        tenantId: tenantObjectId,
        members: { $elemMatch: { user: me, hidden: { $ne: true } } },
        lastMessageAt: { $ne: null },
      })
        .sort({ lastMessageAt: -1 })
        .limit(LIST_LIMIT)
        .lean(),
      Conversation.aggregate([
        { $match: { tenantId: tenantObjectId, 'members.user': me } },
        { $unwind: '$members' },
        { $match: { 'members.user': me } },
        { $group: { _id: null, total: { $sum: '$members.unread' } } },
      ]),
    ]);

    const conversations = await serializeConversations(tenantObjectId, session.userId, rows as any[]);
    return NextResponse.json({
      success: true,
      data: { conversations, totalUnread: unreadAgg[0]?.total ?? 0 },
    });
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch conversations' }, { status: 500 });
  }
}

/** Find or start the direct conversation between the caller and another staff member. */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  try {
    await connectDB();
    const parsed = await parseBody(request, startConversationSchema);
    if (isValidationError(parsed)) return parsed;
    const { userId } = parsed.data;

    if (userId === session.userId) {
      return NextResponse.json({ success: false, error: 'You cannot message yourself' }, { status: 400 });
    }
    if (!(await User.exists(tenantFilter(tenantId, { _id: userId, status: 'active' })))) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const memberKey = conversationMemberKey(session.userId, userId);
    const upsert = () =>
      Conversation.findOneAndUpdate(
        { tenantId: tenantObjectId, memberKey },
        {
          $setOnInsert: {
            tenantId: tenantObjectId,
            memberKey,
            members: [
              { user: new Types.ObjectId(session.userId), unread: 0 },
              { user: new Types.ObjectId(userId), unread: 0 },
            ],
          },
        },
        { upsert: true, new: true, lean: true }
      );

    let conversation;
    try {
      conversation = await upsert();
    } catch (error: any) {
      // Two concurrent starts can race on the unique memberKey; retrying reads the winner.
      if (error?.code !== 11000) throw error;
      conversation = await upsert();
    }

    const [summary] = await serializeConversations(tenantObjectId, session.userId, [conversation as any]);
    return NextResponse.json({ success: true, data: summary });
  } catch (error: any) {
    console.error('Error starting conversation:', error);
    return NextResponse.json({ success: false, error: 'Failed to start conversation' }, { status: 500 });
  }
}
