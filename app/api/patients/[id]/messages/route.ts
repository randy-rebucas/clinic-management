import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import PatientMessage from '@/models/PatientMessage';
import User from '@/models/User';
import { refuseAccess, requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { notifyPatients, STAFF_SENDER_ROLES } from '@/lib/notify';
import { createAuditLog } from '@/lib/audit';

const SendSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(2000),
});

/** GET /api/patients/:id/messages — messages the clinic sent this patient, newest first. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const denied = await requirePermission(ctx.session, 'patients', 'read');
  if (denied) return denied;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Patient');

  await connectDB();
  const rows = await PatientMessage.find(tenantFilter(ctx.tenantId, { patient: id }))
    .select('kind title message sender createdAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean<any[]>();
  return NextResponse.json({
    success: true,
    data: rows.map((m) => ({
      id: String(m._id),
      kind: m.kind,
      title: m.title,
      message: m.message,
      from: m.sender?.name ?? (m.sender?.kind === 'clinic' ? 'The clinic' : null),
      createdAt: m.createdAt,
    })),
  });
}

/**
 * POST /api/patients/:id/messages — a doctor or admin sends the patient a message. It appears
 * in the patient app's notifications (from the sender, by name) and is pushed to their phone.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  if (!STAFF_SENDER_ROLES.includes(ctx.session.role)) {
    return refuseAccess(ctx.session, 'Only doctors and clinic administrators can message patients', 'patients', 'write');
  }
  const denied = await requirePermission(ctx.session, 'patients', 'read');
  if (denied) return denied;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Patient');

  const parsed = await parseBody(request, SendSchema);
  if (isValidationError(parsed)) return parsed;

  await connectDB();
  const patient = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: id })).select('_id active').lean<any>();
  if (!patient) return notFound('Patient');
  if (patient.active === false) {
    return NextResponse.json({ success: false, error: 'This patient record is inactive.' }, { status: 409 });
  }

  const me = await User.findById(ctx.session.userId).select('name').lean<{ name?: string } | null>();
  const senderName = ctx.session.role === 'doctor' && me?.name && !/^dr\.?\s/i.test(me.name) ? `Dr. ${me.name}` : me?.name;
  const result = await notifyPatients({
    tenantId: ctx.tenantId,
    patientIds: [id],
    title: parsed.data.title,
    message: parsed.data.message,
    sender: { kind: 'staff', userId: ctx.session.userId, name: senderName ?? undefined, role: ctx.session.role },
  });
  if (!result.recipients) return notFound('Patient');

  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: 'create',
    resource: 'notification',
    resourceId: result.messageIds[0],
    dataSubject: id,
    description: `Sent the patient a message: "${parsed.data.title}"`,
  });

  return NextResponse.json({ success: true, data: { id: result.messageIds[0] } }, { status: 201 });
}
