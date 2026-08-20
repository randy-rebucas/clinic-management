import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { runAsSystem } from '@/lib/tenant-context';
import { findPatientAcrossTenantsWithAuthFields } from '@/lib/data/patient';

/**
 * GET /api/patients/lookup
 *
 * Public endpoint for third-party applications. Runs entirely in
 * runAsSystem() and then verifies the resolved patient's tenants array
 * includes the requested tenantId — the same intentional cross-tenant
 * search + after-the-fact tenant check the Mongoose version did (it queried
 * `tenantIds: tenantObjectId` directly). See lib/data/patient.ts
 * findPatientAcrossTenantsWithAuthFields().
 *
 * See docstring below for full query param / response contract (unchanged
 * from the pre-migration version).
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.public);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = request.nextUrl;
  const tenantId = searchParams.get('tenantId')?.trim() ?? '';
  const phone = searchParams.get('phone')?.trim() ?? '';
  const email = searchParams.get('email')?.toLowerCase().trim() ?? '';
  const patientCode = searchParams.get('patientCode')?.trim() ?? '';

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId is required' }, { status: 400 });
  }

  if (!phone && !email && !patientCode) {
    return NextResponse.json(
      { success: false, error: 'At least one identifier is required: phone, email, or patientCode' },
      { status: 400 }
    );
  }

  try {
    const patient = await runAsSystem(() =>
      findPatientAcrossTenantsWithAuthFields({ phone, email, patientCode, tenantId })
    );

    if (!patient) {
      return NextResponse.json({ success: false, found: false });
    }

    const resolvedPhone: string = patient.phone || patient.contactsPhone || '';
    const resolvedEmail: string = patient.email || patient.contactsEmail || '';

    return NextResponse.json({
      success: true,
      found: true,
      patient: {
        patientCode: patient.patientCode ?? null,
        firstName: patient.firstName,
        maskedLastName: maskName(patient.lastName),
        maskedEmail: resolvedEmail ? maskEmail(resolvedEmail) : null,
        maskedPhone: resolvedPhone ? maskPhone(resolvedPhone) : null,
        active: patient.active !== false,
      },
      authMethods: {
        password: !!patient.password,
        otp: !!resolvedPhone,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Lookup failed. Please try again.' }, { status: 500 });
  }
}

function maskName(name: string): string {
  if (!name) return '***';
  return `${name[0]}***`;
}

function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return '***@***';
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  return `${local[0]}***${domain}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '****';
  const visible = 4;
  const prefix = 2;
  const raw = phone.replace(/\s/g, '');
  return raw.slice(0, prefix) + '*'.repeat(Math.max(0, raw.length - prefix - visible)) + raw.slice(-visible);
}
