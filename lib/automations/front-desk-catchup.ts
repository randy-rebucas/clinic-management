// End-of-Day Front Desk Catch-up
// Before the clinic closes, one notice to the front desk listing the day's finished visits that
// still need something done: an invoice to make, a payment to record, medicines to hand over.
// Invoices that auto-billing failed to make are made again first, so only real gaps are listed.

import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Invoice from '@/models/Invoice';
import Prescription from '@/models/Prescription';
import { getSettings } from '@/lib/settings';
import { dayRangeOffsetInTz } from '@/lib/tz';
import { Types } from 'mongoose';
import { forEachTenant, automationEnabled, errorMessage, BATCH_LIMIT, type AutomationTenant } from './shared';
import { notifyFrontDesk } from './front-desk';

export const CATCH_UP_SETTING = 'autoFrontDeskCatchUp';
/** Lines shown per section; the rest are counted. */
const MAX_LINES = 10;

export interface CatchUpItem {
  patientName: string;
  visitCode?: string;
  /** No invoice, even after trying again. */
  needsInvoice?: boolean;
  /** An open invoice. */
  invoice?: { number: string; due: number; payer?: string };
  /** Prescriptions with medicines still to give. */
  prescriptions?: string[];
}

export interface CatchUpResult {
  tenants: number;
  visits: number;
  invoicesMade: number;
  needsInvoice: number;
  unpaid: number;
  undispensed: number;
  notified: number;
  errors: string[];
}

const who = (item: CatchUpItem) => (item.visitCode ? `${item.patientName} (${item.visitCode})` : item.patientName);

function section(title: string, lines: string[]): string[] {
  if (!lines.length) return [];
  const shown = lines.slice(0, MAX_LINES).map((l) => `• ${l}`);
  if (lines.length > MAX_LINES) shown.push(`• …and ${lines.length - MAX_LINES} more`);
  return ['', `${title}:`, ...shown];
}

/** The notice's text, or null when nothing is outstanding. */
export function catchUpMessage(items: CatchUpItem[]): string | null {
  const needInvoice = items.filter((i) => i.needsInvoice);
  const unpaid = items.filter((i) => i.invoice);
  const undispensed = items.filter((i) => i.prescriptions?.length);
  const patients = new Set([...needInvoice, ...unpaid, ...undispensed]).size;
  if (!patients) return null;

  return [
    `${patients} patient${patients === 1 ? '' : 's'} seen since yesterday still need${patients === 1 ? 's' : ''} something done at the desk.`,
    ...section('Needs an invoice', needInvoice.map(who)),
    ...section(
      'Payment not recorded',
      unpaid.map((i) => `${who(i)} — ${i.invoice!.number}, ${i.invoice!.due.toFixed(2)} due${i.invoice!.payer ? ` (${i.invoice!.payer} claim: collect only the patient’s share)` : ''}`)
    ),
    ...section('Medicines not handed over', undispensed.map((i) => `${who(i)} — ${i.prescriptions!.join(', ')}`)),
    '',
    'If the patient already paid, open the invoice and record the payment with the date they paid. If they are buying the medicines at a pharmacy, there is nothing to do.',
  ].join('\n');
}

