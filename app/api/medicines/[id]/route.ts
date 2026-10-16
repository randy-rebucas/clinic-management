import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Medicine from '@/models/Medicine';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { pickFields, MEDICINE_FIELDS } from '@/lib/pick-fields';

const isAdminRole = (role?: string) => role === 'admin' || role === 'owner';

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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  if (!isAdminRole(ctx.session.role)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Medicine');

    const body = await request.json().catch(() => null);
    const { data, rejected } = pickFields(body, MEDICINE_FIELDS);
    if (rejected.length) {
      return NextResponse.json({ success: false, error: 'Invalid medicine data' }, { status: 400 });
    }

    const medicine = await Medicine.findOneAndUpdate(tenantFilter(ctx.tenantId, { _id: id }), { $set: data }, {
      new: true,
      runValidators: true,
    });

    if (!medicine) return notFound('Medicine');

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  if (!isAdminRole(ctx.session.role)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Medicine');

    const medicine = await Medicine.findOneAndDelete(tenantFilter(ctx.tenantId, { _id: id }));
    if (!medicine) return notFound('Medicine');

    return NextResponse.json({
      success: true,
      data: medicine,
      message: 'Medicine deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting medicine:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete medicine' },
      { status: 500 }
    );
  }
}
