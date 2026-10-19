import { z } from 'zod';
import { NextResponse } from 'next/server';
import Specialization from '@/models/Specialization';
import { zObjectId, zPhone, zShortText, zEmail } from '@/lib/api/validate';

const zTime = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm');

export const scheduleEntrySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: zTime,
  endTime: zTime,
  isAvailable: z.boolean().optional(),
});

export const availabilityOverrideSchema = z.object({
  date: z.coerce.date(),
  isAvailable: z.boolean(),
  startTime: zTime.optional(),
  endTime: zTime.optional(),
  reason: zShortText.optional(),
});

const doctorFields = {
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: zEmail,
  phone: zPhone,
  specialization: z.string().trim().max(100).optional(),
  specializationId: zObjectId.optional(),
  licenseNumber: z.string().trim().min(1).max(100),
  ptr: z.string().trim().max(100).optional(),
  philhealthPan: z.string().trim().max(50).optional(),
  title: z.string().trim().max(50).optional(),
  qualifications: z.array(zShortText).max(50).optional(),
  bio: z.string().max(5000).optional(),
  department: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive', 'on-leave']).optional(),
  schedule: z.array(scheduleEntrySchema).max(50).optional(),
  availabilityOverrides: z.array(availabilityOverrideSchema).max(500).optional(),
};

export const createDoctorSchema = z.object(doctorFields);
export const updateDoctorSchema = z.object(doctorFields).partial();

/**
 * Resolve `specialization` (a name) to a Specialization id, creating it if needed.
 * Specializations are a global catalogue shared by all clinics.
 */
export async function resolveSpecialization<T extends { specialization?: string; specializationId?: string }>(
  input: T
): Promise<Omit<T, 'specialization'> | { error: string }> {
  const { specialization, ...rest } = input;
  if (specialization !== undefined && !rest.specializationId) {
    const name = specialization.trim();
    if (!name) return { error: 'Specialization is required' };
    let spec = await Specialization.findOne({ name });
    if (!spec) {
      spec = await Specialization.create({ name, active: true, category: 'Specialty' });
    }
    return { ...rest, specializationId: String(spec._id) };
  }
  return rest;
}

/** 409 for a duplicate key, naming the field so the form can put the message on it. */
export function duplicateResponse(error: any) {
  const keys = Object.keys(error?.keyPattern || error?.keyValue || {});
  const field = keys.includes('email') ? 'email' : keys.includes('licenseNumber') ? 'licenseNumber' : undefined;
  const message =
    field === 'email'
      ? 'Another doctor in this clinic already uses this email.'
      : field === 'licenseNumber'
        ? 'Another doctor in this clinic already has this licence number.'
        : 'Another doctor in this clinic already has this email or licence number.';
  return NextResponse.json({ success: false, error: message, field }, { status: 409 });
}

/** User-facing messages from a Mongoose ValidationError (schema messages only). */
export function validationMessage(error: any): string {
  const messages = Object.values(error?.errors || {})
    .map((e: any) => e?.message)
    .filter((m: unknown): m is string => typeof m === 'string');
  return messages.length ? messages.join(', ') : 'Invalid doctor data';
}
