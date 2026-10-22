import { NextResponse } from 'next/server';
import { performInstallChecks } from '@/lib/install-checks';

/**
 * Check installation prerequisites and status. proxy.ts requires the INSTALL_SECRET bearer token.
 */
export async function GET() {
  try {
    const checks = await performInstallChecks();
    return NextResponse.json({
      success: true,
      checks,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check installation status',
      },
      { status: 500 }
    );
  }
}
