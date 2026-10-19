import { describe, it, expect, vi } from 'vitest';
import { joinUrl, joinWindow, newRoomName, patientTeleconsult, startOf, withPatientTeleconsult } from '@/lib/teleconsult';

vi.mock('server-only', () => ({}));
vi.mock('@/app/lib/dal', () => ({ deriveKey: (label: string) => Buffer.from(`test-key:${label}`) }));

const { createPrescriptionLinkToken, readPrescriptionLinkToken, LINK_TTL_MS } = await import('@/lib/prescription-link');

// 2026-10-20 10:00 in Manila (UTC+8) = 02:00Z
const appt = {
  modality: 'teleconsult',
  status: 'confirmed',
  appointmentDate: new Date('2026-10-20T00:00:00Z'),
  appointmentTime: '10:00',
  duration: 30,
  teleconsult: { roomName: 'mcs-abc123' },
};

describe('teleconsult window', () => {
  it('computes the start from the clinic-local date and time', () => {
    expect(startOf(appt, 'Asia/Manila')?.toISOString()).toBe('2026-10-20T02:00:00.000Z');
  });

  it('opens 15 minutes before and closes 2 hours after the end', () => {
    const w = joinWindow(appt, 'Asia/Manila')!;
    expect(w.opensAt.toISOString()).toBe('2026-10-20T01:45:00.000Z');
    expect(w.closesAt.toISOString()).toBe('2026-10-20T04:30:00.000Z');
  });

  it('hands out the link only inside the window and for live appointments', () => {
    const at = (iso: string) => ({ tz: 'Asia/Manila', now: new Date(iso) });
    expect(patientTeleconsult(appt, at('2026-10-20T01:30:00Z'))?.joinUrl).toBeNull();
    expect(patientTeleconsult(appt, at('2026-10-20T01:50:00Z'))?.joinUrl).toContain('/mcs-abc123#');
    expect(patientTeleconsult(appt, at('2026-10-20T05:00:00Z'))?.joinUrl).toBeNull();
    expect(patientTeleconsult({ ...appt, status: 'cancelled' }, at('2026-10-20T02:00:00Z'))?.joinUrl).toBeNull();
    expect(patientTeleconsult({ ...appt, modality: 'in-person' }, at('2026-10-20T02:00:00Z'))).toBeNull();
  });

  it('never exposes the raw room name to the patient', () => {
    const out = withPatientTeleconsult(appt, { tz: 'Asia/Manila', now: new Date('2026-10-19T00:00:00Z') });
    expect(JSON.stringify(out)).not.toContain('roomName');
    expect(out.teleconsult?.joinable).toBe(false);
  });
});

describe('room names and links', () => {
  it('makes long random room names', () => {
    const a = newRoomName();
    expect(a).toMatch(/^mcs-[a-f0-9]{32}$/);
    expect(newRoomName()).not.toBe(a);
  });

  it('builds a Jitsi link with the display name in the hash', () => {
    const url = joinUrl('mcs-x', 'Dr. Santos');
    expect(url.startsWith('https://meet.jit.si/mcs-x#')).toBe(true);
    expect(url).toContain('userInfo.displayName=');
  });
});

describe('prescription PDF links', () => {
  const id = '64b7f0c2a1b2c3d4e5f60718';

  it('round-trips a fresh token', () => {
    const { token } = createPrescriptionLinkToken(id, 1_000);
    expect(readPrescriptionLinkToken(token, 2_000)).toBe(id);
  });

  it('rejects expired or tampered tokens', () => {
    const { token } = createPrescriptionLinkToken(id, 1_000);
    expect(readPrescriptionLinkToken(token, 1_000 + LINK_TTL_MS + 1)).toBeNull();
    const [payload, sig] = token.split('.');
    const other = Buffer.from(`64b7f0c2a1b2c3d4e5f60719.${1_000 + LINK_TTL_MS}`).toString('base64url');
    expect(readPrescriptionLinkToken(`${other}.${sig}`, 2_000)).toBeNull();
    expect(readPrescriptionLinkToken(`${payload}.x${sig.slice(1)}`, 2_000)).toBeNull();
    expect(readPrescriptionLinkToken('garbage', 2_000)).toBeNull();
  });
});
