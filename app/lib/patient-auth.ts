import { NextRequest } from 'next/server';
import { verifyPatientSession, PatientSessionPayload } from '@/app/lib/dal';

/**
 * Verify the patient identity from either:
 *   1. The patient_session HttpOnly cookie  (web portal / same-origin requests)
 *   2. Authorization: Bearer <token> header  (third-party apps, mobile apps)
 *
 * Both carriers use the same HS256 JWT format signed with SESSION_SECRET,
 * so no separate token type is needed.
 *
 * Usage (replaces the two-line cookie pattern in every patient API route):
 *
 *   const session = await verifyPatientAuth(request);
 *   if (!session) return NextResponse.json({ success: false, error: 'Not authenticated.' }, { status: 401 });
 */
export async function verifyPatientAuth(
  request: NextRequest
): Promise<PatientSessionPayload | null> {
  // 1. Cookie (browser / web portal)
  const cookieValue = request.cookies.get('patient_session')?.value;
  if (cookieValue) {
    const session = await verifyPatientSession(cookieValue);
    if (session) return session;
  }

  // 2. Bearer token (third-party apps)
  const authHeader = request.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return verifyPatientSession(token);
  }

  return null;
}

export type { PatientSessionPayload };
