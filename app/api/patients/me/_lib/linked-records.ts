import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { normalizePhone } from '@/lib/phone';
import { phoneVariants } from '@/app/api/patients/auth/shared';

/**
 * One person usually has a separate patient record at each clinic they visit (clinics register
 * patients independently). Records proven to be the same person share an `accountId`, and a
 * patient session reads across all of them: one app login shows every clinic.
 *
 * Linking happens on phone-OTP sign-in only: the OTP proves the caller controls the phone, and a
 * record is linked when its own phone (not an emergency-contact number) is that number and its
 * date of birth matches. The birth-date check keeps a parent and children who share one phone
 * number in separate logins.
 */

/** Upper bound on records one phone number links (a shared clinic or family line stays bounded). */
const MAX_LINKED_RECORDS = 20;

/** A linked record with the clinics it belongs to. */
export type LinkedRecord = { _id: Types.ObjectId; tenantIds: unknown[] };

export type LinkedRecords = {
  /** Every record of this person (the signed-in one first). Use as `patient: { $in: patientIds }`. */
  patientIds: Types.ObjectId[];
  /** Union of those records' clinics, for the patient-scope helpers. */
  tenantIds: unknown[];
  records: LinkedRecord[];
};

type PatientLike = { _id: unknown; accountId?: unknown; tenantIds?: unknown[] | null };

function toObjectId(value: unknown): Types.ObjectId {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(String(value));
}

function uniqueIds(values: unknown[]): unknown[] {
  const seen = new Map<string, unknown>();
  for (const value of values) if (value != null && !seen.has(String(value))) seen.set(String(value), value);
  return [...seen.values()];
}

/**
 * The records this session's patient may read: just its own record unless it is linked. Needs
 * `accountId` and `tenantIds` selected on `patient`. Inactive linked records are left out.
 */
export async function linkedRecords(patient: PatientLike): Promise<LinkedRecords> {
  const self: LinkedRecord = { _id: toObjectId(patient._id), tenantIds: patient.tenantIds ?? [] };
  let records: LinkedRecord[] = [self];

  if (patient.accountId) {
    await connectDB();
    const others = await Patient.find({
      accountId: patient.accountId,
      _id: { $ne: self._id },
      active: { $ne: false },
    })
      .select('tenantIds')
      .limit(MAX_LINKED_RECORDS)
      .lean<{ _id: Types.ObjectId; tenantIds?: unknown[] }[]>();
    records = [self, ...others.map((r) => ({ _id: r._id, tenantIds: r.tenantIds ?? [] }))];
  }

  return {
    patientIds: records.map((r) => r._id),
    tenantIds: uniqueIds(records.flatMap((r) => r.tenantIds)),
    records,
  };
}

/** The linked record registered at `tenantId` (bookings are made on that clinic's record). */
export function recordAtClinic(linked: LinkedRecords, tenantId: unknown): Types.ObjectId | null {
  const key = String(tenantId);
  return linked.records.find((r) => r.tenantIds.some((id) => String(id) === key))?._id ?? null;
}

function birthDay(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string | Date);
  return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * After a phone-OTP sign-in to `patientId` with `phone`: give every active record of the same
 * person (same own phone number, same date of birth) one shared `accountId`, merging any groups
 * those records were already in. Does nothing when the signed-in record's own phone is not that
 * number (the code went to it as an emergency contact).
 */
export async function linkRecordsByVerifiedPhone(patientId: string, phone: string): Promise<void> {
  await connectDB();
  const self = await Patient.findById(patientId)
    .select('phone dateOfBirth accountId selfRegistered')
    .lean<{ _id: Types.ObjectId; phone?: string; dateOfBirth?: Date; accountId?: Types.ObjectId; selfRegistered?: boolean } | null>();
  // Unreviewed public-form records never join a cross-clinic login (Patient.selfRegistered).
  if (!self?.phone || self.selfRegistered) return;

  const proven = normalizePhone(phone);
  if (!proven || normalizePhone(self.phone) !== proven) return;
  const dob = birthDay(self.dateOfBirth);
  if (!dob) return;

  const candidates = await Patient.find({
    _id: { $ne: self._id },
    phone: { $in: phoneVariants(phone) },
    active: { $ne: false },
    selfRegistered: { $ne: true },
  })
    .select('dateOfBirth accountId')
    .limit(MAX_LINKED_RECORDS)
    .lean<{ _id: Types.ObjectId; dateOfBirth?: Date; accountId?: Types.ObjectId }[]>();

  const samePerson = candidates.filter((c) => birthDay(c.dateOfBirth) === dob);
  if (!samePerson.length) return;

  const groups = uniqueIds([self.accountId, ...samePerson.map((c) => c.accountId)]);
  const accountId = (groups[0] as Types.ObjectId | undefined) ?? self._id;
  const members = [self._id, ...samePerson.map((c) => c._id)];

  await Patient.updateMany(
    groups.length ? { $or: [{ _id: { $in: members } }, { accountId: { $in: groups } }] } : { _id: { $in: members } },
    { $set: { accountId } }
  );
}