async function catchUpTenant(tenant: AutomationTenant): Promise<Omit<CatchUpResult, 'tenants'>> {
  const result = { visits: 0, invoicesMade: 0, needsInvoice: 0, unpaid: 0, undispensed: 0, notified: 0, errors: [] as string[] };
  const tenantId = tenant.tenantObjectId;
  const now = new Date();
  // Yesterday as well: visits closed after yesterday's run, and a second reminder for what's left.
  const since = dayRangeOffsetInTz(-1, now, tenant.timezone).start;

  const visits = await Visit.find({ tenantId, status: 'closed', date: { $gte: since, $lte: now } })
    .select('visitCode patient date')
    .populate('patient', 'firstName lastName')
    .sort({ date: 1 })
    .limit(BATCH_LIMIT)
    .lean<{ _id: Types.ObjectId; visitCode?: string; patient?: { firstName?: string; lastName?: string } }[]>();
  result.visits = visits.length;
  if (!visits.length) return result;

  const visitIds = visits.map((v) => v._id);
  const [invoices, prescriptions, settings] = await Promise.all([
    Invoice.find({ tenantId, visit: { $in: visitIds } })
      .select('visit invoiceNumber status outstandingBalance insurance.provider philhealth.status')
      .lean<{ visit: Types.ObjectId; invoiceNumber: string; status: string; outstandingBalance?: number; insurance?: { provider?: string }; philhealth?: unknown }[]>(),
    Prescription.find({ tenantId, visit: { $in: visitIds }, status: { $in: ['active', 'partially-dispensed'] } })
      .select('visit prescriptionCode')
      .lean<{ visit: Types.ObjectId; prescriptionCode: string }[]>(),
    getSettings(tenant.tenantId),
  ]);
  const invoiceByVisit = new Map(invoices.map((i) => [String(i.visit), i]));
  const rxByVisit = new Map<string, string[]>();
  for (const rx of prescriptions) rxByVisit.set(String(rx.visit), [...(rxByVisit.get(String(rx.visit)) ?? []), rx.prescriptionCode]);
  const autoBilling = automationEnabled(settings, 'autoInvoiceGeneration');

  const items: CatchUpItem[] = [];
  for (const visit of visits) {
    const key = String(visit._id);
    const item: CatchUpItem = {
      patientName: [visit.patient?.firstName, visit.patient?.lastName].filter(Boolean).join(' ') || 'A patient',
      visitCode: visit.visitCode,
    };

    let invoice = invoiceByVisit.get(key);
    if (!invoice && autoBilling) {
      // The bill made when the visit closed runs after the response and can fail; make it now.
      try {
        const { generateInvoiceForVisit } = await import('./invoice-generation');
        const made = await generateInvoiceForVisit({ visitId: visit._id, tenantId, sendNotification: false, sendEmail: false });
        if (made.success && made.invoice) {
          result.invoicesMade++;
          invoice = made.invoice;
        }
      } catch (error) {
        result.errors.push(`Visit ${key}: ${errorMessage(error)}`);
      }
    }
    if (!invoice) item.needsInvoice = true;
    else if (invoice.status === 'unpaid' || invoice.status === 'partial') {
      item.invoice = {
        number: invoice.invoiceNumber,
        due: invoice.outstandingBalance ?? 0,
        payer: invoice.insurance?.provider || (invoice.philhealth ? 'PhilHealth' : undefined),
      };
    }
    const rx = rxByVisit.get(key);
    if (rx?.length) item.prescriptions = rx;

    if (item.needsInvoice) result.needsInvoice++;
    if (item.invoice) result.unpaid++;
    if (item.prescriptions) result.undispensed++;
    items.push(item);
  }

  const message = catchUpMessage(items);
  if (!message) return result;
  const billing = result.needsInvoice + result.unpaid > 0;
  result.notified = await notifyFrontDesk(tenantId, {
    type: 'reminder',
    title: 'End of day: front desk to-do',
    message,
    actionUrl: billing ? '/invoices?status=open' : '/prescriptions',
    metadata: { automation: CATCH_UP_SETTING },
  });
  return result;
}

/** Runs for one clinic, or every active clinic with the automation on. */
export async function runFrontDeskCatchUp(options: { tenantId?: string | Types.ObjectId } = {}): Promise<CatchUpResult> {
  await connectDB();
  const total: CatchUpResult = { tenants: 0, visits: 0, invoicesMade: 0, needsInvoice: 0, unpaid: 0, undispensed: 0, notified: 0, errors: [] };
  const runs = await forEachTenant(options.tenantId, catchUpTenant, { setting: CATCH_UP_SETTING });
  for (const run of runs) {
    if (!run.result) {
      total.errors.push(`Tenant ${run.tenantId}: ${run.error}`);
      continue;
    }
    total.tenants++;
    for (const k of ['visits', 'invoicesMade', 'needsInvoice', 'unpaid', 'undispensed', 'notified'] as const) total[k] += run.result[k];
    total.errors.push(...run.result.errors.map((e) => `Tenant ${run.tenantId}: ${e}`));
  }
  return total;
}
