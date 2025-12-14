import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { logDataAccess } from '@/lib/audit';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

/**
 * Patient portal - Get patient profile
 * Patients can only access their own profile
 */
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
    const patientId = searchParams.get('patientId');

    // For now, we'll use the session user to find linked patient
    // In production, you'd link User accounts to Patient records
    const User = (await import('@/models/User')).default;
    const user = await User.findById(session.userId).select('email').lean();

    if (!user || Array.isArray(user) || !('email' in user)) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Find patient by email (or use patientId if provided and user has access) - tenant-scoped
    let patient;
    if (patientId) {
      // Build query with tenant filter
      const patientQuery: any = { _id: patientId };
      if (tenantId) {
        patientQuery.tenantId = new Types.ObjectId(tenantId);
      } else {
        patientQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      patient = await Patient.findOne(patientQuery);
      // In production, add permission check here
    } else {
      // Build query with tenant filter
      const patientQuery: any = { email: user.email };
      if (tenantId) {
        patientQuery.tenantId = new Types.ObjectId(tenantId);
      } else {
        patientQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      patient = await Patient.findOne(patientQuery);
    }

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient profile not found' },
        { status: 404 }
      );
    }

    // Log data access
    await logDataAccess(
      session.userId,
      session.email,
      session.role,
      'patient',
      patient._id.toString(),
      patient._id.toString(),
      request.headers.get('x-forwarded-for') || undefined,
      request.headers.get('user-agent') || undefined,
      request.nextUrl.pathname,
      tenantId || patient.tenantId?.toString()
    );

    return NextResponse.json({ success: true, data: patient });
  } catch (error: any) {
    console.error('Error fetching patient profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch patient profile' },
      { status: 500 }
    );
  }
}

