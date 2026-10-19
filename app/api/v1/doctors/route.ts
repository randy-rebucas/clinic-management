import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import { requireApiKey, isApiError } from '@/lib/api-keys';
import { serializeDoctor } from '@/lib/public-api';

/** GET /api/v1/doctors — the clinic's doctors (for booking). `?status=active` by default; `all` for every one. */
export async function GET(request: NextRequest) {
  const ctx = await requireApiKey(request, 'doctors:read');
  if (isApiError(ctx)) return ctx;
  const status = request.nextUrl.searchParams.get('status') ?? 'active';

  await connectDB();
  await import('@/models/Specialization');
  const rows = await Doctor.find({ tenantId: ctx.tenantObjectId, ...(status === 'all' ? {} : { status: 'active' }) })
    .select('title firstName lastName department status specializationId')
    .populate('specializationId', 'name')
    .sort({ lastName: 1, firstName: 1 })
    .limit(500)
    .lean<any[]>();
  return NextResponse.json({ data: rows.map(serializeDoctor), has_more: false, next_cursor: null });
}
