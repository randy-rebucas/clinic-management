import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import Visit from '@/models/Visit';
import Prescription from '@/models/Prescription';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { logDataAccess } from '@/lib/audit';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

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
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const type = searchParams.get('type'); // 'lab', 'prescription', 'visit', or 'all'

    // Find patient (same logic as profile endpoint)
    const User = (await import('@/models/User')).default;
    const user = await User.findById(session.userId).select('email').lean();

    if (!user || Array.isArray(user) || !('email' in user)) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const Patient = (await import('@/models/Patient')).default;
    let patient;
    if (patientId) {
      // Build query with tenant filter
      const patientQuery: any = { _id: patientId };
      if (tenantId) {
        patientQuery.tenantIds = new Types.ObjectId(tenantId);
      } else {
        patientQuery.$or = [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }];
      }
      patient = await Patient.findOne(patientQuery);
    } else {
      // Build query with tenant filter
      const patientQuery: any = { email: user.email };
      if (tenantId) {
        patientQuery.tenantIds = new Types.ObjectId(tenantId);
      } else {
        patientQuery.$or = [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }];
      }
      patient = await Patient.findOne(patientQuery);
    }

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }
    
    const patientTenantId = patient.tenantId;

    const results: any = {};

    // Get lab results (tenant-scoped)
    if (!type || type === 'lab' || type === 'all') {
      const labResultQuery: any = { patient: patient._id };
      if (patientTenantId) {
        labResultQuery.tenantId = patientTenantId;
      } else {
        labResultQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const labResults = await LabResult.find(labResultQuery)
        .populate('visit', 'visitCode date')
        .sort({ orderDate: -1 });
      results.labResults = labResults;
    }

    // Get prescriptions (tenant-scoped)
    if (!type || type === 'prescription' || type === 'all') {
      const prescriptionQuery: any = { patient: patient._id };
      if (patientTenantId) {
        prescriptionQuery.tenantId = patientTenantId;
      } else {
        prescriptionQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const prescriptions = await Prescription.find(prescriptionQuery)
        .populate('visit', 'visitCode date')
        .sort({ issuedAt: -1 });
      results.prescriptions = prescriptions;
    }

    // Get visits (tenant-scoped)
    if (!type || type === 'visit' || type === 'all') {
      const visitQuery: any = { patient: patient._id };
      if (patientTenantId) {
        visitQuery.tenantId = patientTenantId;
      } else {
        visitQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const visits = await Visit.find(visitQuery)
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
      request.nextUrl.pathname,
      tenantId || patientTenantId?.toString()
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

