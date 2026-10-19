import 'server-only';
import { Types } from 'mongoose';
import Invoice from '@/models/Invoice';
import Patient from '@/models/Patient';
import { escapeRegex } from '@/lib/api/validate';
import { roundMoney } from '@/lib/invoice-totals';
import {
  DEADLINES,
  SETTLED_STATUSES,
  WAITS,
  daysLeftToFile,
  deadlineOf,
  filingWindow,
  waitOf,
  type ClaimRow,
  type DeadlineKey,
  type PhilhealthInsights,
  type SettledStatus,
  type WaitKey,
} from '@/lib/philhealth';

const DAY = 86_400_000;
const OPEN = ['draft', 'returned', 'filed'];
/** Claims still in hand are listed whole up to this many; the figures count them all. */
export const OPEN_CLAIMS_LIMIT = 2000;

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : undefined);

function toRow(r: any, filingDays: number, now: Date): ClaimRow {
  const ph = r.philhealth;
  const open = ph.status === 'draft' || ph.status === 'returned';
  const w = filingWindow(ph, filingDays);
  return {
    invoiceId: String(r._id),
    invoiceNumber: r.invoiceNumber,
    patientName: r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : 'Patient record unavailable',
    pin: ph.pin,
    relationship: ph.relationship,
    caseRateCode: ph.caseRateCode,
    caseRateDescription: ph.caseRateDescription,
    hciAmount: ph.hciAmount ?? 0,
    pfAmount: ph.pfAmount ?? 0,
    amount: ph.amount ?? 0,
    servedOn: iso(ph.servedOn)!,
    status: ph.status,
    claimNumber: ph.claimNumber,
    filedAt: iso(ph.filedAt),
    paidAt: iso(ph.paidAt),
    paidAmount: ph.paidAmount,
    withheldAmount: ph.withheldAmount,
    note: ph.note,
    returnedAt: iso(ph.returnedAt),
    daysLeft: open ? daysLeftToFile(ph, filingDays, now) : null,
    fileBy: open ? new Date(new Date(w.from).getTime() + w.days * DAY).toISOString() : null,
  };
}

const patientPopulate = (t: Types.ObjectId) => ({ path: 'patient', select: 'firstName lastName', match: { tenantIds: t } });

/** Claims still in hand (to file, returned, filed), the nearest deadline first. */
export async function listOpenClaims(tenantId: string, filingDays: number): Promise<{ rows: ClaimRow[]; limited: boolean }> {
  const t = new Types.ObjectId(tenantId);
  const rows = await Invoice.find({ tenantId: t, 'philhealth.status': { $in: OPEN }, status: { $ne: 'refunded' } })
    .select('invoiceNumber patient philhealth')
    .populate(patientPopulate(t))
    .sort({ 'philhealth.servedOn': 1 })
    .limit(OPEN_CLAIMS_LIMIT)
    .lean<any[]>();
  const now = new Date();
  return { rows: rows.map((r) => toRow(r, filingDays, now)), limited: rows.length >= OPEN_CLAIMS_LIMIT };
}

/** Claims PhilHealth has answered (paid, part paid, denied), newest answer first, one page at a time. */
export async function listSettledClaims(opts: {
  tenantId: string;
  filingDays: number;
  result: SettledStatus | null;
  search: string;
  page: number;
  limit: number;
}): Promise<{ rows: ClaimRow[]; total: number }> {
  const t = new Types.ObjectId(opts.tenantId);
  const and: Record<string, unknown>[] = [{ tenantId: t }, { status: { $ne: 'refunded' } }, { 'philhealth.status': opts.result ?? { $in: SETTLED_STATUSES } }];
  const q = opts.search.trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    const digits = q.replace(/\D/g, '');
    const patients = await Patient.find({ tenantIds: t, $or: [{ firstName: rx }, { lastName: rx }] }).select('_id').limit(200).lean<{ _id: Types.ObjectId }[]>();
    and.push({
      $or: [
        { invoiceNumber: rx },
        { 'philhealth.claimNumber': rx },
        { 'philhealth.caseRateCode': rx },
        ...(digits.length >= 4 ? [{ 'philhealth.pin': new RegExp(digits.split('').join('-?')) }] : []),
        ...(patients.length ? [{ patient: { $in: patients.map((p) => p._id) } }] : []),
      ],
    });
  }
  const filter = { $and: and };
  const [rows, total] = await Promise.all([
    Invoice.find(filter)
      .select('invoiceNumber patient philhealth')
      .populate(patientPopulate(t))
      .sort({ 'philhealth.paidAt': -1, 'philhealth.deniedAt': -1, updatedAt: -1, _id: -1 })
      .skip((opts.page - 1) * opts.limit)
      .limit(opts.limit)
      .lean<any[]>(),
    Invoice.countDocuments(filter),
  ]);
  const now = new Date();
  return { rows: rows.map((r) => toRow(r, opts.filingDays, now)), total };
}

/**
 * The page's three answers, from every claim: what is still to file and how close the deadline
 * is, what PhilHealth hasn't paid and for how long, and what was settled in the last 90 days.
 */
