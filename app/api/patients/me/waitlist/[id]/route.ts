import { NextRequest, NextResponse, after } from 'next/server';
import WaitlistEntry from '@/models/WaitlistEntry';
import logger from '@/lib/logger';
import { ownedRecordContext, isOwnedRecordError, recordNotFound } from '../../_lib/owned-record';
import { clinicNames } from '../../_lib/clinic-names';
import { WAITLIST_DOCTOR_POPULATE, logWaitlistChange, toPatientWaitlistEntry } from '../_lib/waitlist-view';

/**
 * DELETE /api/patients/me/waitlist/[id]
 * Leave the waitlist: the entry stops waiting (kept as `removed` for the clinic's records).
 * Only an entry that is still waiting can be left; never gated by eMCR activation.
 * → { entry } with status "removed"
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await ownedRecordContext(request, id, 'Waitlist entry');
    if (isOwnedRecordError(ctx)) return ctx;

    const entry = await WaitlistEntry.findOneAndUpdate(
      { ...ctx.filter, status: 'waiting' },
      { $set: { status: 'removed' } },
      { new: true }
    )
      .select('-priority')
      .populate(WAITLIST_DOCTOR_POPULATE)
      .lean<Record<string, any> | null>();
    if (!entry) return recordNotFound('Waitlist entry');

    after(() =>
      logWaitlistChange(ctx.session, request, {
        action: 'delete',
        tenantId: entry.tenantId,
        entryId: entry._id,
        patientId: entry.patient,
        description: 'Patient left the waitlist',
        metadata: { doctorId: entry.doctor?._id ? String(entry.doctor._id) : null },
      })
    );

    return NextResponse.json({ success: true, data: { entry: { ...toPatientWaitlistEntry(entry, await clinicNames([entry.tenantId])), status: 'removed' } } });
  } catch (error) {
    logger.error('Error leaving patient waitlist', error as Error);
    return NextResponse.json({ success: false, error: 'Couldn’t leave the waitlist. Please try again.' }, { status: 500 });
  }
}
