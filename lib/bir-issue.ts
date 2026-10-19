import 'server-only';
import { Types } from 'mongoose';
import Invoice from '@/models/Invoice';
import Counter from '@/models/Counter';
import { nextSequence } from '@/lib/counters';
import { formatSerial, type BirSettings } from '@/lib/bir';

const COUNTER_KEY = 'bir-sales-invoice';
const LOCK_MS = 30_000;

export type IssueResult = { ok: true; serialNo: string; issuedAt: Date; fresh: boolean } | { ok: false; status: number; error: string };

/**
 * Give an invoice its BIR sales invoice serial, once. Serials come from the clinic's registered
 * range in order with no gaps: the invoice is locked before a number is drawn, so two prints at
 * the same moment can't each take one, and a serial is never drawn for an invoice that has one.
 */
export async function issueBirSerial(opts: {
  tenantId: string;
  invoiceId: string;
  userId: string;
  bir: BirSettings;
}): Promise<IssueResult> {
  const tenantObjectId = new Types.ObjectId(opts.tenantId);
  const _id = new Types.ObjectId(opts.invoiceId);
  const now = new Date();

  const existing = await Invoice.findOne({ _id, tenantId: tenantObjectId }).select('bir').lean<{ bir?: { serialNo?: string; issuedAt?: Date } } | null>();
  if (!existing) return { ok: false, status: 404, error: 'Invoice not found' };
  if (existing.bir?.serialNo) return { ok: true, serialNo: existing.bir.serialNo, issuedAt: existing.bir.issuedAt ?? now, fresh: false };

  const claimed = await Invoice.findOneAndUpdate(
    {
      _id,
      tenantId: tenantObjectId,
      'bir.serialNo': { $exists: false },
      $or: [{ 'bir.lockAt': { $exists: false } }, { 'bir.lockAt': { $lt: new Date(now.getTime() - LOCK_MS) } }],
    },
    { $set: { 'bir.lockAt': now } },
    { new: true }
  ).lean();
  if (!claimed) {
    const again = await Invoice.findOne({ _id, tenantId: tenantObjectId }).select('bir').lean<{ bir?: { serialNo?: string; issuedAt?: Date } } | null>();
    if (again?.bir?.serialNo) return { ok: true, serialNo: again.bir.serialNo, issuedAt: again.bir.issuedAt ?? now, fresh: false };
    return { ok: false, status: 409, error: 'This sales invoice is being issued from another screen. Try again in a moment.' };
  }

  const release = () => Invoice.updateOne({ _id, tenantId: tenantObjectId }, { $unset: { 'bir.lockAt': 1 } });
  try {
    // A newly registered range starts where BIR says, even if the counter is behind it.
    await Counter.updateOne({ tenantId: tenantObjectId, key: COUNTER_KEY }, { $max: { seq: opts.bir.serialStart - 1 } }, { upsert: true });
    const seq = await nextSequence(opts.tenantId, COUNTER_KEY);
    const end = opts.bir.serialEnd;
    if (end && seq > end) {
      // Hand the number back so the next registered range starts exactly where BIR says.
      await Counter.updateOne({ tenantId: tenantObjectId, key: COUNTER_KEY, seq }, { $inc: { seq: -1 } });
      await release();
      return {
        ok: false,
        status: 409,
        error: `The registered serial range ends at ${formatSerial(opts.bir.serialPrefix, end)} and is used up. Register a new range with BIR, then enter it in Settings.`,
      };
    }
    const serialNo = formatSerial(opts.bir.serialPrefix, seq);
    await Invoice.updateOne(
      { _id, tenantId: tenantObjectId },
      { $set: { 'bir.serialNo': serialNo, 'bir.issuedAt': now, 'bir.issuedBy': new Types.ObjectId(opts.userId) }, $unset: { 'bir.lockAt': 1 } }
    );
    return { ok: true, serialNo, issuedAt: now, fresh: true };
  } catch (err) {
    await release().catch(() => {});
    throw err;
  }
}
