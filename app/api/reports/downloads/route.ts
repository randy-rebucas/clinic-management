import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getPermissionChecker, refuseAccess } from '@/app/lib/auth-helpers';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { REPORTS, canOpenReport, type ReportKey } from '@/lib/reports';
import { logReportDownloaded } from '../_lib/report-audit';

const schema = z.object({
  report: z.enum(REPORTS.map((r) => r.key) as [ReportKey, ...ReportKey[]]),
  /** The window the report answered with, as it returned it. Left out for a snapshot report. */
  range: z.object({ start: z.string().datetime(), end: z.string().datetime() }).optional(),
});

/**
 * POST /api/reports/downloads { report, range? }
 * The page builds the CSV from the report it already loaded, so the download never reaches the
 * server; the page tells this route, and it goes into the audit log. Nothing is returned.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const parsed = await parseBody(request, schema);
  if (isValidationError(parsed)) return parsed;
  const { report, range } = parsed.data;

  const can = await getPermissionChecker(ctx.session);
  if (!canOpenReport(can, report)) {
    return refuseAccess({ ...ctx.session, tenantId: ctx.tenantId }, 'You don’t have access to this report', 'reports', 'read');
  }

  const tz = await getTenantTimezone(ctx.tenantId);
  await logReportDownloaded(ctx, request, report, range ?? null, tz);
  return NextResponse.json({ success: true });
}
