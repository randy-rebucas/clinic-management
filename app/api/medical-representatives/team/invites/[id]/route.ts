import { NextRequest, NextResponse } from 'next/server';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { requireRepSession, isRepSessionError } from '../../../_lib/rep-session';
import { requireTeamManager, isTeamError } from '../../../_lib/rep-team';

/**
 * DELETE /api/medical-representatives/team/invites/[id]
 * Withdraw a pending invite (manager). `id` is the invited rep's.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const { id } = await params;
    if (!isValidId(id)) return notFound('Invite');
    const ctx = await requireTeamManager(rep);
    if (isTeamError(ctx)) return ctx;
    const res = await MedicalRepresentative.updateOne({ _id: id, 'teamInvite.teamId': ctx.team._id }, { $unset: { teamInvite: 1 } });
    if (!res.modifiedCount) return notFound('Invite');
    return NextResponse.json({ success: true, message: 'Invite withdrawn' });
  } catch (error) {
    console.error('Withdraw rep team invite error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
