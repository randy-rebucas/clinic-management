import 'server-only';
import { Types } from 'mongoose';
import Invoice from '@/models/Invoice';
import Hmo from '@/models/Hmo';
import HmoClaimBatch, { type IClaimLine, type IHmoClaimBatch } from '@/models/HmoClaimBatch';
import { nextSequence, formatCode } from '@/lib/counters';
import { roundMoney } from '@/lib/invoice-totals';
import { escapeRegex } from '@/lib/api/validate';
import {
  OWED_AGING,
  WAITING_STATUSES,
  claimProblem,
  dueDate,
  owedAgingOf,
  suggestedWithholding,
  type BatchRow,
  type BatchShow,
  type DraftRef,
  type HmoInsights,
  type OpenClaim,
  type OwedAgingKey,
} from '@/lib/hmo';
import { recordInvoicePayments, PAYMENT_EPSILON } from '@/lib/invoice-payments';

export type { OpenClaim };

const DAY = 86_400_000;
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

/** At most this many claims to send are listed; the insights count all of them. */
export const OPEN_CLAIMS_LIMIT = 1000;

/** Claims billed to a payer and not yet sent in a transmittal, oldest first. */
export async function listOpenClaims(tenantId: string): Promise<OpenClaim[]> {
  const t = oid(tenantId);
  const [invoices, hmos] = await Promise.all([
    Invoice.find(openClaimFilter(t))
      .select('invoiceNumber createdAt patient total outstandingBalance insurance')
      .populate({ path: 'patient', select: 'firstName lastName', match: { tenantIds: t } })
      .sort({ createdAt: 1 })
      .limit(OPEN_CLAIMS_LIMIT)
      .lean<any[]>(),
    Hmo.find({ tenantId: t }).select('requiresLoa').lean<{ _id: Types.ObjectId; requiresLoa: boolean }[]>(),
  ]);
  const byId = new Map(hmos.map((h) => [String(h._id), h]));
  return invoices.map((inv) => {
    // A payer id that no longer matches the directory is treated as not on the list.
    const hmo = inv.insurance?.hmo ? byId.get(String(inv.insurance.hmo)) ?? null : null;
    const hmoId = hmo ? String(hmo._id) : null;
    const amount = claimAmount(inv);
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
      problem: hmoId ? claimProblem({ loaNumber: inv.insurance?.loaNumber, amount }, hmo) : 'Its payer isn’t on the HMO list yet.',
    };
  });
}

/** Drafts not yet sent, one per payer at most in practice: claims can be added to them. */
export async function listDrafts(tenantId: string): Promise<DraftRef[]> {
  const drafts = await HmoClaimBatch.find({ tenantId: oid(tenantId), status: 'draft' })
    .select('hmo batchNumber claims.invoice')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean<any[]>();
  return drafts.map((d) => ({ _id: String(d._id), hmoId: String(d.hmo), batchNumber: d.batchNumber, claims: d.claims.length }));
}

/**
 * Claims whose payer isn't on the HMO list (typed on the invoice) are linked to a payer that is,
 * so they can be sent. Matches the typed name exactly, ignoring case and spaces at the ends.
 */
export async function linkUnlistedClaims(tenantId: string, provider: string, hmoId: string): Promise<{ ok: true; linked: number } | Fail> {
  const t = oid(tenantId);
  const hmo = await Hmo.findOne({ _id: oid(hmoId), tenantId: t }).select('name').lean<{ _id: Types.ObjectId; name: string } | null>();
  if (!hmo) return { ok: false, status: 404, error: 'HMO not found' };
  const known = await Hmo.find({ tenantId: t }).distinct('_id');
  const res = await Invoice.updateMany(
    {
      ...openClaimFilter(t),
      'insurance.provider': new RegExp(`^\\s*${escapeRegex(provider.trim())}\\s*$`, 'i'),
      'insurance.hmo': { $nin: known },
    },
    { $set: { 'insurance.hmo': hmo._id, 'insurance.provider': hmo.name } }
  );
  return { ok: true, linked: res.modifiedCount };
}

