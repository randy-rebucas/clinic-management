import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Referral from '@/models/Referral';
import Appointment from '@/models/Appointment';
import { hasPermission, requirePermission } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { dayToDate, normalizeReferral, referralDetailsSchema, referralPopulate, referralStatusSchema, validateReferralRefs } from '@/lib/referral-helpers';
import { NEXT_STATUS, OPEN_STATUSES, type ReferralStatus } from '@/lib/referrals';
import { getTenantTimezone } from '@/lib/clinic-timezone';

const STATUS_WORDS: Record<ReferralStatus, string> = {
  pending: 'waiting for a reply',
  accepted: 'accepted',
  completed: 'seen',
  declined: 'declined',
  cancelled: 'cancelled',
};

/**
 * GET /api/referrals/:id
 * The referral with both parties, and, when no appointment is linked, the patient's first booking
 * with the receiving doctor since the referral (`scheduled`), so "has it been booked?" is answered.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'referrals', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Referral');

    const referral = await Referral.findOne(tenantFilter(tenantId, { _id: id }))
      .select('-feedback.submittedBy')
      .populate(referralPopulate(tenantObjectId, 'firstName lastName patientCode phone dateOfBirth'))
      .populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } })
      .populate({ path: 'appointment', select: 'appointmentCode appointmentDate appointmentTime status', match: { tenantId: tenantObjectId } })
      .lean<any>();

    if (!referral) return notFound('Referral');

    let scheduled = null;
    const patientId = referral.patient?._id;
    const doctorId = referral.receivingDoctor?._id;
    if (!referral.appointment && patientId && doctorId && referral.status !== 'cancelled' && (await hasPermission(session, 'appointments', 'read'))) {
      const since = new Date(referral.referredDate);
      since.setUTCHours(0, 0, 0, 0);
      scheduled = await Appointment.findOne({
        tenantId: tenantObjectId,
        patient: patientId,
        doctor: doctorId,
        appointmentDate: { $gte: since },
        status: { $ne: 'cancelled' },
      })
        .select('appointmentCode appointmentDate appointmentTime status')
        .sort({ appointmentDate: 1, appointmentTime: 1 })
        .lean();
    }

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'view',
      resource: 'referral',
      resourceId: referral._id,
      dataSubject: patientId,
      description: `Viewed referral ${referral.referralCode ?? id}`,
    });

    return NextResponse.json({ success: true, data: referral, scheduled });
  } catch (error: any) {
    console.error('Error fetching referral:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch referral' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/referrals/:id
 * Either a state change (`{ status, declinedReason?, completedOn?, visit? }`), one allowed step at
 * a time, or an edit of the details while the referral is still open.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'referrals', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Referral');

    const current = await Referral.findOne(tenantFilter(tenantId, { _id: id }))
      .select('status patient referralCode followUpDate')
      .lean<{ _id: Types.ObjectId; status: ReferralStatus; patient: Types.ObjectId; referralCode?: string; followUpDate?: Date }>();
    if (!current) return notFound('Referral');
    const patientId = String(current.patient);

    const raw = await request.clone().json().catch(() => null);
    const isStatusChange = raw && typeof raw === 'object' && 'status' in raw;

    let update: Record<string, unknown>;
    let description: string;

    if (isStatusChange) {
      const parsed = await parseBody(request, referralStatusSchema);
      if (isValidationError(parsed)) return parsed;
      const next = parsed.data.status;
      if (!NEXT_STATUS[current.status].includes(next)) {
        return NextResponse.json(
          { success: false, error: `This referral is already ${STATUS_WORDS[current.status]}; it can’t be marked ${STATUS_WORDS[next]}.` },
          { status: 409 }
        );
      }
      const set: Record<string, unknown> = { status: next };
      const now = new Date();
      if (next === 'accepted') set.acceptedDate = now;
      if (next === 'declined') {
        const reason = parsed.data.declinedReason?.trim();
        if (!reason) return NextResponse.json({ success: false, error: 'Say why the referral was declined.' }, { status: 400 });
        set.declinedDate = now;
        set.declinedReason = reason;
      }
      if (next === 'completed') {
        const on = parsed.data.completedOn;
        // "Today" in the clinic's time zone (the date field is the user's local day, not UTC's).
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: await getTenantTimezone(tenantId), year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
        if (on && on > today) return NextResponse.json({ success: false, error: 'The date seen can’t be in the future.' }, { status: 400 });
        set.completedDate = on && on !== today ? dayToDate(on) : now;
        if (current.status === 'pending') set.acceptedDate = set.completedDate;
        if (parsed.data.visit) {
          const refError = await validateReferralRefs({ visit: parsed.data.visit }, tenantObjectId, patientId);
          if (refError) return NextResponse.json({ success: false, error: refError }, { status: 400 });
          set.visit = parsed.data.visit;
        }
      }
      update = { $set: set };
      description = `Marked referral ${current.referralCode ?? id} ${STATUS_WORDS[next]}`;
    } else {
      if (!OPEN_STATUSES.includes(current.status)) {
        return NextResponse.json({ success: false, error: `This referral is already ${STATUS_WORDS[current.status]}; its details can no longer be changed.` }, { status: 409 });
      }
      const parsed = await parseBody(request, referralDetailsSchema);
      if (isValidationError(parsed)) return parsed;
      // No default sender here: editing never makes the editor the referring doctor.
      const { set, unset, problems } = normalizeReferral(parsed.data, patientId);
      if (problems.length) return NextResponse.json({ success: false, error: 'Validation failed', issues: problems }, { status: 400 });
      const refError = await validateReferralRefs(set, tenantObjectId, patientId);
      if (refError) return NextResponse.json({ success: false, error: refError }, { status: 400 });
      // A moved follow-up date earns a fresh reminder.
      const newFollowUp = set.followUpDate instanceof Date ? set.followUpDate.getTime() : null;
      if (newFollowUp !== (current.followUpDate ? new Date(current.followUpDate).getTime() : null)) unset.push('followUpReminderSentAt');
      update = { $set: set, ...(unset.length ? { $unset: Object.fromEntries(unset.map((k) => [k, ''])) } : {}) };
      description = `Edited referral ${current.referralCode ?? id}`;
    }

    // Only if nobody changed the state meanwhile.
    const referral = await Referral.findOneAndUpdate(tenantFilter(tenantId, { _id: id, status: current.status }), update, {
      new: true,
      runValidators: true,
    });
    if (!referral) {
      return NextResponse.json({ success: false, error: 'Someone else changed this referral just now. Reload it and try again.' }, { status: 409 });
    }

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'update',
      resource: 'referral',
      resourceId: referral._id,
      dataSubject: patientId,
      description,
    });

    return NextResponse.json({ success: true, data: { _id: String(referral._id), status: referral.status } });
  } catch (error: any) {
    console.error('Error updating referral:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid referral data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update referral' },
      { status: 500 }
    );
  }
}
