import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types, type Schema } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ recordPatientRefused: vi.fn(), createAuditLog: vi.fn() }));
vi.mock('@/lib/emcr/activation', () => ({ requireActiveEmcr: vi.fn(async () => null) }));
vi.mock('@/lib/queue-position', () => ({ queuePosition: vi.fn(async () => 3) }));
vi.mock('@/app/lib/patient-auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    verifyPatientAuth: vi.fn(),
    patientAuthError: () => NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 }),
  };
});

import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { queuePosition } from '@/lib/queue-position';
import Patient from '@/models/Patient';
import Queue from '@/models/Queue';
import Invoice from '@/models/Invoice';
import Prescription from '@/models/Prescription';
import { PATIENT_PRESCRIPTION_SELECT } from '@/app/api/patients/me/_lib/prescription-fields';
import { PATIENT_INVOICE_SELECT } from '@/app/api/patients/me/_lib/invoice-fields';
import { PATIENT_QUEUE_FIELDS, toPatientQueueEntry } from '@/app/api/patients/me/_lib/queue-fields';
import { PATIENT_LAB_RESULT_HIDDEN, toPatientLabResult } from '@/app/api/patients/me/_lib/lab-result-fields';
import { GET as getQueue } from '@/app/api/patients/me/queue/route';
import { GET as listInvoices } from '@/app/api/patients/me/invoices/route';
import { GET as listPrescriptions } from '@/app/api/patients/me/prescriptions/route';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const TENANT_A = new Types.ObjectId('507f1f77bcf86cd799439011');

/** A dotted path on a schema, following arrays of subdocuments and nested objects. */
function hasPath(schema: Schema, path: string): boolean {
  if (schema.path(path)) return true;
  if (schema.pathType(path) === 'nested') return true;
  const [head, ...rest] = path.split('.');
  const sub = (schema.path(head) as any)?.schema as Schema | undefined;
  return !!sub && rest.length > 0 && hasPath(sub, rest.join('.'));
}

const fields = (projection: string) => projection.split(/\s+/).filter(Boolean);

/** Model.find(...) chain resolving to `rows`; every chained call is recorded. */
function chain(rows: unknown) {
  const q: any = {};
  for (const m of ['select', 'populate', 'sort', 'skip', 'limit']) q[m] = vi.fn(() => q);
  q.lean = vi.fn(async () => rows);
  return q;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient' } as any);
  vi.mocked(queuePosition).mockResolvedValue(3);
  vi.spyOn(Patient, 'findById').mockReturnValue({
    select: () => ({ lean: async () => ({ _id: new Types.ObjectId(PATIENT_ID), tenantIds: [TENANT_A] }) }),
  } as any);
});

describe('patient prescription fields', () => {
  it('lists only fields that exist on the model', () => {
    for (const f of fields(PATIENT_PRESCRIPTION_SELECT)) expect(hasPath(Prescription.schema, f), f).toBe(true);
  });

  it('keeps what eMCR reads and leaves staff-only data out', () => {
    const select = fields(PATIENT_PRESCRIPTION_SELECT);
    for (const f of ['prescriptionCode', 'status', 'issuedAt', 'notes', 'prescribedBy', 'visit', 'createdAt', 'medications.name',
      'medications.frequency', 'medications.durationDays', 'medications.instructions', 'pharmacyDispenses.pharmacyName',
      'pharmacyDispenses.dispensedAt']) {
      expect(select).toContain(f);
    }
    for (const f of select) {
      expect(f).not.toMatch(/^(digitalSignature|drugInteractions|copies|contentAuthor|archived|expiryWarningsSent|refillRemindersSent|lastMedicationReminderSlot)/);
      expect(f).not.toMatch(/^pharmacyDispenses\.(dispensedBy|notes|trackingNumber)/);
    }
  });

  it('the list route applies the whitelist', async () => {
    const find = chain([]);
    vi.spyOn(Prescription, 'find').mockReturnValue(find);
    vi.spyOn(Prescription, 'countDocuments').mockResolvedValue(0 as any);
    const res = await listPrescriptions(new NextRequest('http://localhost/api/patients/me/prescriptions'));
    expect(res.status).toBe(200);
    expect(find.select).toHaveBeenCalledWith(PATIENT_PRESCRIPTION_SELECT);
  });
});

