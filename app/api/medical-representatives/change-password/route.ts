import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { verifySession } from '@/app/lib/dal';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * POST /api/medical-representatives/change-password
 * Change password for medical representative
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, rateLimiters.auth);
    if (rateLimitResponse) return rateLimitResponse;

    // Verify session
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (session.role !== 'medical-representative') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'New password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    const result = await run(session.tenantId, async () => {
      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      if (!user) {
        return { status: 404 as const, error: 'User not found' };
      }

      // Verify current password
      const passwordMatch = await bcrypt.compare(currentPassword, user.password);
      if (!passwordMatch) {
        return { status: 401 as const, error: 'Current password is incorrect' };
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } });

      return { status: 200 as const };
    });

    if (result.status !== 200) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

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
