import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

/**
 * Get audit logs for a specific patient (PH DPA compliance - right to access)
 */
export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');

    if (!patientId) {
      return NextResponse.json(
        { success: false, error: 'Patient ID required' },
        { status: 400 }
      );
    }

    // Users can only view access logs for patients they have permission to access
    // In production, add additional permission checks here

    const logs = await AuditLog.find({
      dataSubject: patientId,
      isSensitive: true,
    })
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .limit(100);

    return NextResponse.json({
      success: true,
      data: logs,
      message: 'Patient data access history (PH DPA compliance)',
    });
  } catch (error: any) {
    console.error('Error fetching patient access logs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch patient access logs' },
      { status: 500 }
    );
  }
}

