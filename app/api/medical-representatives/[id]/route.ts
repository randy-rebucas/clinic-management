import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import { MedicalRepresentative, User } from '@/models';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { revokeUserSessions } from '@/app/lib/dal';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zEmail } from '@/lib/api/validate';
import { HIDDEN_REP_FIELDS, REP_ACCOUNT_ERROR, refusedRepChanges, repForClinic } from '../_lib/shared-rep';

const companyField = z.union([
  z.string().trim().max(200),
  z.object({ name: z.string().trim().max(200).optional() }).transform((c) => c.name || ''),
]);
const territoryField = z.union([
  z.string().trim().max(500),
  z.array(z.string().trim().max(100)).max(50).transform((t) => t.join(', ')),
]);

const updateRepSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  email: zEmail.optional(),
  phone: z.string().trim().min(1).max(30).optional(),
  company: companyField.optional(),
  territory: territoryField.optional(),
  products: z.array(z.string().trim().max(200)).max(50).optional(),
  notes: z.string().max(5000).optional(),
  status: z.enum(['active', 'inactive', 'on-leave']).optional(),
  availability: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        isAvailable: z.boolean().optional(),
      })
    )
    .max(50)
    .optional(),
});

function invalidId() {
  return NextResponse.json({ success: false, error: 'Invalid ID format' }, { status: 400 });
}

function repNotFound() {
  return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });
}

async function revokeSessionsFor(userId: unknown) {
  if (!userId) return;
  await revokeUserSessions(String(userId));
}

// GET /api/medical-representatives/[id] - Get a single medical representative
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;

    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return invalidId();

    const representative = await MedicalRepresentative.findOne({ _id: id, tenantIds: ctx.tenantObjectId })
      .select(HIDDEN_REP_FIELDS)
      .populate('userId', 'name email status')
      .lean<Record<string, unknown> | null>();

    if (!representative) return repNotFound();

    return NextResponse.json({ success: true, data: repForClinic(representative, ctx.tenantObjectId) });
  } catch (error: any) {
    console.error('Error fetching medical representative:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch medical representative' }, { status: 500 });
  }
}

// PUT /api/medical-representatives/[id] - Update a medical representative
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantObjectId, tenantId } = ctx;

    if (!isAdmin(session)) {
      return refuseAccess(session, 'Admin access required', 'medical-representatives', 'write');
    }

    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return invalidId();

    const parsed = await parseBody(request, updateRepSchema);
    if (isValidationError(parsed)) return parsed;
    const { firstName, lastName, email, phone, company, territory, products, notes, status, availability } = parsed.data;

    const representative = await MedicalRepresentative.findOne({ _id: id, tenantIds: tenantObjectId });
    if (!representative) return repNotFound();

    // Status, the login email and the rep's details belong to their account, not to this clinic: a
    // change could reach other clinics, or take over or end a sign-in the rep paid for.
    const fields = refusedRepChanges(representative, tenantId, { firstName, lastName, email, phone, company, territory, products, notes, status, availability });
    if (fields.length) {
      return NextResponse.json({ success: false, code: 'REP_ACCOUNT', error: REP_ACCOUNT_ERROR, fields }, { status: 403 });
    }

    // Activation is tied to the rep's own payment; a clinic admin cannot grant it.
    if (status === 'active' && representative.status !== 'active') {
      if (representative.paymentStatus !== 'completed' || !representative.isActivated) {
        return NextResponse.json(
          { success: false, error: 'This medical representative cannot be activated until their activation payment is completed.' },
          { status: 402 }
        );
      }
    }

    if (email && email !== representative.email) {
      const emailTaken = await User.exists({ email, _id: { $ne: representative.userId } });
      if (emailTaken || (await MedicalRepresentative.exists({ email, _id: { $ne: representative._id } }))) {
        return NextResponse.json({ success: false, error: 'A user with this email already exists' }, { status: 400 });
      }
      representative.email = email;
    }

    if (firstName) representative.firstName = firstName;
    if (lastName) representative.lastName = lastName;
    if (phone) representative.phone = phone;
    if (company !== undefined) representative.company = company;
    if (territory !== undefined) representative.territory = territory;
    if (products) representative.products = products;
    if (notes !== undefined) representative.notes = notes;
    if (status) representative.status = status;
    if (availability) representative.availability = availability;

    await representative.save();
    await representative.populate('userId', 'name email status');

    if (status && representative.userId) {
      const userStatus = status === 'active' ? 'active' : 'inactive';
      const userId = (representative.userId as any)?._id ?? representative.userId;
      await User.updateOne({ _id: userId }, { $set: { status: userStatus } });
      if (userStatus === 'inactive') {
        await revokeSessionsFor(userId);
      }
    }

    return NextResponse.json({
      success: true,
      data: repForClinic(representative.toObject(), tenantObjectId),
      message: 'Medical representative updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating medical representative:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: 'Invalid medical representative data' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Failed to update medical representative' }, { status: 500 });
  }
}

// DELETE /api/medical-representatives/[id] - Delete a medical representative
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantObjectId } = ctx;

    if (!isAdmin(session)) {
      return refuseAccess(session, 'Admin access required', 'medical-representatives', 'write');
    }

    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return invalidId();

    // Remove the rep from this clinic only; the rep account itself is shared across clinics.
    const representative = await MedicalRepresentative.findOneAndUpdate(
      { _id: id, tenantIds: tenantObjectId },
      { $pull: { tenantIds: tenantObjectId } },
      { new: true }
    );
    if (!representative) return repNotFound();

    // A rep who paid keeps their account after their last clinic lets them go. Only a profile a
    // clinic set up that was never activated ends with the link.
    if (!representative.isActivated && !representative.tenantIds?.length) {
      representative.status = 'inactive';
      await representative.save();
      if (representative.userId) {
        await User.updateOne({ _id: representative.userId }, { $set: { status: 'inactive' } });
        await revokeSessionsFor(representative.userId);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Medical representative deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting medical representative:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete medical representative' }, { status: 500 });
  }
}
