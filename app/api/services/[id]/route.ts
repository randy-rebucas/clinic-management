import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Service from '@/models/Service';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { serviceUpdateSchema } from '../schema';

/** Optional fields that a blank value removes. */
const CLEARABLE = ['description', 'type', 'notes', 'duration'] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Service');

  try {
    await connectDB();

    const service = await Service.findOne(tenantFilter(ctx.tenantId, { _id: id }));
    if (!service) return notFound('Service');

    return NextResponse.json({ success: true, data: service });
  } catch (error) {
    console.error('Error fetching service:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch service' },
      { status: 500 }
    );
  }
}

/**
 * PUT: change a service. Blank optional fields are removed (they used to be stored as '' and
 * the length could never be cleared); a blank code keeps the current one. Taking a service off
 * the list is DELETE; `active: true` puts it back. Audited with the old and new values.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'services', 'write');
  if (permissionCheck) return permissionCheck;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Service');

  const parsed = await parseBody(request, serviceUpdateSchema);
  if (isValidationError(parsed)) return parsed;
  const input: Record<string, unknown> = { ...parsed.data };
  if (!input.code) delete input.code;
  if (input.unit === '') input.unit = 'per service';

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if ((CLEARABLE as readonly string[]).includes(key) && (value === '' || value === null)) $unset[key] = '';
    else $set[key] = value;
  }

  try {
    await connectDB();

    const before = await Service.findOne(tenantFilter(ctx.tenantId, { _id: id })).lean<Record<string, unknown> | null>();
    if (!before) return notFound('Service');

    const service = await Service.findOneAndUpdate(
      tenantFilter(ctx.tenantId, { _id: id }),
      { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
      { new: true, runValidators: true }
    );
    if (!service) return notFound('Service');

    const after = service.toObject() as Record<string, unknown>;
    const changes = [...Object.keys($set), ...Object.keys($unset)]
      .filter((field) => String(before[field] ?? '') !== String(after[field] ?? ''))
      .map((field) => ({ field, oldValue: before[field] ?? null, newValue: after[field] ?? null }));
    if (changes.length) {
      const reopened = changes.some((c) => c.field === 'active' && c.newValue === true);
      const price = changes.find((c) => c.field === 'unitPrice');
      await createAuditLog({
        userId: ctx.session.userId,
        userEmail: ctx.session.email,
        userRole: ctx.session.role,
        tenantId: ctx.tenantId,
        action: 'update',
        resource: 'service',
        resourceId: String(service._id),
        description: reopened
          ? `Put ${service.name} (${service.code}) back on the price list`
          : price
            ? `Changed the price of ${service.name} (${service.code}) from ${price.oldValue} to ${price.newValue}`
            : `Changed ${service.name} (${service.code}): ${changes.map((c) => c.field).join(', ')}`,
        changes,
      });
    }

    return NextResponse.json({
      success: true,
      data: service,
      message: 'Service updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating service:', error);
    if (error?.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: 'Invalid service data' },
        { status: 400 }
      );
    }
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, error: `Another service already has the code ${String($set.code)}.` },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update service' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: take a service off the price list. It is kept (invoices point to it) and can be put
 * back with PUT `active: true`.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'services', 'delete');
  if (permissionCheck) return permissionCheck;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Service');

  try {
    await connectDB();

    const service = await Service.findOneAndUpdate(
      tenantFilter(ctx.tenantId, { _id: id, active: true }),
      { $set: { active: false } },
      { new: true }
    );

    if (!service) {
      const exists = await Service.exists(tenantFilter(ctx.tenantId, { _id: id }));
      if (!exists) return notFound('Service');
      return NextResponse.json({ success: false, error: 'This service is already off the price list.' }, { status: 409 });
    }

    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'update',
      resource: 'service',
      resourceId: String(service._id),
      description: `Took ${service.name} (${service.code}) off the price list`,
      changes: [{ field: 'active', oldValue: true, newValue: false }],
    });

    return NextResponse.json({
      success: true,
      data: service,
      message: 'Service taken off the price list'
    });
  } catch (error) {
    console.error('Error deleting service:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to take the service off the list' },
      { status: 500 }
    );
  }
}
