import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  appointmentActionToken,
  verifyAppointmentActionToken,
  buildAppointmentActionUrl,
} from '@/lib/appointment-links';

const ID = '507f1f77bcf86cd799439011';
const OTHER_ID = '507f1f77bcf86cd799439012';

describe('appointment action links', () => {
  const original = process.env.SESSION_SECRET;
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = original;
  });

  it('verifies a token for the same id and action', () => {
    const token = appointmentActionToken(ID, 'yes');
    expect(verifyAppointmentActionToken(ID, 'yes', token)).toBe(true);
  });

  it('fails for a different appointment id', () => {
    expect(verifyAppointmentActionToken(OTHER_ID, 'yes', appointmentActionToken(ID, 'yes'))).toBe(false);
  });

  it('fails for a different or unknown action', () => {
    const token = appointmentActionToken(ID, 'yes');
    expect(verifyAppointmentActionToken(ID, 'no', token)).toBe(false);
    expect(verifyAppointmentActionToken(ID, 'delete', token)).toBe(false);
  });

  it('fails for a tampered, empty or missing token', () => {
    const token = appointmentActionToken(ID, 'no');
    const tampered = (token[0] === 'A' ? 'B' : 'A') + token.slice(1);
    expect(verifyAppointmentActionToken(ID, 'no', tampered)).toBe(false);
    expect(verifyAppointmentActionToken(ID, 'no', token.slice(0, -1))).toBe(false);
    expect(verifyAppointmentActionToken(ID, 'no', '')).toBe(false);
    expect(verifyAppointmentActionToken(ID, 'no', null)).toBe(false);
  });

  it('fails when the signing secret changes', () => {
    const token = appointmentActionToken(ID, 'yes');
    process.env.SESSION_SECRET = 'a-different-secret-also-32-characters-long';
    expect(verifyAppointmentActionToken(ID, 'yes', token)).toBe(false);
  });

  it('fails closed when SESSION_SECRET is missing', () => {
    const token = appointmentActionToken(ID, 'yes');
    delete process.env.SESSION_SECRET;
    expect(verifyAppointmentActionToken(ID, 'yes', token)).toBe(false);
  });

  it('builds a confirm URL whose token verifies', () => {
    const url = new URL(buildAppointmentActionUrl('https://clinic.example.com/', ID, 'no'));
    expect(url.pathname).toBe(`/api/appointments/${ID}/confirm`);
    expect(url.searchParams.get('action')).toBe('no');
    expect(verifyAppointmentActionToken(ID, 'no', url.searchParams.get('token'))).toBe(true);
  });
});
