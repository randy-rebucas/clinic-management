import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import RepTeam from '@/models/RepTeam';
import User from '@/models/User';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { teamCoverage } from '@/lib/rep-billing';
import { requireRepSession, isRepSessionError } from '../_lib/rep-session';
import { loadTeamMe, isTeamManager, requireTeamManager, isTeamError, teamError } from '../_lib/rep-team';

const nameSchema = z.object({ name: z.string().trim().min(2).max(200) });

type MemberStats = { visitsThisMonth: number; completedThisMonth: number; upcoming: number; pendingRequests: number; lastVisitAt: Date | null };

async function memberStats(userIds: Types.ObjectId[], now = new Date()): Promise<Map<string, MemberStats>> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const inMonth = { $and: [{ $gte: ['$date', monthStart] }, { $lt: ['$date', nextMonth] }] };
  const rows = await MedicalRepresentativeVisit.aggregate([
    { $match: { userId: { $in: userIds } } },
    {
      $group: {
        _id: '$userId',
        visitsThisMonth: { $sum: { $cond: [{ $and: [inMonth, { $not: [{ $in: ['$status', ['cancelled', 'declined']] }] }] }, 1, 0] } },
        completedThisMonth: { $sum: { $cond: [{ $and: [inMonth, { $eq: ['$status', 'completed'] }] }, 1, 0] } },
        upcoming: { $sum: { $cond: [{ $and: [{ $gte: ['$date', today] }, { $eq: ['$status', 'scheduled'] }] }, 1, 0] } },
        pendingRequests: { $sum: { $cond: [{ $eq: ['$status', 'requested'] }, 1, 0] } },
        lastVisitAt: { $max: { $cond: [{ $eq: ['$status', 'completed'] }, '$date', null] } },
      },
    },
  ]);
  return new Map(rows.map((r: any) => [String(r._id), { ...r, _id: undefined }]));
}

/**
 * GET /api/medical-representatives/team
 * The rep's team, if any, and any pending invite. Managers also get every member with their
 * visit counts and the team's pending invites.
 */
export async function GET() {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const me = await loadTeamMe(rep);
    if (!me) return teamError(404, 'Medical representative not found');

    let invite = null;
    if (me.teamInvite?.teamId) {
      const [team, inviter] = await Promise.all([
        RepTeam.findById(me.teamInvite.teamId).select('name').lean<any>(),
        User.findById(me.teamInvite.invitedBy).select('name').lean<any>(),
      ]);
      if (team) invite = { teamId: String(team._id), teamName: team.name, invitedBy: inviter?.name ?? null, invitedAt: me.teamInvite.invitedAt };
    }

    const team = me.teamId ? await RepTeam.findById(me.teamId).lean<any>() : null;
    if (!team) return NextResponse.json({ success: true, data: { invite, team: null } });

    const manager = isTeamManager(team, rep.userObjectId);
    const members = await MedicalRepresentative.find({ teamId: team._id })
      .select('userId firstName lastName email company territory')
      .sort({ lastName: 1, firstName: 1 })
      .lean<any[]>();
    const managers = members.filter((m) => isTeamManager(team, m.userId)).map((m) => `${m.firstName} ${m.lastName}`);

    const data: Record<string, unknown> = {
      id: String(team._id),
      name: team.name,
      role: manager ? 'manager' : 'member',
      managers,
      memberCount: members.length,
      subscription: await teamCoverage(team._id),
    };

    if (manager) {
      const stats = await memberStats(members.map((m) => m.userId));
      data.members = members.map((m) => ({
        id: String(m._id),
        name: `${m.firstName} ${m.lastName}`,
        email: m.email,
        territory: m.territory ?? null,
        role: isTeamManager(team, m.userId) ? 'manager' : 'member',
        stats: stats.get(String(m.userId)) ?? { visitsThisMonth: 0, completedThisMonth: 0, upcoming: 0, pendingRequests: 0, lastVisitAt: null },
      }));
      const invited = await MedicalRepresentative.find({ 'teamInvite.teamId': team._id }).select('firstName lastName email teamInvite.invitedAt').lean<any[]>();
      data.pendingInvites = invited.map((r) => ({ id: String(r._id), name: `${r.firstName} ${r.lastName}`, email: r.email, invitedAt: r.teamInvite?.invitedAt }));
    }

    return NextResponse.json({ success: true, data: { invite, team: data } });
  } catch (error) {
    console.error('Get rep team error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/medical-representatives/team  { name }
 * Start a team for your company; you become its manager.
 */
export async function POST(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const parsed = await parseBody(request, nameSchema);
    if (isValidationError(parsed)) return parsed;
    const me = await loadTeamMe(rep);
    if (!me) return teamError(404, 'Medical representative not found');
    if (me.teamId) return teamError(409, 'You are already on a team. Leave it first.', 'ALREADY_ON_TEAM');

    const team = await RepTeam.create({ name: parsed.data.name, managerUserIds: [rep.userObjectId] });
    const res = await MedicalRepresentative.updateOne({ _id: me._id, teamId: { $exists: false } }, { $set: { teamId: team._id }, $unset: { teamInvite: 1 } });
    if (!res.modifiedCount) {
      await RepTeam.deleteOne({ _id: team._id });
      return teamError(409, 'You are already on a team. Leave it first.', 'ALREADY_ON_TEAM');
    }
    return NextResponse.json({ success: true, data: { id: String(team._id), name: team.name, role: 'manager' } }, { status: 201 });
  } catch (error) {
    console.error('Create rep team error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

/** PUT /api/medical-representatives/team  { name } — rename (manager). */
export async function PUT(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const parsed = await parseBody(request, nameSchema);
    if (isValidationError(parsed)) return parsed;
    const ctx = await requireTeamManager(rep);
    if (isTeamError(ctx)) return ctx;
    await RepTeam.updateOne({ _id: ctx.team._id }, { $set: { name: parsed.data.name } });
    return NextResponse.json({ success: true, data: { id: String(ctx.team._id), name: parsed.data.name } });
  } catch (error) {
    console.error('Rename rep team error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/medical-representatives/team
 * Leave your team. The last manager can only leave once everyone else has; the team then closes.
 */
export async function DELETE() {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    await connectDB();
    const me = await loadTeamMe(rep);
    if (!me) return teamError(404, 'Medical representative not found');
    if (!me.teamId) return teamError(404, 'You are not on a team.', 'NO_TEAM');
    const team = await RepTeam.findById(me.teamId).lean<any>();

    if (team && isTeamManager(team, rep.userObjectId)) {
      const otherManagers = team.managerUserIds.filter((id: unknown) => String(id) !== String(rep.userObjectId));
      const others = await MedicalRepresentative.countDocuments({ teamId: team._id, _id: { $ne: me._id } });
      if (!otherManagers.length && others > 0) {
        return teamError(409, 'Remove the other members before you leave; you are the team’s only manager.', 'TEAM_HAS_MEMBERS');
      }
      if (!others) {
        await Promise.all([
          RepTeam.deleteOne({ _id: team._id }),
          MedicalRepresentative.updateMany({ 'teamInvite.teamId': team._id }, { $unset: { teamInvite: 1 } }),
        ]);
      } else {
        await RepTeam.updateOne({ _id: team._id }, { $pull: { managerUserIds: rep.userObjectId } });
      }
    }
    await MedicalRepresentative.updateOne({ _id: me._id }, { $unset: { teamId: 1 } });
    return NextResponse.json({ success: true, message: 'You left the team.' });
  } catch (error) {
    console.error('Leave rep team error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
