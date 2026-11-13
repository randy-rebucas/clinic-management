import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import RepAccessRequest, { REP_ACCESS_STATUSES } from '@/models/RepAccessRequest';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { VISIT_REP_FIELDS } from '@/lib/rep-visits';

/**
 * GET /api/rep-access-requests
 * Reps asking to be added to this clinic's representatives (admins). Query: status? (default
 * pending), page, limit (default 50, max 100). Each carries the rep's public profile; `counts`
 * has the number in each status.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    if (!isAdmin(ctx.session)) return refuseAccess(ctx.session, 'Admin access required', 'medical-representatives');

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50));
    const status = sp.get('status') ?? 'pending';
    if (!(REP_ACCESS_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status value.' }, { status: 400 });
    }

    await connectDB();
    void MedicalRepresentative;
    const base = { tenantId: ctx.tenantObjectId };
    const query = { ...base, status };
    const [requests, total, counts] = await Promise.all([
      RepAccessRequest.find(query)
        .select('-userId')
        .populate('medicalRepresentativeId', VISIT_REP_FIELDS)
        .sort({ createdAt: status === 'pending' ? 1 : -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      RepAccessRequest.countDocuments(query),
      RepAccessRequest.aggregate<{ _id: string; n: number }>([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);

    return NextResponse.json({
      success: true,
      data: requests,
      counts: Object.fromEntries(REP_ACCESS_STATUSES.map((s) => [s, counts.find((c) => c._id === s)?.n ?? 0])),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get rep access requests error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch requests' }, { status: 500 });
  }
}
