import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    const searchParams = request.nextUrl.searchParams;
    const read = searchParams.get('read'); // 'true', 'false', or null for all
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const query: any = { user: session.userId };
    
    // Add tenant filter
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    if (read !== null) {
      query.read = read === 'true';
    }
    
    if (type) {
      query.type = type;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    // Get unread count with tenant filter
    const unreadQuery: any = {
      user: session.userId,
      read: false,
    };
    if (tenantId) {
      unreadQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      unreadQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    const unreadCount = await Notification.countDocuments(unreadQuery);

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        unreadCount,
      },
    });
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can create notifications for other users
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const body = await request.json();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Ensure notification is created with tenantId
    const notificationData: any = {
      ...body,
      user: body.user || session.userId,
    };
    if (tenantId && !notificationData.tenantId) {
      notificationData.tenantId = new Types.ObjectId(tenantId);
    }

    const notification = await Notification.create(notificationData);

    return NextResponse.json({ success: true, data: notification }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating notification:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create notification' },
      { status: 500 }
    );
  }
}

