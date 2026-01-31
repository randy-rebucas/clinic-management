import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import { Types } from 'mongoose';

// GET /api/patients/[id]/tenants
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();
    const patientId = params.id;
    if (!patientId) {
      return NextResponse.json({ success: false, error: 'Patient ID required' }, { status: 400 });
    }
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }
    // Multi-tenant: get all clinics for this patient
    const tenantIds = Array.isArray(patient.tenantIds) ? patient.tenantIds : (patient.tenantId ? [patient.tenantId] : []);
    if (!tenantIds.length) {
      return NextResponse.json({ success: true, tenants: [] });
    }
    const tenants = await Tenant.find({ _id: { $in: tenantIds } });
    return NextResponse.json({ success: true, tenants });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch clinics' }, { status: 500 });
  }
}
