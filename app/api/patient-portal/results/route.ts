import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import Visit from '@/models/Visit';
import Prescription from '@/models/Prescription';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { logDataAccess } from '@/lib/audit';

/**
 * Patient portal - Get patient results (lab results, prescriptions, visits)
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
    const type = searchParams.get('type'); // 'lab', 'prescription', 'visit', or 'all'

    // Find patient (same logic as profile endpoint)
    const User = (await import('@/models/User')).default;
    const user = await User.findById(session.userId).select('email').lean();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const Patient = (await import('@/models/Patient')).default;
    let patient;
    if (patientId) {
      patient = await Patient.findById(patientId);
    } else {
      patient = await Patient.findOne({ email: user.email });
    }

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    const results: any = {};

    // Get lab results
    if (!type || type === 'lab' || type === 'all') {
      const labResults = await LabResult.find({ patient: patient._id })
        .populate('visit', 'visitCode date')
        .sort({ orderDate: -1 });
      results.labResults = labResults;
    }

    // Get prescriptions
    if (!type || type === 'prescription' || type === 'all') {
      const prescriptions = await Prescription.find({ patient: patient._id })
        .populate('visit', 'visitCode date')
        .sort({ issuedAt: -1 });
      results.prescriptions = prescriptions;
    }

    // Get visits
    if (!type || type === 'visit' || type === 'all') {
      const visits = await Visit.find({ patient: patient._id })
        .populate('provider', 'name')
        .sort({ date: -1 });
      results.visits = visits;
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

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    console.error('Error fetching patient results:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch patient results' },
      { status: 500 }
    );
  }
}

