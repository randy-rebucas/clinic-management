import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import PushSubscription from '@/models/PushSubscription';
import { verifySession } from '@/app/lib/dal';
import { Types } from 'mongoose';

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { endpoint } = body;

    await connectDB();

    if (endpoint) {
      // Remove a specific subscription by endpoint
      await PushSubscription.deleteOne({
        endpoint,
        userId: new Types.ObjectId(session.userId),
      });
    } else {
      // Remove all subscriptions for this user
      await PushSubscription.deleteMany({
        userId: new Types.ObjectId(session.userId),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Push] Unsubscribe error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove subscription' },
      { status: 500 }
    );
  }
}
