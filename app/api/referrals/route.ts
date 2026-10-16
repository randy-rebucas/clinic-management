import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Referral from '@/models/Referral';
import { requirePermission } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { Types } from 'mongoose';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { pickFields } from '@/lib/pick-fields';
import { REFERRAL_FIELDS, referralPopulate, validateReferralRefs } from '@/lib/referral-helpers';
import { nextSequence, formatCode } from '@/lib/counters';

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'referrals', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const referringDoctor = searchParams.get('referringDoctor');
    const receivingDoctor = searchParams.get('receivingDoctor');
    const patientId = searchParams.get('patientId');
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    const query: any = { tenantId: tenantObjectId };
    for (const [key, value] of [['referringDoctor', referringDoctor], ['receivingDoctor', receivingDoctor], ['patient', patientId]] as const) {
      if (!value) continue;
      if (!isValidId(value)) return NextResponse.json({ success: true, data: [] });
      query[key] = new Types.ObjectId(value);
    }
    if (status) query.status = status;
    if (type) query.type = type;

    const referrals = await Referral.find(query)
      .populate(referralPopulate(tenantObjectId))
      .populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } })
      .populate({ path: 'appointment', select: 'appointmentCode appointmentDate', match: { tenantId: tenantObjectId } })
      .sort({ referredDate: -1 })
      .limit(500)
      .lean();

    return NextResponse.json({ success: true, data: referrals });
  } catch (error: any) {
    console.error('Error fetching referrals:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch referrals' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'referrals', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const body = await request.json().catch(() => null);
    const { data, rejected } = pickFields(body, REFERRAL_FIELDS);
    if (rejected.length) {
      return NextResponse.json({ success: false, error: 'Invalid referral data' }, { status: 400 });
    }

    const refError = await validateReferralRefs(data, tenantObjectId);
    if (refError) {
      return NextResponse.json({ success: false, error: refError }, { status: 400 });
    }

    // Only keep referringContact when it has a name; drop empty phone/email
    const contact = data.referringContact;
    if (contact && typeof contact === 'object') {
      const name = typeof contact.name === 'string' ? contact.name.trim() : '';
      if (!name) {
        delete data.referringContact;
      } else {
        const cleaned: Record<string, string> = { name };
        for (const k of ['phone', 'email']) {
          if (typeof contact[k] === 'string' && contact[k].trim()) cleaned[k] = contact[k].trim();
        }
        data.referringContact = cleaned;
      }
    } else {
      delete data.referringContact;
    }

    const seq = await nextSequence(tenantObjectId, 'referral', () => Referral.countDocuments({ tenantId: tenantObjectId }));

    const referral = await Referral.create({
      ...data,
      referralCode: formatCode('REF', seq),
      referredDate: data.referredDate || new Date(),
      tenantId: tenantObjectId,
    });

    await referral.populate(referralPopulate(tenantObjectId));

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: tenantId,
      action: 'create',
      resource: 'patient',
      resourceId: referral._id,
      description: `Created ${referral.type} referral for patient ${String((referral.patient as any)?._id ?? referral.patient)}`,
    });

    return NextResponse.json({ success: true, data: referral }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating referral:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid referral data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create referral' },
      { status: 500 }
    );
  }
}
