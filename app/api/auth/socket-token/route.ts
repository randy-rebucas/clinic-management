import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { verifySession } from '@/app/lib/dal';

const secretKey = process.env.SESSION_SECRET;
const encodedKey = new TextEncoder().encode(
  secretKey ||
    (process.env.NODE_ENV === 'production'
      ? ''
      : 'default-secret-key-change-in-production-dev-only')
);

/**
 * Mints a short-lived token for Socket.IO authentication, derived from the
 * caller's existing HTTP-only session cookie. Kept separate from the 7-day
 * session token so a leaked socket token (client-visible, unlike the cookie)
 * has a small blast radius.
 */
export async function GET() {
  if (!secretKey && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 503 });
  }

  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const token = await new SignJWT({
    userId: session.userId,
    email: session.email,
    role: session.role,
    tenantId: session.tenantId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(encodedKey);

  return NextResponse.json({ success: true, token });
}
