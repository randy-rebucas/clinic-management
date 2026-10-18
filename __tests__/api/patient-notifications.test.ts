import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ recordPatientRefused: vi.fn() }));
vi.mock('@/app/lib/patient-auth', () => ({ verifyPatientAuth: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/models/Appointment', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/LabResult', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Invoice', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Prescription', () => ({ default: { find: vi.fn() } }));

import { verifyPatientAuth } from '@/app/lib/patient-auth';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import LabResult from '@/models/LabResult';
import Invoice from '@/models/Invoice';
import Prescription from '@/models/Prescription';
import { GET, PATCH } from '@/app/api/patients/me/notifications/route';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const chain = (rows: unknown[]) => {
  const q: any = {};
  for (const m of ['select', 'sort', 'limit']) q[m] = vi.fn().mockReturnValue(q);
  q.lean = vi.fn().mockResolvedValue(rows);
  return q;
};

describe('patient notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID } as any);
    vi.mocked(Patient.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: PATIENT_ID, tenantIds: [], readNotificationIds: ['lab-l1'] }),
      }),
    } as any);
    vi.mocked(Appointment.find).mockReturnValue(chain([
      { _id: 'a1', status: 'confirmed', appointmentDate: new Date('2026-10-20'), appointmentTime: '09:00', updatedAt: new Date('2026-10-10') },
    ]));
    vi.mocked(LabResult.find).mockReturnValue(chain([
      { _id: 'l1', request: { testType: 'CBC' }, status: 'completed', abnormalFlags: { hb: 'low' }, updatedAt: new Date('2026-10-12') },
    ]));
    vi.mocked(Invoice.find).mockReturnValue(chain([]));
    vi.mocked(Prescription.find).mockReturnValue(chain([]));
  });

  it('gives each item an app navigation target instead of a web portal URL', async () => {
    const body = await (await GET(new NextRequest('http://localhost/api/patients/me/notifications'))).json();
    expect(body.data.map((n: any) => n.target)).toEqual([
      { screen: 'lab-results', id: 'l1' },
      { screen: 'appointments', id: 'a1' },
    ]);
    expect(body.data.some((n: any) => 'actionUrl' in n)).toBe(false);
    expect(body.unreadCount).toBe(1);
  });

  it('builds lab notifications from real LabResult statuses and flags', async () => {
    const body = await (await GET(new NextRequest('http://localhost/api/patients/me/notifications'))).json();
    const filter = (vi.mocked(LabResult.find).mock.calls[0] as any[])[0];
    expect(filter.status).toEqual({ $in: ['completed', 'reviewed'] });
    const lab = body.data.find((n: any) => n.type === 'lab_result');
    expect(lab.title).toBe('Lab Result Requires Attention');
    expect(lab.message).toContain('CBC');
  });

  it('markAllRead records the current feed as read (it used to clear the list)', async () => {
    const req = new NextRequest('http://localhost/api/patients/me/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ markAllRead: true }),
    });
    expect((await PATCH(req)).status).toBe(200);
    expect(Patient.updateOne).toHaveBeenCalledWith(
      { _id: PATIENT_ID },
      { $set: { readNotificationIds: ['lab-l1', 'apt-a1'] } }
    );
  });
});
