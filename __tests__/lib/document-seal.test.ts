import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({ clinicName: 'Sunrise Clinic', billingSettings: { currency: 'PHP' } }),
}));
vi.mock('@/lib/clinic-timezone', () => ({ getTenantTimezone: vi.fn().mockResolvedValue('Asia/Manila') }));
const counters = new Map<string, number>();
vi.mock('@/lib/counters', () => ({
  nextSequence: vi.fn(async (tenantId: unknown, key: string, seed?: () => Promise<number>) => {
    const k = `${String(tenantId)}:${key}`;
    const next = (counters.has(k) ? counters.get(k)! : seed ? await seed() : 0) + 1;
    counters.set(k, next);
    return next;
  }),
}));
vi.mock('qrcode',() => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAAA') } }));

// In-memory seal store
const seals: any[] = [];
vi.mock('@/models/DocumentSeal', () => ({
  default: {
    create: vi.fn(async (doc: any) => {
      seals.push({ ...doc, _id: new Types.ObjectId() });
      return doc;
    }),
    findOne: vi.fn(({ serial }: any) => ({ lean: async () => seals.find((s) => s.serial === serial) ?? null })),
    countDocuments: vi.fn(async () => seals.length),
    updateOne: vi.fn(async () => ({ modifiedCount: 1 })),
  },
}));

let currentRx: any = null;
const thenable = (get: () => any) => {
  const q: any = { populate: () => q, then: (res: any, rej: any) => Promise.resolve(get()).then(res, rej) };
  return q;
};
vi.mock('@/models/Prescription', () => ({ default: { findOne: vi.fn(() => thenable(() => currentRx)) } }));
vi.mock('@/models/Visit', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/LabResult', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/Invoice', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/Patient', () => ({ default: {} }));
vi.mock('@/models/User', () => ({
  default: { findById: vi.fn(() => ({ select: () => ({ lean: async () => ({ name: 'Nurse Joy' }) }) })) },
}));

import { issueSeal, verifySeal, normalizeSerial, formatSerial } from '@/lib/document-seal';
import { escapeHtml, safeImageSrc } from '@/lib/document-protection';

const tenantId = new Types.ObjectId().toString();
const request = () =>
  new NextRequest('http://sunrise.localhost:3000/api/prescriptions/x/print', {
    headers: { host: 'sunrise.localhost:3000', 'user-agent': 'vitest' },
  });

function makePrescription() {
  return {
    _id: new Types.ObjectId(),
    prescriptionCode: 'RX-0001',
    status: 'active',
    issuedAt: new Date('2026-10-01T08:00:00Z'),
    patient: { _id: new Types.ObjectId(), firstName: 'Juan', lastName: 'Dela Cruz' },
    prescribedBy: { _id: new Types.ObjectId(), name: 'Dr. Santos' },
    visit: new Types.ObjectId(),
    notes: 'Take with food',
    medications: [{ name: 'Amoxicillin', genericName: 'Amoxicillin', quantity: 21, instructions: '1 cap TID x 7 days' }],
  };
}

async function issue(copyType: 'patient' | 'clinic' = 'patient') {
  return issueSeal({
    request: request(),
    documentType: 'prescription',
    document: currentRx,
    tenantId,
    userId: new Types.ObjectId().toString(),
    copyType,
  });
}

describe('document seals', () => {
  beforeEach(() => {
    seals.length = 0;
    counters.clear();
    process.env.DOCUMENT_SEAL_SECRET = 'test-seal-secret-that-is-at-least-32-chars';
    currentRx = makePrescription();
  });

  it('issues a seal with a verify URL on the request host', async () => {
    const seal = await issue();
    expect(seal.serial).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    expect(seal.verifyUrl).toBe(`http://sunrise.localhost:3000/verify/${seal.serial}`);
    expect(seal.printNumber).toBe(1);
    expect(seal.issuedByName).toBe('Nurse Joy');
  });

  it('verifies an unaltered document as valid, with masked patient name', async () => {
    const seal = await issue();
    const result = await verifySeal(seal.displaySerial.toLowerCase());
    expect(result.status).toBe('valid');
    expect(result.patientName).toBe('J*** D*** C***');
    expect(result.clinicName).toBe('Sunrise Clinic');
    expect(result.facts?.some((f) => f.value.includes('Amoxicillin'))).toBe(true);
  });

  it('reports modified when printed content changes after issue', async () => {
    const seal = await issue();
    currentRx.medications[0].quantity = 42;
    expect((await verifySeal(seal.serial)).status).toBe('modified');
  });

  it('ignores non-printed fields such as dispensing status', async () => {
    const seal = await issue();
    currentRx.status = 'dispensed';
    const result = await verifySeal(seal.serial);
    expect(result.status).toBe('valid');
    expect(result.warnings.join(' ')).toMatch(/already dispensed/);
  });

  it('reports revoked when the prescription is cancelled', async () => {
    const seal = await issue();
    currentRx.status = 'cancelled';
    expect((await verifySeal(seal.serial)).status).toBe('revoked');
  });

  it('reports invalid when the stored seal record is tampered with', async () => {
    const seal = await issue();
    seals[0].contentHash = 'f'.repeat(64);
    expect((await verifySeal(seal.serial)).status).toBe('invalid');
  });

  it('flags clinic file copies and reprints', async () => {
    await issue('patient');
    const clinicCopy = await issue('clinic');
    const result = await verifySeal(clinicCopy.serial);
    expect(clinicCopy.printNumber).toBe(2);
    expect(result.warnings.join(' ')).toMatch(/file copy/);
    expect(result.warnings.join(' ')).toMatch(/2 copies/);
  });

  it('returns not_found for unknown or malformed serials', async () => {
    expect((await verifySeal('0000-0000-0000-0000')).status).toBe('not_found');
    expect((await verifySeal('<script>')).status).toBe('not_found');
  });
});

describe('serial helpers', () => {
  it('normalizes look-alike characters and formatting', () => {
    expect(normalizeSerial('abcd-efgh-jkmn-pqrs')).toBe('ABCDEFGHJKMNPQRS');
    expect(normalizeSerial('O1IL 0000 0000 0000')).toBe('0111000000000000');
    expect(normalizeSerial('too-short')).toBeNull();
    expect(formatSerial('ABCDEFGHJKMNPQRS')).toBe('ABCD-EFGH-JKMN-PQRS');
  });
});

describe('html safety helpers', () => {
  it('escapes markup so record fields cannot inject content into documents', () => {
    expect(escapeHtml('<b onclick="x">Tom & \'Jerry\'</b>')).toBe(
      '&lt;b onclick=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/b&gt;'
    );
    expect(escapeHtml(undefined)).toBe('');
  });

  it('only accepts base64 raster data URLs as signature images', () => {
    expect(safeImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(safeImageSrc('javascript:alert(1)')).toBeNull();
    expect(safeImageSrc('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(safeImageSrc('https://evil.example/x.png" onerror="alert(1)')).toBeNull();
  });
});
