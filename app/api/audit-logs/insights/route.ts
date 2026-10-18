import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import User from '@/models/User';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { dayRangeInTz, dayRangeOffsetInTz, formatInTz } from '@/lib/tz';
import { AUDIT_KINDS, INSIGHT_DAYS, KIND_ACTIONS, kindOf, type AuditInsights, type AuditKind } from '@/lib/audit-log';

/**
 * GET /api/audit-logs/insights — clinic administrators only. The last 30 days of the audit
 * log in figures: entries and refused access per clinic day, entries per kind, refused and
 * failed counts, and who opened the most patients' records. Never narrowed by the list's
 * filters. Also the clinic's people, for the "Who" filter.
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId: tenantId } = ctx;
  if (!isAdmin(session)) {
    return refuseAccess(session, 'Only clinic administrators can read the audit log', 'audit-log');
  }

  try {
    await connectDB();
    const tz = await getTenantTimezone(tenantId);
    const now = new Date();
    const start = dayRangeOffsetInTz(-(INSIGHT_DAYS - 1), now, tz).start;
    const end = dayRangeInTz(now, tz).end;
    const window = { tenantId, timestamp: { $gte: start, $lte: end } };

    const [perDayRaw, perAction, failed, failedSignIns, opened, people, oldest, aboutPatients, openedPatients] = await Promise.all([
      AuditLog.aggregate<{ _id: string; entries: number; refused: number }>([
        { $match: window },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: tz } },
            entries: { $sum: 1 },
            refused: { $sum: { $cond: [{ $eq: ['$action', 'access_denied'] }, 1, 0] } },
          },
        },
      ]),
      AuditLog.aggregate<{ _id: string; n: number }>([{ $match: window }, { $group: { _id: '$action', n: { $sum: 1 } } }]),
      AuditLog.countDocuments({ ...window, success: false }),
      AuditLog.countDocuments({ ...window, action: 'login', success: false }),
      AuditLog.aggregate<{ _id: unknown; patients: number; entries: number }>([
        { $match: { ...window, dataSubject: { $ne: null }, action: { $in: KIND_ACTIONS.opened } } },
        { $group: { _id: { user: '$userId', patient: '$dataSubject' } } },
        { $group: { _id: '$_id.user', patients: { $sum: 1 } } },
        { $sort: { patients: -1 } },
      ]),
      User.find({ tenantId }).select('name email status').sort({ name: 1 }).lean<{ _id: unknown; name?: string; email?: string; status?: string }[]>(),
      AuditLog.findOne({ tenantId }).sort({ timestamp: 1 }).select('timestamp').lean<{ timestamp: Date } | null>(),
      AuditLog.countDocuments({ ...window, dataSubject: { $ne: null } }),
      AuditLog.distinct('dataSubject', { ...window, dataSubject: { $ne: null }, action: { $in: KIND_ACTIONS.opened } }),
    ]);
    const patientsOpened = openedPatients.length;

    const byKind = Object.fromEntries(AUDIT_KINDS.map((k) => [k, 0])) as Record<AuditKind, number>;
    let total = 0;
    let refused = 0;
    for (const row of perAction) {
      byKind[kindOf(row._id)] += row.n;
      total += row.n;
      if (row._id === 'access_denied') refused = row.n;
    }

    const dayMap = new Map(perDayRaw.map((d) => [d._id, d]));
    const perDay = Array.from({ length: INSIGHT_DAYS }, (_, i) => {
      const date = formatInTz(dayRangeOffsetInTz(i - (INSIGHT_DAYS - 1), now, tz).start, 'yyyy-MM-dd', tz);
      const d = dayMap.get(date);
      return { date, entries: d?.entries ?? 0, refused: d?.refused ?? 0 };
    });

    const names = new Map(people.map((p) => [String(p._id), p.name?.trim() || p.email || 'Unnamed account']));
    const data: AuditInsights = {
      tz,
      today: formatInTz(now, 'yyyy-MM-dd', tz),
      days: INSIGHT_DAYS,
      perDay,
      total,
      byKind,
      refused,
      failedSignIns,
      failed,
      aboutPatients,
      patientsOpened,
      openers: opened.length,
      openedBy: opened.slice(0, 5).map((o) => ({
        _id: String(o._id),
        name: names.get(String(o._id)) ?? 'Someone no longer on file',
        patients: o.patients,
      })),
      people: people.map((p) => ({
        _id: String(p._id),
        name: p.name?.trim() || p.email || 'Unnamed account',
        email: p.email ?? '',
        closed: p.status === 'inactive',
      })),
      oldest: oldest?.timestamp ? new Date(oldest.timestamp).toISOString() : null,
    };
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error loading audit log insights:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the audit log figures' }, { status: 500 });
  }
}
