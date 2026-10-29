import { Types, type Model } from 'mongoose';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import DocumentModel from '@/models/Document';
import EmcrAccessRequest from '@/models/EmcrAccessRequest';
import EmcrInvite from '@/models/EmcrInvite';
import Imaging from '@/models/Imaging';
import Invoice from '@/models/Invoice';
import LabResult from '@/models/LabResult';
import Membership from '@/models/Membership';
import MobileDevice from '@/models/MobileDevice';
import PatientMessage from '@/models/PatientMessage';
import PatientNote from '@/models/PatientNote';
import Prescription from '@/models/Prescription';
import Procedure from '@/models/Procedure';
import Queue from '@/models/Queue';
import Referral from '@/models/Referral';
import Survey from '@/models/Survey';
import Visit from '@/models/Visit';
import WaitlistEntry from '@/models/WaitlistEntry';
import { cloudinaryRefForDocument } from '@/lib/document-file';
import { deleteFromCloudinary } from '@/lib/cloudinary';
import { deleteStoredAttachment } from '@/lib/attachment-file';

/**
 * Erasure of one patient's data at one clinic (PH DPA right to erasure).
 *
 * A Patient record is shared by every clinic in its `tenantIds`; only the calling clinic's data is
 * touched. `delete` removes the clinic's records about the patient and detaches the clinic from the
 * Patient record, which is deleted once no clinic is left; sales invoices are kept (BIR) with the
 * buyer's name and address copied onto them. `anonymize` keeps the clinic's medical
 * record (visits, prescriptions, results, billing) but cuts it off from anyone identifiable: files,
 * messages and contact details go, and the records are left pointing at an anonymous patient.
 */

type Link = { model: Model<any>; field: string };

/** Every clinic record about a patient, by the field that links it. __tests__ checks this against the schemas. */
export const PATIENT_RECORDS: Link[] = [
  { model: Appointment, field: 'patient' },
  { model: DocumentModel, field: 'patient' },
  { model: EmcrAccessRequest, field: 'patientId' },
  { model: EmcrInvite, field: 'patientId' },
  { model: Imaging, field: 'patient' },
  { model: Invoice, field: 'patient' },
  { model: LabResult, field: 'patient' },
  { model: Membership, field: 'patient' },
  { model: MobileDevice, field: 'patientId' },
  { model: PatientMessage, field: 'patient' },
  { model: PatientNote, field: 'patient' },
  { model: Prescription, field: 'patient' },
  { model: Procedure, field: 'patient' },
  { model: Queue, field: 'patient' },
  { model: Referral, field: 'patient' },
  { model: Survey, field: 'patientId' },
  { model: Visit, field: 'patient' },
  { model: WaitlistEntry, field: 'patient' },
];

/** Records that mention the patient without being about them: the mention goes, the record stays. */
export const PATIENT_MENTIONS: (Link & { array?: boolean; alsoUnset?: string[] })[] = [
  { model: Membership, field: 'referredBy' },
  { model: Membership, field: 'referrals', array: true },
  { model: Referral, field: 'referringPatient', alsoUnset: ['referringContact'] },
  { model: EmcrInvite, field: 'dependentIds', array: true },
];

/**
 * Patient references left alone on purpose: the audit trail is the record of processing the DPA
 * requires the clinic to keep, and the eMCR account is the patient's own, not the clinic's.
 */
export const PATIENT_REFS_KEPT = ['AuditLog.dataSubject', 'EmcrAccount.selfPatientId'];

/**
 * Kept in delete mode as well: sales invoices are retained for BIR, with the buyer copied onto
 * them first (snapshotBuyer) so they still say who they were sold to.
 */
const RETAINED_RECORDS = new Set<Model<any>>([Invoice]);

/** Not part of the medical record; removed in both modes. */
const NON_CLINICAL = [DocumentModel, PatientMessage, MobileDevice, Survey, EmcrAccessRequest, EmcrInvite, WaitlistEntry];

const ANONYMIZED = '[ANONYMIZED]';

/** Everything on a Patient record that identifies or reaches the person; the medical history stays. */
const IDENTIFYING_FIELDS = [
  'patientCode', 'middleName', 'suffix', 'email', 'contacts', 'emergencyContact', 'identifiers', 'civilStatus',
  'nationality', 'occupation', 'socialHistory', 'discountEligibility', 'password', 'otp', 'otpExpiry', 'otpAttempts',
  'loginQrTokenHash', 'loginQrTokenExpiry', 'loginQrTenantId', 'passwordTenantId', 'accountId', 'selfRegistered',
  'guardians', 'attachments', 'readNotificationIds', 'tags', 'segmentFlags', 'lastBirthdayGreetingAt',
  'lastHealthReminderAt', 'reengagementSentAt',
];

