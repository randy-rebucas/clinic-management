import { NextResponse } from 'next/server';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { isAdmin } from '@/app/lib/auth-helpers';

export async function GET() {
  try {
    // Verify session (tenant comes from the session) and admin role
    const auth = await requireTenantSession();
    if (isTenantSessionError(auth)) return auth;
    if (!isAdmin(auth.session)) {
      return NextResponse.json(
        { success: false, message: 'Forbidden' },
        { status: 403 }
      );
    }

    // Mock system health check
    const services = [
      { 
        service: 'Database', 
        status: 'Healthy' as const, 
        color: 'green' as const 
      },
      { 
        service: 'API Server', 
        status: 'Healthy' as const, 
        color: 'green' as const 
      },
      { 
        service: 'File Storage', 
        status: 'Healthy' as const, 
        color: 'green' as const 
      },
      { 
        service: 'Email Service', 
        status: 'Operational' as const, 
        color: 'green' as const 
      },
    ];

    return NextResponse.json(
      { 
        success: true, 
        data: { 
          services,
          systemHealth: 99.9,
          lastChecked: new Date().toISOString()
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error checking system health:', error);
    return NextResponse.json(
      { success: false, message: 'Error checking system health' },
      { status: 500 }
    );
  }
}
