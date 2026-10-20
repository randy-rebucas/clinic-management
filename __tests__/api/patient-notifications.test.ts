import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ recordPatientRefused: vi.fn() }));
vi.mock('@/app/lib/patient-auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    verifyPatientAuth: vi.fn(),
    patientAuthError: () => NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 }),
  };
});
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/models/Appointment', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/LabResult', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Invoice', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Prescription', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/PatientMessage', () => ({ default: { find: vi.fn() } }));

import { verifyPatientAuth } from '@/app/lib/patient-auth';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import LabResult from '@/models/LabResult';
import Invoice from '@/models/Invoice';
import Prescription from '@/models/Prescription';
import PatientMessage from '@/models/PatientMessage';
import { GET, PATCH } from '@/app/api/patients/me/notifications/route';
import { notificationId } from '@/app/api/patients/me/_lib/notification-id';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const TENANT_A = '507f1f77bcf86cd799439011';
const TENANT_B = '507f1f77bcf86cd799439022';
const OTHER_CLINIC_READ = 'apt-507f1f77bcf86cd799439099-confirmed';
const chain = (rows: unknown[]) => {
  const q: any = {};
  for (const m of ['select', 'sort', 'limit']) q[m] = vi.fn().mockReturnValue(q);
  q.lean = vi.fn().mockResolvedValue(rows);
  return q;
};
const mockPatient = (patient: Record<string, unknown>) =>
  vi.mocked(Patient.findById).mockReturnValue({
    select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: PATIENT_ID, ...patient }) }),
  } as any);
const getFeed = async (qs = '') =>
  (await GET(new NextRequest(`http://localhost/api/patients/me/notifications${qs}`))).json();
const patch = (body: unknown) =>
  PATCH(new NextRequest('http://localhost/api/patients/me/notifications', { method: 'PATCH', body: JSON.stringify(body) }));

describe('notificationId', () => {
  it('includes the status for status-bearing records', () => {
    expect(notificationId('apt', 'a1', 'pending')).toBe('apt-a1-pending');
    expect(notificationId('lab', 'l1', 'reviewed')).toBe('lab-l1-reviewed');
    expect(notificationId('inv', 'i1', 'partial')).toBe('inv-i1-partial');
  });

  it('a status change yields a different id', () => {
    expect(notificationId('apt', 'a1', 'pending')).not.toBe(notificationId('apt', 'a1', 'confirmed'));
  });

  it('prescriptions and clinic messages notify once, with no status part', () => {
    expect(notificationId('rx', 'r1', 'dispensed')).toBe('rx-r1');
    expect(notificationId('msg', 'm1')).toBe('msg-m1');
  });

  it('strips characters that do not belong in an id', () => {
    expect(notificationId('apt', 'a1', 'no-show')).toBe('apt-a1-no-show');
    expect(notificationId('apt', 'a1', 'we ird/$')).toBe('apt-a1-weird');
  });
});

