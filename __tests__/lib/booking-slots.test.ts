import { describe, it, expect } from 'vitest';
import {
  bookingHorizon,
  bookingRulesFrom,
  bookingWindow,
  candidateSlots,
  clinicClock,
  freeSlots,
  freeSlotsAnyDoctor,
  slotRejection,
  type BookableDoctor,
  type BookingRules,
  type ClinicClock,
} from '@/lib/booking-slots';
import { timeToMinutes } from '@/lib/appointment-booking';

const h = (hhmm: string) => timeToMinutes(hhmm)!;

// Mon–Fri 09:00–12:00 (2026-10-19 is a Monday).
const doctor: BookableDoctor = {
  schedule: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '12:00' })),
};
const clock: ClinicClock = { today: '2026-10-19', nowMinutes: 10 * 60 + 5 }; // 10:05 clinic time
const reject = (date: string, time: string, c = clock) => slotRejection(doctor, date, timeToMinutes(time), c);

// Clinic: Mon–Fri 08:00–17:00, Sat 09:00–13:00, Sun closed.
const businessHours = [
  ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map((day) => ({ day, open: '08:00', close: '17:00', closed: false })),
  { day: 'saturday', open: '09:00', close: '13:00', closed: false },
  { day: 'sunday', open: '09:00', close: '13:00', closed: true },
];
const rules: BookingRules = { businessHours, slotMinutes: 30 };
const noSchedule: BookableDoctor = { schedule: [] };

describe('booking slot grid (legacy behaviour, no clinic rules)', () => {
  it('clinicClock reads the day and minute in the clinic timezone', () => {
    // 2026-10-18T17:30Z is 2026-10-19 01:30 in Manila (UTC+8).
    expect(clinicClock('Asia/Manila', new Date('2026-10-18T17:30:00Z'))).toEqual({ today: '2026-10-19', nowMinutes: 90 });
  });

  it('horizon is 60 days starting today', () => {
    const days = bookingHorizon('2026-10-19');
    expect(days).toHaveLength(60);
    expect(days[0]).toBe('2026-10-19');
    expect(days[59]).toBe('2026-12-17');
  });

  it("offers 30-minute slots, dropping today's past and current slots", () => {
    expect(candidateSlots(doctor, '2026-10-19', clock)).toEqual([h('10:30'), h('11:00'), h('11:30')]);
    expect(candidateSlots(doctor, '2026-10-20', clock)).toEqual([540, 570, 600, 630, 660, 690]);
  });

  it('offers nothing on a day off, in the past or beyond the horizon', () => {
    expect(candidateSlots(doctor, '2026-10-18', clock)).toEqual([]);
    expect(candidateSlots(doctor, '2026-10-24', clock)).toEqual([]);
    expect(candidateSlots(doctor, '2026-12-18', clock)).toEqual([]);
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
    expect(reject('2026-10-19', '10:00')).toBe('past');
    expect(reject('2026-10-19', '10:30')).toBeNull();
  });

  it('rejects dates beyond the 60-day window', () => {
    expect(reject('2026-12-18', '09:00')).toBe('beyond-horizon');
    expect(reject('2026-12-17', '09:00')).toBeNull();
  });

  it("rejects times outside the doctor's hours, and off the grid", () => {
    expect(reject('2026-10-20', '08:30')).toBe('not-working');
    expect(reject('2026-10-20', '11:45')).toBe('not-working');
    expect(reject('2026-10-24', '09:00')).toBe('not-working');
    expect(reject('2026-10-20', '09:15')).toBe('off-grid');
  });

  it('doctors without weekly hours and no clinic hours keep the 9–5 default', () => {
    expect(candidateSlots(noSchedule, '2026-10-25', clock)).toHaveLength(16);
  });
});

