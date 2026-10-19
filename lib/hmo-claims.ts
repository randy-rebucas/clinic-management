import 'server-only';
import { Types } from 'mongoose';
import Invoice from '@/models/Invoice';
import Hmo from '@/models/Hmo';
import HmoClaimBatch, { type IClaimLine } from '@/models/HmoClaimBatch';
import { nextSequence, formatCode } from '@/lib/counters';
import { roundMoney } from '@/lib/invoice-totals';
import { claimProblem, dueDate, suggestedWithholding } from '@/lib/hmo';
import { recordInvoicePayments, PAYMENT_EPSILON } from '@/lib/invoice-payments';

const oid = (v: string | Types.ObjectId) => new Types.ObjectId(String(v));

/** What the payer is asked for: the covered amount (when one was entered) but never more than is still owed. */
function claimAmount(inv: any): number {
  const owed = Math.max(0, roundMoney(Number(inv.outstandingBalance ?? inv.total) || 0));
  const covered = Number(inv.insurance?.coverageAmount) || 0;
  return roundMoney(covered > 0 ? Math.min(covered, owed) : owed);
}

const openClaimFilter = (tenantId: Types.ObjectId) => ({
  tenantId,
  status: { $nin: ['refunded', 'paid'] },
  'insurance.provider': { $nin: [null, ''] },
  'insurance.batch': { $exists: false },
  'insurance.status': { $nin: ['paid', 'rejected'] },
});

export interface OpenClaim {
  invoiceId: string;
  invoiceNumber: string;
  createdAt: string;
  patientName: string;
  provider: string;
  hmoId: string | null;
  memberId: string;
  loaNumber: string;
  amount: number;
  problem: string | null;
}

/** Claims billed to a payer and not yet sent in a transmittal, oldest first. */
export async function listOpenClaims(tenantId: string): Promise<OpenClaim[]> {
  const t = oid(tenantId);
  const [invoices, hmos] = await Promise.all([
    Invoice.find(openClaimFilter(t))
      .select('invoiceNumber createdAt patient total outstandingBalance insurance')
      .populate({ path: 'patient', select: 'firstName lastName', match: { tenantIds: t } })
      .sort({ createdAt: 1 })
      .limit(1000)
      .lean<any[]>(),
    Hmo.find({ tenantId: t }).select('requiresLoa').lean<{ _id: Types.ObjectId; requiresLoa: boolean }[]>(),
  ]);
  const byId = new Map(hmos.map((h) => [String(h._id), h]));
  return invoices.map((inv) => {
    const hmoId = inv.insurance?.hmo ? String(inv.insurance.hmo) : null;
    const amount = claimAmount(inv);
    const hmo = hmoId ? byId.get(hmoId) ?? null : null;
    return {
      invoiceId: String(inv._id),
      invoiceNumber: inv.invoiceNumber,
      createdAt: new Date(inv.createdAt).toISOString(),
      patientName: inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName}`.trim() : 'Patient record unavailable',
      provider: inv.insurance?.provider ?? '',
      hmoId,
      memberId: inv.insurance?.memberId ?? '',
      loaNumber: inv.insurance?.loaNumber ?? '',
      amount,
      problem: hmoId ? claimProblem({ loaNumber: inv.insurance?.loaNumber, amount }, hmo) : 'Pick this payer from the HMO list on the invoice so it can be sent.',
    };
  });
}

type Fail = { ok: false; status: number; error: string };

/** Put claims to one HMO into a new draft transmittal. Each invoice is claimed once, atomically. */
export async function createBatch(opts: { tenantId: string; hmoId: string; invoiceIds: string[]; userId: string }): Promise<{ ok: true; batchId: string } | Fail> {
  const t = oid(opts.tenantId);
  const hmo = await Hmo.findOne({ _id: oid(opts.hmoId), tenantId: t }).lean<any>();
  if (!hmo) return { ok: false, status: 404, error: 'HMO not found' };
  const ids = [...new Set(opts.invoiceIds)].map(oid);
  const invoices = await Invoice.find({ ...openClaimFilter(t), _id: { $in: ids }, 'insurance.hmo': hmo._id })
    .select('invoiceNumber patient total outstandingBalance professionalFee subtotal tax taxBreakdown insurance')
    .populate({ path: 'patient', select: 'firstName lastName', match: { tenantIds: t } })
    .lean<any[]>();
  if (invoices.length !== ids.length) {
    return { ok: false, status: 409, error: 'Some of those claims were already sent, paid, or billed to another HMO. Reload and choose again.' };
  }

  const lines: IClaimLine[] = [];
  for (const inv of invoices) {
    const amount = claimAmount(inv);
    const problem = claimProblem({ loaNumber: inv.insurance?.loaNumber, amount }, hmo);
    if (problem) return { ok: false, status: 400, error: `${inv.invoiceNumber}: ${problem}` };
    const total = Number(inv.total) || 0;
    const gross = (Number(inv.subtotal) || 0) + (Number(inv.professionalFee) || 0);
    const vat = Number(inv.taxBreakdown?.vatAmount) || 0;
    lines.push({
      invoice: inv._id,
      invoiceNumber: inv.invoiceNumber,
      patientName: inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName}`.trim() : '',
      memberId: inv.insurance?.memberId,
      loaNumber: inv.insurance?.loaNumber,
      amount,
      paid: 0,
      withheld: 0,
      suggestedWithheld: suggestedWithholding({
        amount,
        pfShare: gross > 0 ? (Number(inv.professionalFee) || 0) / gross : 0,
        netFactor: total > 0 && vat > 0 ? (total - vat) / total : 1,
        servicesRate: hmo.withholdingServicesRate,
        professionalRate: hmo.withholdingProfessionalRate,
      }),
      status: 'pending',
    });
  }

  const seq = await nextSequence(opts.tenantId, 'hmo-batch');
  const batch = await HmoClaimBatch.create({
    tenantId: t,
    hmo: hmo._id,
    hmoName: hmo.name,
    batchNumber: formatCode('TR', seq),
    status: 'draft',
    claims: lines,
    totalClaimed: roundMoney(lines.reduce((s, l) => s + l.amount, 0)),
    createdBy: oid(opts.userId),
  });

  // Claim the invoices; if another transmittal got one first, undo this one.
  const res = await Invoice.updateMany({ _id: { $in: ids }, tenantId: t, 'insurance.batch': { $exists: false } }, { $set: { 'insurance.batch': batch._id } });
  if (res.modifiedCount !== ids.length) {
    await Invoice.updateMany({ _id: { $in: ids }, tenantId: t, 'insurance.batch': batch._id }, { $unset: { 'insurance.batch': 1 } });
    await HmoClaimBatch.deleteOne({ _id: batch._id });
    return { ok: false, status: 409, error: 'Another transmittal took some of these claims at the same moment. Reload and choose again.' };
  }
  return { ok: true, batchId: String(batch._id) };
}

