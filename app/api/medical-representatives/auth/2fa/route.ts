import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { verifyPending2faToken } from '@/app/lib/dal';
import { verifyUserTotp } from '@/app/api/auth/2fa/totp';
import { applyAuthRateLimits } from '@/lib/middleware/rate-limit';
import { auditRepSignIn, repTokenResponse } from '../../_lib/rep-login';

const EXPIRED = 'Your sign-in attempt expired. Please sign in again.';

/**
 * POST /api/medical-representatives/auth/2fa
 * Body: { pendingToken, code }
 *
 * Second step of mobile sign-in for accounts with two-step sign-in: `pendingToken` comes from
 * POST /api/medical-representatives/auth/token (valid 5 minutes), `code` is the 6-digit
 * authenticator code. Returns the same body as a successful token sign-in.
 */
export async function POST(request: NextRequest) {
  let body: { pendingToken?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body. Expected JSON.' }, { status: 400 });
  }

  const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : '';
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { success: false, error: 'Enter the 6-digit code from your authenticator app.' },
      { status: 400 }
    );
  }

  const pending = await verifyPending2faToken(typeof body.pendingToken === 'string' ? body.pendingToken : undefined);
  if (!pending) {
    return NextResponse.json({ success: false, error: EXPIRED, code: 'PENDING_2FA_EXPIRED' }, { status: 401 });
  }

  const limited = await applyAuthRateLimits(request, `2fa:${pending.userId}`);
  if (limited) return limited;

  try {
    await connectDB();
    const user = await User.findById(pending.userId).populate('role');
    const roleName = (user?.role as any)?.name;
    if (!user || user.status !== 'active' || !user.totpEnabled || roleName !== 'medical-representative') {
      return NextResponse.json({ success: false, error: EXPIRED, code: 'PENDING_2FA_EXPIRED' }, { status: 401 });
    }

    const medicalRep = user.medicalRepresentativeProfile
      ? await MedicalRepresentative.findById(user.medicalRepresentativeProfile)
      : await MedicalRepresentative.findOne({ email: user.email });
    if (!medicalRep || !medicalRep.isActivated || medicalRep.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Your account is not activated. Please complete payment or contact support.', code: 'MEDREP_INACTIVE' },
        { status: 403 }
      );
    }

    if (!(await verifyUserTotp(user._id.toString(), code))) {
      await auditRepSignIn(request, user, user.email, pending.tenantId ?? null, false, 'Wrong two-step code');
      return NextResponse.json(
        { success: false, error: 'Invalid or already used code. Please try again.' },
        { status: 401 }
      );
    }

    return await repTokenResponse(request, {
      user,
      medicalRep,
      roleId: (user.role as any)?._id?.toString(),
      tenantId: pending.tenantId ?? null,
      email: user.email,
    });
  } catch (error: any) {
    console.error('Medical representative 2FA error:', error);
    return NextResponse.json({ success: false, error: 'Failed to sign in' }, { status: 500 });
  }
}
