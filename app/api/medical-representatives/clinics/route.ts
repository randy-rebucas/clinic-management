import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';
import Tenant from '@/models/Tenant';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { sanitizeSearch } from '@/lib/utils';
import { normalizeRepVisitSettings, describeWindows } from '@/lib/rep-visit-rules';
import { requireRepSession, isRepSessionError, repProfileFilter } from '../_lib/rep-session';

/**
 * GET /api/medical-representatives/clinics
 * Clinics the rep can book visits with: those taking rep visits that either added the rep or
 * are open to all reps. Query: search? (clinic name or city), page, limit (default 50, max 100).
 */
export async function GET(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50));
    const search = sp.get('search')?.trim();

    await connectDB();
    const profile = await MedicalRepresentative.findOne(repProfileFilter(rep)).select('tenantIds').lean<{ tenantIds?: unknown[] } | null>();
    const linkedIds = (profile?.tenantIds ?? []).map(String);

    const open = await Settings.find({
      'repVisitSettings.enabled': true,
      $or: [{ 'repVisitSettings.openToAllReps': true }, { tenantId: { $in: profile?.tenantIds ?? [] } }],
    })
      .select('tenantId clinicAddress repVisitSettings')
      .lean<any[]>();
    const settingsByTenant = new Map(open.filter((s) => s.tenantId).map((s) => [String(s.tenantId), s]));

    const tenantQuery: Record<string, unknown> = { _id: { $in: [...settingsByTenant.keys()] }, status: 'active' };
    if (search) {
      const rx = { $regex: sanitizeSearch(search), $options: 'i' };
      tenantQuery.$or = [{ name: rx }, { displayName: rx }, { 'address.city': rx }];
    }
    const [tenants, total] = await Promise.all([
      Tenant.find(tenantQuery)
        .select('name displayName address')
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<any[]>(),
      Tenant.countDocuments(tenantQuery),
    ]);

    const data = tenants.map((t) => {
      const s = settingsByTenant.get(String(t._id));
      const settings = normalizeRepVisitSettings(s?.repVisitSettings);
      const a = t.address ?? {};
      return {
        id: String(t._id),
        name: t.displayName || t.name,
        location: s?.clinicAddress || [a.street, a.city, a.state].filter(Boolean).join(', '),
        city: a.city ?? null,
        linked: linkedIds.includes(String(t._id)),
        hours: describeWindows(settings.windows),
        slotMinutes: settings.slotMinutes,
        maxAdvanceDays: settings.maxAdvanceDays,
        instructions: settings.instructions || null,
      };
    });

    return NextResponse.json({ success: true, data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Get rep clinics error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
