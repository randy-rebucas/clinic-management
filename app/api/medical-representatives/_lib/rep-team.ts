import 'server-only';
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import RepTeam from '@/models/RepTeam';
import { repProfileFilter, type RepSession } from './rep-session';

export type TeamMe = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  teamId?: Types.ObjectId;
  teamInvite?: { teamId?: Types.ObjectId; invitedBy?: Types.ObjectId; invitedAt?: Date };
};

export function teamError(status: number, error: string, code?: string) {
  return NextResponse.json({ success: false, error, ...(code ? { code } : {}) }, { status });
}

export async function loadTeamMe(rep: RepSession): Promise<TeamMe | null> {
  await connectDB();
  return MedicalRepresentative.findOne(repProfileFilter(rep))
    .select('userId firstName lastName email company teamId teamInvite')
    .lean<TeamMe | null>();
}

export const isTeamManager = (team: { managerUserIds?: unknown[] } | null, userId: Types.ObjectId) =>
  !!team?.managerUserIds?.some((id) => String(id) === String(userId));

/** The caller's profile and team, refusing unless they manage it. */
export async function requireTeamManager(rep: RepSession): Promise<{ me: TeamMe; team: any } | NextResponse> {
  const me = await loadTeamMe(rep);
  if (!me) return teamError(404, 'Medical representative not found');
  if (!me.teamId) return teamError(404, 'You are not on a team.', 'NO_TEAM');
  const team = await RepTeam.findById(me.teamId).lean<any>();
  if (!team) return teamError(404, 'You are not on a team.', 'NO_TEAM');
  if (!isTeamManager(team, rep.userObjectId)) return teamError(403, 'Only the team manager can do this.', 'NOT_TEAM_MANAGER');
  return { me, team };
}

export function isTeamError(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}
