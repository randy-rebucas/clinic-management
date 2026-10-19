import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import User from '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { createAuditLog } from '@/lib/audit';
import { getClientIp } from '@/lib/middleware/rate-limit';
import { joinUrl, newRoomName } from '@/lib/teleconsult';

/**
 * GET /api/appointments/:id/video — staff join a video visit: redirect to the Jitsi room
 * with their name filled in. Staff join through here (not a stored link) so each join is
 * audit-logged against the person who joined.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;
  const denied = await requirePermission(session, 'appointments', 'read');
  if (denied) return denied;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Appointment');

  await connectDB();
  const appt = await Appointment.findOne(tenantFilter(tenantId, { _id: id })).select('modality status teleconsult patient');
  if (!appt) return notFound('Appointment');
  if (appt.modality !== 'teleconsult') {
    return NextResponse.json({ success: false, error: 'This appointment is not a video visit.' }, { status: 409 });
  }
  if (['cancelled', 'no-show', 'completed'].includes(appt.status)) {
    return NextResponse.json({ success: false, error: `This video visit is ${appt.status}.` }, { status: 409 });
  }
  if (!appt.teleconsult?.roomName) {
    appt.set('teleconsult.roomName', newRoomName());
    await appt.save();
  }

  const user = await User.findById(session.userId).select('name').lean<{ name?: string } | null>();
  await createAuditLog({
    userId: session.userId,
    userEmail: session.email,
    userRole: session.role,
    tenantId,
    action: 'view',
    resource: 'appointment',
    resourceId: id,
    dataSubject: appt.patient,
    description: 'Joined a video visit',
    ipAddress: getClientIp(request.headers),
  });

  return NextResponse.redirect(joinUrl(appt.teleconsult!.roomName!, user?.name), 302);
}
