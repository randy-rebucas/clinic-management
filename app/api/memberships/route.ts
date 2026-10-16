import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Membership from '@/models/Membership';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  patientTenantFilter,
  isValidId,
} from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';

const MEMBERSHIP_TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const;
const MEMBERSHIP_STATUSES = ['active', 'inactive', 'expired', 'suspended'] as const;
const REFERRAL_BONUS = 100;

const membershipCreateSchema = z.object({
  patientId: zObjectId,
  tier: z.enum(MEMBERSHIP_TIERS).optional(),
  referredBy: zObjectId.optional().or(z.literal('').transform(() => undefined)),
});

function patientPopulate(path: string, tenantId: string, select = 'firstName lastName patientCode') {
  return { path, select, match: patientTenantFilter(tenantId) };
}

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const tier = searchParams.get('tier');
    const status = searchParams.get('status');

    const query: Record<string, unknown> = tenantFilter(ctx.tenantId);

    if (patientId) {
      if (!isValidId(patientId)) {
        return NextResponse.json({ success: true, data: [] });
      }
      query.patient = patientId;
    }
    if (tier && (MEMBERSHIP_TIERS as readonly string[]).includes(tier)) {
      query.tier = tier;
    }
    if (status && (MEMBERSHIP_STATUSES as readonly string[]).includes(status)) {
      query.status = status;
    }

    const memberships = await Membership.find(query)
      .populate(patientPopulate('patient', ctx.tenantId))
      .populate(patientPopulate('referredBy', ctx.tenantId))
      .sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: memberships });
  } catch (error) {
    console.error('Error fetching memberships:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch memberships' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  const parsed = await parseBody(request, membershipCreateSchema);
  if (isValidationError(parsed)) return parsed;
  const { patientId, tier, referredBy } = parsed.data;

  if (referredBy && referredBy === patientId) {
    return NextResponse.json(
      { success: false, error: 'A patient cannot refer themselves' },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    const patient = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: patientId })).select('_id').lean();
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    if (referredBy) {
      const referrer = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: referredBy })).select('_id').lean();
      if (!referrer) {
        return NextResponse.json(
          { success: false, error: 'Referring patient not found' },
          { status: 400 }
        );
      }
    }

    const existing = await Membership.findOne(tenantFilter(ctx.tenantId, { patient: patientId })).select('_id').lean();
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Patient already has a membership' },
        { status: 409 }
      );
    }

    const membership = new Membership({
      tenantId: ctx.tenantObjectId,
      patient: patientId,
      tier: tier || 'bronze',
      referredBy: referredBy || undefined,
    });

    if (referredBy) {
      membership.points += REFERRAL_BONUS;
      membership.totalPointsEarned += REFERRAL_BONUS;
      membership.transactions.push({
        type: 'earn',
        points: REFERRAL_BONUS,
        description: 'Welcome bonus (referred)',
        createdAt: new Date(),
      });
    }

    await membership.save();

    if (referredBy) {
      await Membership.updateOne(
        tenantFilter(ctx.tenantId, { patient: referredBy }),
        {
          $addToSet: { referrals: membership.patient },
          $inc: { points: REFERRAL_BONUS, totalPointsEarned: REFERRAL_BONUS },
          $push: {
            transactions: {
              type: 'earn',
              points: REFERRAL_BONUS,
              description: 'Referral bonus',
              createdAt: new Date(),
            },
          },
        }
      );
    }

    await membership.populate(patientPopulate('patient', ctx.tenantId));
    await membership.populate(patientPopulate('referredBy', ctx.tenantId));

    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'create',
      resource: 'patient',
      resourceId: membership.patient,
      description: `Created membership for patient ${patientId}`,
    });

    return NextResponse.json({ success: true, data: membership }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating membership:', error);
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Patient already has a membership' },
        { status: 409 }
      );
    }
    if (error?.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: 'Invalid membership data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create membership' },
      { status: 500 }
    );
  }
}