type Fail = { ok: false; status: number; error: string };

/** The claim lines for invoices to one payer, or the first reason one can't be claimed. */
async function claimLines(t: Types.ObjectId, hmo: any, invoiceIds: Types.ObjectId[]): Promise<{ ok: true; lines: IClaimLine[] } | Fail> {
  const invoices = await Invoice.find({ ...openClaimFilter(t), _id: { $in: invoiceIds }, 'insurance.hmo': hmo._id })
    .select('invoiceNumber patient total outstandingBalance professionalFee subtotal tax taxBreakdown insurance')
    .populate({ path: 'patient', select: 'firstName lastName', match: { tenantIds: t } })
    .lean<any[]>();
  if (invoices.length !== invoiceIds.length) {
    return { ok: false, status: 409, error: 'Some of those claims were already sent, paid, or billed to another HMO. Reload and choose again.' };
  }
  const lines: IClaimLine[] = [];
  for (const inv of invoices) {
    const amount = claimAmount(inv);
    const problem = claimProblem({ loaNumber: inv.insurance?.loaNumber, amount }, hmo);
    if (problem) return { ok: false, status: 400, error: `${inv.invoiceNumber}: ${problem}` };
    lines.push({
      invoice: inv._id,
      invoiceNumber: inv.invoiceNumber,
      patientName: inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName}`.trim() : '',
      memberId: inv.insurance?.memberId,
      loaNumber: inv.insurance?.loaNumber,
      amount,
      paid: 0,
      withheld: 0,
      suggestedWithheld: withholdingOn(inv, amount, hmo),
      status: 'pending',
    });
  }
  return { ok: true, lines };
}

/** The tax a payer is likely to withhold on `amount` of this bill, at the payer's rates. */
function withholdingOn(inv: any, amount: number, rates: { withholdingServicesRate: number; withholdingProfessionalRate: number }): number {
  const total = Number(inv.total) || 0;
  const gross = (Number(inv.subtotal) || 0) + (Number(inv.professionalFee) || 0);
  const vat = Number(inv.taxBreakdown?.vatAmount) || 0;
  return suggestedWithholding({
    amount,
    pfShare: gross > 0 ? (Number(inv.professionalFee) || 0) / gross : 0,
    netFactor: total > 0 && vat > 0 ? (total - vat) / total : 1,
    servicesRate: Number(rates.withholdingServicesRate) || 0,
    professionalRate: Number(rates.withholdingProfessionalRate) || 0,
  });
}

/** Mark invoices as claimed by a transmittal; false (and nothing kept) if another got one first. */
async function claimInvoices(t: Types.ObjectId, batchId: Types.ObjectId, ids: Types.ObjectId[]): Promise<boolean> {
  const res = await Invoice.updateMany({ _id: { $in: ids }, tenantId: t, 'insurance.batch': { $exists: false } }, { $set: { 'insurance.batch': batchId } });
  if (res.modifiedCount === ids.length) return true;
  await Invoice.updateMany({ _id: { $in: ids }, tenantId: t, 'insurance.batch': batchId }, { $unset: { 'insurance.batch': 1 } });
  return false;
}

/** Put claims to one HMO into a new draft transmittal. Each invoice is claimed once, atomically. */
export async function createBatch(opts: { tenantId: string; hmoId: string; invoiceIds: string[]; userId: string }): Promise<{ ok: true; batchId: string } | Fail> {
  const t = oid(opts.tenantId);
  const hmo = await Hmo.findOne({ _id: oid(opts.hmoId), tenantId: t }).lean<any>();
  if (!hmo) return { ok: false, status: 404, error: 'HMO not found' };
  const ids = [...new Set(opts.invoiceIds)].map(oid);
  const built = await claimLines(t, hmo, ids);
  if (!built.ok) return built;

  const seq = await nextSequence(opts.tenantId, 'hmo-batch');
  const batch = await HmoClaimBatch.create({
    tenantId: t,
    hmo: hmo._id,
    hmoName: hmo.name,
    batchNumber: formatCode('TR', seq),
    status: 'draft',
    claims: built.lines,
    totalClaimed: roundMoney(built.lines.reduce((s, l) => s + l.amount, 0)),
    createdBy: oid(opts.userId),
  });

  if (!(await claimInvoices(t, batch._id as Types.ObjectId, ids))) {
    await HmoClaimBatch.deleteOne({ _id: batch._id });
    return { ok: false, status: 409, error: 'Another transmittal took some of these claims at the same moment. Reload and choose again.' };
  }
  return { ok: true, batchId: String(batch._id) };
}

/** Add claims to a draft transmittal to the same payer. */
export async function addClaims(tenantId: string, batchId: string, invoiceIds: string[]): Promise<{ ok: true; added: number } | Fail> {
  const t = oid(tenantId);
  const batch = await HmoClaimBatch.findOne({ _id: oid(batchId), tenantId: t });
  if (!batch) return { ok: false, status: 404, error: 'Transmittal not found' };
  if (batch.status !== 'draft') return { ok: false, status: 409, error: 'This transmittal has been sent; put these claims in a new one.' };
  const hmo = await Hmo.findOne({ _id: batch.hmo, tenantId: t }).lean<any>();
  if (!hmo) return { ok: false, status: 404, error: 'HMO not found' };
  const ids = [...new Set(invoiceIds)].map(oid).filter((id) => !batch.claims.some((c) => String(c.invoice) === String(id)));
  if (!ids.length) return { ok: true, added: 0 };
  const built = await claimLines(t, hmo, ids);
  if (!built.ok) return built;
  if (!(await claimInvoices(t, batch._id as Types.ObjectId, ids))) {
    return { ok: false, status: 409, error: 'Another transmittal took some of these claims at the same moment. Reload and choose again.' };
  }
  batch.claims.push(...built.lines);
  batch.totalClaimed = roundMoney(batch.claims.reduce((s, l) => s + l.amount, 0));
  await batch.save();
  return { ok: true, added: ids.length };
}

/**
 * Mark a draft as sent to the HMO: dated, with the date payment is due by the HMO's terms.
 * Refused while a claim no longer matches its bill (refunded, or paid since by someone else),
 * so the payer is never sent a claim the clinic can't take payment on.
 */
export async function submitBatch(tenantId: string, batchId: string): Promise<{ ok: true } | Fail> {
  const t = oid(tenantId);
  const batch = await HmoClaimBatch.findOne({ _id: oid(batchId), tenantId: t });
  if (!batch) return { ok: false, status: 404, error: 'Transmittal not found' };
  if (batch.status !== 'draft') return { ok: false, status: 409, error: 'This transmittal has already been sent.' };
  if (!batch.claims.length) return { ok: false, status: 400, error: 'There are no claims in this transmittal.' };
  const states = await claimInvoiceStates(t, batch.claims);
  const stale = batch.claims.filter((c) => states[String(c.invoice)]?.problem);
  if (stale.length) {
    return {
      ok: false,
      status: 409,
      error: `Take out ${stale.map((c) => c.invoiceNumber).join(', ')} first: ${states[String(stale[0].invoice)]!.problem!.toLowerCase()}`,
    };
  }
  const hmo = await Hmo.findOne({ _id: batch.hmo, tenantId: t }).select('paymentTermsDays').lean<{ paymentTermsDays: number } | null>();
  const now = new Date();
  batch.status = 'submitted';
  batch.submittedAt = now;
  batch.dueAt = dueDate(now, hmo?.paymentTermsDays ?? 30);
  await batch.save();
  await Invoice.updateMany({ tenantId: t, 'insurance.batch': batch._id }, { $set: { 'insurance.submittedAt': now } });
  return { ok: true };
}

export interface ClaimInvoiceState {
  /** What is still owed on the bill now. */
  balance: number;
  status: string;
  /** Why the claim can't be paid as it stands, in words; null when it can. */
  problem: string | null;
  /**
   * The tax the payer is likely to withhold on what is left of a waiting claim, at the payer's
   * rates today (null when no rates were given or the claim isn't waiting).
   */
  suggestedWithheld: number | null;
}

/**
 * Each claim's bill as it is now: a claim waiting on more than the bill still owes can't be
 * posted. With the payer's `rates`, also what it is likely to withhold on the rest of each claim.
 */
export async function claimInvoiceStates(
  t: Types.ObjectId,
  claims: Pick<IClaimLine, 'invoice' | 'amount' | 'paid' | 'withheld' | 'status'>[],
  rates?: { withholdingServicesRate: number; withholdingProfessionalRate: number } | null
): Promise<Record<string, ClaimInvoiceState>> {
  const invoices = await Invoice.find({ tenantId: t, _id: { $in: claims.map((c) => c.invoice) } })
    .select('status total outstandingBalance subtotal professionalFee taxBreakdown.vatAmount')
    .lean<any[]>();
  const byId = new Map(invoices.map((i) => [String(i._id), i]));
  const out: Record<string, ClaimInvoiceState> = {};
  for (const c of claims) {
    const inv = byId.get(String(c.invoice));
    if (!inv) {
      out[String(c.invoice)] = { balance: 0, status: 'missing', problem: 'The invoice is no longer on file.', suggestedWithheld: null };
      continue;
    }
    const balance = roundMoney(Number(inv.outstandingBalance ?? inv.total) || 0);
    const left = roundMoney(c.amount - c.paid - c.withheld);
    let problem: string | null = null;
    if (c.status === 'pending') {
      if (inv.status === 'refunded') problem = 'The invoice was refunded.';
      else if (balance + PAYMENT_EPSILON < left) problem = balance <= 0 ? 'The invoice has since been paid in full.' : `The invoice now owes only ${balance.toFixed(2)}.`;
    }
    const suggestedWithheld = rates && c.status === 'pending' ? Math.min(withholdingOn(inv, c.amount, rates), Math.max(0, left)) : null;
    out[String(c.invoice)] = { balance, status: inv.status, problem, suggestedWithheld };
  }
  return out;
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

/** Throw a draft away: every claim goes back to the claims still to send. */
export async function discardDraft(tenantId: string, batchId: string): Promise<{ ok: true; claims: number } | Fail> {
  const t = oid(tenantId);
  const batch = await HmoClaimBatch.findOne({ _id: oid(batchId), tenantId: t }).select('status claims.invoice').lean<any>();
  if (!batch) return { ok: false, status: 404, error: 'Transmittal not found' };
  if (batch.status !== 'draft') return { ok: false, status: 409, error: 'A transmittal that has been sent can’t be thrown away; close it instead.' };
  await Invoice.updateMany({ tenantId: t, 'insurance.batch': batch._id }, { $unset: { 'insurance.batch': 1 } });
  await HmoClaimBatch.deleteOne({ _id: batch._id, status: 'draft' });
  return { ok: true, claims: batch.claims.length };
}

/**
 * Why an invoice's amounts can't change or it can't be refunded right now: its claim is in a
 * transmittal and the payer hasn't answered. Null when nothing holds it.
 */
export async function claimHold(tenantId: string | Types.ObjectId, invoice: { _id: unknown; insurance?: { batch?: unknown } | null }, doing: 'change' | 'refund'): Promise<string | null> {
  if (!invoice.insurance?.batch) return null;
  const batch = await HmoClaimBatch.findOne({ _id: oid(String(invoice.insurance.batch)), tenantId: oid(String(tenantId)) })
    .select('batchNumber hmoName status claims.invoice claims.status')
    .lean<any>();
  if (!batch) return null;
  const line = batch.claims.find((c: any) => String(c.invoice) === String(invoice._id));
  if (!line || line.status !== 'pending') return null;
  const verb = doing === 'refund' ? 'refund it' : 'change its amounts';
  if (batch.status === 'draft') {
    return `This bill is in draft transmittal ${batch.batchNumber} to ${batch.hmoName}. Take it out of the transmittal first, then ${verb}.`;
  }
  if (!WAITING_STATUSES.includes(batch.status)) return null;
  return `This bill was sent to ${batch.hmoName} in transmittal ${batch.batchNumber}. Record their answer there first (paid or refused), then ${verb}.`;
}

/** How long one posting may hold a transmittal before another can take it (a crashed request). */
const POSTING_LEASE_MS = 120_000;
const BUSY_ERROR = 'Someone else is recording a payment on this transmittal or closing it right now. Wait a moment, reload, and check it before posting again.';

/**
 * Take a transmittal for one remittance or close at a time. Each writes the whole claims list
 * back, so two at once would overwrite each other's lines while both payments stayed on the
 * bills. Released by `releasePosting` (or by saving with `postingSince` cleared).
 */
async function takeForPosting(t: Types.ObjectId, batchId: string): Promise<{ ok: true; batch: IHmoClaimBatch } | Fail> {
  const batch = await HmoClaimBatch.findOneAndUpdate(
    { _id: oid(batchId), tenantId: t, $or: [{ postingSince: null }, { postingSince: { $lt: new Date(Date.now() - POSTING_LEASE_MS) } }] },
    { $set: { postingSince: new Date() } },
    { new: true }
  );
  if (batch) return { ok: true, batch };
  const exists = await HmoClaimBatch.exists({ _id: oid(batchId), tenantId: t });
  return exists ? { ok: false, status: 409, error: BUSY_ERROR } : { ok: false, status: 404, error: 'Transmittal not found' };
}

const releasePosting = (batch: { _id: unknown }) => HmoClaimBatch.updateOne({ _id: batch._id }, { $unset: { postingSince: 1 } });

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
  const taken = await takeForPosting(t, opts.batchId);
  if (!taken.ok) return taken;
  const batch = taken.batch;
  let saved = false;
  try {
    const r = await postRemittance(t, batch, opts);
    if (r.ok) saved = true;
    return r;
  } finally {
    if (!saved) await releasePosting(batch);
  }
}

async function postRemittance(
  t: Types.ObjectId,
  batch: IHmoClaimBatch,
  opts: Parameters<typeof recordRemittance>[0]
): Promise<{ ok: true; posted: number; failed: { invoiceNumber: string; error: string }[] } | Fail> {
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
  batch.postingSince = null;
  batch.markModified('claims');
  await batch.save();
  return { ok: true, posted, failed };
}

/** Close a transmittal by hand (e.g. the HMO won't pay the rest); open claims go back to the patient. */
export async function closeBatch(tenantId: string, batchId: string): Promise<{ ok: true } | Fail> {
  const t = oid(tenantId);
  const taken = await takeForPosting(t, batchId);
  if (!taken.ok) return taken;
  const batch = taken.batch;
  let saved = false;
  try {
    const r = await closeTaken(t, batch);
    if (r.ok) saved = true;
    return r;
  } finally {
    if (!saved) await releasePosting(batch);
  }
}

async function closeTaken(t: Types.ObjectId, batch: IHmoClaimBatch): Promise<{ ok: true } | Fail> {
  if (batch.status === 'draft') return { ok: false, status: 409, error: 'Throw a draft away instead; it was never sent.' };
  if (batch.status === 'closed') return { ok: false, status: 409, error: 'This transmittal is already closed.' };
  for (const c of batch.claims) {
    if (c.status !== 'pending') continue;
    if (c.paid + c.withheld > 0) {
      // The payer's part is over: the claim is no longer open, and the rest stays on the bill.
      c.status = 'short_paid';
      c.denialReason = c.denialReason || 'Transmittal closed with the rest unpaid';
      await Invoice.updateOne({ _id: c.invoice, tenantId: t }, { $set: { 'insurance.status': 'paid', 'insurance.denialReason': c.denialReason } });
    } else {
      c.status = 'denied';
      c.denialReason = c.denialReason || 'Transmittal closed unpaid';
      await Invoice.updateOne({ _id: c.invoice, tenantId: t }, { $set: { 'insurance.status': 'rejected', 'insurance.denialReason': c.denialReason } });
    }
  }
  batch.status = 'closed';
  batch.postingSince = null;
  batch.markModified('claims');
  await batch.save();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The claims page
// ---------------------------------------------------------------------------

const outstandingOf = (claims: any[]) =>
  roundMoney(claims.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amount - (c.paid || 0) - (c.withheld || 0), 0));

/** The submittedAt range for transmittals sent between minDays and maxDays ago. */
function sentRange(key: OwedAgingKey, now: Date) {
  const b = OWED_AGING.find((a) => a.key === key)!;
  const range: { $lte?: Date; $gt?: Date } = {};
  if (b.minDays > 0) range.$lte = new Date(now.getTime() - b.minDays * DAY);
  if (b.maxDays !== null) range.$gt = new Date(now.getTime() - (b.maxDays + 1) * DAY);
  return range;
}

/** Transmittals, one page at a time. Waiting views list the oldest sent first. */
export async function listBatches(opts: {
  tenantId: string;
  show: BatchShow | null;
  hmo: string | null;
  aging: OwedAgingKey | null;
  search: string;
  page: number;
  limit: number;
}): Promise<{ rows: BatchRow[]; total: number }> {
  const t = oid(opts.tenantId);
  const now = new Date();
  const and: Record<string, unknown>[] = [{ tenantId: t }];
  if (opts.show === 'waiting' || opts.show === 'overdue' || opts.aging) and.push({ status: { $in: WAITING_STATUSES } });
  if (opts.show === 'overdue') and.push({ dueAt: { $lt: now } });
  if (opts.show === 'draft') and.push({ status: 'draft' });
  if (opts.show === 'done') and.push({ status: { $in: ['paid', 'closed'] } });
  if (opts.aging) and.push({ submittedAt: sentRange(opts.aging, now) });
  if (opts.hmo) and.push({ hmo: oid(opts.hmo) });
  const q = opts.search.trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    and.push({ $or: [{ batchNumber: rx }, { hmoName: rx }, { 'claims.patientName': rx }, { 'claims.invoiceNumber': rx }, { 'claims.loaNumber': rx }] });
  }
  const filter = { $and: and };
  const waitingView = opts.show === 'waiting' || opts.show === 'overdue' || Boolean(opts.aging);
  const [batches, total] = await Promise.all([
    HmoClaimBatch.find(filter)
      .select('hmo hmoName batchNumber status totalClaimed submittedAt dueAt createdAt claims.paid claims.withheld claims.status claims.amount')
      .sort(waitingView ? { submittedAt: 1, _id: 1 } : { createdAt: -1, _id: -1 })
      .skip((opts.page - 1) * opts.limit)
      .limit(opts.limit)
      .lean<any[]>(),
    HmoClaimBatch.countDocuments(filter),
  ]);
  return {
    total,
    rows: batches.map((b) => ({
      _id: String(b._id),
      hmoId: String(b.hmo),
      hmoName: b.hmoName,
      batchNumber: b.batchNumber,
      status: b.status,
      claims: b.claims.length,
      refused: b.claims.filter((c: any) => c.status === 'denied' || c.status === 'short_paid').length,
      totalClaimed: b.totalClaimed,
      received: roundMoney(b.claims.reduce((s: number, c: any) => s + (c.paid || 0) + (c.withheld || 0), 0)),
      outstanding: outstandingOf(b.claims),
      submittedAt: b.submittedAt ? new Date(b.submittedAt).toISOString() : null,
      dueAt: b.dueAt ? new Date(b.dueAt).toISOString() : null,
      overdue: Boolean(b.dueAt && WAITING_STATUSES.includes(b.status) && new Date(b.dueAt).getTime() < now.getTime()),
      createdAt: new Date(b.createdAt).toISOString(),
    })),
  };
}

/**
 * The three answers the claims page opens with, from every record (never one page of them):
 * what is still to send, what payers owe and how late, and how each payer is doing.
 */
export async function hmoInsights(tenantId: string): Promise<HmoInsights> {
  const t = oid(tenantId);
  const now = new Date();
  const yearAgo = new Date(now.getTime() - 365 * DAY);
  const monthAgo = new Date(now.getTime() - 30 * DAY);

  const [toSendRows, waiting, drafts, paidRows, hmos] = await Promise.all([
    Invoice.aggregate([
      { $match: openClaimFilter(t) },
      {
        $lookup: {
          from: 'hmos',
          localField: 'insurance.hmo',
          foreignField: '_id',
          as: 'h',
          pipeline: [{ $match: { tenantId: t } }, { $project: { requiresLoa: 1 } }],
        },
      },
      { $addFields: { payer: { $first: '$h' }, owed: { $max: [0, { $round: [{ $ifNull: ['$outstandingBalance', '$total'] }, 2] }] }, covered: { $ifNull: ['$insurance.coverageAmount', 0] } } },
      { $addFields: { amount: { $cond: [{ $gt: ['$covered', 0] }, { $min: ['$covered', '$owed'] }, '$owed'] } } },
      {
        $addFields: {
          problem: {
            $switch: {
              branches: [
                { case: { $eq: [{ $ifNull: ['$payer._id', null] }, null] }, then: 'unlisted' },
                { case: { $lte: ['$amount', 0] }, then: 'nothing' },
                {
                  case: { $and: [{ $eq: ['$payer.requiresLoa', true] }, { $eq: [{ $trim: { input: { $ifNull: ['$insurance.loaNumber', ''] } } }, ''] }] },
                  then: 'loa',
                },
              ],
              default: 'ready',
            },
          },
        },
      },
      { $group: { _id: { hmo: '$payer._id', problem: '$problem' }, n: { $sum: 1 }, amount: { $sum: '$amount' }, oldest: { $min: '$createdAt' } } },
    ]),
    HmoClaimBatch.find({ tenantId: t, status: { $in: WAITING_STATUSES } })
      .select('hmo submittedAt dueAt claims.amount claims.paid claims.withheld claims.status')
      .lean<any[]>(),
    HmoClaimBatch.countDocuments({ tenantId: t, status: 'draft' }),
    HmoClaimBatch.aggregate([
      { $match: { tenantId: t, submittedAt: { $exists: true }, 'remittances.date': { $gte: yearAgo } } },
      { $unwind: '$remittances' },
      { $match: { 'remittances.date': { $gte: yearAgo } } },
      {
        $project: {
          hmo: 1,
          date: '$remittances.date',
          net: '$remittances.net',
          withheld: '$remittances.withheld',
          amount: { $add: [{ $ifNull: ['$remittances.net', 0] }, { $ifNull: ['$remittances.withheld', 0] }] },
          days: { $max: [0, { $divide: [{ $subtract: ['$remittances.date', '$submittedAt'] }, DAY] }] },
        },
      },
      {
        $group: {
          _id: '$hmo',
          weighted: { $sum: { $multiply: ['$amount', '$days'] } },
          amount: { $sum: '$amount' },
          net30: { $sum: { $cond: [{ $gte: ['$date', monthAgo] }, '$net', 0] } },
          withheld30: { $sum: { $cond: [{ $gte: ['$date', monthAgo] }, '$withheld', 0] } },
        },
      },
    ]),
    Hmo.find({ tenantId: t }).select('name active paymentTermsDays').lean<{ _id: Types.ObjectId; name: string; active: boolean; paymentTermsDays: number }[]>(),
  ]);

  const toSend: HmoInsights['toSend'] = { count: 0, amount: 0, ready: 0, readyAmount: 0, needLoa: 0, unlisted: 0, oldestAt: null };
  const perHmo = new Map<string, { owed: number; pastDue: number; toSend: number; toSendAmount: number; daysToPay: number | null }>();
  const slot = (id: string) => {
    let s = perHmo.get(id);
    if (!s) perHmo.set(id, (s = { owed: 0, pastDue: 0, toSend: 0, toSendAmount: 0, daysToPay: null }));
    return s;
  };
  let oldest: Date | null = null;
  for (const r of toSendRows as { _id: { hmo?: Types.ObjectId; problem: string }; n: number; amount: number; oldest: Date }[]) {
    toSend.count += r.n;
    toSend.amount += r.amount;
    if (r._id.problem === 'ready') {
      toSend.ready += r.n;
      toSend.readyAmount += r.amount;
    } else if (r._id.problem === 'loa') toSend.needLoa += r.n;
    else if (r._id.problem === 'unlisted') toSend.unlisted += r.n;
    if (!oldest || r.oldest < oldest) oldest = r.oldest;
    if (r._id.hmo) {
      const s = slot(String(r._id.hmo));
      s.toSend += r.n;
      s.toSendAmount += r.amount;
    }
  }
  toSend.amount = roundMoney(toSend.amount);
  toSend.readyAmount = roundMoney(toSend.readyAmount);
  toSend.oldestAt = oldest ? new Date(oldest).toISOString() : null;

  const aging = new Map<OwedAgingKey, { amount: number; batches: number }>(OWED_AGING.map((a) => [a.key, { amount: 0, batches: 0 }]));
  const owed: HmoInsights['owed'] = { amount: 0, batches: 0, pastDue: { amount: 0, batches: 0 }, aging: [] };
  for (const b of waiting) {
    const out = outstandingOf(b.claims);
    if (out <= 0) continue;
    owed.amount += out;
    owed.batches += 1;
    const days = Math.max(0, Math.floor((now.getTime() - new Date(b.submittedAt ?? now).getTime()) / DAY));
    const a = aging.get(owedAgingOf(days))!;
    a.amount += out;
    a.batches += 1;
    const late = Boolean(b.dueAt && new Date(b.dueAt) < now);
    if (late) {
      owed.pastDue.amount += out;
      owed.pastDue.batches += 1;
    }
    const s = slot(String(b.hmo));
    s.owed += out;
    if (late) s.pastDue += out;
  }
  owed.amount = roundMoney(owed.amount);
  owed.pastDue.amount = roundMoney(owed.pastDue.amount);
  owed.aging = OWED_AGING.map((a) => ({ key: a.key, amount: roundMoney(aging.get(a.key)!.amount), batches: aging.get(a.key)!.batches }));

  const received30 = { amount: 0, withheld: 0 };
  for (const p of paidRows as { _id: Types.ObjectId; weighted: number; amount: number; net30: number; withheld30: number }[]) {
    received30.amount += p.net30 + p.withheld30;
    received30.withheld += p.withheld30;
    if (p.amount > 0) slot(String(p._id)).daysToPay = Math.round(p.weighted / p.amount);
  }

  const byHmo: HmoInsights['byHmo'] = hmos
    .filter((h) => perHmo.has(String(h._id)))
    .map((h) => {
      const s = perHmo.get(String(h._id))!;
      return {
        hmoId: String(h._id),
        name: h.name,
        active: h.active,
        termsDays: h.paymentTermsDays,
        owed: roundMoney(s.owed),
        pastDue: roundMoney(s.pastDue),
        toSend: s.toSend,
        toSendAmount: roundMoney(s.toSendAmount),
        daysToPay: s.daysToPay,
      };
    })
    .sort((a, b) => b.owed - a.owed || b.toSendAmount - a.toSendAmount || a.name.localeCompare(b.name));

  return {
    toSend,
    owed,
    drafts,
    received30: { amount: roundMoney(received30.amount), withheld: roundMoney(received30.withheld) },
    byHmo,
  };
}
