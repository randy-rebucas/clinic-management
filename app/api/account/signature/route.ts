import { NextRequest, NextResponse } from 'next/server';
import { verifySession, type SessionPayload } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Doctor from '@/models/Doctor';
import { createAuditLog } from '@/lib/audit';
import { getClientIp } from '@/lib/middleware/rate-limit';
import { parseSignatureImage } from '@/lib/doctor-signature';

/**
 * The signed-in doctor's own signature, printed on documents they issue.
 * Only the doctor can set it: an administrator setting someone else's signature
 * would let them sign in that doctor's name.
 */

async function ownDoctorId(userId: string): Promise<string | null> {
  await connectDB();
  const user = await User.findById(userId).select('doctorProfile').lean<{ doctorProfile?: unknown } | null>();
  return user?.doctorProfile ? String(user.doctorProfile) : null;
}

const notADoctor = () =>
  NextResponse.json({ success: false, error: 'Only doctors have a signature on file.' }, { status: 403 });

/** GET /api/account/signature → { image: string | null, updatedAt: string | null } */
export async function GET() {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();
  const doctorId = await ownDoctorId(session.userId);
  if (!doctorId) return notADoctor();

  const doc = await Doctor.findById(doctorId)
    .select('+signature.image signature.updatedAt')
    .lean<{ signature?: { image?: string; updatedAt?: Date } } | null>();
  return NextResponse.json({
    success: true,
    data: {
      image: doc?.signature?.image ?? null,
      updatedAt: doc?.signature?.updatedAt ? new Date(doc.signature.updatedAt).toISOString() : null,
    },
  });
}

/** PUT /api/account/signature  Body: { image: "data:image/png;base64,…" } */
export async function PUT(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();
  const doctorId = await ownDoctorId(session.userId);
  if (!doctorId) return notADoctor();

  const body = await request.json().catch(() => null);
  const parsed = parseSignatureImage(body?.image);
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });

  const updatedAt = new Date();
  await Doctor.updateOne({ _id: doctorId }, { $set: { 'signature.image': parsed.image, 'signature.updatedAt': updatedAt } });
  await audit(request, session, doctorId, 'Saved own signature');

  return NextResponse.json({ success: true, data: { image: parsed.image, updatedAt: updatedAt.toISOString() } });
}

/** DELETE /api/account/signature — stop signing documents automatically. */
export async function DELETE(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();
  const doctorId = await ownDoctorId(session.userId);
  if (!doctorId) return notADoctor();

  await Doctor.updateOne({ _id: doctorId }, { $unset: { signature: 1 } });
  await audit(request, session, doctorId, 'Removed own signature');
  return NextResponse.json({ success: true, data: { image: null, updatedAt: null } });
}

function audit(
  request: NextRequest,
  session: SessionPayload,
  doctorId: string,
  description: string
) {
  return createAuditLog({
    userId: session.userId,
    userEmail: session.email,
    userRole: session.role,
    tenantId: session.tenantId,
    action: 'update',
    resource: 'doctor',
    resourceId: doctorId,
    description,
    ipAddress: getClientIp(request.headers),
    userAgent: request.headers.get('user-agent') ?? undefined,
  });
}