describe('patient invoice fields', () => {
  it('lists only fields that exist on the model', () => {
    for (const f of fields(PATIENT_INVOICE_SELECT)) expect(hasPath(Invoice.schema, f), f).toBe(true);
  });

  it('keeps what eMCR reads and leaves staff-only data out', () => {
    const select = fields(PATIENT_INVOICE_SELECT);
    for (const f of ['invoiceNumber', 'items.description', 'items.total', 'subtotal', 'discounts.amount', 'tax', 'total',
      'payments.method', 'payments.amount', 'payments.date', 'payments.receiptNo', 'status', 'createdAt']) {
      expect(select).toContain(f);
    }
    for (const f of select) {
      expect(f).not.toMatch(/^(professionalFee|payLinks|paymentClaims|philhealth|insurance|billedTo|paymentRemindersSent|createdBy|taxBreakdown)/);
      expect(f).not.toMatch(/^payments\.(processedBy|notes|accountId)/);
      expect(f).not.toMatch(/^discounts\.(appliedBy|idNumber)/);
      expect(f).not.toMatch(/^bir\.(issuedBy|lockAt)/);
    }
  });

  it('the list route applies the whitelist and sums open balances in the database', async () => {
    const find = chain([{ _id: 'i1', status: 'unpaid', total: 500 }]);
    vi.spyOn(Invoice, 'find').mockReturnValue(find);
    vi.spyOn(Invoice, 'countDocuments').mockResolvedValue(1 as any);
    const aggregate = vi.spyOn(Invoice, 'aggregate').mockResolvedValue([{ _id: null, outstandingBalance: 650, unpaidCount: 2 }] as any);

    const res = await listInvoices(new NextRequest('http://localhost/api/patients/me/invoices?status=paid'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(find.select).toHaveBeenCalledWith(PATIENT_INVOICE_SELECT);
    expect(body.summary).toEqual({ outstandingBalance: 650, unpaidCount: 2 });
    const [match, group] = aggregate.mock.calls[0][0] as any[];
    // The summary ignores the list's status filter and matches ObjectIds (aggregate does not cast).
    expect(match.$match).toEqual({
      patient: { $in: [new Types.ObjectId(PATIENT_ID)] },
      tenantId: { $in: [TENANT_A] },
      status: { $in: ['unpaid', 'partial'] },
    });
    expect(group.$group.unpaidCount).toEqual({ $sum: 1 });
  });

  it('reports a zero summary when nothing is owed', async () => {
    vi.spyOn(Invoice, 'find').mockReturnValue(chain([]));
    vi.spyOn(Invoice, 'countDocuments').mockResolvedValue(0 as any);
    vi.spyOn(Invoice, 'aggregate').mockResolvedValue([] as any);
    const body = await (await listInvoices(new NextRequest('http://localhost/api/patients/me/invoices'))).json();
    expect(body.summary).toEqual({ outstandingBalance: 0, unpaidCount: 0 });
  });
});

describe('patient queue entry', () => {
  const entry = {
    _id: 'q1',
    tenantId: TENANT_A,
    queueNumber: 'A007',
    queueType: 'walk-in',
    status: 'waiting',
    awayReason: null,
    checkedIn: false,
    qrCode: '{"q":"A007"}',
    queuedAt: new Date('2026-11-15T01:00:00Z'),
    estimatedWaitTime: 20,
    doctor: { _id: 'd1', firstName: 'Ana', lastName: 'Cruz' },
    room: { name: 'Room 2' },
    patientName: 'Juan Dela Cruz',
    priority: 2,
    notes: 'staff note',
    completionNotes: 'x',
    nextAction: 'billing',
    vitals: { bp: '120/80' },
    checkInMethod: 'kiosk',
  };

  it('returns only the eMCR QueueEntry fields', () => {
    const view = toPatientQueueEntry(entry, 3);
    expect(Object.keys(view).sort()).toEqual([...PATIENT_QUEUE_FIELDS, 'position'].sort());
    expect(view).toMatchObject({ queueNumber: 'A007', position: 3, room: { name: 'Room 2' } });
  });

  it('the route selects and returns the whitelist', async () => {
    const q = chain(null);
    q.lean = vi.fn(async () => entry);
    vi.spyOn(Queue, 'findOne').mockReturnValue(q);
    const res = await getQueue(new NextRequest('http://localhost/api/patients/me/queue'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(fields(q.select.mock.calls[0][0])).toEqual([...PATIENT_QUEUE_FIELDS, 'priority']);
    expect(body.data.position).toBe(3);
    for (const hidden of ['notes', 'priority', 'completionNotes', 'nextAction', 'vitals', 'patientName', 'checkInMethod']) {
      expect(body.data).not.toHaveProperty(hidden);
    }
  });

  it('a populated model is registered for every populate (no MissingSchemaError on a cold server)', async () => {
    const mongoose = (await import('mongoose')).default;
    expect(mongoose.modelNames()).toEqual(expect.arrayContaining(['Doctor', 'Room']));
  });
});

describe('patient lab result fields', () => {
  it('hides staff and file-location fields', () => {
    const hidden = fields(PATIENT_LAB_RESULT_HIDDEN);
    for (const f of ['-thirdPartyLab', '-attachments.url', '-attachments.gridFsId', '-attachments.uploadedBy', '-attachments.notes',
      '-orderedBy', '-performedBy', '-reviewedBy', '-receivedBy', '-notificationSent', '-notificationAttempts']) {
      expect(hidden).toContain(f);
    }
  });

  it('withholds values until the lab has completed the request', () => {
    const base = { _id: 'l1', results: { hb: 9.1 }, abnormalFlags: { hb: 'low' }, interpretation: 'pending', referenceRanges: { hb: '12-16' } };
    for (const status of ['ordered', 'in-progress', 'cancelled']) {
      expect(toPatientLabResult({ ...base, status })).toMatchObject({ results: null, abnormalFlags: null, referenceRanges: { hb: '12-16' } });
    }
    for (const status of ['completed', 'reviewed']) {
      expect(toPatientLabResult({ ...base, status })).toMatchObject({ results: { hb: 9.1 }, abnormalFlags: { hb: 'low' } });
    }
  });
});
