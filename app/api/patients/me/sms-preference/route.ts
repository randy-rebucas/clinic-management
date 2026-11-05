import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { maskPhone, normalizePhone } from '@/lib/phone';
import { getSmsPreference, setSmsPreference } from '@/lib/sms-preferences';

const schema = z.object({ textsEnabled: z.boolean() });

async function ownPhone(patientId: string): Promise<string | null> {
  await connectDB();
  const patient = await Patient.findById(patientId).select('phone').lean<{ phone?: string } | null>();
  return patient?.phone ? normalizePhone(patient.phone) : null;
}

/** GET /api/patients/me/sms-preference → { hasPhone, textsEnabled }: texts from every clinic. */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'refuse' });
  if (!session) return patientAuthError(request);

  const phone = await ownPhone(session.patientId);
  if (!phone) return NextResponse.json({ success: true, data: { hasPhone: false, textsEnabled: false } });
  const { optedOut } = await getSmsPreference(phone, null);
  return NextResponse.json({ success: true, data: { hasPhone: true, textsEnabled: !optedOut } });
}

/** PUT /api/patients/me/sms-preference { textsEnabled }. Sign-in codes go out either way. */
export async function PUT(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'refuse' });
  if (!session) return patientAuthError(request);

  const parsed = await parseBody(request, schema);
  if (isValidationError(parsed)) return parsed;

  const phone = await ownPhone(session.patientId);
  if (!phone) return NextResponse.json({ success: false, code: 'NO_PHONE', error: 'There’s no mobile number on your record.' }, { status: 400 });

  await setSmsPreference({ phone, tenantId: null, optedOut: !parsed.data.textsEnabled, source: 'app' });

  const { createAuditLog } = await import('@/lib/audit');
  after(() =>
    createAuditLog({
      action: 'update',
      resource: 'patient',
      resourceId: session.patientId,
      dataSubject: session.patientId,
      description: `Patient turned text messages ${parsed.data.textsEnabled ? 'on' : 'off'} in the app, for ${maskPhone(phone)}`,
    })
  );
  return NextResponse.json({ success: true, data: { hasPhone: true, textsEnabled: parsed.data.textsEnabled } });
}
