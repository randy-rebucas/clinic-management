import 'server-only';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import QRCode from 'qrcode';
import connectDB from '@/lib/mongodb';
import { getSettings } from '@/lib/settings';
import DocumentSeal, { SealCopyType, SealDocumentType } from '@/models/DocumentSeal';
import Prescription from '@/models/Prescription';
import Visit from '@/models/Visit';
import LabResult from '@/models/LabResult';
import Invoice from '@/models/Invoice';
import Referral from '@/models/Referral';
import User from '@/models/User';
import '@/models/Patient';
import { nextSequence } from '@/lib/counters';
import { resolveTimezone } from '@/lib/tz';
import { getTenantTimezone } from '@/lib/clinic-timezone';

/**
 * Document sealing — tamper-evident, verifiable printouts.
 *
 * Every time an official document is printed, a DocumentSeal is issued:
 *   - an unguessable serial (printed + encoded in a QR code)
 *   - a SHA-256 fingerprint of the document's canonical content
 *   - an HMAC-SHA256 signature over the seal fields (detects DB tampering)
 *
 * Anyone holding the paper can open /verify/<serial> to see the clinic's
 * authoritative copy of the key details, whether the record changed after
 * printing, whether it was cancelled/revoked, and how many copies exist.
 */

export interface SealFact {
  label: string;
  value: string;
}

interface SealDefinition {
  label: string;
  load(documentId: string, tenantId?: string | null): Promise<any | null>;
  code(doc: any): string | undefined;
  canonical(doc: any, version?: CanonicalVersion): Record<string, unknown>;
  revocation(doc: any): string | null;
  facts(doc: any, currency: string, tz?: string): SealFact[];
  patient(doc: any): any;
  issuer(doc: any): string | undefined;
}

// ─── Primitive helpers ───────────────────────────────────────────────────────

const idOf = (v: any): string | null => (v ? String(v._id ?? v) : null);
const str = (v: any): string | null => (v === undefined || v === null || v === '' ? null : String(v));
const num = (v: any): number | null => (v === undefined || v === null || v === '' ? null : Number(v));
const iso = (v: any): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const longDate = (v: any, tz?: string): string => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: resolveTimezone(tz) })
    : '—';
};
const formatMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount || 0);
  } catch {
    return `${currency} ${(amount || 0).toFixed(2)}`;
  }
};

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Canonical content format. v1 seals (issued before strength/dose/form were part of the
 * prescription fingerprint) keep verifying with v1; new seals are issued as v2 and their
 * contentHash carries a "v2:" prefix, which the HMAC signature covers.
 */
type CanonicalVersion = 1 | 2;
const CURRENT_CANONICAL_VERSION: CanonicalVersion = 2;

function hashCanonical(def: SealDefinition, doc: any, version: CanonicalVersion): string {
  const digest = sha256(stableStringify(def.canonical(doc, version)));
  return version === 1 ? digest : `v${version}:${digest}`;
}

function canonicalVersionOf(contentHash: string): CanonicalVersion {
  return contentHash?.startsWith('v2:') ? 2 : 1;
}

/** Build a `{ _id, tenantId }` query that cannot cross tenant boundaries. Returns null for malformed ids. */
export function tenantScopedQuery(id: string, tenantId?: string | null): Record<string, unknown> | null {
  if (!Types.ObjectId.isValid(id)) return null;
  const query: Record<string, unknown> = { _id: new Types.ObjectId(id) };
  if (tenantId) {
    query.tenantId = new Types.ObjectId(tenantId);
  } else {
    query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
  }
  return query;
}

// ─── Per-document definitions ────────────────────────────────────────────────
// canonical() must only include fields that define what is printed, and must
// produce the same output for the same record regardless of populate depth.

const primaryDiagnosis = (visit: any) =>
  visit?.diagnoses?.find((d: any) => d.primary) || visit?.diagnoses?.[0];

const diagnosisText = (d: any) =>
  d ? `${d.code ? `(${d.code}) ` : ''}${d.description || ''}`.trim() : '';

