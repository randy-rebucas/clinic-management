import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getSettings } from '@/lib/settings';
import { daysToFile, philhealthSettingsOf } from '@/lib/philhealth';

/**
 * GET: every PhilHealth claim on the clinic's bills (refunded bills left out), with the days left
 * to file the ones not filed yet. Billing staff (invoices:write).
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const settings = philhealthSettingsOf((await getSettings(ctx.tenantId)).philhealthSettings);
    const rows = await Invoice.find({ tenantId: ctx.tenantObjectId, philhealth: { $exists: true }, status: { $ne: 'refunded' } })
      .select('invoiceNumber patient total outstandingBalance philhealth createdAt')
      .populate({ path: 'patient', select: 'firstName lastName', match: { tenantIds: ctx.tenantObjectId } })
      .sort({ 'philhealth.servedOn': 1 })
      .limit(2000)
      .lean<any[]>();
    const now = new Date();
    return NextResponse.json({
      success: true,
      data: {
        filingDays: settings.filingDays,
        claims: rows.map((r) => ({
          invoiceId: String(r._id),
          invoiceNumber: r.invoiceNumber,
          patientName: r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : 'Patient record unavailable',
          ...r.philhealth,
          caseRate: r.philhealth.caseRate ? String(r.philhealth.caseRate) : null,
          daysLeft: ['draft', 'returned'].includes(r.philhealth.status) ? daysToFile(r.philhealth.servedOn, settings.filingDays, now) : null,
        })),
      },
    });
  } catch (error) {
    console.error('Error loading PhilHealth claims:', error);
    return NextResponse.json({ success: false, error: 'Failed to load PhilHealth claims' }, { status: 500 });
  }
}
