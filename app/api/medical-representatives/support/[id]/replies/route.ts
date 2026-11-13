import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SupportRequestModel from '@/models/SupportRequest';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { addSupportReply, ReplySchema } from '@/lib/support';
import { requireRepSession, isRepSessionError } from '../../../_lib/rep-session';

/**
 * POST /api/medical-representatives/support/:id/replies
 * The rep answers the support team on their own request (the reply email says "Reply from the
 * app"). A reply on a resolved or closed request reopens it; the platform team is emailed.
 * Body: { message }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rep = await requireRepSession();
  if (isRepSessionError(rep)) return rep;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Support request');

  const parsed = await parseBody(request, ReplySchema.pick({ message: true }));
  if (isValidationError(parsed)) return parsed;

  try {
    await connectDB();
    // Only the rep's own request: addSupportReply itself checks nothing but the id.
    const own = await SupportRequestModel.exists({ _id: id, ...rep.ownerFilter });
    if (!own) return notFound('Support request');

    const result = await addSupportReply({
      id,
      authorType: 'requester',
      authorEmail: rep.session.email,
      message: parsed.data.message,
      clinicName: 'a medical representative account',
    });
    if (!result) return notFound('Support request');
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Rep support reply error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
