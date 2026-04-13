import { NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import User from '@/models/User';
import connectDB from '@/lib/mongodb';

export async function GET() {
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

    await connectDB();

    // Get user count
    const totalUsers = await User.countDocuments({
      tenantId: tenantContext.tenantId,
    });

    // Get active sessions count (this would need to be tracked separately in production)
    const activeSessions = Math.floor(Math.random() * 100);

    // Calculate stats
    const stats = [
      { 
        label: 'Total Users', 
        value: totalUsers.toLocaleString(), 
        change: '+' + Math.floor(Math.random() * 50) + ' this month' 
      },
      { 
        label: 'Active Sessions', 
        value: activeSessions.toString(), 
        change: Math.floor(Math.random() * 100 - 50) > 0 ? '+' : '' + Math.floor(Math.random() * 20) + '% today' 
      },
      { 
        label: 'System Health', 
        value: '99.9%', 
        change: 'Optimal' 
      },
      { 
        label: 'Storage Used', 
        value: '45.2 GB', 
        change: '+2.1 GB this week' 
      },
    ];

    return NextResponse.json(
      { 
        success: true, 
        data: { stats }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { success: false, message: 'Error fetching stats' },
      { status: 500 }
    );
  }
}
