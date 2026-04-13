import { NextResponse, NextRequest } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import AuditLog from '@/models/AuditLog';
import connectDB from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    // Verify session and admin role
    const session = await verifySession();
    if (!session || session.user?.role?.name !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get tenant context
    const tenantContext = await getTenantContext();
    if (!tenantContext.tenant) {
      return NextResponse.json(
        { success: false, message: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Get limit from query
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '4');

    await connectDB();

    // Fetch recent audit logs
    const logs = await AuditLog.find({
      tenantId: tenantContext.tenantId,
    })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    // Transform to activity format
    const activities = logs.map((log) => {
      const timestamp = new Date(log.timestamp);
      const now = new Date();
      const diffMs = now.getTime() - timestamp.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      let timeString = '';
      if (diffMins < 1) timeString = 'just now';
      else if (diffMins < 60) timeString = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      else if (diffHours < 24) timeString = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      else if (diffDays < 7) timeString = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      else timeString = timestamp.toLocaleDateString();

      return {
        event: `${log.action} on ${log.resource}${log.description ? ': ' + log.description : ''}`,
        time: timeString,
        type: log.success ? 'success' : 'error' as const,
      };
    });

    return NextResponse.json(
      { 
        success: true, 
        data: { activities }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching activity:', error);
    return NextResponse.json(
      { success: false, message: 'Error fetching activity' },
      { status: 500 }
    );
  }
}
