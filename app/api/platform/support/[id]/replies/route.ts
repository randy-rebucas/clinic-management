import { NextRequest, NextResponse } from 'next/server';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { addSupportReply, ReplySchema } from '@/lib/support';

/** POST /api/platform/support/:id/replies — answer a request; the requester is emailed. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Support request');

  const parsed = await parseBody(request, ReplySchema);
  if (isValidationError(parsed)) return parsed;

  const result = await addSupportReply({
    id,
    authorType: 'platform',
    authorEmail: admin.email,
    message: parsed.data.message,
    status: parsed.data.status,
  });
  if (!result) return notFound('Support request');
  return NextResponse.json({ success: true, data: result });
}
