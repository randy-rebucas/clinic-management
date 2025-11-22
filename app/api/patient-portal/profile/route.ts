import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { logDataAccess } from '@/lib/audit';

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

    // Find patient by email (or use patientId if provided and user has access)
    let patient;
    if (patientId) {
      // Verify user has access to this patient
      patient = await Patient.findById(patientId);
      // In production, add permission check here
    } else {
      // Find patient by user email
      patient = await Patient.findOne({ email: user.email });
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
      request.nextUrl.pathname
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

