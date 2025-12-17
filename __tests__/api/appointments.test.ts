import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/appointments/route';
import { NextRequest } from 'next/server';

// Mock dependencies
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

vi.mock('@/models/Appointment', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

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

vi.mock('@/lib/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({
    automationSettings: {
      autoInsuranceVerification: true,
    },
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

      vi.mocked(verifySession).mockResolvedValue({
        userId: 'user123',
        email: 'test@example.com',
        role: 'admin',
        tenantId: 'tenant123',
      } as any);

      const mockAppointment = {
        _id: 'appointment123',
        populate: vi.fn().mockResolvedValue(true),
      };

      vi.mocked(Appointment.create).mockResolvedValue(mockAppointment as any);

      const request = new NextRequest('http://localhost:3000/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patient: 'patient123',
          doctor: 'doctor123',
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
      const { autoVerifyInsuranceForAppointment } = await import('@/lib/automations/insurance-verification');

      vi.mocked(verifySession).mockResolvedValue({
        userId: 'user123',
        email: 'test@example.com',
        role: 'admin',
        tenantId: 'tenant123',
      } as any);

      const mockAppointment = {
        _id: 'appointment123',
        patient: 'patient123',
        populate: vi.fn().mockResolvedValue(true),
      };

      vi.mocked(Appointment.create).mockResolvedValue(mockAppointment as any);

      const request = new NextRequest('http://localhost:3000/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patient: 'patient123',
          doctor: 'doctor123',
          date: new Date().toISOString(),
          status: 'scheduled',
        }),
      });

      await POST(request);

      // Insurance verification should be called (async, so we check if it was called)
      // Note: In a real test, we might need to wait for async operations
      expect(autoVerifyInsuranceForAppointment).toHaveBeenCalled();
    });
  });
});

