import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Prescription from '@/models/Prescription';
import LabResult from '@/models/LabResult';
import Invoice from '@/models/Invoice';
import { getPermissionChecker, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';

/** How many earlier visits feed the vital-sign trends (plus this one). */
const HISTORY = 7;

/**
 * What surrounds one visit: the patient's earlier vital signs, and the prescriptions, lab
 * tests and invoice that came out of it. Orders are found by their `visit` link as well as the
 * visit's own arrays, because the automations only set the former. Each block is returned only
 * when the user may read that module (null otherwise).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const can = await getPermissionChecker(session);
  if (!can('visits', 'read')) {
    return refuseAccess(session, 'Permission denied: Cannot read visits', 'visits');
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Visit');

    const visit = (await Visit.findOne(tenantFilter(tenantId, { _id: id }))
      .select('patient date prescriptions labsOrdered')
      .lean()) as { _id: unknown; patient?: unknown; date?: Date; prescriptions?: unknown[]; labsOrdered?: unknown[] } | null;
    if (!visit) return notFound('Visit');

    const [history, prescriptions, labs, invoice] = await Promise.all([
      visit.patient
        ? Visit.find(
            tenantFilter(tenantId, {
              patient: visit.patient,
              _id: { $ne: visit._id },
              date: { $lte: visit.date ?? new Date() },
              status: { $ne: 'cancelled' },
              vitals: { $exists: true },
            })
          )
            .sort({ date: -1 })
            .limit(HISTORY)
            .select('visitCode date vitals')
            .lean()
        : [],
      can('prescriptions', 'read')
        ? Prescription.find(tenantFilter(tenantId, { $or: [{ visit: visit._id }, { _id: { $in: visit.prescriptions ?? [] } }] }))
            .sort({ issuedAt: -1 })
            .limit(10)
            .select('prescriptionCode issuedAt status medications.name')
            .lean()
        : null,
      can('lab-results', 'read')
        ? LabResult.find(tenantFilter(tenantId, { $or: [{ visit: visit._id }, { _id: { $in: visit.labsOrdered ?? [] } }] }))
            .sort({ orderDate: -1 })
            .limit(20)
            .select('requestCode orderDate status request.testType request.urgency')
            .lean()
        : null,
      can('invoices', 'read')
        ? Invoice.findOne(tenantFilter(tenantId, { visit: visit._id }))
            .select('invoiceNumber status total outstandingBalance createdAt')
            .lean()
        : null,
    ]);

    return NextResponse.json({
      success: true,
      data: {
        // Oldest first, so trends read left to right.
        history: [...history].reverse(),
        prescriptions,
        labs,
        invoice: invoice ?? null,
        access: { prescriptions: prescriptions !== null, labs: labs !== null, invoices: can('invoices', 'read') },
      },
    });
  } catch (error) {
    console.error('Error loading visit context:', error);
    return NextResponse.json({ success: false, error: 'Failed to load visit context' }, { status: 500 });
  }
}
