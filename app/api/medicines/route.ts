import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Medicine from '@/models/Medicine';
import { sanitizeSearch } from '@/lib/utils';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { pickFields, MEDICINE_FIELDS } from '@/lib/pick-fields';


export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const active = searchParams.get('active') !== 'false';

    const query: any = { tenantId: ctx.tenantObjectId };

    if (active) {
      query.active = true;
    }
    if (category) {
      query.category = String(category);
    }
    if (search) {
      const safeSearch = sanitizeSearch(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { genericName: { $regex: safeSearch, $options: 'i' } },
        { brandNames: { $in: [new RegExp(safeSearch, 'i')] } },
      ];
    }

    const medicines = await Medicine.find(query)
      .sort({ name: 1 })
      .limit(100)
      .lean();

    return NextResponse.json({ success: true, data: medicines });
  } catch (error: any) {
    console.error('Error fetching medicines:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch medicines' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session } = ctx;

  // Only admins can add medicines
  if (session.role !== 'admin' && session.role !== 'owner') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const body = await request.json().catch(() => null);
    const { data, rejected } = pickFields(body, MEDICINE_FIELDS);
    if (rejected.length) {
      return NextResponse.json({ success: false, error: 'Invalid medicine data' }, { status: 400 });
    }

    const medicine = await Medicine.create({ ...data, tenantId: ctx.tenantObjectId });
    return NextResponse.json({
      success: true,
      data: medicine,
      message: 'Medicine created successfully'
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating medicine:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid medicine data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create medicine' },
      { status: 500 }
    );
  }
}

