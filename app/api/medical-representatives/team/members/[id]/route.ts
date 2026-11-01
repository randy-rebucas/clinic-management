import { NextRequest, NextResponse } from 'next/server';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { requireRepSession, isRepSessionError } from '../../../_lib/rep-session';
import { requireTeamManager, isTeamError, isTeamManager, teamError } from '../../../_lib/rep-team';

/**
 * DELETE /api/medical-representatives/team/members/[id]
 * Remove a member (manager). To leave the team yourself, DELETE /team.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const { id } = await params;
    if (!isValidId(id)) return notFound('Member');
    const ctx = await requireTeamManager(rep);
    if (isTeamError(ctx)) return ctx;
    if (String(ctx.me._id) === id) return teamError(400, 'To leave the team yourself, use Leave team.', 'USE_LEAVE');

    const member = await MedicalRepresentative.findOne({ _id: id, teamId: ctx.team._id }).select('userId').lean<any>();
    if (!member) return notFound('Member');
    if (isTeamManager(ctx.team, member.userId)) return teamError(403, 'Another manager can’t be removed.', 'IS_MANAGER');
    await MedicalRepresentative.updateOne({ _id: id, teamId: ctx.team._id }, { $unset: { teamId: 1 } });
    return NextResponse.json({ success: true, message: 'Member removed' });
  } catch (error) {
    console.error('Remove rep team member error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
