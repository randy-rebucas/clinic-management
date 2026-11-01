import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import RepAccessRequest from '@/models/RepAccessRequest';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { notifyRepOfAccessAnswer } from '@/lib/rep-access';

const schema = z.object({
  action: z.enum(['approve', 'decline']),
  /** To the rep, with the answer. */
  note: z.string().trim().max(1000).optional(),
});

/**
 * PATCH /api/rep-access-requests/[id]  { action: "approve" | "decline", note? }
 * Approve adds the rep to this clinic's representatives (they can book its visiting hours);
 * decline leaves them out (they may ask again after 30 days). Only a pending request can be
 * answered (409 REQUEST_CLOSED). The rep gets a push either way.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantObjectId } = ctx;
    if (!isAdmin(session)) return refuseAccess(session, 'Admin access required', 'medical-representatives', 'write');

    const { id } = await params;
    if (!isValidId(id)) return notFound('Request');
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    const { action, note } = parsed.data;

    await connectDB();
    // Claimed while still pending, so two admins can't answer it differently.
    const answered = await RepAccessRequest.findOneAndUpdate(
      { _id: id, tenantId: tenantObjectId, status: 'pending' },
      { $set: { status: action === 'approve' ? 'approved' : 'declined', respondedAt: new Date(), respondedBy: session.userId, ...(note ? { clinicNote: note } : {}) } },
      { new: true }
    ).lean<{ medicalRepresentativeId: unknown } | null>();
    if (!answered) {
      const exists = await RepAccessRequest.exists({ _id: id, tenantId: tenantObjectId });
      if (!exists) return notFound('Request');
      return NextResponse.json({ success: false, error: 'This request was already answered or withdrawn.', code: 'REQUEST_CLOSED' }, { status: 409 });
    }

    if (action === 'approve') {
      await MedicalRepresentative.updateOne({ _id: answered.medicalRepresentativeId }, { $addToSet: { tenantIds: tenantObjectId } });
    }
    await notifyRepOfAccessAnswer(answered.medicalRepresentativeId, tenantObjectId, action === 'approve', note);

    return NextResponse.json({
      success: true,
      message: action === 'approve' ? 'Rep added to your representatives. They’ve been told.' : 'Request declined. The rep has been told.',
    });
  } catch (error) {
    console.error('Answer rep access request error:', error);
    return NextResponse.json({ success: false, error: 'Failed to answer the request' }, { status: 500 });
  }
}
