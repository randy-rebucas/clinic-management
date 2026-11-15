import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('server-only', () => ({}));

describe('patient doctor populate', () => {
  it('registers the Doctor and Specialization models it populates', async () => {
    await import('@/app/api/patients/_lib/doctor-summary');
    // Without these, .populate(PATIENT_DOCTOR_POPULATE) throws MissingSchemaError on a fresh server.
    expect(mongoose.models.Doctor).toBeDefined();
    expect(mongoose.models.Specialization).toBeDefined();
  });
});