export async function philhealthInsights(tenantId: string, filingDays: number): Promise<PhilhealthInsights> {
  const t = new Types.ObjectId(tenantId);
  const now = new Date();
  const since = new Date(now.getTime() - 90 * DAY);
  const [open, settled] = await Promise.all([
    Invoice.find({ tenantId: t, 'philhealth.status': { $in: OPEN }, status: { $ne: 'refunded' } })
      .select('philhealth.status philhealth.servedOn philhealth.returnedAt philhealth.filedAt philhealth.amount')
      .lean<any[]>(),
    Invoice.aggregate([
      { $match: { tenantId: t, status: { $ne: 'refunded' }, 'philhealth.status': { $in: SETTLED_STATUSES } } },
      { $addFields: { answeredAt: { $ifNull: ['$philhealth.paidAt', { $ifNull: ['$philhealth.deniedAt', '$updatedAt'] }] } } },
      { $match: { answeredAt: { $gte: since } } },
      {
        $group: {
          _id: '$philhealth.status',
          n: { $sum: 1 },
          amount: { $sum: { $ifNull: ['$philhealth.amount', 0] } },
          paid: { $sum: { $ifNull: ['$philhealth.paidAmount', 0] } },
          withheld: { $sum: { $ifNull: ['$philhealth.withheldAmount', 0] } },
          // Days from filing to payment, weighted by what was paid.
          weighted: {
            $sum: {
              $cond: [
                { $and: [{ $ne: [{ $ifNull: ['$philhealth.filedAt', null] }, null] }, { $ne: [{ $ifNull: ['$philhealth.paidAt', null] }, null] }] },
                {
                  $multiply: [
                    { $add: [{ $ifNull: ['$philhealth.paidAmount', 0] }, { $ifNull: ['$philhealth.withheldAmount', 0] }] },
                    { $max: [0, { $divide: [{ $subtract: ['$philhealth.paidAt', '$philhealth.filedAt'] }, DAY] }] },
                  ],
                },
                0,
              ],
            },
          },
          weight: {
            $sum: {
              $cond: [
                { $and: [{ $ne: [{ $ifNull: ['$philhealth.filedAt', null] }, null] }, { $ne: [{ $ifNull: ['$philhealth.paidAt', null] }, null] }] },
                { $add: [{ $ifNull: ['$philhealth.paidAmount', 0] }, { $ifNull: ['$philhealth.withheldAmount', 0] }] },
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const deadlines = new Map<DeadlineKey, { count: number; amount: number }>(DEADLINES.map((d) => [d.key, { count: 0, amount: 0 }]));
  const waits = new Map<WaitKey, { count: number; amount: number }>(WAITS.map((w) => [w.key, { count: 0, amount: 0 }]));
  const toFile = { count: 0, amount: 0, returned: 0 };
  const filed = { count: 0, amount: 0 };
  for (const r of open) {
    const ph = r.philhealth;
    const amount = Number(ph.amount) || 0;
    if (ph.status === 'filed') {
      filed.count += 1;
      filed.amount += amount;
      const days = Math.max(0, Math.floor((now.getTime() - new Date(ph.filedAt ?? now).getTime()) / DAY));
      const w = waits.get(waitOf(days))!;
      w.count += 1;
      w.amount += amount;
    } else {
      toFile.count += 1;
      toFile.amount += amount;
      if (ph.status === 'returned') toFile.returned += 1;
      const d = deadlines.get(deadlineOf(daysLeftToFile(ph, filingDays, now)))!;
      d.count += 1;
      d.amount += amount;
    }
  }

  const s = new Map((settled as { _id: string; n: number; amount: number; paid: number; withheld: number; weighted: number; weight: number }[]).map((x) => [x._id, x]));
  const full = s.get('paid');
  const part = s.get('part_paid');
  const denied = s.get('denied');
  const sum = (k: 'n' | 'amount' | 'paid' | 'withheld' | 'weighted' | 'weight') => (full?.[k] ?? 0) + (part?.[k] ?? 0);
  return {
    filingDays,
    toFile: { ...toFile, amount: roundMoney(toFile.amount), deadlines: DEADLINES.map((d) => ({ key: d.key, count: deadlines.get(d.key)!.count, amount: roundMoney(deadlines.get(d.key)!.amount) })) },
    filed: { ...filed, amount: roundMoney(filed.amount), waits: WAITS.map((w) => ({ key: w.key, count: waits.get(w.key)!.count, amount: roundMoney(waits.get(w.key)!.amount) })) },
    settled90: {
      paid: sum('n'),
      paidAmount: roundMoney(sum('paid') + sum('withheld')),
      withheld: roundMoney(sum('withheld')),
      daysToPay: sum('weight') > 0 ? Math.round(sum('weighted') / sum('weight')) : null,
      partPaid: part?.n ?? 0,
      shortAmount: roundMoney(Math.max(0, (part?.amount ?? 0) - (part?.paid ?? 0) - (part?.withheld ?? 0))),
      denied: denied?.n ?? 0,
      deniedAmount: roundMoney(denied?.amount ?? 0),
    },
  };
}

/** Claims for the CSV download, newest visit first. */
export async function exportClaims(tenantId: string, filingDays: number, limit = 10_000): Promise<ClaimRow[]> {
  const t = new Types.ObjectId(tenantId);
  const rows = await Invoice.find({ tenantId: t, philhealth: { $exists: true }, status: { $ne: 'refunded' } })
    .select('invoiceNumber patient philhealth')
    .populate(patientPopulate(t))
    .sort({ 'philhealth.servedOn': -1 })
    .limit(limit)
    .lean<any[]>();
  const now = new Date();
  return rows.map((r) => toRow(r, filingDays, now));
}