const SEAL_DEFINITIONS: Record<SealDocumentType, SealDefinition> = {
  prescription: {
    label: 'Prescription',
    load: (id, tenantId) => {
      const q = tenantScopedQuery(id, tenantId);
      return q
        ? Prescription.findOne(q)
            .populate('patient', 'firstName lastName')
            .populate('prescribedBy', 'name')
        : Promise.resolve(null);
    },
    code: (rx) => rx.prescriptionCode,
    canonical: (rx, version = CURRENT_CANONICAL_VERSION) => ({
      code: str(rx.prescriptionCode),
      patient: idOf(rx.patient),
      visit: idOf(rx.visit),
      prescribedBy: idOf(rx.prescribedBy),
      issuedAt: iso(rx.issuedAt),
      notes: str(rx.notes),
      medications: (rx.medications || []).map((m: any) => ({
        name: str(m.name),
        genericName: str(m.genericName),
        ...(version >= 2 ? { strength: str(m.strength), dose: str(m.dose), form: str(m.form) } : {}),
        route: str(m.route),
        frequency: str(m.frequency),
        durationDays: num(m.durationDays),
        quantity: num(m.quantity),
        instructions: str(m.instructions),
      })),
    }),
    revocation: (rx) => (rx.status === 'cancelled' ? 'This prescription was cancelled by the clinic.' : null),
    facts: (rx, _currency, tz) => [
      { label: 'Prescription code', value: rx.prescriptionCode || '—' },
      { label: 'Date issued', value: longDate(rx.issuedAt, tz) },
      { label: 'Current status', value: String(rx.status || '—').replace(/-/g, ' ').toUpperCase() },
      ...(rx.medications || []).map((m: any, i: number) => ({
        label: `Medication ${i + 1}`,
        value: [
          m.name,
          m.genericName ? `(${m.genericName})` : '',
          m.strength || '',
          m.form || '',
          m.dose ? `dose ${m.dose}` : '',
          m.quantity ? `# ${m.quantity}` : '',
          m.instructions ? `— Sig: ${m.instructions}` : '',
        ]
          .filter(Boolean)
          .join(' '),
      })),
    ],
    patient: (rx) => rx.patient,
    issuer: (rx) => rx.prescribedBy?.name,
  },

  medical_certificate: {
    label: 'Medical Certificate',
    load: (id, tenantId) => {
      const q = tenantScopedQuery(id, tenantId);
      return q
        ? Visit.findOne(q).populate('patient', 'firstName lastName').populate('provider', 'name')
        : Promise.resolve(null);
    },
    code: (v) => v.visitCode,
    canonical: (v) => {
      const dx = primaryDiagnosis(v);
      return {
        code: str(v.visitCode),
        patient: idOf(v.patient),
        provider: idOf(v.provider),
        date: iso(v.date),
        diagnosis: dx ? { code: str(dx.code), description: str(dx.description) } : null,
        chiefComplaint: str(v.chiefComplaint),
        assessment: str(v.soapNotes?.assessment),
        recommendations: str(v.treatmentPlan?.followUp?.instructions),
        followUpDate: iso(v.followUpDate),
      };
    },
    revocation: (v) => (v.status === 'cancelled' ? 'The underlying visit was cancelled by the clinic.' : null),
    facts: (v, _currency, tz) => {
      const dx = primaryDiagnosis(v);
      return [
        { label: 'Visit code', value: v.visitCode || '—' },
        { label: 'Examination date', value: longDate(v.date, tz) },
        { label: 'Diagnosis', value: diagnosisText(dx) || '—' },
        ...(v.treatmentPlan?.followUp?.instructions
          ? [{ label: 'Recommendations', value: String(v.treatmentPlan.followUp.instructions) }]
          : []),
        ...(v.followUpDate ? [{ label: 'Follow-up date', value: longDate(v.followUpDate, tz) }] : []),
      ];
    },
    patient: (v) => v.patient,
    issuer: (v) => v.provider?.name,
  },

  lab_request: {
    label: 'Laboratory Request',
    load: (id, tenantId) => {
      const q = tenantScopedQuery(id, tenantId);
      return q
        ? Visit.findOne(q)
            .populate('patient', 'firstName lastName')
            .populate('provider', 'name')
            .populate('labsOrdered')
        : Promise.resolve(null);
    },
    code: (v) => v.visitCode,
    canonical: (v) => ({
      code: str(v.visitCode),
      patient: idOf(v.patient),
      provider: idOf(v.provider),
      date: iso(v.date),
      diagnoses: (v.diagnoses || []).map((d: any) => ({ code: str(d.code), description: str(d.description) })),
      chiefComplaint: str(v.chiefComplaint),
      assessment: str(v.soapNotes?.assessment),
      notes: str(v.notes),
      labs: (v.labsOrdered || []).map((l: any) => ({ id: idOf(l), testType: str(l?.testType) })),
    }),
    revocation: (v) => (v.status === 'cancelled' ? 'The underlying visit was cancelled by the clinic.' : null),
    facts: (v, _currency, tz) => [
      { label: 'Visit code', value: v.visitCode || '—' },
      { label: 'Visit date', value: longDate(v.date, tz) },
      {
        label: 'Requested tests',
        value:
          (v.labsOrdered || []).map((l: any) => l?.testType || 'Lab Test').join(', ') ||
          'As per clinical indication',
      },
    ],
    patient: (v) => v.patient,
    issuer: (v) => v.provider?.name,
  },

  lab_request_form: {
    label: 'Laboratory Request Form',
    load: (id, tenantId) => {
      const q = tenantScopedQuery(id, tenantId);
      return q
        ? LabResult.findOne(q).populate('patient', 'firstName lastName').populate('orderedBy', 'name')
        : Promise.resolve(null);
    },
    code: (l) => l.requestCode,
    canonical: (l) => ({
      code: str(l.requestCode),
      patient: idOf(l.patient),
      visit: idOf(l.visit),
      orderedBy: idOf(l.orderedBy),
      orderDate: iso(l.orderDate),
      request: {
        testType: str(l.request?.testType),
        testCode: str(l.request?.testCode),
        urgency: str(l.request?.urgency),
        description: str(l.request?.description),
        fastingRequired: !!l.request?.fastingRequired,
        preparationNotes: str(l.request?.preparationNotes),
        specialInstructions: str(l.request?.specialInstructions),
      },
      thirdPartyLab: str(l.thirdPartyLab?.labName),
    }),
    revocation: (l) => (l.status === 'cancelled' ? 'This laboratory request was cancelled by the clinic.' : null),
    facts: (l, _currency, tz) => [
      { label: 'Request code', value: l.requestCode || '—' },
      { label: 'Order date', value: longDate(l.orderDate, tz) },
      { label: 'Test', value: l.request?.testType || '—' },
      { label: 'Urgency', value: String(l.request?.urgency || 'routine').toUpperCase() },
    ],
    patient: (l) => l.patient,
    issuer: (l) => l.orderedBy?.name,
  },

  referral_letter: {
    label: 'Referral Letter',
    load: (id, tenantId) => {
      const q = tenantScopedQuery(id, tenantId);
      return q
        ? Referral.findOne(q)
            .populate('patient', 'firstName lastName')
            .populate('referringDoctor', 'firstName lastName')
            .populate('receivingDoctor', 'firstName lastName')
        : Promise.resolve(null);
    },
    code: (r) => r.referralCode,
    canonical: (r) => ({
      code: str(r.referralCode),
      patient: idOf(r.patient),
      referringDoctor: idOf(r.referringDoctor),
      receivingDoctor: idOf(r.receivingDoctor),
      receivingClinic: str(r.receivingClinic),
      referredDate: iso(r.referredDate),
      reason: str(r.reason),
      urgency: str(r.urgency),
      specialty: str(r.specialty),
      chiefComplaint: str(r.chiefComplaint),
      diagnosis: str(r.diagnosis),
      relevantHistory: str(r.relevantHistory),
      medications: (r.medications || []).map((m: any) => str(m)),
      notes: str(r.notes),
    }),
    revocation: (r) =>
      r.status === 'cancelled'
        ? 'This referral was cancelled by the clinic.'
        : r.status === 'declined'
          ? 'The receiving doctor or clinic declined this referral.'
          : null,
    facts: (r, _currency, tz) => [
      { label: 'Referral code', value: r.referralCode || '—' },
      { label: 'Date referred', value: longDate(r.referredDate, tz) },
      {
        label: 'Referred to',
        value: r.receivingDoctor ? `Dr. ${r.receivingDoctor.firstName} ${r.receivingDoctor.lastName}` : r.receivingClinic || '—',
      },
      ...(r.specialty ? [{ label: 'Specialty', value: String(r.specialty) }] : []),
      { label: 'Urgency', value: String(r.urgency || 'routine').toUpperCase() },
    ],
    patient: (r) => r.patient,
    issuer: (r) => (r.referringDoctor ? `Dr. ${r.referringDoctor.firstName} ${r.referringDoctor.lastName}` : undefined),
  },

  receipt: {
    label: 'Official Receipt',
    load: (id, tenantId) => {
      const q = tenantScopedQuery(id, tenantId);
      return q
        ? Invoice.findOne(q).populate('patient', 'firstName lastName').populate('createdBy', 'name')
        : Promise.resolve(null);
    },
    code: (inv) => inv.invoiceNumber,
    canonical: (inv) => ({
      code: str(inv.invoiceNumber),
      patient: idOf(inv.patient),
      visit: idOf(inv.visit),
      createdAt: iso(inv.createdAt),
      items: (inv.items || []).map((it: any) => ({
        code: str(it.code),
        description: str(it.description),
        service: idOf(it.serviceId),
        quantity: num(it.quantity),
        unitPrice: num(it.unitPrice),
        total: num(it.total),
      })),
      discounts: (inv.discounts || []).map((d: any) => ({
        type: str(d.type),
        reason: str(d.reason),
        amount: num(d.amount),
      })),
      subtotal: num(inv.subtotal),
      tax: num(inv.tax),
      total: num(inv.total),
      payments: (inv.payments || []).map((p: any) => ({
        method: str(p.method),
        amount: num(p.amount),
        date: iso(p.date),
        receiptNo: str(p.receiptNo),
        referenceNo: str(p.referenceNo),
      })),
      insurance: inv.insurance
        ? {
            provider: str(inv.insurance.provider),
            policyNumber: str(inv.insurance.policyNumber),
            memberId: str(inv.insurance.memberId),
            coverageAmount: num(inv.insurance.coverageAmount),
          }
        : null,
    }),
    revocation: (inv) => (inv.status === 'refunded' ? 'This transaction was refunded.' : null),
    facts: (inv, currency, tz) => {
      const paid = (inv.payments || []).reduce((s: number, p: any) => s + (p.amount || 0), 0);
      return [
        { label: 'Receipt number', value: inv.invoiceNumber || '—' },
        { label: 'Date', value: longDate(inv.createdAt, tz) },
        { label: 'Total amount', value: formatMoney(inv.total || 0, currency) },
        { label: 'Amount paid', value: formatMoney(paid, currency) },
        { label: 'Payment status', value: String(inv.status || '—').toUpperCase() },
      ];
    },
    patient: (inv) => inv.patient,
    issuer: (inv) => inv.createdBy?.name,
  },
};

