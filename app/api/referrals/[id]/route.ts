import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Referral from '@/models/Referral';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { pickFields } from '@/lib/pick-fields';
import { REFERRAL_FIELDS, referralPopulate, validateReferralRefs } from '@/lib/referral-helpers';

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
      .populate(referralPopulate(tenantObjectId))
      .populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } })
      .populate({ path: 'appointment', select: 'appointmentCode appointmentDate', match: { tenantId: tenantObjectId } });

    if (!referral) return notFound('Referral');

    return NextResponse.json({ success: true, data: referral });
  } catch (error: any) {
    console.error('Error fetching referral:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch referral' },
      { status: 500 }
    );
  }
}

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

    const body = await request.json().catch(() => null);
    const { data, rejected } = pickFields(body, REFERRAL_FIELDS);
    if (rejected.length) {
      return NextResponse.json({ success: false, error: 'Invalid referral data' }, { status: 400 });
    }
    const refError = await validateReferralRefs(data, tenantObjectId);
    if (refError) {
      return NextResponse.json({ success: false, error: refError }, { status: 400 });
    }

    if (data.status === 'accepted' && !data.acceptedDate) data.acceptedDate = new Date();
    if (data.status === 'completed' && !data.completedDate) data.completedDate = new Date();
    if (data.status === 'declined' && !data.declinedDate) data.declinedDate = new Date();

    const referral = await Referral.findOneAndUpdate(tenantFilter(tenantId, { _id: id }), { $set: data }, {
      new: true,
      runValidators: true,
    });

    if (!referral) return notFound('Referral');

    await referral.populate(referralPopulate(tenantObjectId));

    return NextResponse.json({ success: true, data: referral });
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
