import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { createSession, revokeUserSessions } from '@/app/lib/dal';
import { requireRepSession, isRepSessionError } from '../_lib/rep-session';
import { validatePasswordPolicy } from '@/lib/user-invite';

/**
 * POST /api/medical-representatives/change-password
 * Change password for medical representative
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, rateLimiters.auth);
    if (rateLimitResponse) return rateLimitResponse;

    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    await connectDB();

    const user = await User.findOne({ _id: rep.userObjectId });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const policyErrors = validatePasswordPolicy(newPassword, { email: user.email });
    if (policyErrors.length > 0) {
      return NextResponse.json(
        { success: false, error: policyErrors.join(' ') },
        { status: 400 }
      );
    }

    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();

    // Sign out every other device, then re-issue this device's session at the new version.
    await revokeUserSessions(String(user._id));
    await createSession(
      String(user._id),
      rep.session.email,
      'medical-representative',
      rep.session.roleId,
      rep.session.tenantId
    );

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error: any) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