export function sealDocumentLabel(type: SealDocumentType): string {
  return SEAL_DEFINITIONS[type].label;
}

// ─── Serials & signatures ────────────────────────────────────────────────────

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateSerial(): string {
  const bytes = crypto.randomBytes(10); // 80 bits → 16 base32 chars
  let out = '';
  let value = 0;
  let bits = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return out;
}

/** Accepts user-typed serials (any case, dashes/spaces, O/I/L look-alikes). Returns null if malformed. */
export function normalizeSerial(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (cleaned.length !== 16) return null;
  for (const ch of cleaned) {
    if (!CROCKFORD.includes(ch)) return null;
  }
  return cleaned;
}

export function formatSerial(serial: string): string {
  return serial.match(/.{1,4}/g)?.join('-') ?? serial;
}

function sealKey(): string {
  const dedicated = process.env.DOCUMENT_SEAL_SECRET;
  if (dedicated) return dedicated;
  const session = process.env.SESSION_SECRET;
  if (!session) {
    throw new Error('DOCUMENT_SEAL_SECRET (or SESSION_SECRET) must be set to seal documents');
  }
  // Derived sub-key so seal signatures are never interchangeable with session tokens
  return crypto.createHmac('sha256', session).update('document-seal:v1').digest('hex');
}