/** Mark a draft as sent to the HMO: dated, with the date payment is due by the HMO's terms. */
export async function submitBatch(tenantId: string, batchId: string): Promise<{ ok: true } | Fail> {
  const t = oid(tenantId);
  const batch = await HmoClaimBatch.findOne({ _id: oid(batchId), tenantId: t });
  if (!batch) return { ok: false, status: 404, error: 'Transmittal not found' };
  if (batch.status !== 'draft') return { ok: false, status: 409, error: 'This transmittal has already been sent.' };
  if (!batch.claims.length) return { ok: false, status: 400, error: 'There are no claims in this transmittal.' };
  const hmo = await Hmo.findOne({ _id: batch.hmo, tenantId: t }).select('paymentTermsDays').lean<{ paymentTermsDays: number } | null>();
  const now = new Date();
  batch.status = 'submitted';
  batch.submittedAt = now;
  batch.dueAt = dueDate(now, hmo?.paymentTermsDays ?? 30);
  await batch.save();
  await Invoice.updateMany({ tenantId: t, 'insurance.batch': batch._id }, { $set: { 'insurance.submittedAt': now } });
  return { ok: true };
}

/** Take a claim out of a draft, back to the claims still to send. */
export async function removeClaim(tenantId: string, batchId: string, invoiceId: string): Promise<{ ok: true; deleted: boolean } | Fail> {
  const t = oid(tenantId);
  const batch = await HmoClaimBatch.findOne({ _id: oid(batchId), tenantId: t });
  if (!batch) return { ok: false, status: 404, error: 'Transmittal not found' };
  if (batch.status !== 'draft') return { ok: false, status: 409, error: 'Claims can only be taken out before the transmittal is sent.' };
  const before = batch.claims.length;
  batch.claims = batch.claims.filter((c) => String(c.invoice) !== invoiceId);
  if (batch.claims.length === before) return { ok: false, status: 404, error: 'That claim isn’t in this transmittal.' };
  batch.totalClaimed = roundMoney(batch.claims.reduce((s, l) => s + l.amount, 0));
  await Invoice.updateOne({ _id: oid(invoiceId), tenantId: t, 'insurance.batch': batch._id }, { $unset: { 'insurance.batch': 1 } });
  // An empty draft is nothing; it goes, and its number is simply never sent.
  if (!batch.claims.length) await HmoClaimBatch.deleteOne({ _id: batch._id });
  else await batch.save();
  return { ok: true, deleted: !batch.claims.length };
}

export interface RemitLine {
  invoiceId: string;
  /** Money received for this claim, net of withholding. */
  paid: number;
  withheld: number;
  denied?: boolean;
  denialReason?: string;
}

/**
 * Record what the HMO paid against a sent transmittal. Each claim's payment and withheld tax are
 * posted to its invoice as an HMO payment and a creditable-withholding payment, atomically per
 * invoice; a denied claim goes back to the patient to pay. Claims that fail (an invoice changed,
 * or the amount is more than is owed) are reported and left as they were.
 */
