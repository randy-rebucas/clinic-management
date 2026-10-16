import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Service from '@/models/Service';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { serviceUpdateSchema } from '../schema';

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

    return NextResponse.json({
      success: true,
      data: service,
      message: 'Service updated successfully'
    });
  } catch (error) {
    console.error('Error fetching service:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch service' },
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

  const permissionCheck = await requirePermission(ctx.session, 'services', 'write');
  if (permissionCheck) return permissionCheck;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Service');

  const parsed = await parseBody(request, serviceUpdateSchema);
  if (isValidationError(parsed)) return parsed;
  const updates: Record<string, unknown> = { ...parsed.data };
  if (updates.code === '') delete updates.code;

  try {
    await connectDB();

    const service = await Service.findOneAndUpdate(
      tenantFilter(ctx.tenantId, { _id: id }),
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!service) return notFound('Service');

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
        { success: false, error: 'Service with this code already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update service' },
      { status: 500 }
    );
  }
}

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
      tenantFilter(ctx.tenantId, { _id: id }),
      { $set: { active: false } },
      { new: true }
    );

    if (!service) return notFound('Service');

    return NextResponse.json({
      success: true,
      data: service,
      message: 'Service updated successfully'
    });
  } catch (error) {
    console.error('Error deleting service:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete service' },
      { status: 500 }
    );
  }
}
