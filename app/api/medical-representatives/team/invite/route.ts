import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import RepTeam from '@/models/RepTeam';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { teamCoverage } from '@/lib/rep-billing';
import { requireRepSession, isRepSessionError } from '../../_lib/rep-session';
import { loadTeamMe, teamError } from '../../_lib/rep-team';

const schema = z.object({ accept: z.boolean() });

/**
 * POST /api/medical-representatives/team/invite  { accept }
 * Answer your pending team invite. Joining a team on a paid plan needs a free seat. The team's
 * manager can see your visits, but not your private notes.
 */
export async function POST(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    const me = await loadTeamMe(rep);
    if (!me) return teamError(404, 'Medical representative not found');
    const teamId = me.teamInvite?.teamId;
    if (!teamId) return teamError(404, 'You have no pending invite.', 'NO_INVITE');

    if (!parsed.data.accept) {
      await MedicalRepresentative.updateOne({ _id: me._id }, { $unset: { teamInvite: 1 } });
      return NextResponse.json({ success: true, message: 'Invite declined' });
    }

    const team = await RepTeam.findById(teamId).select('name').lean<any>();
    if (!team) {
      await MedicalRepresentative.updateOne({ _id: me._id }, { $unset: { teamInvite: 1 } });
      return teamError(404, 'That team no longer exists.', 'NO_INVITE');
    }
    if (me.teamId) return teamError(409, 'You are already on a team. Leave it first.', 'ALREADY_ON_TEAM');

    const cover = await teamCoverage(teamId);
    if (cover.active && cover.members >= cover.seats) {
      return teamError(409, 'The team has no free seat. Ask your manager to add one.', 'TEAM_FULL');
    }

    const res = await MedicalRepresentative.updateOne(
      { _id: me._id, 'teamInvite.teamId': teamId, teamId: { $exists: false } },
      { $set: { teamId }, $unset: { teamInvite: 1 } }
    );
    if (!res.modifiedCount) return teamError(409, 'The invite changed. Reload and try again.', 'INVITE_CHANGED');
    return NextResponse.json({ success: true, data: { id: String(teamId), name: team.name, role: 'member' } });
  } catch (error) {
    console.error('Answer rep team invite error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
