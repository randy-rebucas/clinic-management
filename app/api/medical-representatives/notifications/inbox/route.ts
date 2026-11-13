import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';
import { requireRepSession, isRepSessionError } from '../../_lib/rep-session';
import { inboxFilter, toInboxItem, unreadCount } from '../../_lib/rep-inbox';

/**
 * GET /api/medical-representatives/notifications/inbox?page=&limit=
 * The rep's in-app notifications, newest first, expired ones left out. Paginated: page
 * (default 1), limit (default 20, max 50). Also returns the unread count for the badge.
 */
export async function GET(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(sp.get('limit') ?? '20', 10) || 20));

    await connectDB();
    const query = inboxFilter(rep.userObjectId);
    const [rows, total, unread] = await Promise.all([
      Notification.find(query)
        .select('type title message metadata read createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<any[]>(),
      Notification.countDocuments(query),
      unreadCount(rep.userObjectId),
    ]);

    return NextResponse.json({
      success: true,
      data: rows.map(toInboxItem),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      unreadCount: unread,
    });
  } catch (error) {
    console.error('Rep notification inbox error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
