import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { MESSAGE_MAX_LENGTH } from '@/lib/messaging';
import { BROADCAST_MAX_CLINICS, broadcastSupportMessage } from '@/lib/support-chat';

const BroadcastSchema = z.object({
  body: z.string().trim().min(1, 'Message is empty').max(MESSAGE_MAX_LENGTH),
  audience: z.enum(['admins', 'all-staff']),
  /** Leave empty for every active clinic. */
  tenantIds: z.array(zObjectId).max(BROADCAST_MAX_CLINICS).default([]),
});

/** POST /api/platform/chat/broadcast — one message into many staff members' support threads. */
export async function POST(request: NextRequest) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const parsed = await parseBody(request, BroadcastSchema);
  if (isValidationError(parsed)) return parsed;

  const result = await broadcastSupportMessage({ agentEmail: admin.email, ...parsed.data });
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, data: { clinics: result.clinics, recipients: result.recipients } }, { status: 201 });
}
