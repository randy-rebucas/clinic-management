import 'server-only';
import { Types } from 'mongoose';
import Invoice from '@/models/Invoice';
import Counter from '@/models/Counter';
import { nextSequence } from '@/lib/counters';
import { formatSerial, type BirSettings } from '@/lib/bir';
import { escapeRegex } from '@/lib/api/validate';

export const COUNTER_KEY = 'bir-sales-invoice';
const LOCK_MS = 30_000;

/**
 * One sequence per serial prefix, so a range registered under a new prefix can start at 1. No
 * prefix keeps the original key, which was once shared by every prefix: it is never behind them.
 */
export function counterKeyFor(prefix: string) {
  const p = prefix.trim();
  return p ? `${COUNTER_KEY}:${p}` : COUNTER_KEY;
}

/** The highest number printed so far under each prefix ('' for none), from the invoices themselves. */
export async function highestIssuedByPrefix(tenantId: Types.ObjectId, prefix?: string): Promise<Map<string, number>> {
  const match: Record<string, unknown> = { tenantId, 'bir.serialNo': { $type: 'string' } };
  if (prefix !== undefined) match['bir.serialNo'] = prefix ? new RegExp(`^${escapeRegex(prefix)}-\\d+$`) : /^\d+$/;
  const rows = await Invoice.aggregate<{ _id: string | null; max: number }>([
    { $match: match },
    { $project: { m: { $regexFind: { input: '$bir.serialNo', regex: /^(?:(.+)-)?(\d+)$/ } } } },
    { $match: { m: { $ne: null } } },
    { $group: { _id: { $arrayElemAt: ['$m.captures', 0] }, max: { $max: { $toLong: { $arrayElemAt: ['$m.captures', 1] } } } } },
  ]);
  return new Map(rows.map((r) => [r._id ?? '', Number(r.max) || 0]));
}

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
    const prefix = opts.bir.serialPrefix.trim();
    const key = counterKeyFor(prefix);
    // A prefix's own counter starts past anything already printed under it (from the shared sequence).
    if (prefix && !(await Counter.exists({ tenantId: tenantObjectId, key }))) {
      const printed = (await highestIssuedByPrefix(tenantObjectId, prefix)).get(prefix) ?? 0;
      await Counter.updateOne({ tenantId: tenantObjectId, key }, { $max: { seq: printed } }, { upsert: true });
    }
    // A newly registered range starts where BIR says, even if the counter is behind it.
    await Counter.updateOne({ tenantId: tenantObjectId, key }, { $max: { seq: opts.bir.serialStart - 1 } }, { upsert: true });
    const seq = await nextSequence(opts.tenantId, key);
    const end = opts.bir.serialEnd;
    if (end && seq > end) {
      // Hand the number back so the next registered range starts exactly where BIR says.
      await Counter.updateOne({ tenantId: tenantObjectId, key, seq }, { $inc: { seq: -1 } });
      await release();
      return {
        ok: false,
        status: 409,
        error: `The registered serial range ends at ${formatSerial(opts.bir.serialPrefix, end)} and is used up. Register a new range with BIR, then enter it in Settings.`,
      };
    }
    const serialNo = formatSerial(prefix, seq);
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
