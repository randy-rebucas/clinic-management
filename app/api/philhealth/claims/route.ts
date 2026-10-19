import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getSettings } from '@/lib/settings';
import { isSettledStatus, philhealthSettingsOf } from '@/lib/philhealth';
import { listOpenClaims, listSettledClaims } from '@/lib/philhealth-claims';

/**
 * GET: PhilHealth claims on the clinic's bills (refunded bills left out). Billing staff
 * (invoices:write).
 *  Default: every claim still in hand (to file, returned, filed), nearest deadline first, with
 *  the days left to file and the date to file by.
 *  `view=done`: paid and denied claims, newest answer first, paged (`page`, `limit`), narrowed by
 *  `result=paid|part_paid|denied` and `search` (patient, bill, claim number, case rate or PIN).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;
  const sp = request.nextUrl.searchParams;

  try {
    await connectDB();
    const { filingDays } = philhealthSettingsOf((await getSettings(ctx.tenantId)).philhealthSettings);
    if (sp.get('view') === 'done') {
      const page = Math.max(1, Math.floor(Number(sp.get('page')) || 1));
      const limit = Math.min(50, Math.max(1, Math.floor(Number(sp.get('limit')) || 20)));
      const result = sp.get('result');
      const { rows, total } = await listSettledClaims({
        tenantId: ctx.tenantId,
        filingDays,
        result: isSettledStatus(result) ? result : null,
        search: (sp.get('search') ?? '').slice(0, 100),
        page,
        limit,
      });
      return NextResponse.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
    }
    const { rows, limited } = await listOpenClaims(ctx.tenantId, filingDays);
    return NextResponse.json({ success: true, data: { filingDays, claims: rows, limited } });
  } catch (error) {
    console.error('Error loading PhilHealth claims:', error);
    return NextResponse.json({ success: false, error: 'Failed to load PhilHealth claims' }, { status: 500 });
  }
}
