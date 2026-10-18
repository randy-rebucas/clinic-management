import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import Appointment from '@/models/Appointment';
import Prescription from '@/models/Prescription';
import LabResult from '@/models/LabResult';
import Invoice from '@/models/Invoice';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import { getPermissionChecker, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter, tenantFilter } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { dayRangeInTz } from '@/lib/tz';
import { logDataAccess } from '@/lib/audit';

/** Newest items per module shown on the patient page; totals are counted in full. */
const RECENT = 25;
/** Earlier visits feeding the vital-sign trends. */
const VITALS_HISTORY = 12;
const ACTIVE_APPOINTMENT = ['pending', 'scheduled', 'confirmed', 'rescheduled'];

/**
 * One patient's record for the patient page: the demographics (file contents left out), and per
 * module the newest items plus true totals, each only for roles that may read that module (null
 * otherwise). Billing figures are summed in the database across every invoice, not a page of them.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const can = await getPermissionChecker(session);
  if (!can('patients', 'read')) {
    return refuseAccess(session, 'Permission denied: Cannot read patients', 'patients');
  }

  try {
    await connectDB();
    void [Doctor, User];
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');
    const pid = new Types.ObjectId(id);

    const patient = (await Patient.findOne(patientTenantFilter(tenantId, { _id: pid })).lean()) as Record<string, unknown> | null;
    if (!patient) return notFound('Patient');

    const attachments = ((patient.attachments as { _id: unknown; filename?: string; contentType?: string; size?: number; uploadDate?: Date; notes?: string; url?: string }[] | undefined) ?? []).map((a) => ({
      _id: String(a._id),
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      uploadDate: a.uploadDate,
      notes: a.notes,
    }));
    delete patient.attachments;
    delete patient.password;

    const tz = await getTenantTimezone(tenantId);
    const { start: todayStart } = dayRangeInTz(new Date(), tz);
    const mine = (extra: Record<string, unknown> = {}) => tenantFilter(tenantId, { patient: pid, ...extra });

    const [visits, appointments, prescriptions, labs, billing] = await Promise.all([
      can('visits', 'read')
        ? Promise.all([
            Visit.find(mine())
              .sort({ date: -1 })
              .limit(RECENT)
              .select('visitCode date visitType chiefComplaint diagnoses status provider')
              .populate('provider', 'name')
              .lean(),
            Visit.countDocuments(mine()),
            Visit.find(mine({ status: { $nin: ['cancelled', 'draft'] }, vitals: { $exists: true } }))
              .sort({ date: -1 })
              .limit(VITALS_HISTORY)
              .select('visitCode date vitals')
              .lean(),
          ]).then(([items, total, vitals]) => ({ items, total, vitals: [...vitals].reverse() }))
        : null,
      can('appointments', 'read')
        ? Promise.all([
            Appointment.find(mine())
              .sort({ appointmentDate: -1, appointmentTime: -1 })
              .limit(RECENT)
              .select('appointmentCode appointmentDate appointmentTime status reason doctor isWalkIn')
              .populate({ path: 'doctor', select: 'firstName lastName', match: { tenantId: new Types.ObjectId(tenantId) } })
              .lean(),
            Appointment.countDocuments(mine()),
            Appointment.findOne(mine({ status: { $in: ACTIVE_APPOINTMENT }, appointmentDate: { $gte: todayStart } }))
              .sort({ appointmentDate: 1, appointmentTime: 1 })
              .select('appointmentCode appointmentDate appointmentTime status reason doctor')
              .populate({ path: 'doctor', select: 'firstName lastName', match: { tenantId: new Types.ObjectId(tenantId) } })
              .lean(),
          ]).then(([items, total, next]) => ({ items, total, next }))
        : null,
      can('prescriptions', 'read')
        ? Promise.all([
            Prescription.find(mine())
              .sort({ issuedAt: -1 })
              .limit(RECENT)
              .select('prescriptionCode issuedAt status medications.name visit')
              .lean(),
            Prescription.countDocuments(mine()),
            Prescription.countDocuments(mine({ status: { $in: ['active', 'partially-dispensed'] } })),
          ]).then(([items, total, waiting]) => ({ items, total, waiting }))
        : null,
      can('lab-results', 'read')
        ? Promise.all([
            LabResult.find(mine())
              .sort({ orderDate: -1 })
              .limit(RECENT)
              .select('requestCode orderDate resultDate status request.testType request.urgency')
              .lean(),
            LabResult.countDocuments(mine()),
            LabResult.countDocuments(mine({ status: { $in: ['ordered', 'in-progress'] } })),
            LabResult.countDocuments(mine({ status: 'completed' })),
          ]).then(([items, total, atLab, toReview]) => ({ items, total, atLab, toReview }))
        : null,
      can('invoices', 'read')
        ? Promise.all([
            Invoice.find(mine()).sort({ createdAt: -1 }).limit(RECENT).select('invoiceNumber createdAt status total totalPaid outstandingBalance').lean(),
            Invoice.aggregate<{ _id: null; count: number; billed: number; paid: number; outstanding: number; unpaid: number }>([
              { $match: mine() },
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  billed: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 0, { $ifNull: ['$total', 0] }] } },
                  paid: { $sum: { $ifNull: ['$totalPaid', 0] } },
                  outstanding: {
                    $sum: {
                      $cond: [
                        { $in: ['$status', ['unpaid', 'partial']] },
                        { $ifNull: ['$outstandingBalance', { $subtract: [{ $ifNull: ['$total', 0] }, { $ifNull: ['$totalPaid', 0] }] }] },
                        0,
                      ],
                    },
                  },
                  unpaid: { $sum: { $cond: [{ $in: ['$status', ['unpaid', 'partial']] }, 1, 0] } },
                },
              },
            ]),
          ]).then(([items, [sum]]) => ({
            items,
            total: sum?.count ?? 0,
            billed: sum?.billed ?? 0,
            paid: sum?.paid ?? 0,
            outstanding: Math.max(0, sum?.outstanding ?? 0),
            unpaidCount: sum?.unpaid ?? 0,
          }))
        : null,
    ]);

    const ec = patient.emergencyContact as { name?: string; phone?: string } | undefined;
    const missing = [
      !patient.phone && 'phone number',
      !(ec?.name && ec?.phone) && 'emergency contact',
      !((patient.allergies as unknown[] | undefined)?.length) && 'allergies',
    ].filter(Boolean) as string[];

    void logDataAccess(session.userId, session.email ?? '', session.role ?? '', 'patient', id, id, request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(), request.headers.get('user-agent') ?? undefined, request.nextUrl.pathname, tenantId);

    return NextResponse.json({
      success: true,
      data: { patient: { ...patient, attachments }, visits, appointments, prescriptions, labs, billing, missing },
    });
  } catch (error) {
    console.error('Error loading patient record:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the patient record' }, { status: 500 });
  }
}
