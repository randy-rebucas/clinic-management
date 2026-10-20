import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import PlatformAnnouncement from '@/models/PlatformAnnouncement';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { notifyStaff } from '@/lib/notify';

/** Clinics one announcement may reach; beyond this, send in batches by plan or region. */
const MAX_CLINICS = 2000;

const SendSchema = z.object({
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(2000),
  priority: z.enum(['normal', 'high', 'urgent']).default('normal'),
  audience: z.enum(['admins', 'all-staff']),
  /** Leave empty for every active clinic. */
  tenantIds: z.array(zObjectId).max(MAX_CLINICS).default([]),
  // A path inside the clinic app, e.g. /admin/subscription
  actionUrl: z.string().max(500).regex(/^\/(?![/\\])/, 'Use a path inside the app, like /admin/subscription').optional(),
});

/**
 * POST /api/platform/notifications — the platform team notifies clinics (maintenance, new
 * features, billing notices). In-app for the chosen staff of each clinic, pushed to devices
 * unless the priority is normal and the audience is everyone.
 */
export async function POST(request: NextRequest) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const parsed = await parseBody(request, SendSchema);
  if (isValidationError(parsed)) return parsed;
  const b = parsed.data;

  await connectDB();
  const filter: Record<string, unknown> = { status: 'active' };
  if (b.tenantIds.length) filter._id = { $in: b.tenantIds.map((id) => new Types.ObjectId(id)) };
  const tenants = await Tenant.find(filter).select('_id').limit(MAX_CLINICS + 1).lean<{ _id: Types.ObjectId }[]>();
  if (!tenants.length) return NextResponse.json({ success: false, error: 'No active clinic matches.' }, { status: 400 });
  if (tenants.length > MAX_CLINICS) {
    return NextResponse.json({ success: false, error: `One announcement can reach ${MAX_CLINICS} clinics. Choose clinics.` }, { status: 400 });
  }

  let recipients = 0;
  let clinics = 0;
  for (const t of tenants) {
    const r = await notifyStaff({
      tenantId: String(t._id),
      audience: b.audience === 'admins' ? { roles: ['admin', 'owner'] } : { allStaff: true },
      type: 'announcement',
      title: b.title,
      message: b.message,
      priority: b.priority,
      actionUrl: b.actionUrl,
      sender: { kind: 'platform', name: 'MyClinicSoft' },
      // An everyday note to every staff member stays in the app; anything flagged is pushed.
      push: b.priority !== 'normal' || b.audience === 'admins',
      metadata: { platformAnnouncement: true },
    });
    recipients += r.recipients;
    if (r.recipients) clinics++;
  }

  const doc = await PlatformAnnouncement.create({
    title: b.title,
    message: b.message,
    priority: b.priority,
    audience: b.audience,
    tenantIds: b.tenantIds.map((id) => new Types.ObjectId(id)),
    actionUrl: b.actionUrl,
    sentByEmail: admin.email,
    clinics,
    recipients,
  });

  return NextResponse.json({ success: true, data: { id: String(doc._id), clinics, recipients } }, { status: 201 });
}
