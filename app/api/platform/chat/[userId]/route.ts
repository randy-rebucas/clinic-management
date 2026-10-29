import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { MESSAGE_MAX_LENGTH } from '@/lib/messaging';
import { loadSupportThread, markSupportThreadRead, sendSupportMessage } from '@/lib/support-chat';

const SendSchema = z.object({
  body: z.string().trim().min(1, 'Message is empty').max(MESSAGE_MAX_LENGTH),
});

/**
 * GET /api/platform/chat/:userId — a staff member's support thread. Reading it marks it read:
 * the console only asks while the conversation is on screen.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { userId } = await params;
  if (!isValidId(userId)) return notFound('Staff member');

  const thread = await loadSupportThread(userId);
  if (!thread) return notFound('Staff member');
  await markSupportThreadRead(userId);
  return NextResponse.json({ success: true, data: thread });
}

/** POST /api/platform/chat/:userId — write to the staff member; starts the thread if needed. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { userId } = await params;
  if (!isValidId(userId)) return notFound('Staff member');

  const parsed = await parseBody(request, SendSchema);
  if (isValidationError(parsed)) return parsed;

  const result = await sendSupportMessage({ agentEmail: admin.email, userId, body: parsed.data.body });
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, data: result.message }, { status: 201 });
}
