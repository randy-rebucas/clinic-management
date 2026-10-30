// Front-desk notices when a visit closes
// The patient is on the way out: the receptionist records the payment and hands over the
// medicines while they're still at the desk.

import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Visit from '@/models/Visit';
import Prescription from '@/models/Prescription';
import { dispensedPerMedication } from '@/lib/prescription-dispense';
import type { NotifyStaffOptions } from '@/lib/notify';
import { Types } from 'mongoose';

/** Who works the desk; admins stand in where a clinic has no receptionist. */
const FRONT_DESK_ROLES = ['receptionist'];
const FRONT_DESK_FALLBACK_ROLES = ['admin', 'owner'];

export interface ClosedVisitNoticeOptions {
  visitId: string | Types.ObjectId;
  tenantId: string | Types.ObjectId;
  /** Whoever closed the visit; they aren't told about their own action. */
  closedBy?: string;
}

type VisitForNotice = {
  visitCode?: string;
  patient?: { _id: Types.ObjectId; firstName?: string; lastName?: string; allergies?: Array<string | { substance?: string }> };
  provider?: { name?: string };
};

async function loadVisit(tenantId: Types.ObjectId, visitId: Types.ObjectId) {
  return Visit.findOne({ _id: visitId, tenantId })
    .select('visitCode patient provider')
    .populate('patient', 'firstName lastName allergies')
    .populate('provider', 'name')
    .lean<VisitForNotice>();
}

const patientNameOf = (visit: VisitForNotice) =>
  [visit.patient?.firstName, visit.patient?.lastName].filter(Boolean).join(' ') || 'The patient';
const visitLabelOf = (visit: VisitForNotice) => (visit.visitCode ? `visit ${visit.visitCode}` : 'their visit');

/** A high-priority notice (pushed) to the front desk, or to admins where there's no receptionist. */
export async function notifyFrontDesk(
  tenantId: Types.ObjectId,
  notice: Pick<NotifyStaffOptions, 'title' | 'message' | 'actionUrl' | 'type' | 'metadata' | 'excludeUserId'>
): Promise<number> {
  const { notifyStaff, resolveStaffAudience } = await import('@/lib/notify');
  const tid = String(tenantId);
  const hasFrontDesk = (await resolveStaffAudience(tid, { roles: FRONT_DESK_ROLES })).length > 0;
  const { recipients } = await notifyStaff({
    ...notice,
    tenantId: tid,
    audience: { roles: hasFrontDesk ? FRONT_DESK_ROLES : FRONT_DESK_FALLBACK_ROLES },
    priority: 'high',
    sender: { kind: 'system' },
  });
  return recipients;
}

/**
 * Tell the front desk a visit is done so the payment gets recorded. Points at the visit's
 * invoice, or at a new one when none was made (auto-invoicing off or failed). Nothing is sent
 * for a bill that is already settled. Never throws.
 */
export async function notifyFrontDeskOfClosedVisit(options: ClosedVisitNoticeOptions): Promise<{ recipients: number }> {
  try {
    await connectDB();
    const tenantId = new Types.ObjectId(String(options.tenantId));
    const visitId = new Types.ObjectId(String(options.visitId));

    const [visit, invoice] = await Promise.all([
      loadVisit(tenantId, visitId),
      Invoice.findOne({ visit: visitId, tenantId })
        .select('invoiceNumber status outstandingBalance')
        .lean<{ _id: Types.ObjectId; invoiceNumber: string; status: string; outstandingBalance?: number }>(),
    ]);
    if (!visit) return { recipients: 0 };
    if (invoice && (invoice.status === 'paid' || invoice.status === 'refunded')) return { recipients: 0 };

    const patientName = patientNameOf(visit);
    const visitLabel = visitLabelOf(visit);
    const recipients = await notifyFrontDesk(tenantId, {
      type: 'invoice',
      title: invoice ? 'Visit done — record payment' : 'Visit done — needs an invoice',
      message: invoice
        ? `${patientName} has finished ${visitLabel}. Record the payment on invoice ${invoice.invoiceNumber}` +
          (invoice.outstandingBalance ? ` (${invoice.outstandingBalance.toFixed(2)} due).` : '.')
        : `${patientName} has finished ${visitLabel} and has no invoice yet. Create one and record the payment.`,
      actionUrl: invoice
        ? `/invoices/${invoice._id}`
        : `/invoices/new?patientId=${visit.patient?._id ?? ''}&visitId=${visitId}`,
      excludeUserId: options.closedBy,
      metadata: { visitId: String(visitId), ...(invoice ? { invoiceId: String(invoice._id) } : {}) },
    });
    return { recipients };
  } catch (error) {
    console.error('Error notifying front desk of closed visit:', error);
    return { recipients: 0 };
  }
}

