import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getSettings } from '@/lib/settings';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { createAuditLog } from '@/lib/audit';
import { PHILHEALTH_STATUS, philhealthSettingsOf } from '@/lib/philhealth';
import { exportClaims } from '@/lib/philhealth-claims';

const cell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * GET: every PhilHealth claim as CSV (newest 10,000 visits at most). It carries members' PhilHealth
 * numbers, so each download is recorded in the audit log.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const [settings, tz] = await Promise.all([getSettings(ctx.tenantId), getTenantTimezone(ctx.tenantId)]);
    const { filingDays } = philhealthSettingsOf(settings.philhealthSettings);
    const rows = await exportClaims(ctx.tenantId, filingDays);
    const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-CA', { timeZone: tz }) : '');
    const lines = [
      ['Bill', 'Patient', 'PIN', 'Member or dependent', 'Case rate', 'Case', 'Seen on', 'Facility share', 'Professional fee share', 'Claim', 'Status', 'File by', 'Claim number', 'Filed', 'Paid on', 'Paid', 'Tax withheld', 'Note'],
      ...rows.map((c) => [
        c.invoiceNumber,
        c.patientName,
        c.pin,
        c.relationship === 'dependent' ? 'Dependent' : 'Member',
        c.caseRateCode,
        c.caseRateDescription ?? '',
        day(c.servedOn),
        c.hciAmount,
        c.pfAmount,
        c.amount,
        PHILHEALTH_STATUS[c.status]?.label ?? c.status,
        day(c.fileBy),
        c.claimNumber ?? '',
        day(c.filedAt),
        day(c.paidAt),
        c.paidAmount ?? '',
        c.withheldAmount ?? '',
        c.note ?? '',
      ]),
    ];
    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'data_export',
      resource: 'philhealth',
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
      requestMethod: 'GET',
      requestPath: request.nextUrl.pathname,
      description: `Downloaded ${rows.length.toLocaleString('en-US')} PhilHealth ${rows.length === 1 ? 'claim' : 'claims'}`,
      metadata: { rows: rows.length },
    });
    const stamp = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    return new NextResponse('﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="philhealth-claims-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error exporting PhilHealth claims:', error);
    return NextResponse.json({ success: false, error: 'Failed to download the claims' }, { status: 500 });
  }
}