describe('patient notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID } as any);
    mockPatient({ tenantIds: [], readNotificationIds: ['lab-l1-completed'] });
    vi.mocked(Appointment.find).mockReturnValue(chain([
      { _id: 'a1', status: 'confirmed', appointmentDate: new Date('2026-10-20'), appointmentTime: '09:00', updatedAt: new Date('2026-10-10') },
    ]));
    vi.mocked(LabResult.find).mockReturnValue(chain([
      { _id: 'l1', request: { testType: 'CBC' }, status: 'completed', abnormalFlags: { hb: 'low' }, updatedAt: new Date('2026-10-12') },
    ]));
    vi.mocked(Invoice.find).mockReturnValue(chain([]));
    vi.mocked(Prescription.find).mockReturnValue(chain([]));
    vi.mocked(PatientMessage.find).mockReturnValue(chain([]));
  });

  it('includes messages the clinic sent, named by sender, with no screen to open', async () => {
    vi.mocked(PatientMessage.find).mockReturnValue(chain([
      { _id: 'm1', kind: 'message', title: 'About your follow-up', message: 'Please come in fasting.', sender: { kind: 'staff', name: 'Dr. Reyes' }, createdAt: new Date('2026-10-15') },
      { _id: 'm2', kind: 'announcement', title: 'Closed on Monday', message: 'Holiday.', sender: { kind: 'clinic' }, createdAt: new Date('2026-10-14') },
    ]));
    const body = await getFeed();
    const messages = body.data.filter((n: any) => n.type === 'message');
    expect(messages).toMatchObject([
      { id: 'msg-m1', title: 'About your follow-up', message: 'Please come in fasting.', read: false, target: { screen: 'messages', id: 'm1' }, metadata: { from: 'Dr. Reyes' } },
      { id: 'msg-m2', metadata: { from: 'Your clinic' } },
    ]);
    expect(body.data[0].id).toBe('msg-m1'); // newest first
  });

  it('gives each item an app navigation target instead of a web portal URL', async () => {
    const body = await getFeed();
    expect(body.data.map((n: any) => n.target)).toEqual([
      { screen: 'lab-results', id: 'l1' },
      { screen: 'appointments', id: 'a1' },
    ]);
    expect(body.data.some((n: any) => 'actionUrl' in n)).toBe(false);
    expect(body.unreadCount).toBe(1);
  });

  it('builds lab notifications from real LabResult statuses and flags', async () => {
    const body = await getFeed();
    const filter = (vi.mocked(LabResult.find).mock.calls[0] as any[])[0];
    expect(filter.status).toEqual({ $in: ['completed', 'reviewed'] });
    const lab = body.data.find((n: any) => n.type === 'lab_result');
    expect(lab.id).toBe('lab-l1-completed');
    expect(lab.title).toBe('Lab Result Requires Attention');
    expect(lab.message).toContain('CBC');
  });

  it('a status change after being read shows up unread again', async () => {
    // Read while "completed"; the result has since been reviewed.
    vi.mocked(LabResult.find).mockReturnValue(chain([
      { _id: 'l1', request: { testType: 'CBC' }, status: 'reviewed', abnormalFlags: {}, updatedAt: new Date('2026-10-13') },
    ]));
    const body = await getFeed();
    const lab = body.data.find((n: any) => n.type === 'lab_result');
    expect(lab.id).toBe('lab-l1-reviewed');
    expect(lab.read).toBe(false);
    expect(body.unreadCount).toBe(2);
  });

  it('legacy read ids (no status part) and junk entries do not crash and do not match', async () => {
    mockPatient({ tenantIds: [], readNotificationIds: ['lab-l1', 'apt-a1', null, 42] });
    const body = await getFeed();
    expect(body.data.every((n: any) => n.read === false)).toBe(true);
    expect(body.unreadCount).toBe(2);
  });

  it('non-numeric page/limit fall back to defaults instead of NaN', async () => {
    const body = await getFeed('?page=abc&limit=xyz');
    expect(body.pagination).toMatchObject({ page: 1, limit: 20 });
    expect(body.data).toHaveLength(2);
  });

  it('marking one read by its new id clears it from unreadCount', async () => {
    expect((await patch({ ids: ['apt-a1-confirmed'] })).status).toBe(200);
    expect(Patient.updateOne).toHaveBeenCalledWith(
      { _id: PATIENT_ID },
      { $addToSet: { readNotificationIds: { $each: ['apt-a1-confirmed'] } } }
    );
    mockPatient({ tenantIds: [], readNotificationIds: ['lab-l1-completed', 'apt-a1-confirmed'] });
    expect((await getFeed()).unreadCount).toBe(0);
  });

  it('markAllRead records the current feed as read and prunes legacy ids', async () => {
    mockPatient({ tenantIds: [], readNotificationIds: ['lab-l1', OTHER_CLINIC_READ] });
    expect((await patch({ markAllRead: true })).status).toBe(200);
    expect(Patient.updateOne).toHaveBeenCalledWith(
      { _id: PATIENT_ID },
      { $set: { readNotificationIds: [OTHER_CLINIC_READ, 'lab-l1-completed', 'apt-a1-confirmed'] } }
    );
  });

  it("scopes the feed to the session's clinic when the token carries one", async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, tid: TENANT_B } as any);
    mockPatient({ tenantIds: [TENANT_A, TENANT_B], readNotificationIds: [] });
    await getFeed();
    for (const model of [Appointment, LabResult, Invoice, Prescription]) {
      expect((vi.mocked(model.find).mock.calls[0] as any[])[0].tenantId).toEqual({ $in: [TENANT_B] });
    }
  });
});
