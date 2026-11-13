import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { parseBody, isValidationError, zEmail } from '@/lib/api/validate';
import { notifyRep } from '@/lib/rep-notify';
import { requireRepSession, isRepSessionError } from '../../_lib/rep-session';
import { requireTeamManager, isTeamError } from '../../_lib/rep-team';

const schema = z.object({ email: zEmail });

/**
 * POST /api/medical-representatives/team/invites  { email }
 * Invite a rep to the team (manager). The answer is the same whether or not a rep uses that
 * email, so it can't be used to find out who has an account. Only activated reps not on a team
 * and with no other pending invite get it; they accept in the app.
 */
export async function POST(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    const ctx = await requireTeamManager(rep);
    if (isTeamError(ctx)) return ctx;

    const invitee = await MedicalRepresentative.findOneAndUpdate(
      {
        email: parsed.data.email,
        isActivated: true,
        status: 'active',
        teamId: { $exists: false },
        'teamInvite.teamId': { $exists: false },
      },
      { $set: { teamInvite: { teamId: ctx.team._id, invitedBy: rep.userObjectId, invitedAt: new Date() } } },
      { new: true }
    )
      .select('userId notificationsEnabled')
      .lean<any>();

    if (invitee?.userId) {
      // Inbox record always; push unless the invitee switched it off. Never throws.
      await notifyRep(
        { userId: invitee.userId, notificationsEnabled: invitee.notificationsEnabled !== false },
        {
          kind: 'team',
          title: 'Team invite',
          body: `${ctx.me.firstName} ${ctx.me.lastName} invited you to join ${ctx.team.name}.`,
          screen: 'team',
          id: String(ctx.team._id),
          tag: `medrep-team-invite-${String(ctx.team._id)}`,
        }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'If a rep who isn’t on a team uses this email, they’ll get the invite in the app.',
    });
  } catch (error) {
    console.error('Invite to rep team error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
