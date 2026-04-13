import { NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';

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
