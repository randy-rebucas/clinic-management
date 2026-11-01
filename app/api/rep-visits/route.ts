import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { CLINIC_HIDDEN_VISIT_FIELDS, VISIT_REP_FIELDS, VISIT_PRODUCT_FIELDS } from '@/lib/rep-visits';
import { REP_VISIT_STATUSES, parseVisitDay } from '@/lib/rep-visit-rules';

/**
 * GET /api/rep-visits
 * Medical-rep visits booked with this clinic (admins). Query: status?, from? / to? (YYYY-MM-DD,
 * inclusive), page, limit (default 50, max 100). `counts` has the number in each status.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    if (!isAdmin(ctx.session)) return refuseAccess(ctx.session, 'Admin access required', 'medical-representatives');

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50));

    const base = { clinicId: ctx.tenantObjectId };
    const query: Record<string, unknown> = { ...base };
    const status = sp.get('status');
    if (status) {
      if (!(REP_VISIT_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ success: false, error: 'Invalid status value.' }, { status: 400 });
      }
      query.status = status;
    }
    const range: Record<string, Date> = {};
    for (const [param, op] of [['from', '$gte'], ['to', '$lte']] as const) {
      const v = sp.get(param);
      if (!v) continue;
      const d = parseVisitDay(v);
      if (!d) return NextResponse.json({ success: false, error: `${param} must be YYYY-MM-DD.` }, { status: 400 });
      range[op] = d;
    }
    if (Object.keys(range).length) query.date = range;

    await connectDB();
    // Requests first by soonest date, so the next decision is on top.
    const sort: Record<string, 1 | -1> = status === 'requested' || status === 'scheduled' ? { date: 1, time: 1 } : { date: -1, time: -1 };
    const [visits, total, counts] = await Promise.all([
      MedicalRepresentativeVisit.find(query)
        .select(CLINIC_HIDDEN_VISIT_FIELDS)
        .populate('medicalRepresentativeId', VISIT_REP_FIELDS)
        .populate('productIds', VISIT_PRODUCT_FIELDS)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MedicalRepresentativeVisit.countDocuments(query),
      MedicalRepresentativeVisit.aggregate<{ _id: string; n: number }>([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);

    return NextResponse.json({
      success: true,
      data: visits,
      counts: Object.fromEntries(REP_VISIT_STATUSES.map((s) => [s, counts.find((c) => c._id === s)?.n ?? 0])),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get clinic rep visits error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch rep visits' }, { status: 500 });
  }
}
