import 'server-only';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import { safeImageSrc } from '@/lib/document-protection';

/**
 * A doctor's stored signature and credentials, as printed under documents they issue.
 *
 * The signature image is set only by the doctor (PUT /api/account/signature) and is applied
 * to documents whose provider/prescriber/referring doctor is that doctor. A signature drawn on
 * the document itself (digitalSignature.signatureData) always takes precedence.
 */

/** Decoded size limit for a stored signature image. A drawn 600x200 PNG is ~10–30 KB. */
export const MAX_SIGNATURE_BYTES = 200 * 1024;

export type SignatureImageResult = { ok: true; image: string } | { ok: false; error: string };

/** Validate an uploaded or drawn signature: inline PNG/JPEG/WebP data URL, at most 200 KB. */
export function parseSignatureImage(value: unknown): SignatureImageResult {
  const image = safeImageSrc(value);
  if (!image || /^data:image\/gif/.test(image)) {
    return { ok: false, error: 'Use a PNG, JPEG or WebP image of your signature.' };
  }
  const base64 = image.slice(image.indexOf(',') + 1);
  const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (bytes < 200) return { ok: false, error: 'The signature image is empty. Draw or upload it again.' };
  if (bytes > MAX_SIGNATURE_BYTES) return { ok: false, error: 'Keep the signature image under 200 KB.' };
  return { ok: true, image };
}

export interface Signer {
  doctorId: string | null;
  /** "Dr. Juan Dela Cruz", or the account name when there is no doctor record. */
  name: string;
  licenseNumber: string | null;
  ptr: string | null;
  s2Number: string | null;
  /** Safe data URL of the stored signature, or null. */
  signatureSrc: string | null;
}

type DoctorRow = {
  _id: { toString(): string };
  title?: string;
  firstName?: string;
  lastName?: string;
  licenseNumber?: string;
  ptr?: string;
  ptrNumber?: string;
  s2Number?: string;
  signature?: { image?: string };
};

const DOCTOR_FIELDS = 'title firstName lastName licenseNumber ptr ptrNumber s2Number +signature.image';

function toSigner(doc: DoctorRow | null, fallbackName?: string): Signer | null {
  if (!doc) return fallbackName ? { doctorId: null, name: fallbackName, licenseNumber: null, ptr: null, s2Number: null, signatureSrc: null } : null;
  const fullName = [doc.firstName, doc.lastName].filter(Boolean).join(' ');
  const name = fullName ? [doc.title, fullName].filter(Boolean).join(' ') : fallbackName || 'Physician';
  return {
    doctorId: doc._id.toString(),
    name,
    licenseNumber: doc.licenseNumber || null,
    ptr: doc.ptrNumber || doc.ptr || null,
    s2Number: doc.s2Number || null,
    signatureSrc: safeImageSrc(doc.signature?.image),
  };
}

/**
 * Resolve the signer of a document from either a Doctor id (referrals) or a User id
 * (visit provider, prescription prescriber). Scoped to the tenant.
 */
export async function loadSigner(params: {
  tenantId: string;
  doctorId?: unknown;
  userId?: unknown;
}): Promise<Signer | null> {
  await connectDB();
  const { tenantId } = params;
  const idOf = (v: unknown) => (v && typeof v === 'object' && '_id' in v ? String((v as { _id: unknown })._id) : v ? String(v) : null);

  const doctorId = idOf(params.doctorId);
  if (doctorId) {
    const doc = await Doctor.findOne({ _id: doctorId, tenantId }).select(DOCTOR_FIELDS).lean<DoctorRow | null>();
    return toSigner(doc);
  }

  const userId = idOf(params.userId);
  if (!userId) return null;
  const user = await User.findById(userId).select('name doctorProfile').lean<{ name?: string; doctorProfile?: unknown } | null>();
  if (!user) return null;
  const profileId = idOf(user.doctorProfile);
  const doc = profileId
    ? await Doctor.findOne({ _id: profileId, tenantId }).select(DOCTOR_FIELDS).lean<DoctorRow | null>()
    : null;
  return toSigner(doc, user.name);
}

/** The per-document signature if present, else the signer's stored one when allowed. */
export function pickSignature(documentSignature: unknown, signer: Signer | null, allowStored: boolean): string | null {
  return safeImageSrc(documentSignature) ?? (allowStored ? signer?.signatureSrc ?? null : null);
}
