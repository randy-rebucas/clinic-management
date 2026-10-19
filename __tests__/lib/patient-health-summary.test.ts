import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: {} }));
vi.mock('@/models/Prescription', () => ({ default: {} }));
vi.mock('@/models/Tenant', () => ({ default: {} }));
vi.mock('@/models/User', () => ({ default: {} }));

import { mergeAllergies, mergeConditions, mergeImmunizations, splitMedications } from '@/lib/patient-health-summary';
import { generateHealthSummaryHTML } from '@/lib/health-summary-document';

const NOW = new Date('2026-10-19T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('health summary merging', () => {
  it('folds allergies by substance across clinics, keeping the most detail', () => {
    const merged = mergeAllergies([
      { value: 'Penicillin', clinic: 'A' },
      { value: { substance: 'penicillin', reaction: 'Hives', severity: 'severe' }, clinic: 'B' },
      { value: { substance: 'Shellfish' }, clinic: 'A' },
      { value: '  ', clinic: 'A' },
    ]);
    expect(merged).toEqual([
      { substance: 'Penicillin', reaction: 'Hives', severity: 'severe', clinics: ['A', 'B'] },
      { substance: 'Shellfish', reaction: null, severity: null, clinics: ['A'] },
    ]);
  });

  it('an open condition at one clinic outranks a resolved record at another, open first', () => {
    const merged = mergeConditions([
      { value: { condition: 'Asthma', status: 'resolved' }, clinic: 'A' },
      { value: { condition: 'asthma', status: 'chronic' }, clinic: 'B' },
      { value: { condition: 'Appendicitis', status: 'resolved' }, clinic: 'A' },
    ]);
    expect(merged.map((c) => [c.condition, c.status])).toEqual([
      ['Asthma', 'chronic'],
      ['Appendicitis', 'resolved'],
    ]);
    expect(merged[0].clinics).toEqual(['A', 'B']);
  });

  it('the same vaccine on the same day is one dose; newest first', () => {
    const merged = mergeImmunizations([
      { value: { name: 'MMR', date: '2020-01-01T00:00:00Z' }, clinic: 'A' },
      { value: { name: 'mmr', date: '2020-01-01T09:00:00Z' }, clinic: 'B' },
      { value: { name: 'Flu', date: '2025-10-01' }, clinic: 'B' },
    ]);
    expect(merged.map((i) => i.name)).toEqual(['Flu', 'MMR']);
  });

  it('splits current and recent medicines from course length and prescription status', () => {
    const clinic = () => 'A';
    const { current, recent } = splitMedications(
      [
        { _id: 'rx1', issuedAt: daysAgo(3), status: 'active', medications: [{ name: 'Amoxicillin', durationDays: 7 }] },
        { _id: 'rx2', issuedAt: daysAgo(20), status: 'dispensed', medications: [{ name: 'Metformin' }] }, // no duration: 30 days
        { _id: 'rx3', issuedAt: daysAgo(40), status: 'active', medications: [{ name: 'Ibuprofen', durationDays: 5 }] },
        { _id: 'rx4', issuedAt: daysAgo(2), status: 'completed', medications: [{ name: 'Cetirizine', durationDays: 30 }] },
        { _id: 'rx5', issuedAt: daysAgo(90), status: 'active', medications: [{ name: 'amoxicillin', durationDays: 7 }] },
      ],
      clinic,
      NOW
    );
    expect(current.map((m) => m.name)).toEqual(['Amoxicillin', 'Metformin']);
    expect(current[0].endsAt).toBe(daysAgo(-4).slice(0, 10));
    // An older course of a current medicine isn't listed again under recent.
    expect(recent.map((m) => m.name)).toEqual(['Cetirizine', 'Ibuprofen']);
  });

  it('renders escaped HTML', () => {
    const html = generateHealthSummaryHTML({
      generatedAt: NOW.toISOString(),
      patient: { firstName: '<b>Ana</b>', middleName: null, lastName: 'Cruz', suffix: null, dateOfBirth: '2016-01-01', sex: 'female' },
      clinics: [],
      allergies: [],
      conditions: [],
      medications: { current: [], recent: [] },
      immunizations: [],
    });
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(html).toContain('No known allergies recorded.');
  });
});