type MedicationForNotice = {
  name: string;
  strength?: string;
  form?: string;
  dose?: string;
  frequency?: string;
  durationDays?: number;
  quantity?: number;
  instructions?: string;
};

/** "Amoxicillin 500 mg capsule — give 21 — 1 capsule three times a day", one line per medicine. */
export function medicationLine(med: MedicationForNotice, remaining: number | null): string {
  const name = [med.name, med.strength, med.form].filter(Boolean).join(' ');
  const amount = remaining && remaining > 0 ? `give ${remaining}` : 'quantity not set — ask the doctor';
  const howTo =
    med.instructions ||
    [med.dose, med.frequency, med.durationDays ? `for ${med.durationDays} days` : ''].filter(Boolean).join(' ') ||
    'as directed';
  return `• ${name} — ${amount} — ${howTo}`;
}

const allergiesOf = (visit: VisitForNotice) =>
  (visit.patient?.allergies ?? [])
    .map((a) => (typeof a === 'string' ? a : a?.substance))
    .filter((a): a is string => !!a && !!a.trim());

/**
 * Tell the front desk what to hand the patient: each medicine still to give, how to take it,
 * the patient's allergies, and the steps for recording it. One notice per open prescription
 * on the visit. Never throws.
 */
export async function notifyFrontDeskToDispense(options: ClosedVisitNoticeOptions): Promise<{ recipients: number }> {
  try {
    await connectDB();
    const tenantId = new Types.ObjectId(String(options.tenantId));
    const visitId = new Types.ObjectId(String(options.visitId));

    const [visit, prescriptions] = await Promise.all([
      loadVisit(tenantId, visitId),
      Prescription.find({ visit: visitId, tenantId, status: { $in: ['active', 'partially-dispensed'] } })
        .select('prescriptionCode medications pharmacyDispenses status')
        .lean<
          {
            _id: Types.ObjectId;
            prescriptionCode: string;
            status: string;
            medications: MedicationForNotice[];
            pharmacyDispenses?: { items?: { medicationIndex: number; quantity: number }[]; quantityDispensed?: number }[];
          }[]
        >(),
    ]);
    if (!visit || !prescriptions.length) return { recipients: 0 };

    const patientName = patientNameOf(visit);
    const doctor = visit.provider?.name ? ` from ${visit.provider.name}` : '';
    const allergies = allergiesOf(visit);
    let recipients = 0;

    for (const rx of prescriptions) {
      const meds = rx.medications ?? [];
      const prescribed = meds.map((m) => Math.max(0, Number(m.quantity) || 0));
      const done = dispensedPerMedication(prescribed, rx.pharmacyDispenses);
      // A medicine with a quantity that's all been given is off the list; one without a quantity stays.
      const lines = meds
        .map((m, i) => ({ m, remaining: prescribed[i] ? prescribed[i] - done[i] : null }))
        .filter(({ remaining }) => remaining === null || remaining > 0)
        .map(({ m, remaining }) => medicationLine(m, remaining));
      if (!lines.length) continue;

      const message = [
        `${patientName} has finished ${visitLabelOf(visit)}. Prescription ${rx.prescriptionCode}${doctor} is ready to hand over:`,
        ...lines,
        allergies.length
          ? `⚠ Allergies on file: ${allergies.join(', ')}. If a medicine looks related, check with the doctor before giving it.`
          : 'No allergies on file — ask the patient to be sure.',
        '',
        'Before the patient leaves:',
        '1. Confirm the patient’s name, and that these are the medicines the doctor discussed.',
        '2. Pick each medicine and check its name, strength and quantity against this list.',
        '3. Explain how and when to take each one, and how long to keep taking it.',
        '4. Open the prescription, press Dispense and enter what you gave. Stock is deducted; anything you couldn’t give stays open.',
        '5. Print the patient copy. If they’ll buy the medicines at a pharmacy instead, give them the copy and leave it undispensed.',
      ].join('\n');

      recipients += await notifyFrontDesk(tenantId, {
        type: 'prescription',
        title: `Medicines to hand over — ${patientName}`,
        message,
        actionUrl: `/prescriptions/${rx._id}`,
        excludeUserId: options.closedBy,
        metadata: { visitId: String(visitId), prescriptionId: String(rx._id) },
      });
    }
    return { recipients };
  } catch (error) {
    console.error('Error notifying front desk to dispense:', error);
    return { recipients: 0 };
  }
}
