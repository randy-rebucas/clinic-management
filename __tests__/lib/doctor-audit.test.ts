import { describe, it, expect, vi } from 'vitest';

const CARDIO = '507f1f77bcf86cd799439021';
const PEDIA = '507f1f77bcf86cd799439022';

vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/models/Specialization', () => ({
  default: {
    find: vi.fn(() => ({
      select: () => ({
        lean: async () => [
          { _id: CARDIO, name: 'Cardiology' },
          { _id: PEDIA, name: 'Pediatrics' },
        ],
      }),
    })),
  },
}));

const { doctorChanges, changedSentence, doctorLabel } = await import('@/app/api/doctors/_lib/doctor-audit');

const base = {
  title: 'Dr.',
  firstName: 'Ana',
  lastName: 'Reyes',
  email: 'ana@example.com',
  phone: '09171234567',
  specializationId: CARDIO,
  status: 'active',
  qualifications: ['MD'],
  schedule: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isAvailable: true }],
  availabilityOverrides: [],
};

describe('doctorChanges', () => {
  it('names the specialty instead of its id', async () => {
    const changes = await doctorChanges(base, { specializationId: { _id: PEDIA, name: 'Pediatrics' } });
    expect(changes).toEqual([{ field: 'specialization', oldValue: 'Cardiology', newValue: 'Pediatrics' }]);
  });

  it('compares only the fields sent and skips the unchanged ones', async () => {
    const changes = await doctorChanges(base, { ...base, phone: '09179999999' });
    expect(changes).toEqual([{ field: 'phone', oldValue: '09171234567', newValue: '09179999999' }]);
  });

  it('treats blank and missing as the same', async () => {
    expect(await doctorChanges({ ...base, ptr: undefined }, { ptr: '' })).toEqual([]);
  });

  it('puts status, qualifications and hours in words', async () => {
    const changes = await doctorChanges(base, {
      status: 'on-leave',
      qualifications: ['MD', 'FPCP'],
      schedule: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00', isAvailable: true }],
    });
    expect(changes).toEqual([
      { field: 'qualifications', oldValue: 'MD', newValue: 'MD, FPCP' },
      { field: 'status', oldValue: 'Active', newValue: 'On leave' },
      { field: 'weeklyHours', oldValue: 'Mon 9 AM–5 PM', newValue: 'Mon 8 AM–12 PM' },
    ]);
  });

  it('records only the days of time off that came or went', async () => {
    const kept = { date: '2026-11-03T12:00:00.000Z', isAvailable: false, reason: 'Conference' };
    const added = { date: '2026-11-08T12:00:00.000Z', isAvailable: true, startTime: '09:00', endTime: '12:00' };
    const changes = await doctorChanges({ ...base, availabilityOverrides: [kept] }, { availabilityOverrides: [kept, added] });
    expect(changes).toEqual([{ field: 'timeOff', oldValue: null, newValue: ['Sun, Nov 8, 2026: 9 AM–12 PM'] }]);
  });

  it('lists every filled field for a new profile', async () => {
    const fields = (await doctorChanges({}, base)).map((c) => c.field);
    expect(fields).toEqual(['title', 'firstName', 'lastName', 'email', 'phone', 'specialization', 'qualifications', 'status', 'weeklyHours']);
  });
});

describe('sentences', () => {
  it('names the doctor and what changed', () => {
    expect(doctorLabel({ firstName: 'Ana', lastName: 'Reyes' })).toBe('Dr. Ana Reyes');
    expect(changedSentence('Dr. Ana Reyes', [{ field: 'status', oldValue: 'Active', newValue: 'Inactive' }])).toBe('Marked Dr. Ana Reyes inactive');
    expect(changedSentence('Dr. Ana Reyes', [
      { field: 'specialization', oldValue: 'Cardiology', newValue: 'Pediatrics' },
      { field: 'phone', oldValue: '1', newValue: '2' },
    ])).toBe('Changed Dr. Ana Reyes: specialization, phone');
  });
});
