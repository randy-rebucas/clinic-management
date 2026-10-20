import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import SupportRequest from '@/models/SupportRequest';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { SUPPORT_STATUSES, notifyRequesterInApp } from '@/lib/support';

const PatchSchema = z.object({ status: z.enum(SUPPORT_STATUSES) });

/** PATCH /api/platform/support/:id — change a request's status without replying. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Support request');

  const parsed = await parseBody(request, PatchSchema);
  if (isValidationError(parsed)) return parsed;

  await connectDB();
  const before = await SupportRequest.findByIdAndUpdate(id, { $set: { status: parsed.data.status } }, { new: false, projection: { status: 1, subject: 1, userId: 1, tenantId: 1 } }).lean<any>();
  if (!before) return notFound('Support request');
  if (parsed.data.status === 'resolved' && before.status !== 'resolved') {
    await notifyRequesterInApp(before, id, `Resolved: ${before.subject}`, 'MyClinicSoft support marked your request resolved. Reply if anything is still wrong.');
  }
  return NextResponse.json({ success: true, data: { status: parsed.data.status } });
}
