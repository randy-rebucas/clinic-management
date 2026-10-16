import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import Prescription from '@/models/Prescription';
import LabResult from '@/models/LabResult';
import { getPermissionChecker } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter, tenantFilter } from '@/lib/api/tenant-session';

/**
 * What a clinician needs beside a note they are writing: who the patient is (age, sex), what
 * they react to, what they live with, how their last visits went, the medicines they are on
 * and the lab tests still out. Prescriptions and labs are included only for roles that may
 * read them (null otherwise).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const can = await getPermissionChecker(session);
  if (!can('visits', 'read')) {
    return NextResponse.json({ success: false, error: 'Permission denied: Cannot read visits' }, { status: 403 });
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');

    // The visit being edited, so "last visits" means the ones before it.
    const exclude = request.nextUrl.searchParams.get('excludeVisit');

    const patient = await Patient.findOne(patientTenantFilter(tenantId, { _id: id }))
      .select('firstName lastName patientCode dateOfBirth sex phone allergies preExistingConditions')
      .lean();
    if (!patient) return notFound('Patient');

    const [visits, prescriptions, labs] = await Promise.all([
      Visit.find(
        tenantFilter(tenantId, {
          patient: id,
          status: { $nin: ['cancelled', 'draft'] },
          ...(exclude && isValidId(exclude) ? { _id: { $ne: exclude } } : {}),
        })
      )
        .sort({ date: -1 })
        .limit(3)
        .select('visitCode date chiefComplaint diagnoses vitals status')
        .lean(),
      can('prescriptions', 'read')
        ? Prescription.find(tenantFilter(tenantId, { patient: id, status: { $in: ['active', 'partially-dispensed'] } }))
            .sort({ issuedAt: -1 })
            .limit(5)
            .select('prescriptionCode issuedAt status medications.name medications.dose medications.frequency')
            .lean()
        : null,
      can('lab-results', 'read')
        ? LabResult.find(tenantFilter(tenantId, { patient: id, status: { $in: ['ordered', 'in-progress', 'completed'] } }))
            .sort({ orderDate: -1 })
            .limit(5)
            .select('requestCode orderDate status request.testType')
            .lean()
        : null,
    ]);

    return NextResponse.json({ success: true, data: { patient, visits, prescriptions, labs } });
  } catch (error) {
    console.error('Error loading clinical summary:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the patient summary' }, { status: 500 });
  }
}
