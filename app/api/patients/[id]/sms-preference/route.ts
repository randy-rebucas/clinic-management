import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { maskPhone, normalizePhone } from '@/lib/phone';
import { getSmsPreference, setSmsPreference } from '@/lib/sms-preferences';

const schema = z
  .object({ optedOut: z.boolean(), promoOptIn: z.boolean() })
  .partial()
  .refine((v) => v.optedOut !== undefined || v.promoOptIn !== undefined, 'Nothing to change');

async function patientPhone(tenantId: string, id: string): Promise<{ found: boolean; phone: string | null }> {
  const patient = await Patient.findOne(patientTenantFilter(tenantId, { _id: id })).select('phone').lean<{ phone?: string } | null>();
  return { found: !!patient, phone: patient?.phone ? normalizePhone(patient.phone) : null };
}

/** GET /api/patients/[id]/sms-preference: this clinic's texts to the patient's number. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Patient');
  await connectDB();
  const { found, phone } = await patientPhone(ctx.tenantId, id);
  if (!found) return notFound('Patient');
  if (!phone) return NextResponse.json({ success: true, data: { hasPhone: false, optedOut: false, promoOptIn: false } });

  const [own, everywhere] = await Promise.all([getSmsPreference(phone, ctx.tenantId), getSmsPreference(phone, null)]);
  return NextResponse.json({
    success: true,
    data: { hasPhone: true, optedOut: own.optedOut, optedOutEverywhere: everywhere.optedOut, promoOptIn: own.promoOptIn },
  });
}

/** PUT /api/patients/[id]/sms-preference: record what the patient told the clinic. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  const parsed = await parseBody(request, schema);
  if (isValidationError(parsed)) return parsed;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Patient');
  await connectDB();
  const { found, phone } = await patientPhone(ctx.tenantId, id);
  if (!found) return notFound('Patient');
  if (!phone) return NextResponse.json({ success: false, error: 'This patient has no mobile number on file.' }, { status: 400 });

  await setSmsPreference({ phone, tenantId: ctx.tenantId, ...parsed.data, source: 'staff' });

  const { createAuditLog } = await import('@/lib/audit');
  after(() =>
    createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'update',
      resource: 'patient',
      resourceId: id,
      dataSubject: id,
      description: `Staff changed text message preferences for ${maskPhone(phone)}: ${JSON.stringify(parsed.data)}`,
    })
  );
  return NextResponse.json({ success: true });
}