interface SignableSeal {
  serial: string;
  tenantId?: Types.ObjectId | string | null;
  documentType: string;
  documentId: Types.ObjectId | string;
  contentHash: string;
  issuedAt: Date;
  printNumber: number;
  copyType: string;
}

function signSeal(s: SignableSeal): string {
  const payload = [
    'v1',
    s.serial,
    s.tenantId ? String(s.tenantId) : '',
    s.documentType,
    String(s.documentId),
    s.contentHash,
    new Date(s.issuedAt).toISOString(),
    String(s.printNumber),
    s.copyType,
  ].join('|');
  return crypto.createHmac('sha256', sealKey()).update(payload).digest('hex');
}

function signatureMatches(seal: SignableSeal & { signature: string }): boolean {
  const expected = Buffer.from(signSeal(seal), 'hex');
  const actual = Buffer.from(seal.signature || '', 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Short human-checkable fingerprint printed under the QR code. */
function fingerprintOf(signature: string): string {
  return signature.slice(0, 16).toUpperCase().match(/.{1,4}/g)!.join(' ');
}

/**
 * Base URL embedded in QR codes. Set DOCUMENT_VERIFY_BASE_URL in production so
 * the printed link always points at the clinic's canonical domain.
 */
export function getVerifyBaseUrl(request: NextRequest): string {
  const configured = process.env.DOCUMENT_VERIFY_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const host = request.headers.get('host');
  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    request.nextUrl.protocol.replace(':', '');
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}

// ─── Issue ───────────────────────────────────────────────────────────────────

export interface IssuedSeal {
  serial: string;
  displaySerial: string;
  fingerprint: string;
  printNumber: number;
  copyType: SealCopyType;
  issuedAt: Date;
  issuedByName: string;
  verifyBaseUrl: string;
  verifyUrl: string;
  qrDataUrl: string;
}

export async function issueSeal(params: {
  request: NextRequest;
  documentType: SealDocumentType;
  document: any;
  tenantId?: string | null;
  userId?: string;
  copyType?: SealCopyType;
}): Promise<IssuedSeal> {
  const { request, documentType, document, tenantId, userId, copyType = 'original' } = params;
  const def = SEAL_DEFINITIONS[documentType];
  await connectDB();

  const contentHash = hashCanonical(def, document, CURRENT_CANONICAL_VERSION);
  const tenantObjectId = tenantId ? new Types.ObjectId(tenantId) : undefined;

  const [printNumber, issuer] = await Promise.all([
    // Atomic per-document counter, seeded from seals issued before the counter existed.
    nextSequence(tenantObjectId ?? null, `seal:${documentType}:${String(document._id)}`, () =>
      DocumentSeal.countDocuments({ tenantId: tenantObjectId ?? null, documentType, documentId: document._id })
    ),
    userId && Types.ObjectId.isValid(userId)
      ? User.findById(userId).select('name').lean<{ name?: string }>()
      : Promise.resolve(null),
  ]);

  const issuedAt = new Date();
  const forwarded = request.headers.get('x-forwarded-for');
  const ipAddress = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || undefined;

  let serial = '';
  let signature = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    serial = generateSerial();
    signature = signSeal({
      serial,
      tenantId: tenantObjectId,
      documentType,
      documentId: document._id,
      contentHash,
      issuedAt,
      printNumber,
      copyType,
    });
    try {
      await DocumentSeal.create({
        tenantId: tenantObjectId,
        serial,
        documentType,
        documentId: document._id,
        documentCode: def.code(document),
        copyType,
        printNumber,
        contentHash,
        signature,
        issuedAt,
        issuedBy: userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
        issuedByName: issuer?.name,
        ipAddress,
        userAgent: request.headers.get('user-agent')?.slice(0, 300) || undefined,
      });
      break;
    } catch (err: any) {
      if (err?.code !== 11000 || attempt === 2) throw err; // retry only on serial collision
    }
  }

  const verifyBaseUrl = getVerifyBaseUrl(request);
  const verifyUrl = `${verifyBaseUrl}/verify/${serial}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 });

  return {
    serial,
    displaySerial: formatSerial(serial),
    fingerprint: fingerprintOf(signature),
    printNumber,
    copyType,
    issuedAt,
    issuedByName: issuer?.name || 'Clinic staff',
    verifyBaseUrl,
    verifyUrl,
    qrDataUrl,
  };
}

// ─── Verify ──────────────────────────────────────────────────────────────────

export type SealStatus = 'valid' | 'modified' | 'revoked' | 'invalid' | 'not_found';

export interface SealVerification {
  status: SealStatus;
  message: string;
  serial?: string;
  fingerprint?: string;
  documentType?: SealDocumentType;
  documentLabel?: string;
  documentCode?: string;
  clinicName?: string;
  patientName?: string;
  issuedBy?: string;
  issuedAt?: string;
  printedBy?: string;
  printNumber?: number;
  totalPrints?: number;
  copyType?: SealCopyType;
  facts?: SealFact[];
  warnings: string[];
}

/** "Juan Dela Cruz" → "J*** D*** C***" — enough to cross-check the paper without exposing PII. */
function maskName(patient: any): string {
  const full = [patient?.firstName, patient?.lastName].filter(Boolean).join(' ').trim();
  if (!full) return '—';
  return full
    .split(/\s+/)
    .map((w) => w[0].toUpperCase() + '*'.repeat(Math.min(Math.max(w.length - 1, 2), 6)))
    .join(' ');
}

export async function verifySeal(rawSerial: string): Promise<SealVerification> {
  const serial = normalizeSerial(rawSerial);
  if (!serial) {
    return { status: 'not_found', message: 'That is not a valid document serial number.', warnings: [] };
  }

  await connectDB();
  const seal = await DocumentSeal.findOne({ serial }).lean<any>();
  if (!seal) {
    return {
      status: 'not_found',
      message: 'No document with this serial number was issued by this system. Treat the document as not genuine.',
      serial: formatSerial(serial),
      warnings: [],
    };
  }

  if (!signatureMatches(seal)) {
    return {
      status: 'invalid',
      message: 'The seal signature does not match. This record may have been tampered with — do not accept the document.',
      serial: formatSerial(serial),
      warnings: [],
    };
  }

  const def = SEAL_DEFINITIONS[seal.documentType as SealDocumentType];
  const tenantId = seal.tenantId ? String(seal.tenantId) : null;
  const [document, settings, totalPrints, tz] = await Promise.all([
    def.load(String(seal.documentId), tenantId),
    getSettings(tenantId),
    DocumentSeal.countDocuments({
      tenantId: seal.tenantId ?? null,
      documentType: seal.documentType,
      documentId: seal.documentId,
    }),
    getTenantTimezone(tenantId),
  ]);

  await DocumentSeal.updateOne({ _id: seal._id }, { $inc: { verificationCount: 1 }, $set: { lastVerifiedAt: new Date() } });

  const base: SealVerification = {
    status: 'valid',
    message: '',
    serial: formatSerial(serial),
    fingerprint: fingerprintOf(seal.signature),
    documentType: seal.documentType,
    documentLabel: def.label,
    documentCode: seal.documentCode,
    clinicName: settings?.clinicName || 'Clinic',
    issuedAt: new Date(seal.issuedAt).toISOString(),
    printedBy: seal.issuedByName,
    printNumber: seal.printNumber,
    totalPrints,
    copyType: seal.copyType,
    warnings: [],
  };

  if (seal.copyType === 'clinic') {
    base.warnings.push('This serial belongs to the clinic’s internal file copy. It is not valid for dispensing, reimbursement or insurance claims.');
  }
  if (totalPrints > 1) {
    base.warnings.push(
      `${totalPrints} copies of this document have been printed (this is copy #${seal.printNumber}). Make sure it has not already been dispensed or claimed elsewhere.`
    );
  }

  if (!document) {
    return { ...base, status: 'revoked', message: 'The clinic record for this document no longer exists. Do not accept it.' };
  }

  base.patientName = maskName(def.patient(document));
  base.issuedBy = def.issuer(document);
  base.facts = def.facts(document, settings?.billingSettings?.currency || 'PHP', tz);

  if (seal.documentType === 'prescription' && ['dispensed', 'completed'].includes(document.status)) {
    base.warnings.push('The clinic records this prescription as already dispensed/completed.');
  }

  if (seal.revokedAt) {
    return { ...base, status: 'revoked', message: `This copy was revoked by the clinic${seal.revokedReason ? `: ${seal.revokedReason}` : '.'}` };
  }

  const revocation = def.revocation(document);
  if (revocation) {
    return { ...base, status: 'revoked', message: revocation };
  }

  const currentHash = hashCanonical(def, document, canonicalVersionOf(seal.contentHash));
  if (currentHash !== seal.contentHash) {
    return {
      ...base,
      status: 'modified',
      message:
        'The clinic record changed after this copy was printed. Compare the paper carefully with the current details below — only the details shown here are authoritative.',
    };
  }

  return {
    ...base,
    message: 'This document was issued by the clinic and its contents match the clinic record. Compare the details below with the paper.',
  };
}

// ─── Revoke ──────────────────────────────────────────────────────────────────

export async function revokeSeal(params: {
  serial: string;
  tenantId?: string | null;
  userId?: string;
  reason?: string;
}): Promise<boolean> {
  const serial = normalizeSerial(params.serial);
  if (!serial) return false;
  await connectDB();
  const result = await DocumentSeal.updateOne(
    {
      serial,
      tenantId: params.tenantId ? new Types.ObjectId(params.tenantId) : null,
      revokedAt: { $exists: false },
    },
    {
      $set: {
        revokedAt: new Date(),
        revokedBy: params.userId && Types.ObjectId.isValid(params.userId) ? new Types.ObjectId(params.userId) : undefined,
        revokedReason: params.reason?.slice(0, 300) || undefined,
      },
    }
  );
  return result.modifiedCount === 1;
}
