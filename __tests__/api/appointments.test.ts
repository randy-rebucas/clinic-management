import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/appointments/route';
import { NextRequest } from 'next/server';

const VALID_TENANT_ID = '507f1f77bcf86cd799439011';
const VALID_PATIENT_ID = '507f1f77bcf86cd799439012';
const VALID_DOCTOR_ID = '507f1f77bcf86cd799439013';
const VALID_APPT_ID = '507f1f77bcf86cd799439014';

vi.mock('@/app/lib/dal', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/app/lib/auth-helpers', () => ({
  unauthorizedResponse: vi.fn().mockReturnValue(new Response(JSON.stringify({ success: false }), { status: 401 })),
  requirePermission: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn(),
}));

vi.mock('@/models/Appointment', () => {
  const chain = { sort: vi.fn(), exec: vi.fn().mockResolvedValue(null) };
  chain.sort.mockReturnValue(chain);
  return {
    default: {
      findOne: vi.fn().mockReturnValue(chain),
      find: vi.fn().mockReturnValue({ sort: vi.fn().mockResolvedValue([]) }),
      create: vi.fn(),
    },
  };
});

vi.mock('@/models/Doctor', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('@/models/Patient', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('@/lib/subscription-limits', () => ({
  checkSubscriptionLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('@/models', () => ({
  registerAllModels: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/tenant', () => ({
  getTenantContext: vi.fn().mockResolvedValue({ tenantId: null }),
}));

vi.mock('@/lib/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({
    generalSettings: { itemsPerPage: 20 },
    automationSettings: { autoInsuranceVerification: true },
    appointmentSettings: { defaultDuration: 30 },
  }),
}));

vi.mock('@/lib/automations/insurance-verification', () => ({
  autoVerifyInsuranceForAppointment: vi.fn().mockResolvedValue({ verified: true }),
}));

describe('Appointments API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/appointments', () => {
    it('should return 401 if not authenticated', async () => {
      const { verifySession } = await import('@/app/lib/dal');
      vi.mocked(verifySession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/appointments', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('should create appointment successfully', async () => {
      const { verifySession } = await import('@/app/lib/dal');
      const Appointment = (await import('@/models/Appointment')).default;
      const Doctor = (await import('@/models/Doctor')).default;
      const Patient = (await import('@/models/Patient')).default;

      vi.mocked(verifySession).mockResolvedValue({
        userId: VALID_PATIENT_ID,
        email: 'test@example.com',
        role: 'admin',
        tenantId: VALID_TENANT_ID,
      } as any);

      vi.mocked(Doctor.findOne).mockResolvedValue({ _id: VALID_DOCTOR_ID } as any);
      vi.mocked(Patient.findOne).mockResolvedValue({ _id: VALID_PATIENT_ID } as any);

      const mockAppointment = {
        _id: VALID_APPT_ID,
        populate: vi.fn().mockResolvedValue(true),
      };

      vi.mocked(Appointment.create).mockResolvedValue(mockAppointment as any);

      const request = new NextRequest('http://localhost:3000/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patient: VALID_PATIENT_ID,
          doctor: VALID_DOCTOR_ID,
          date: new Date().toISOString(),
          status: 'scheduled',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(Appointment.create).toHaveBeenCalled();
    });

    it('should trigger insurance verification if enabled', async () => {
      const { verifySession } = await import('@/app/lib/dal');
      const Appointment = (await import('@/models/Appointment')).default;
      const Doctor = (await import('@/models/Doctor')).default;
      const Patient = (await import('@/models/Patient')).default;
      const { autoVerifyInsuranceForAppointment } = await import('@/lib/automations/insurance-verification');

      vi.mocked(verifySession).mockResolvedValue({
        userId: VALID_PATIENT_ID,
        email: 'test@example.com',
        role: 'admin',
        tenantId: VALID_TENANT_ID,
      } as any);

      vi.mocked(Doctor.findOne).mockResolvedValue({ _id: VALID_DOCTOR_ID } as any);
      vi.mocked(Patient.findOne).mockResolvedValue({ _id: VALID_PATIENT_ID } as any);

      const mockAppointment = {
        _id: VALID_APPT_ID,
        patient: VALID_PATIENT_ID,
        populate: vi.fn().mockResolvedValue(true),
      };

      vi.mocked(Appointment.create).mockResolvedValue(mockAppointment as any);

      const request = new NextRequest('http://localhost:3000/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patient: VALID_PATIENT_ID,
          doctor: VALID_DOCTOR_ID,
          date: new Date().toISOString(),
          status: 'scheduled',
        }),
      });

      await POST(request);
      // Flush microtasks to allow fire-and-forget async call to execute
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      expect(autoVerifyInsuranceForAppointment).toHaveBeenCalled();
    });
  });
});
