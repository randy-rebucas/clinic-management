import { NextResponse } from 'next/server';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { getPlatformPaymongoKeys } from '@/lib/platform-config';
import { testPaymongoKey } from '@/lib/paymongo';

/** POST /api/platform/configuration/paymongo-test: check the platform PayMongo key in use. */
export async function POST() {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const keys = await getPlatformPaymongoKeys();
  if (!keys) return NextResponse.json({ success: false, error: 'No PayMongo key is set.' }, { status: 409 });
  const result = await testPaymongoKey(keys.secretKey);
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  return NextResponse.json({ success: true, data: { mode: result.mode } });
}
