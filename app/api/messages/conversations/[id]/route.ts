import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
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
