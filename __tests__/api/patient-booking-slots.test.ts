import { describe, it, expect } from 'vitest';
import {
  bookingHorizon,
  candidateSlots,
  clinicClock,
  slotRejection,
  type BookableDoctor,
  type ClinicClock,
} from '@/app/api/patients/appointments/_lib/booking-slots';
import { timeToMinutes } from '@/lib/appointment-booking';

// Mon–Fri 09:00–12:00 (2026-10-19 is a Monday).
const doctor: BookableDoctor = {
  schedule: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '12:00' })),
};
const clock: ClinicClock = { today: '2026-10-19', nowMinutes: 10 * 60 + 5 }; // 10:05 clinic time
const reject = (date: string, time: string, c = clock) => slotRejection(doctor, date, timeToMinutes(time), c);

describe('patient booking slot grid', () => {
  it('clinicClock reads the day and minute in the clinic timezone', () => {
    // 2026-10-18T17:30Z is 2026-10-19 01:30 in Manila (UTC+8).
    expect(clinicClock('Asia/Manila', new Date('2026-10-18T17:30:00Z'))).toEqual({ today: '2026-10-19', nowMinutes: 90 });
  });

  it('horizon is 60 days starting today', () => {
    const h = bookingHorizon('2026-10-19');
    expect(h).toHaveLength(60);
    expect(h[0]).toBe('2026-10-19');
    expect(h[59]).toBe('2026-12-17');
  });

  it("offers 30-minute slots, dropping today's past and current slots", () => {
    expect(candidateSlots(doctor, '2026-10-19', clock)).toEqual([10 * 60 + 30, 11 * 60, 11 * 60 + 30]);
    expect(candidateSlots(doctor, '2026-10-20', clock)).toEqual([540, 570, 600, 630, 660, 690]);
  });

  it('offers nothing on a day off, in the past or beyond the horizon', () => {
    expect(candidateSlots(doctor, '2026-10-18', clock)).toEqual([]); // past (and a Sunday)
    expect(candidateSlots(doctor, '2026-10-24', clock)).toEqual([]); // Saturday
    expect(candidateSlots(doctor, '2026-12-18', clock)).toEqual([]); // day 61
  });

  it('POST accepts exactly the offered slots', () => {
    for (const date of ['2026-10-19', '2026-10-20', '2026-12-17']) {
      for (const minutes of candidateSlots(doctor, date, clock)) {
        expect(slotRejection(doctor, date, minutes, clock)).toBeNull();
      }
    }
  });

  it('rejects past dates and earlier times today (clinic time)', () => {
    expect(reject('2026-10-16', '10:00')).toBe('past');
    expect(reject('2026-10-19', '09:30')).toBe('past');
    expect(reject('2026-10-19', '10:00')).toBe('past'); // the slot in progress
    expect(reject('2026-10-19', '10:30')).toBeNull();
  });

  it('rejects dates beyond the 60-day window', () => {
    expect(reject('2026-12-18', '09:00')).toBe('beyond-horizon');
    expect(reject('2027-06-01', '09:00')).toBe('beyond-horizon');
    expect(reject('2026-12-17', '09:00')).toBeNull();
  });

  it("rejects times outside the doctor's hours or on a day off", () => {
    expect(reject('2026-10-20', '08:30')).toBe('not-working');
    expect(reject('2026-10-20', '11:45')).toBe('not-working'); // would run past 12:00
    expect(reject('2026-10-24', '09:00')).toBe('not-working');
  });

  it('rejects times off the 30-minute grid', () => {
    expect(reject('2026-10-20', '09:15')).toBe('off-grid');
    expect(reject('2026-10-20', '10:01')).toBe('off-grid');
  });

  it('the grid starts at the doctor start time, not on the hour', () => {
    const late: BookableDoctor = { schedule: [{ dayOfWeek: 2, startTime: '09:15', endTime: '10:15' }] };
    expect(candidateSlots(late, '2026-10-20', clock)).toEqual([555, 585]);
    expect(slotRejection(late, '2026-10-20', 555, clock)).toBeNull();
    expect(slotRejection(late, '2026-10-20', 540, clock)).toBe('not-working');
    expect(slotRejection(late, '2026-10-20', 570, clock)).toBe('off-grid');
  });

  it('doctors without weekly hours keep the 9–5 default', () => {
    expect(candidateSlots({ schedule: [] }, '2026-10-25', clock)).toHaveLength(16);
  });
});
