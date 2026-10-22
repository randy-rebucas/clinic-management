import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { updatePatientSchema } from '@/lib/patient-schema';
import { normalizePhone } from '@/lib/phone';
import { revokeAllPatientAccess } from '@/app/api/patients/auth/shared';

const NESTED_FIELDS = new Set(['address', 'emergencyContact', 'identifiers', 'socialHistory']);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');
    // File contents are inline data URLs and can run to megabytes; no caller uses them here
    // (files open through ./files/[fileId]), so only their names and sizes are sent.
    const patient = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: id }), { 'attachments.url': 0, readNotificationIds: 0 });
    if (!patient) return notFound('Patient');
    return NextResponse.json({ success: true, data: patient });
  } catch (error) {
    console.error('Error fetching patient:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch patient' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');

    const parsed = await parseBody(request, updatePatientSchema);
    if (isValidationError(parsed)) return parsed;
    // Grouped fields are written key by key so parts the form doesn't edit (identifiers.other,
    // the legacy emergencyContact.relation) survive, and a field sent blank is removed rather
    // than ignored: otherwise a middle name, PhilHealth number or condition could never be cleared.
    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};
    const assign = (path: string, value: unknown) => {
      if (value === undefined) return;
      if (value === '' || value === null) unset[path] = '';
      else set[path] = value;
    };
    for (const [key, value] of Object.entries(parsed.data)) {
      if (NESTED_FIELDS.has(key) && value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [sub, v] of Object.entries(value)) assign(`${key}.${sub}`, v);
      } else {
        assign(key, value);
      }
    }

    // A staff save is the clinic vouching for the record (see Patient.selfRegistered).
    unset.selfRegistered = '';

    const filter = patientTenantFilter(ctx.tenantId, { _id: id });

    // The record joined a cross-clinic login on its phone + birth date (linked-records.ts). When
    // either changes it leaves that login, and a new phone also ends the old number's sessions;
    // the next OTP sign-in with the new number links it again.
    let phoneChanged = false;
    if ('phone' in parsed.data || 'dateOfBirth' in parsed.data) {
      const before = await Patient.findOne(filter).select('phone dateOfBirth accountId').lean<{ phone?: string; dateOfBirth?: Date; accountId?: unknown } | null>();
      if (!before) return notFound('Patient');
      const day = (v: unknown) => {
        const d = v ? new Date(v as string) : null;
        return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(v ?? '');
      };
      const samePhone = (a: unknown, b: unknown) => (normalizePhone(String(a ?? '')) ?? String(a ?? '')) === (normalizePhone(String(b ?? '')) ?? String(b ?? ''));
      phoneChanged = 'phone' in parsed.data && !samePhone(before.phone, parsed.data.phone);
      const dobChanged = 'dateOfBirth' in parsed.data && day(before.dateOfBirth) !== day(parsed.data.dateOfBirth);
      if ((phoneChanged || dobChanged) && before.accountId) unset.accountId = '';
    }

    const patient =
      Object.keys(set).length || Object.keys(unset).length
        ? await Patient.findOneAndUpdate(
            filter,
            { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
            { new: true, runValidators: true, projection: { 'attachments.url': 0, readNotificationIds: 0 } }
          )
        : await Patient.findOne(filter, { 'attachments.url': 0, readNotificationIds: 0 });
    if (!patient) return notFound('Patient');
    if (phoneChanged) await revokeAllPatientAccess(id);
    return NextResponse.json({ success: true, data: patient });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors || {}).map((err: any) => err.message).join(', ');
      return NextResponse.json(
        { success: false, error: messages || 'Invalid patient data' },
        { status: 400 }
      );
    }
    if (error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid patient data' },
        { status: 400 }
      );
    }
    console.error('Error updating patient:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update patient' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');

    const patient = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: id })).select('tenantIds').lean();
    if (!patient) return notFound('Patient');

    // A patient shared with other clinics is only unlinked from this one.
    const otherClinics = ((patient as any).tenantIds || []).filter((t: any) => String(t) !== ctx.tenantId);
    if (otherClinics.length > 0) {
      await Patient.updateOne({ _id: id }, { $pull: { tenantIds: ctx.tenantObjectId } });
    } else {
      await Patient.deleteOne(patientTenantFilter(ctx.tenantId, { _id: id }));
    }
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error('Error deleting patient:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete patient' },
      { status: 500 }
    );
  }
}
