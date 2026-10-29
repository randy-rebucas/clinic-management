import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { MESSAGE_MAX_LENGTH } from '@/lib/messaging';
import { deleteSupportMessage, editSupportMessage } from '@/lib/support-chat';

type Params = { params: Promise<{ userId: string; messageId: string }> };

const EditSchema = z.object({
  body: z.string().trim().min(1, 'Message is empty').max(MESSAGE_MAX_LENGTH),
});

/** PATCH /api/platform/chat/:userId/messages/:messageId — correct your own message, shortly after sending it. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { userId, messageId } = await params;
  if (!isValidId(userId) || !isValidId(messageId)) return notFound('Message');

  const parsed = await parseBody(request, EditSchema);
  if (isValidationError(parsed)) return parsed;

  const result = await editSupportMessage({ agentEmail: admin.email, userId, messageId, body: parsed.data.body });
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, data: result.message });
}

/** DELETE /api/platform/chat/:userId/messages/:messageId — delete your own message for everyone. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { userId, messageId } = await params;
  if (!isValidId(userId) || !isValidId(messageId)) return notFound('Message');

  const result = await deleteSupportMessage({ agentEmail: admin.email, userId, messageId });
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, data: result.message });
}
