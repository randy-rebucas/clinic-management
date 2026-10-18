import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Medicine from '@/models/Medicine';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, escapeRegex } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { unitOf } from '@/lib/medicines';
import { medicineUpdateSchema } from '../schema';

/** Optional text fields that a blank value removes. */
const CLEARABLE = ['genericName', 'standardDosage', 'standardFrequency', 'duration', 'schedule'] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Medicine');

    const medicine = await Medicine.findOne(tenantFilter(ctx.tenantId, { _id: id })).lean();
    if (!medicine) return notFound('Medicine');

    return NextResponse.json({ success: true, data: medicine });
  } catch (error: any) {
    console.error('Error fetching medicine:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch medicine' },
      { status: 500 }
    );
  }
}

/**
 * PUT: change a medicine (medicines:write). Blank optional fields are removed, the unit follows
 * the strength, and turning "controlled" off clears the schedule. `active: true` puts a medicine
 * back on the list; taking it off is DELETE. Audited with old and new values. Prescriptions
 * already written keep what they were written with.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'medicines', 'write');
  if (permissionCheck) return permissionCheck;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Medicine');

  const parsed = await parseBody(request, medicineUpdateSchema);
  if (isValidationError(parsed)) return parsed;
  const input: Record<string, unknown> = { ...parsed.data };
  if (typeof input.strength === 'string') input.unit = unitOf(input.strength);
  if (input.controlledSubstance === false) input.schedule = '';

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if ((CLEARABLE as readonly string[]).includes(key) && value === '') $unset[key] = '';
    else $set[key] = value;
  }

  try {
    await connectDB();

    const before = await Medicine.findOne(tenantFilter(ctx.tenantId, { _id: id })).lean<Record<string, unknown> | null>();
    if (!before) return notFound('Medicine');

    if (typeof $set.name === 'string') {
      const clash = await Medicine.findOne(
        tenantFilter(ctx.tenantId, { _id: { $ne: before._id }, name: new RegExp(`^${escapeRegex($set.name)}$`, 'i') })
      )
        .select('_id name')
        .lean<{ _id: unknown; name: string } | null>();
      if (clash) {
        return NextResponse.json(
          { success: false, error: `Another medicine is already called ${clash.name}.`, existingId: String(clash._id) },
          { status: 409 }
        );
      }
    }

    const medicine = await Medicine.findOneAndUpdate(
      tenantFilter(ctx.tenantId, { _id: id }),
      { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
      { new: true, runValidators: true }
    );
    if (!medicine) return notFound('Medicine');

    const after = medicine.toObject() as Record<string, unknown>;
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const changes = [...Object.keys($set), ...Object.keys($unset)]
      .filter((field) => field !== 'unit' && !same(before[field], after[field]))
      .map((field) => ({ field, oldValue: before[field] ?? null, newValue: after[field] ?? null }));
    if (changes.length) {
      const reopened = changes.some((c) => c.field === 'active' && c.newValue === true);
      await createAuditLog({
        userId: ctx.session.userId,
        userEmail: ctx.session.email,
        userRole: ctx.session.role,
        tenantId: ctx.tenantId,
        action: 'update',
        resource: 'medicine',
        resourceId: String(medicine._id),
        description: reopened
          ? `Put ${medicine.name} back on the medicines list`
          : `Changed ${medicine.name}: ${changes.map((c) => c.field).join(', ')}`,
        changes,
      });
    }

    return NextResponse.json({
      success: true,
      data: medicine,
      message: 'Medicine updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating medicine:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid medicine data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update medicine' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: take a medicine off the list (medicines:write). It is kept, because prescriptions and
 * stock items point to it, and can be put back with PUT `active: true`. (It used to be deleted
 * outright, leaving those links pointing at nothing.)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'medicines', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Medicine');

    const medicine = await Medicine.findOneAndUpdate(
      tenantFilter(ctx.tenantId, { _id: id, active: true }),
      { $set: { active: false } },
      { new: true }
    );
    if (!medicine) {
      const exists = await Medicine.exists(tenantFilter(ctx.tenantId, { _id: id }));
      if (!exists) return notFound('Medicine');
      return NextResponse.json({ success: false, error: 'This medicine is already off the list.' }, { status: 409 });
    }

    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'update',
      resource: 'medicine',
      resourceId: String(medicine._id),
      description: `Took ${medicine.name} off the medicines list`,
      changes: [{ field: 'active', oldValue: true, newValue: false }],
    });

    return NextResponse.json({
      success: true,
      data: medicine,
      message: 'Medicine taken off the list'
    });
  } catch (error: any) {
    console.error('Error taking medicine off the list:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to take the medicine off the list' },
      { status: 500 }
    );
  }
}
