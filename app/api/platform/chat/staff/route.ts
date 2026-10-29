import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { searchStaff } from '@/lib/support-chat';

/** GET /api/platform/chat/staff?q= — active staff in any clinic, to message from support. */
export async function GET(request: NextRequest) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const people = await searchStaff(request.nextUrl.searchParams.get('q') ?? '');
  return NextResponse.json({ success: true, data: people });
}