export async function recordRemittance(opts: {
  tenantId: string;
  batchId: string;
  userId: string;
  date: Date;
  reference?: string;
  form2307Received: boolean;
  notes?: string;
  lines: RemitLine[];
}): Promise<{ ok: true; posted: number; failed: { invoiceNumber: string; error: string }[] } | Fail> {
  const t = oid(opts.tenantId);
  const batch = await HmoClaimBatch.findOne({ _id: oid(opts.batchId), tenantId: t });
  if (!batch) return { ok: false, status: 404, error: 'Transmittal not found' };
  if (batch.status === 'draft') return { ok: false, status: 409, error: 'Send the transmittal before recording a payment on it.' };
  if (batch.status === 'closed') return { ok: false, status: 409, error: 'This transmittal is closed.' };

  const failed: { invoiceNumber: string; error: string }[] = [];
  let posted = 0;
  let net = 0;
  let withheld = 0;
  const ref = [batch.batchNumber, opts.reference?.trim()].filter(Boolean).join(' · ');

  for (const l of opts.lines) {
    const claim = batch.claims.find((c) => String(c.invoice) === l.invoiceId);
    if (!claim || claim.status === 'paid' || claim.status === 'denied') continue;
    const paid = roundMoney(Math.max(0, l.paid));
    const wht = roundMoney(Math.max(0, l.withheld));

    if (l.denied && paid + wht <= 0) {
      claim.status = 'denied';
      claim.denialReason = l.denialReason?.trim() || undefined;
      await Invoice.updateOne(
        { _id: claim.invoice, tenantId: t },
        { $set: { 'insurance.status': 'rejected', 'insurance.denialReason': claim.denialReason ?? '' } }
      );
      posted += 1;
      continue;
    }
    if (paid + wht <= 0) continue;

    const settled = claim.paid + claim.withheld + paid + wht >= claim.amount - PAYMENT_EPSILON;
    const result = await recordInvoicePayments({
      tenantId: t,
      invoiceId: claim.invoice,
      payments: [
        { method: 'hmo', amount: paid, date: opts.date, referenceNo: ref, processedBy: opts.userId, notes: `${batch.hmoName} transmittal ${batch.batchNumber}` },
        { method: 'cwt', amount: wht, date: opts.date, referenceNo: ref, processedBy: opts.userId, notes: `Withheld by ${batch.hmoName}${opts.form2307Received ? '; Form 2307 received' : '; Form 2307 to follow'}` },
      ],
      alsoSet: {
        'insurance.status': settled || l.denied ? 'paid' : 'approved',
        'insurance.paidAmount': roundMoney(claim.paid + paid),
        'insurance.withheldAmount': roundMoney(claim.withheld + wht),
        ...(l.denied && l.denialReason ? { 'insurance.denialReason': l.denialReason.trim() } : {}),
      },
    });
    if (!result.ok) {
      failed.push({ invoiceNumber: claim.invoiceNumber, error: result.error });
      continue;
    }
    claim.paid = roundMoney(claim.paid + paid);
    claim.withheld = roundMoney(claim.withheld + wht);
    // Paid in part and the rest refused: the patient owes the difference.
    claim.status = settled ? 'paid' : l.denied ? 'short_paid' : 'pending';
    if (l.denied && l.denialReason) claim.denialReason = l.denialReason.trim();
    net += paid;
    withheld += wht;
    posted += 1;
  }

  if (net + withheld > 0) {
    batch.remittances.push({
      date: opts.date,
      reference: opts.reference?.trim() || undefined,
      net: roundMoney(net),
      withheld: roundMoney(withheld),
      form2307Received: opts.form2307Received,
      recordedBy: oid(opts.userId),
      notes: opts.notes?.trim() || undefined,
    });
  }
  const done = batch.claims.every((c) => c.status === 'paid' || c.status === 'denied' || c.status === 'short_paid');
  const any = batch.claims.some((c) => c.paid + c.withheld > 0 || c.status === 'denied');
  batch.status = done ? 'paid' : any ? 'partial' : batch.status;
  batch.markModified('claims');
  await batch.save();
  return { ok: true, posted, failed };
}

/** Close a transmittal by hand (e.g. the HMO won't pay the rest); open claims go back to the patient. */
export async function closeBatch(tenantId: string, batchId: string): Promise<{ ok: true } | Fail> {
  const t = oid(tenantId);
  const batch = await HmoClaimBatch.findOne({ _id: oid(batchId), tenantId: t });
  if (!batch) return { ok: false, status: 404, error: 'Transmittal not found' };
  if (batch.status === 'draft') return { ok: false, status: 409, error: 'Delete a draft by taking its claims out instead.' };
  for (const c of batch.claims) {
    if (c.status === 'pending') {
      c.status = c.paid + c.withheld > 0 ? 'short_paid' : 'denied';
      if (c.status === 'denied') {
        await Invoice.updateOne({ _id: c.invoice, tenantId: t }, { $set: { 'insurance.status': 'rejected', 'insurance.denialReason': 'Transmittal closed unpaid' } });
      }
    }
  }
  batch.status = 'closed';
  batch.markModified('claims');
  await batch.save();
  return { ok: true };
}
