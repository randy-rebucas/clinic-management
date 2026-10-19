import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Invoice from '@/models/Invoice';
import Visit from '@/models/Visit';
import User from '@/models/User';
import Membership from '@/models/Membership';
import { billingDiscount, membershipState } from '@/lib/memberships';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter, patientTenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { OPEN_STATUSES } from '@/lib/invoices';

const VISIT_WINDOW_DAYS = 120;

/**
 * GET /api/invoices/patient-context?patientId=
 * What billing needs to know about one patient while writing an invoice: discount eligibility
 * (and birth date, for the senior discount), their loyalty membership and the discount it gives
 * while in date, balances still open on earlier invoices, and their
 * recent visits with the invoice each one already has. Visit fields are limited to code, date,
 * type and doctor: nothing clinical.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;

  const patientId = request.nextUrl.searchParams.get('patientId') || '';
  if (!isValidId(patientId)) return notFound('Patient');

  try {
    await connectDB();
    const pid = new Types.ObjectId(patientId);
    const patient = await Patient.findOne(patientTenantFilter(tenantId, { _id: pid }))
      .select('firstName lastName patientCode phone dateOfBirth discountEligibility')
      .lean();
    if (!patient) return notFound('Patient');

    const since = new Date(Date.now() - VISIT_WINDOW_DAYS * 86_400_000);
    const [openInvoices, visits, membership] = await Promise.all([
      Invoice.find(tenantFilter(tenantId, { patient: pid, status: { $in: OPEN_STATUSES } }))
        .select('invoiceNumber createdAt outstandingBalance status')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      Visit.find(tenantFilter(tenantId, { patient: pid, date: { $gte: since }, status: { $ne: 'cancelled' } }))
        .select('visitCode date visitType status provider')
        .populate({ path: 'provider', select: 'name', model: User })
        .sort({ date: -1 })
        .limit(10)
        .lean(),
      Membership.findOne(tenantFilter(tenantId, { patient: pid }))
        .select('membershipNumber tier status expiryDate discountPercentage points')
        .lean<{ _id: Types.ObjectId; membershipNumber: string; tier: string; status: string; expiryDate?: Date; discountPercentage?: number; points: number }>(),
    ]);
    // The loyalty membership's discount, offered on the form while the membership is in date.
    const memberDiscount = membership ? billingDiscount(membership) : null;

    const billed = visits.length
      ? await Invoice.find(tenantFilter(tenantId, { visit: { $in: visits.map((v) => v._id) } }))
          .select('visit invoiceNumber')
          .lean()
      : [];
    const invoiceFor = new Map(billed.map((b: any) => [String(b.visit), { _id: String(b._id), invoiceNumber: b.invoiceNumber }]));

    // The HMO card used last, so the cashier doesn't retype the member ID every visit.
    const lastClaim = await Invoice.findOne(tenantFilter(tenantId, { patient: pid, 'insurance.provider': { $nin: [null, ''] } }))
      .select('insurance.hmo insurance.provider insurance.memberId insurance.policyNumber')
      .sort({ createdAt: -1 })
      .lean<{ insurance?: { hmo?: Types.ObjectId; provider?: string; memberId?: string; policyNumber?: string } } | null>();

    return NextResponse.json({
      success: true,
      data: {
        patient,
        membership: membership
          ? {
              _id: String(membership._id),
              membershipNumber: membership.membershipNumber,
              tier: membership.tier,
              state: membershipState(membership),
              discountPercentage: memberDiscount,
              points: membership.points,
            }
          : null,
        openInvoices,
        openBalance: Math.round(openInvoices.reduce((s: number, i: any) => s + (i.outstandingBalance || 0), 0) * 100) / 100,
        lastInsurance: lastClaim?.insurance
          ? {
              hmo: lastClaim.insurance.hmo ? String(lastClaim.insurance.hmo) : null,
              provider: lastClaim.insurance.provider ?? '',
              memberId: lastClaim.insurance.memberId ?? '',
              policyNumber: lastClaim.insurance.policyNumber ?? '',
            }
          : null,
        visits: visits.map((v: any) => ({
          _id: String(v._id),
          visitCode: v.visitCode,
          date: v.date,
          visitType: v.visitType,
          status: v.status,
          doctor: v.provider?.name ?? null,
          invoice: invoiceFor.get(String(v._id)) ?? null,
        })),
      },
    });
  } catch (error) {
    console.error('Error loading invoice patient context:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the patient’s billing details' }, { status: 500 });
  }
}
