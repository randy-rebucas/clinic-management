import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';
import { createAuditLog } from '@/lib/audit';
import logger from '@/lib/logger';
import {
  addClinicGuardian,
  FAMILY_RELATIONSHIPS,
  guardianshipActive,
  personRecordIds,
  removeDependent,
  type GuardianEntry,
} from '@/lib/patient-family';

/**
 * Family access, staff side: who may manage this patient's records from their own eMCR login.
 * Staff add a guardian after confirming consent in person (an elderly parent, a child registered
 * under another number). Guardians must be registered at this clinic too.
 *
 * GET    → { guardians: [...], dependents: [...] } (people this patient manages, at this clinic)
 * POST   { guardianPatientId, relationship? }      (patients → write)
 * DELETE ?guardianPatientId=…                      (patients → write) — removes that guardian
 *        from every record of this patient, at every clinic.
 */

type Row = {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  patientCode?: string;
  dateOfBirth?: Date;
  guardians?: GuardianEntry[];
};

function person(row: Row) {
  return { patientId: String(row._id), firstName: row.firstName, lastName: row.lastName, patientCode: row.patientCode ?? null };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const denied = await requirePermission(ctx.session, 'patients', 'read');
  if (denied) return denied;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');

    const patient = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: id }))
      .select('dateOfBirth guardians')
      .lean<Row | null>();
    if (!patient) return notFound('Patient');

    const entries = patient.guardians ?? [];
    const [guardianRows, dependentRows] = await Promise.all([
      entries.length
        ? Patient.find({ _id: { $in: entries.map((g) => g.patient) }, tenantIds: ctx.tenantObjectId })
            .select('firstName lastName patientCode')
            .lean<Row[]>()
        : [],
      Patient.find({ 'guardians.patient': patient._id, tenantIds: ctx.tenantObjectId })
        .select('firstName lastName patientCode dateOfBirth guardians')
        .limit(50)
        .lean<Row[]>(),
    ]);
    const byId = new Map(guardianRows.map((r) => [String(r._id), r]));

    const guardians = entries
      .map((g) => {
        const row = byId.get(String(g.patient));
        return row
          ? {
              ...person(row),
              relationship: g.relationship ?? null,
              source: g.source,
              active: guardianshipActive(g, patient.dateOfBirth),
              addedAt: g.addedAt ?? null,
            }
          : null;
      })
      .filter(Boolean);

    const dependents = dependentRows.map((row) => {
      const entry = (row.guardians ?? []).find((g) => String(g.patient) === String(patient._id));
      return {
        ...person(row),
        relationship: entry?.relationship ?? null,
        source: entry?.source ?? 'clinic',
        active: entry ? guardianshipActive(entry, row.dateOfBirth) : false,
      };
    });

    return NextResponse.json({ success: true, data: { guardians, dependents } });
  } catch (error) {
    logger.error('Error loading patient guardians', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to load family access' }, { status: 500 });
  }
}

const AddSchema = z
  .object({
    guardianPatientId: z.string().refine(isValidId, 'Invalid patient'),
    relationship: z.enum(FAMILY_RELATIONSHIPS).optional(),
  })
  .strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const denied = await requirePermission(ctx.session, 'patients', 'write');
  if (denied) return denied;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');

    const parsed = AddSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Choose the patient who will manage this record.' }, { status: 400 });
    }
    const { guardianPatientId, relationship } = parsed.data;

    const [dependent, guardian] = await Promise.all([
      Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: id })).select('_id active').lean<{ _id: Types.ObjectId; active?: boolean } | null>(),
      Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: guardianPatientId }))
        .select('_id active firstName lastName')
        .lean<{ _id: Types.ObjectId; active?: boolean; firstName: string; lastName: string } | null>(),
    ]);
    if (!dependent) return notFound('Patient');
    if (!guardian) {
      return NextResponse.json({ success: false, error: 'The family member must be registered at this clinic first.' }, { status: 404 });
    }
    if (guardian.active === false) {
      return NextResponse.json({ success: false, error: 'That patient is inactive.' }, { status: 409 });
    }
    const dependentPerson = (await personRecordIds(id)).map(String);
    if (dependentPerson.includes(guardianPatientId)) {
      return NextResponse.json({ success: false, error: 'A patient can’t manage their own record.' }, { status: 400 });
    }

    await addClinicGuardian({
      dependentId: dependent._id,
      guardianId: guardian._id,
      tenantId: ctx.tenantObjectId,
      relationship,
      addedBy: ctx.session.userId,
    });

    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'update',
      resource: 'patient',
      resourceId: id,
      dataSubject: id,
      isSensitive: true,
      description: `Gave ${guardian.firstName} ${guardian.lastName} access to manage this patient's records in the app`,
      metadata: { guardianPatientId, relationship: relationship ?? null },
    });

    return NextResponse.json({ success: true, message: 'Family access added.' }, { status: 201 });
  } catch (error) {
    logger.error('Error adding patient guardian', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to add family access' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const denied = await requirePermission(ctx.session, 'patients', 'write');
  if (denied) return denied;

  try {
    await connectDB();
    const { id } = await params;
    const guardianPatientId = request.nextUrl.searchParams.get('guardianPatientId') ?? '';
    if (!isValidId(id) || !isValidId(guardianPatientId)) return notFound('Patient');

    const dependent = await Patient.exists(patientTenantFilter(ctx.tenantId, { _id: id }));
    if (!dependent) return notFound('Patient');

    const removed = await removeDependent(await personRecordIds(guardianPatientId), id, { tenantId: ctx.tenantObjectId });
    if (!removed) return NextResponse.json({ success: false, error: 'That family access was already removed.' }, { status: 404 });

    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'update',
      resource: 'patient',
      resourceId: id,
      dataSubject: id,
      isSensitive: true,
      description: 'Removed a family member’s access to manage this patient’s records in the app',
      metadata: { guardianPatientId },
    });

    return NextResponse.json({ success: true, message: 'Family access removed.' });
  } catch (error) {
    logger.error('Error removing patient guardian', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to remove family access' }, { status: 500 });
  }
}
