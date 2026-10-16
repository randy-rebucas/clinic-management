import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Conversation from '@/models/Conversation';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';

/** Mark the conversation read for the caller. */
export async function POST(
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

    const me = new Types.ObjectId(session.userId);
    const result = await Conversation.updateOne(
      { _id: id, tenantId: tenantObjectId, 'members.user': me },
      { $set: { 'members.$.unread': 0, 'members.$.lastReadAt': new Date() } }
    );
    if (result.matchedCount === 0) return notFound('Conversation');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error marking conversation read:', error);
    return NextResponse.json({ success: false, error: 'Failed to mark conversation read' }, { status: 500 });
  }
}