describe('clinic opening hours', () => {
  it('a closed day offers no slots, even for a doctor rostered that day', () => {
    const sundayDoctor: BookableDoctor = { schedule: [{ dayOfWeek: 0, startTime: '09:00', endTime: '12:00' }] };
    expect(candidateSlots(sundayDoctor, '2026-10-25', clock)).not.toEqual([]); // without rules
    expect(candidateSlots(sundayDoctor, '2026-10-25', clock, rules)).toEqual([]);
    expect(bookingWindow(sundayDoctor, '2026-10-25', rules)).toBeNull();
    expect(slotRejection(sundayDoctor, '2026-10-25', h('09:00'), clock, rules)).toBe('not-working');
  });

  it('slots stay inside the opening hours: first at open, last ending at close', () => {
    const slots = candidateSlots(noSchedule, '2026-10-24', clock, rules); // Saturday 09:00–13:00
    expect(slots[0]).toBe(h('09:00'));
    expect(slots[slots.length - 1]).toBe(h('12:30'));
    expect(slots).toHaveLength(8);
    expect(slotRejection(noSchedule, '2026-10-24', h('13:00'), clock, rules)).toBe('not-working');
    expect(slotRejection(noSchedule, '2026-10-24', h('08:30'), clock, rules)).toBe('not-working');
  });

  it('no slot runs past closing when the step does not divide the day', () => {
    const r: BookingRules = { businessHours, slotMinutes: 45 };
    const slots = candidateSlots(noSchedule, '2026-10-24', clock, r); // 09:00–13:00
    expect(slots).toEqual([h('09:00'), h('09:45'), h('10:30'), h('11:15'), h('12:00')]);
    expect(slots.every((s) => s + 45 <= h('13:00'))).toBe(true);
  });

  it("steps by the clinic's usual appointment length", () => {
    const r: BookingRules = { businessHours, slotMinutes: 60 };
    expect(candidateSlots(doctor, '2026-10-20', clock, r)).toEqual([h('09:00'), h('10:00'), h('11:00')]);
    expect(slotRejection(doctor, '2026-10-20', h('09:30'), clock, r)).toBe('off-grid');
  });

  it('bookingRulesFrom reads Settings and falls back to 30 minutes', () => {
    expect(bookingRulesFrom({ businessHours, appointmentSettings: { defaultDuration: 20 } }).slotMinutes).toBe(20);
    expect(bookingRulesFrom({ businessHours, appointmentSettings: {} }).slotMinutes).toBe(30);
    expect(bookingRulesFrom(null)).toEqual({ businessHours: [], slotMinutes: 30 });
  });
});

describe('doctor schedules', () => {
  it("narrow the clinic's hours to the doctor's", () => {
    // Clinic Tue 08:00–17:00, doctor Tue 09:00–12:00 → 09:00–12:00.
    expect(bookingWindow(doctor, '2026-10-20', rules)).toEqual({ start: h('09:00'), end: h('12:00') });
    expect(candidateSlots(doctor, '2026-10-20', clock, rules)).toEqual([540, 570, 600, 630, 660, 690]);
  });

  it("the clinic's hours narrow a doctor rostered beyond them", () => {
    const long: BookableDoctor = { schedule: [{ dayOfWeek: 6, startTime: '07:00', endTime: '18:00' }] };
    expect(bookingWindow(long, '2026-10-24', rules)).toEqual({ start: h('09:00'), end: h('13:00') });
  });

  it('a doctor not rostered that weekday offers nothing even when the clinic is open', () => {
    expect(candidateSlots(doctor, '2026-10-24', clock, rules)).toEqual([]); // Saturday
  });

  it('a doctor with no schedule falls back to the opening hours', () => {
    expect(bookingWindow(noSchedule, '2026-10-20', rules)).toEqual({ start: h('08:00'), end: h('17:00') });
    expect(candidateSlots(noSchedule, '2026-10-20', clock, rules)).toHaveLength(18);
    expect(candidateSlots(noSchedule, '2026-10-25', clock, rules)).toEqual([]); // Sunday closed
  });

  it('time off and leave still apply', () => {
    const off: BookableDoctor = { ...doctor, availabilityOverrides: [{ date: '2026-10-20T12:00:00.000Z', isAvailable: false }] };
    expect(candidateSlots(off, '2026-10-20', clock, rules)).toEqual([]);
    const fallbackOff: BookableDoctor = { schedule: [], availabilityOverrides: off.availabilityOverrides };
    expect(candidateSlots(fallbackOff, '2026-10-20', clock, rules)).toEqual([]);
    expect(candidateSlots({ ...doctor, status: 'on-leave' }, '2026-10-20', clock, rules)).toEqual([]);
  });
});

