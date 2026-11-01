import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import {
  CLINIC_HIDDEN_VISIT_FIELDS,
  VISIT_REP_FIELDS,
  VISIT_PRODUCT_FIELDS,
  getClinicForReps,
  slotRemaining,
  notifyRepOfVisit,
  bumpRepMetrics,
  type RepEvent,
} from '@/lib/rep-visits';
import { CLINIC_ACTIONS, type ClinicAction } from '@/lib/rep-visit-rules';

const schema = z.object({
  action: z.enum(Object.keys(CLINIC_ACTIONS) as [ClinicAction, ...ClinicAction[]]),
  /** To the rep: a decline or cancel reason, or instructions with an approval. */
  note: z.string().trim().max(1000).optional(),
  /** Approve even though the slot already has as many reps as the clinic allows. */
  override: z.boolean().optional(),
});

const EVENT: Record<ClinicAction, RepEvent> = {
  approve: 'approved',
  decline: 'declined',
  'check-in': 'checked-in',
  complete: 'completed',
  'no-show': 'no-show',
  cancel: 'cancelled',
};

async function loadVisit(clinicId: unknown, id: string) {
  return MedicalRepresentativeVisit.findOne({ _id: id, clinicId })
    .select(CLINIC_HIDDEN_VISIT_FIELDS)
    .populate('medicalRepresentativeId', VISIT_REP_FIELDS)
    .populate('productIds', VISIT_PRODUCT_FIELDS)
    .lean();
}

/** GET /api/rep-visits/[id] — one rep visit with the rep and their product sheets (admins). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    if (!isAdmin(ctx.session)) return refuseAccess(ctx.session, 'Admin access required', 'medical-representatives');
    const { id } = await params;
    if (!isValidId(id)) return notFound('Visit');
    await connectDB();
    const visit = await loadVisit(ctx.tenantObjectId, id);
    if (!visit) return notFound('Visit');
    return NextResponse.json({ success: true, data: visit });
  } catch (error) {
    console.error('Get clinic rep visit error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch the visit' }, { status: 500 });
  }
}

/**
 * PATCH /api/rep-visits/[id]  { action, note?, override? }
 * The clinic's answer and what happened: approve / decline a request; check in, complete, mark
 * a no-show or cancel an approved visit. The rep gets a push for each.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantObjectId, tenantId } = ctx;
    if (!isAdmin(session)) return refuseAccess(session, 'Admin access required', 'medical-representatives', 'write');

    const { id } = await params;
    if (!isValidId(id)) return notFound('Visit');
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    const { action, note, override } = parsed.data;

    await connectDB();
    const current = await MedicalRepresentativeVisit.findOne({ _id: id, clinicId: tenantObjectId })
      .select('status date time medicalRepresentativeId checkedInAt')
      .lean<any>();
    if (!current) return notFound('Visit');
    const allowed = CLINIC_ACTIONS[action] as readonly string[];
    if (!allowed.includes(current.status)) {
      return NextResponse.json(
        { success: false, error: `A ${current.status} visit can't be changed that way.`, code: 'INVALID_TRANSITION' },
        { status: 409 }
      );
    }

    if (action === 'approve' && !override) {
      const clinic = await getClinicForReps(tenantId);
      const day = (current.date as Date).toISOString().slice(0, 10);
      const remaining = clinic ? await slotRemaining(clinic, day, current.date, current.time, id) : null;
      if (remaining === 0) {
        return NextResponse.json(
          { success: false, error: 'That slot already has as many reps as you allow. Approve anyway?', code: 'SLOT_FULL' },
          { status: 409 }
        );
      }
    }

    const now = new Date();
    const userId = session.userId;
    const set: Record<string, unknown> = {};
    switch (action) {
      case 'approve':
        Object.assign(set, { status: 'scheduled', respondedAt: now, respondedBy: userId });
        break;
      case 'decline':
        Object.assign(set, { status: 'declined', respondedAt: now, respondedBy: userId });
        break;
      case 'check-in':
        Object.assign(set, { checkedInAt: now, checkedInBy: userId });
        break;
      case 'complete':
        Object.assign(set, { status: 'completed', ...(current.checkedInAt ? {} : { checkedInAt: now, checkedInBy: userId }) });
        break;
      case 'no-show':
        set.status = 'no-show';
        break;
      case 'cancel':
        Object.assign(set, { status: 'cancelled', cancelledBy: 'clinic' });
        break;
    }
    if (note) set.clinicNote = note;

    // The status guard stops a race with the rep cancelling or moving it at the same moment.
    const updated = await MedicalRepresentativeVisit.findOneAndUpdate(
      { _id: id, clinicId: tenantObjectId, status: current.status, ...(action === 'check-in' ? { checkedInAt: null } : {}) },
      { $set: set },
      { new: true, runValidators: true }
    ).lean<any>();
    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'This visit just changed. Reload and try again.', code: 'VISIT_CHANGED' },
        { status: 409 }
      );
    }

    // Approving a rep the clinic hadn't added yet adds them to its representatives.
    if (action === 'approve' && current.medicalRepresentativeId) {
      await MedicalRepresentative.updateOne({ _id: current.medicalRepresentativeId }, { $addToSet: { tenantIds: tenantObjectId } });
    }
    if (action === 'complete' || action === 'cancel') {
      await bumpRepMetrics(current.medicalRepresentativeId, action === 'complete' ? 'completed' : 'cancelled');
    }
    await notifyRepOfVisit(updated, EVENT[action], action === 'decline' || action === 'cancel' || action === 'approve' ? note : undefined);

    return NextResponse.json({ success: true, data: await loadVisit(tenantObjectId, id) });
  } catch (error) {
    console.error('Update clinic rep visit error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update the visit' }, { status: 500 });
  }
}
