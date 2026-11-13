import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';
import Tenant from '@/models/Tenant';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import RepAccessRequest from '@/models/RepAccessRequest';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { sanitizeSearch } from '@/lib/utils';
import { normalizeRepVisitSettings, describeWindows, localNow, parseVisitDay } from '@/lib/rep-visit-rules';
import { requireRepSession, isRepSessionError, repProfileFilter } from '../_lib/rep-session';

/** The rep app's calendar: visit days are clinic days, and the clinics are in the Philippines. */
const REP_TIME_ZONE = 'Asia/Manila';

type History = { lastVisit: string | null; nextVisit: { date: string; time: string } | null };

/**
 * The rep's last completed and next open visit with each of these clinics, in one aggregation on
 * the rep's own visits (the {tenantId, userId, date} index). Visit days are UTC midnights.
 */
async function visitHistory(ownerFilter: Record<string, unknown>, clinicIds: unknown[]): Promise<Map<string, History>> {
  if (!clinicIds.length) return new Map();
  const todayStart = parseVisitDay(localNow(REP_TIME_ZONE).day)!;
  const day = { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'UTC' } };
  const rows = await MedicalRepresentativeVisit.aggregate<{ _id: unknown; lastDone: string | null; nextOpen: string | null }>([
    {
      $match: {
        ...ownerFilter,
        $or: [{ clinicId: { $in: clinicIds } }, { linkedClinicId: { $in: clinicIds } }],
        status: { $in: ['completed', 'requested', 'scheduled'] },
      },
    },
    {
      $group: {
        _id: { $ifNull: ['$clinicId', '$linkedClinicId'] },
        lastDone: { $max: { $cond: [{ $eq: ['$status', 'completed'] }, day, null] } },
        // "YYYY-MM-DD HH:mm" sorts as text, so $min is the soonest.
        nextOpen: {
          $min: {
            $cond: [{ $and: [{ $ne: ['$status', 'completed'] }, { $gte: ['$date', todayStart] }] }, { $concat: [day, ' ', '$time'] }, null],
          },
        },
      },
    },
  ]);
  return new Map(
    rows.map((r) => [
      String(r._id),
      {
        lastVisit: r.lastDone ?? null,
        nextVisit: r.nextOpen ? { date: r.nextOpen.slice(0, 10), time: r.nextOpen.slice(11) } : null,
      },
    ])
  );
}

/**
 * GET /api/medical-representatives/clinics
 * Clinics the rep can book visits with: those taking rep visits that either added the rep or
 * are open to all reps. Query: search? (clinic name or city), id? (just that clinic, for one
 * clinic's screen), page, limit (default 50, max 100).
 * `scope=all` also lists clinics taking rep visits that haven't added the rep and aren't open to
 * all (to request access); those carry no hours or instructions. Every clinic has `access`:
 * "linked" (added the rep), "open" (open to all reps), "requested" (the rep's request is
 * waiting) or "none", and `canBook`. Each clinic also carries the rep's own history with it:
 * `lastVisit` (the latest completed visit's day, "YYYY-MM-DD") and `nextVisit` (the soonest
 * requested or scheduled visit from today on, `{ date, time }`), or null. Bookings (`clinicId`)
 * and log entries the rep linked to the clinic (`linkedClinicId`) both count.
 */
export async function GET(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50));
    const search = sp.get('search')?.trim();
    const all = sp.get('scope') === 'all';
    const onlyId = sp.get('id')?.trim();

    await connectDB();
    const profile = await MedicalRepresentative.findOne(repProfileFilter(rep)).select('tenantIds').lean<{ tenantIds?: unknown[] } | null>();
    const linkedIds = (profile?.tenantIds ?? []).map(String);

    const open = await Settings.find({
      'repVisitSettings.enabled': true,
      ...(all ? {} : { $or: [{ 'repVisitSettings.openToAllReps': true }, { tenantId: { $in: profile?.tenantIds ?? [] } }] }),
    })
      .select('tenantId clinicAddress repVisitSettings')
      .lean<any[]>();
    const settingsByTenant = new Map(open.filter((s) => s.tenantId).map((s) => [String(s.tenantId), s]));

    const ids = [...settingsByTenant.keys()].filter((id) => !onlyId || id === onlyId);
    const tenantQuery: Record<string, unknown> = { _id: { $in: ids }, status: 'active' };
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

    const history = await visitHistory(rep.ownerFilter, tenants.map((t) => t._id));

    const requested = all
      ? new Set(
          (await RepAccessRequest.find({ userId: rep.userObjectId, status: 'pending', tenantId: { $in: tenants.map((t) => t._id) } })
            .select('tenantId')
            .lean<{ tenantId: unknown }[]>()).map((r) => String(r.tenantId))
        )
      : new Set<string>();

    const data = tenants.map((t) => {
      const id = String(t._id);
      const s = settingsByTenant.get(id);
      const settings = normalizeRepVisitSettings(s?.repVisitSettings);
      const a = t.address ?? {};
      const linked = linkedIds.includes(id);
      const canBook = linked || settings.openToAllReps;
      return {
        id,
        name: t.displayName || t.name,
        location: s?.clinicAddress || [a.street, a.city, a.state].filter(Boolean).join(', '),
        city: a.city ?? null,
        linked,
        canBook,
        // Whether it stays bookable if the rep leaves its list.
        openToAllReps: settings.openToAllReps,
        access: linked ? 'linked' : settings.openToAllReps ? 'open' : requested.has(id) ? 'requested' : 'none',
        // A clinic that hasn't accepted the rep keeps its hours and instructions to itself.
        hours: canBook ? describeWindows(settings.windows) : [],
        slotMinutes: settings.slotMinutes,
        maxAdvanceDays: settings.maxAdvanceDays,
        instructions: canBook ? settings.instructions || null : null,
        lastVisit: history.get(id)?.lastVisit ?? null,
        nextVisit: history.get(id)?.nextVisit ?? null,
      };
    });

    return NextResponse.json({ success: true, data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Get rep clinics error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