describe('existing appointments', () => {
  it('removes slots overlapping a booking, including long and off-grid ones', () => {
    const booked = [
      { start: h('09:00'), duration: 30 },
      { start: h('10:15'), duration: 45 }, // covers 10:00 and 10:30 slots
    ];
    expect(freeSlots(doctor, '2026-10-20', clock, booked, rules)).toEqual([h('09:30'), h('11:00'), h('11:30')]);
  });

  it('a booking without a length counts as 30 minutes', () => {
    expect(freeSlots(doctor, '2026-10-20', clock, [{ start: h('11:00') }], rules)).toEqual([540, 570, 600, 630, 690]);
  });

  it('with no doctor chosen, a slot is free if any doctor is free', () => {
    const other: BookableDoctor = { schedule: [{ dayOfWeek: 2, startTime: '11:00', endTime: '13:00' }] };
    const slots = freeSlotsAnyDoctor(
      [
        { doctor, booked: [{ start: h('11:00'), duration: 60 }] }, // 09:00–11:00 free
        { doctor: other, booked: [{ start: h('12:00'), duration: 30 }] }, // 11:00, 11:30, 12:30 free
      ],
      '2026-10-20',
      clock,
      rules
    );
    expect(slots).toEqual([h('09:00'), h('09:30'), h('10:00'), h('10:30'), h('11:00'), h('11:30'), h('12:30')]);
  });
});

describe('time zone and past times', () => {
  // 2026-10-19T23:30Z: Tuesday 07:30 in Manila, still Monday 23:30 in UTC.
  const instant = new Date('2026-10-19T23:30:00Z');

  it('day boundaries follow the clinic zone, not the server (UTC)', () => {
    const manila = clinicClock('Asia/Manila', instant);
    // What a UTC server would read with naive date maths ('UTC' itself means "unset" → Manila).
    const utc = clinicClock('Etc/UTC', instant);
    expect(clinicClock('UTC', instant)).toEqual(manila);
    expect(manila).toEqual({ today: '2026-10-20', nowMinutes: h('07:30') });
    expect(utc).toEqual({ today: '2026-10-19', nowMinutes: h('23:30') });
    // Manila's Tuesday is bookable from opening; Monday is already in the past there.
    expect(candidateSlots(noSchedule, '2026-10-20', manila, rules)[0]).toBe(h('08:00'));
    expect(candidateSlots(noSchedule, '2026-10-19', manila, rules)).toEqual([]);
    expect(slotRejection(noSchedule, '2026-10-19', h('16:00'), manila, rules)).toBe('past');
    // Read in UTC, Monday's slots would all be past (23:30) — but still "today".
    expect(candidateSlots(noSchedule, '2026-10-19', utc, rules)).toEqual([]);
    expect(slotRejection(noSchedule, '2026-10-19', h('16:00'), utc, rules)).toBe('past');
  });

  it("drops today's elapsed slots in clinic time", () => {
    const midday = clinicClock('Asia/Manila', new Date('2026-10-20T06:10:00Z')); // 14:10 Manila
    expect(candidateSlots(noSchedule, '2026-10-20', midday, rules)).toEqual([h('14:30'), h('15:00'), h('15:30'), h('16:00'), h('16:30')]);
    expect(slotRejection(noSchedule, '2026-10-20', h('14:00'), midday, rules)).toBe('past');
  });
});
