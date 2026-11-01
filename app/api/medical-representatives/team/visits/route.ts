import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { isValidId } from '@/lib/api/tenant-session';
import { REP_VISIT_STATUSES } from '@/lib/rep-visit-rules';
import { requireRepSession, isRepSessionError } from '../../_lib/rep-session';
import { requireTeamManager, isTeamError, teamError } from '../../_lib/rep-team';

/**
 * GET /api/medical-representatives/team/visits
 * Every team member's visits, newest first (manager). Members' private notes are left out.
 * Query: memberId?, status?, from? / to? (ISO dates, inclusive), page, limit (default 50, max 100).
 */
export async function GET(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const ctx = await requireTeamManager(rep);
    if (isTeamError(ctx)) return ctx;

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50));

    const members = await MedicalRepresentative.find({ teamId: ctx.team._id }).select('userId firstName lastName').lean<any[]>();
    const byUser = new Map(members.map((m) => [String(m.userId), { id: String(m._id), name: `${m.firstName} ${m.lastName}` }]));

    let userIds = members.map((m) => m.userId as Types.ObjectId);
    const memberId = sp.get('memberId');
    if (memberId) {
      const m = isValidId(memberId) ? members.find((x) => String(x._id) === memberId) : undefined;
      if (!m) return teamError(404, 'Member not found');
      userIds = [m.userId];
    }

    const query: Record<string, unknown> = { userId: { $in: userIds } };
    const status = sp.get('status');
    if (status) {
      if (!(REP_VISIT_STATUSES as readonly string[]).includes(status)) return teamError(400, 'Invalid status value.');
      query.status = status;
    }
    const range: Record<string, Date> = {};
    for (const [param, op] of [['from', '$gte'], ['to', '$lte']] as const) {
      const v = sp.get(param);
      if (!v) continue;
      const d = new Date(v);
      if (isNaN(d.getTime())) return teamError(400, `Invalid ${param} date.`);
      range[op] = d;
    }
    if (Object.keys(range).length) query.date = range;

    const [visits, total] = await Promise.all([
      MedicalRepresentativeVisit.find(query)
        .select('-notes -reminderSentAt -tenantId')
        .sort({ date: -1, time: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<any[]>(),
      MedicalRepresentativeVisit.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: visits.map((v) => ({ ...v, member: byUser.get(String(v.userId)) ?? null })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get rep team visits error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
