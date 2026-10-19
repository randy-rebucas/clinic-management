import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import WebhookEndpoint from '@/models/WebhookEndpoint';
import { emitWebhookEvent } from '@/lib/webhooks';
import { serializeAppointment, serializeInvoice, serializePatient } from '@/lib/public-api';
import { getTenantTimezone } from '@/lib/clinic-timezone';

/**
 * Record changes → webhook events. Called from the model hooks (lib/webhook-model-hooks.ts)
 * and from invoice payments. Each first checks, cheaply, whether the clinic has any endpoint
 * for the event, so clinics without webhooks pay one indexed count.
 */

async function wants(tenantId: unknown, event: string): Promise<boolean> {
  if (!tenantId) return false;
  await connectDB();
  return !!(await WebhookEndpoint.exists({ tenantId: new Types.ObjectId(String(tenantId)), enabled: true, events: event }));
}

export async function onPatientCreated(patient: Record<string, any>) {
  for (const tenantId of patient.tenantIds ?? []) {
    if (await wants(tenantId, 'patient.created')) await emitWebhookEvent(tenantId, 'patient.created', serializePatient(patient));
  }
}

export async function onAppointmentCreated(appointment: Record<string, any>) {
  if (!(await wants(appointment.tenantId, 'appointment.created'))) return;
  const tz = await getTenantTimezone(String(appointment.tenantId));
  await emitWebhookEvent(appointment.tenantId, 'appointment.created', serializeAppointment(appointment, tz));
}

export async function onAppointmentStatusChanged(changes: Array<{ id: string; previous?: string }>) {
  if (!changes.length) return;
  await connectDB();
  const Appointment = (await import('@/models/Appointment')).default;
  const rows = await Appointment.find({ _id: { $in: changes.map((c) => c.id) } })
    .select('tenantId appointmentCode patient doctor appointmentDate appointmentTime scheduledAt duration status modality isWalkIn queueNumber reason createdAt updatedAt')
    .lean<any[]>();
  const previous = new Map(changes.map((c) => [c.id, c.previous]));
  const tzCache = new Map<string, string>();
  for (const a of rows) {
    const tid = String(a.tenantId ?? '');
    if (!tid || previous.get(String(a._id)) === a.status) continue;
    if (!(await wants(tid, 'appointment.status_changed'))) continue;
    if (!tzCache.has(tid)) tzCache.set(tid, await getTenantTimezone(tid));
    await emitWebhookEvent(tid, 'appointment.status_changed', {
      ...serializeAppointment(a, tzCache.get(tid)!),
      previous_status: previous.get(String(a._id)) ?? null,
    });
  }
}

export async function onInvoicePaid(invoice: Record<string, any>) {
  if (await wants(invoice.tenantId, 'invoice.paid')) await emitWebhookEvent(invoice.tenantId, 'invoice.paid', serializeInvoice(invoice));
}
