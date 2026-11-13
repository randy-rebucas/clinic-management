import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { requireRepSession, isRepSessionError } from '../../../_lib/rep-session';
import { unreadCount } from '../../../_lib/rep-inbox';

const schema = z.union([
  z.object({ ids: z.array(zObjectId).min(1).max(100) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

/**
 * POST /api/medical-representatives/notifications/inbox/read  { ids: string[] } | { all: true }
 * Mark the rep's own notifications read (up to 100 by id, or all). Returns the unread count left.
 */
export async function POST(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;

    await connectDB();
    const filter: Record<string, unknown> = { user: rep.userObjectId, read: false };
    if ('ids' in parsed.data) filter._id = { $in: [...new Set(parsed.data.ids)].map((id) => new Types.ObjectId(id)) };
    await Notification.updateMany(filter, { $set: { read: true, readAt: new Date() } });

    return NextResponse.json({ success: true, data: { unreadCount: await unreadCount(rep.userObjectId) } });
  } catch (error) {
    console.error('Rep notification mark-read error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