/** Kept on an anonymized record so the clinical history still reads correctly. */
const CLINICAL_FIELDS = ['sex', 'medicalHistory', 'preExistingConditions', 'allergies', 'immunizations', 'familyHistory'];

const ANONYMOUS_IDENTITY = {
  firstName: ANONYMIZED,
  lastName: ANONYMIZED,
  phone: ANONYMIZED,
  dateOfBirth: null,
  address: { street: ANONYMIZED, city: ANONYMIZED, state: ANONYMIZED, zipCode: ANONYMIZED },
  active: false,
};

export interface ErasureResult {
  mode: 'anonymize' | 'delete';
  /** Other clinics still hold the patient; only this clinic's link was removed. */
  detachedOnly: boolean;
  /** Cloudinary files that could not be removed (public ids), for follow-up. */
  filesNotRemoved: string[];
}

/** Remove the clinic's uploaded documents for the patient from Cloudinary, then their records. */
async function deleteDocuments(tenantId: Types.ObjectId, patientId: Types.ObjectId): Promise<string[]> {
  const docs = await DocumentModel.find({ tenantId, patient: patientId }).select('url metadata').lean<{ url?: string; metadata?: unknown }[]>();
  const failed: string[] = [];
  for (const doc of docs) {
    const ref = cloudinaryRefForDocument(doc);
    if (!ref) continue;
    const result = await deleteFromCloudinary(ref.publicId, { resourceType: ref.resourceType, deliveryType: ref.deliveryType });
    if (!result.success) failed.push(ref.publicId);
  }
  await DocumentModel.deleteMany({ tenantId, patient: patientId });
  return failed;
}

/** Copy the buyer onto the clinic's invoices for the patient before their name and address go. */
async function snapshotBuyer(tenantId: Types.ObjectId, patientId: Types.ObjectId) {
  const p = await Patient.findById(patientId)
    .select('firstName middleName lastName suffix address')
    .lean<{ firstName?: string; middleName?: string; lastName?: string; suffix?: string; address?: Record<string, string> } | null>();
  if (!p) return;
  const name = [p.firstName, p.middleName, p.lastName, p.suffix].filter(Boolean).join(' ');
  const { street, city, state, zipCode } = p.address ?? {};
  await Invoice.updateMany(
    { tenantId, patient: patientId, 'billedTo.name': { $exists: false } },
    { $set: { billedTo: { name, address: { street, city, state, zipCode } } } }
  );
}

/** Delete the stored copies of files attached to the matching records (or, on a patient, this clinic's). */
async function deleteAttachedFiles(model: Model<any>, filter: Record<string, unknown>, field = 'attachments', tenantId?: Types.ObjectId) {
  const rows = await model.find(filter).select(`${field}.url ${field}.tenantId`).lean<Record<string, { url?: string; tenantId?: unknown }[]>[]>();
  for (const row of rows) {
    for (const file of row[field] ?? []) {
      if (tenantId && String(file.tenantId) !== String(tenantId)) continue;
      await deleteStoredAttachment(file.url);
    }
  }
}

/** Point this clinic's mentions of `from` at `to`, or remove them when `to` is null. */
async function relinkMentions(tenantId: Types.ObjectId, from: Types.ObjectId, to: Types.ObjectId | null) {
  for (const { model, field, array, alsoUnset = [] } of PATIENT_MENTIONS) {
    const filter = { tenantId, [field]: from };
    if (to) {
      await model.updateMany(filter, array ? { $set: { [`${field}.$[m]`]: to } } : { $set: { [field]: to } }, array ? { arrayFilters: [{ m: from }] } : {});
    } else if (array) {
      await model.updateMany(filter, { $pull: { [field]: from } });
    } else {
      await model.updateMany(filter, { $unset: Object.fromEntries([field, ...alsoUnset].map((f) => [f, ''])) });
    }
  }
}

/** Take the clinic off a shared Patient record, with everything on it that came from this clinic. */
async function detachClinic(patientId: Types.ObjectId, tenantId: Types.ObjectId) {
  // Sign-in set up by this clinic is scoped to it; left unscoped it would open every clinic.
  await Patient.updateOne({ _id: patientId, passwordTenantId: tenantId }, { $unset: { password: '', passwordTenantId: '' } });
  await Patient.updateOne(
    { _id: patientId, loginQrTenantId: tenantId },
    { $unset: { loginQrTokenHash: '', loginQrTokenExpiry: '', loginQrTenantId: '' } }
  );
  await Patient.updateOne({ _id: patientId }, { $pull: { tenantIds: tenantId, attachments: { tenantId }, guardians: { tenantId } } });
  // Family links this clinic recorded on other patients' records.
  await Patient.updateMany({ 'guardians.patient': patientId }, { $pull: { guardians: { patient: patientId, tenantId } } });
}

