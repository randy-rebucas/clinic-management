import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { findAccountForSession } from '@/lib/emcr/account';
import { activationView } from '@/lib/emcr/activation';
import { accountView } from '@/lib/emcr/session';

/**
 * GET /api/emcr/account (patient sign-in)
 * The eMCR account behind this sign-in: activation (active, plan, expiresAt, daysLeft, enforced),
 * whether it has the holder's own record, and how many clinic approvals are pending.
 * A sign-in without an account yet (password / QR, never redeemed) gets an inactive view.
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'ignore' });
  if (!session) return patientAuthError(request);
  try {
    const account = await findAccountForSession(session);
    const data = account
      ? { ...(await accountView(account)), guardianOnly: session.rel === 'guardian' }
      : { id: null, hasOwnRecord: true, pendingRequests: 0, guardianOnly: false, activation: activationView(null) };
    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error('Error loading eMCR account', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to load your account' }, { status: 500 });
  }
}
