import 'server-only';
import { after } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import SupportRequest from '@/models/SupportRequest';
import { notifyPlatformTeam } from '@/lib/support';
import { supportReference } from '@/lib/platform-console';

/**
 * Support requests from the eMCR patient app: "Contact support" and account-deletion requests.
 * They land in the platform team's support queue (source 'patient', no clinic), so the same people
 * who handle deletion requests from the web page see them, with the patient record attached.
 */

export interface PatientContact {
  name: string;
  email?: string;
  phone?: string;
}

export interface DeletionRequestView {
  reference: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  requestedAt: string;
}

/** Name and contact details of the signed-in patient, for the request and the reply. */
export async function patientContact(patientId: string): Promise<PatientContact | null> {
  await connectDB();
  const p = await Patient.findById(patientId)
    .select('firstName lastName email phone')
    .lean<{ firstName?: string; lastName?: string; email?: string; phone?: string } | null>();
  if (!p) return null;
  return {
    name: [p.firstName, p.lastName].filter(Boolean).join(' ') || 'eMCR patient',
    email: p.email?.trim() || undefined,
    phone: p.phone?.trim() || undefined,
  };
}

function toView(r: { _id: unknown; status: DeletionRequestView['status']; createdAt: Date }): DeletionRequestView {
  return { reference: supportReference(String(r._id)), status: r.status, requestedAt: new Date(r.createdAt).toISOString() };
}

/** The patient's newest deletion request that isn't finished, or null. */
export async function openDeletionRequest(patientId: string): Promise<DeletionRequestView | null> {
  await connectDB();
  const r = await SupportRequest.findOne({
    patientId: new Types.ObjectId(patientId),
    kind: 'account-deletion',
    status: { $in: ['open', 'in-progress'] },
  })
    .select('status createdAt')
    .sort({ createdAt: -1 })
    .lean<{ _id: unknown; status: DeletionRequestView['status']; createdAt: Date } | null>();
  return r ? toView(r) : null;
}

/** Text appended to every patient request so the team can act without asking back. */
function contextLines(contact: PatientContact, patientId: string, context?: Record<string, string | undefined>): string {
  const lines = [
    `Patient: ${contact.name} (record ${patientId})`,
    contact.phone ? `Mobile: ${contact.phone}` : null,
    contact.email ? `Email on record: ${contact.email}` : null,
    ...Object.entries(context ?? {})
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`),
  ];
  return lines.filter(Boolean).join('\n');
}

export async function createPatientRequest(opts: {
  patientId: string;
  contact: PatientContact;
  subject: string;
  message: string;
  category: 'account' | 'general';
  kind?: 'account-deletion';
  replyEmail?: string;
  context?: Record<string, string | undefined>;
}): Promise<{ id: string; reference: string; status: DeletionRequestView['status']; createdAt: Date }> {
  await connectDB();
  const email = opts.replyEmail || opts.contact.email;
  const body = `${opts.message}\n\n— ${contextLines(opts.contact, opts.patientId, opts.context)}`;
  const doc = await SupportRequest.create({
    patientId: new Types.ObjectId(opts.patientId),
    ...(email ? { email } : {}),
    ...(opts.contact.phone ? { phone: opts.contact.phone } : {}),
    ...(opts.kind ? { kind: opts.kind } : {}),
    subject: opts.subject,
    category: opts.category,
    message: body,
    status: 'open',
    source: 'patient',
    lastActivityAt: new Date(),
    lastReplyBy: 'requester',
  });
  const id = String(doc._id);
  // Failure to notify never blocks the request.
  after(() => notifyPlatformTeam(id, opts.subject, 'the eMCR app', email ?? opts.contact.phone ?? opts.contact.name, body, true));
  return { id, reference: supportReference(id), status: 'open', createdAt: doc.createdAt ?? new Date() };
}

export function deletionView(r: { id: string; status: DeletionRequestView['status']; createdAt: Date }): DeletionRequestView {
  return toView({ _id: r.id, status: r.status, createdAt: r.createdAt });
}