async function erase(tenantId: Types.ObjectId, patientId: Types.ObjectId, shared: boolean): Promise<ErasureResult> {
  const filesNotRemoved = await deleteDocuments(tenantId, patientId);
  await deleteAttachedFiles(Visit, { tenantId, patient: patientId });
  await deleteAttachedFiles(LabResult, { tenantId, patient: patientId });
  await deleteAttachedFiles(Imaging, { tenantId, patient: patientId }, 'images');
  await deleteAttachedFiles(Patient, { _id: patientId }, 'attachments', tenantId);
  await snapshotBuyer(tenantId, patientId);
  for (const { model, field } of PATIENT_RECORDS) {
    if (RETAINED_RECORDS.has(model)) continue;
    await model.deleteMany({ tenantId, [field]: patientId });
  }
  await relinkMentions(tenantId, patientId, null);
  await detachClinic(patientId, tenantId);

  const { deletedCount } = await Patient.deleteOne({
    _id: patientId,
    $or: [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }],
  });
  if (deletedCount) {
    await Patient.updateMany({ 'guardians.patient': patientId }, { $pull: { guardians: { patient: patientId } } });
  }
  return { mode: 'delete', detachedOnly: shared, filesNotRemoved };
}

async function anonymize(tenantId: Types.ObjectId, patientId: Types.ObjectId, shared: boolean): Promise<ErasureResult> {
  let subject = patientId;
  await snapshotBuyer(tenantId, patientId);

  if (shared) {
    // Other clinics still treat this person, so the record itself can't be anonymized: this
    // clinic's records move to an anonymous stand-in and the clinic is detached from the original.
    const original = await Patient.findById(patientId).select(CLINICAL_FIELDS.join(' ')).lean<Record<string, unknown>>();
    const now = new Date();
    const clinical = Object.fromEntries(CLINICAL_FIELDS.filter((f) => original?.[f] !== undefined).map((f) => [f, original![f]]));
    // Inserted directly: the schema's hooks would give it a patient code, and its validation wants a birth date.
    const { insertedId } = await Patient.collection.insertOne({
      ...clinical,
      ...ANONYMOUS_IDENTITY,
      tenantIds: [tenantId],
      createdAt: now,
      updatedAt: now,
    });
    subject = insertedId as Types.ObjectId;
    for (const { model, field } of PATIENT_RECORDS) {
      await model.updateMany({ tenantId, [field]: patientId }, { $set: { [field]: subject } });
    }
    await relinkMentions(tenantId, patientId, subject);
    await deleteAttachedFiles(Patient, { _id: patientId }, 'attachments', tenantId);
    await detachClinic(patientId, tenantId);
  } else {
    await deleteAttachedFiles(Patient, { _id: patientId });
    await Patient.updateOne(
      { _id: patientId },
      {
        $set: ANONYMOUS_IDENTITY,
        $unset: Object.fromEntries(IDENTIFYING_FIELDS.map((f) => [f, ''])),
        // Signs the patient out of the portal and app.
        $inc: { sessionVersion: 1 },
      }
    );
  }

  const filesNotRemoved = await deleteDocuments(tenantId, subject);
  for (const model of NON_CLINICAL) {
    if (model === DocumentModel) continue;
    const link = PATIENT_RECORDS.find((l) => l.model === model)!;
    await model.deleteMany({ tenantId, [link.field]: subject });
  }
  // Attached files and free-text notes can name the patient; the structured record stays.
  await deleteAttachedFiles(Visit, { tenantId, patient: subject });
  await deleteAttachedFiles(LabResult, { tenantId, patient: subject });
  await deleteAttachedFiles(Imaging, { tenantId, patient: subject }, 'images');
  await Visit.updateMany({ tenantId, patient: subject }, { $set: { attachments: [], notes: '[Data anonymized]' } });
  await LabResult.updateMany({ tenantId, patient: subject }, { $set: { attachments: [] } });
  await Imaging.updateMany({ tenantId, patient: subject }, { $set: { images: [] } });
  await Queue.updateMany({ tenantId, patient: subject }, { $set: { patientName: ANONYMIZED } });

  return { mode: 'anonymize', detachedOnly: shared, filesNotRemoved };
}

/**
 * Erase `patientId`'s data at the clinic `tenantId`. The caller has already checked that the
 * patient belongs to the clinic and that the request is authorised.
 */
export async function erasePatientAtClinic(
  tenantId: string | Types.ObjectId,
  patientId: string | Types.ObjectId,
  mode: 'anonymize' | 'delete'
): Promise<ErasureResult> {
  const tid = new Types.ObjectId(String(tenantId));
  const pid = new Types.ObjectId(String(patientId));
  const patient = await Patient.findById(pid).select('tenantIds').lean<{ tenantIds?: Types.ObjectId[] }>();
  const shared = (patient?.tenantIds ?? []).some((t) => String(t) !== String(tid));
  return mode === 'delete' ? erase(tid, pid, shared) : anonymize(tid, pid, shared);
}
