import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import '@/models/Role';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { escapeRegex } from '@/lib/api/validate';
import type { ChatUser } from '@/lib/messaging';

/** Active staff in the caller's clinic they can start a conversation with. */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  try {
    await connectDB();
    const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 100);
    const filter = tenantFilter(tenantId, {
      _id: { $ne: new Types.ObjectId(session.userId) },
      status: 'active',
      ...(q ? { name: { $regex: escapeRegex(q), $options: 'i' } } : {}),
    });

    const users = (await User.find(filter)
      .select('name role')
      .populate('role', 'name displayName')
      .sort({ name: 1 })
      .limit(25)
      .lean()) as any[];

    const contacts: ChatUser[] = users.map((u) => ({
      id: String(u._id),
      name: u.name,
      role: u.role?.displayName || u.role?.name || '',
    }));
    return NextResponse.json({ success: true, data: contacts });
  } catch (error: any) {
    console.error('Error fetching contacts:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch contacts' }, { status: 500 });
  }
}
