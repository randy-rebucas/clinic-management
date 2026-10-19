import { NextRequest, NextResponse, after } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import HmoClaimBatch from '@/models/HmoClaimBatch';
import Hmo from '@/models/Hmo';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { getSettings } from '@/lib/settings';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { escapeHtml as e, PROTECTED_DOCUMENT_HEADERS, withScriptNonce } from '@/lib/document-protection';
import { formatTin, birSettingsOf } from '@/lib/bir';
import { createAuditLog } from '@/lib/audit';

/**
 * GET: the transmittal letter to send with the claims: one line per claim, totals, sign-off. It
 * lists patients' names, member IDs and LOA numbers for a third party, so each print is audited.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Transmittal');

  try {
    await connectDB();
    const batch = await HmoClaimBatch.findOne({ _id: new Types.ObjectId(id), tenantId: ctx.tenantObjectId }).lean<any>();
    if (!batch) return notFound('Transmittal');
    const [hmo, settings, tz] = await Promise.all([
      Hmo.findOne({ _id: batch.hmo, tenantId: ctx.tenantObjectId }).lean<any>(),
      getSettings(ctx.tenantId),
      getTenantTimezone(ctx.tenantId),
    ]);
    const currency = settings.billingSettings?.currency || 'PHP';
    const money = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(Number(n) || 0);
    const day = (d: Date) => new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });
    const bir = birSettingsOf(settings.birSettings);
    const sent = batch.submittedAt ? day(batch.submittedAt) : 'Not yet sent (draft)';

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Transmittal ${e(batch.batchNumber)}</title>
<style>
  @media print { @page { size: A4; margin: 15mm; } .no-print { display: none; } }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; max-width: 820px; margin: 0 auto; padding: 24px; font-size: 13px; line-height: 1.5; }
  h1 { font-size: 18px; margin: 0; } .muted { color: #4b5563; }
  .head { display: flex; justify-content: space-between; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-size: 12px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tfoot td { font-weight: bold; }
  .sign { display: flex; gap: 48px; margin-top: 48px; } .sign div { flex: 1; border-top: 1px solid #111827; padding-top: 4px; font-size: 12px; }
  .print { text-align: center; margin-bottom: 16px; } .print button { padding: 10px 22px; background: #0f766e; color: #fff; border: 0; border-radius: 6px; font-size: 15px; cursor: pointer; }
</style></head>
<body>
<div class="no-print print"><button data-print>Print transmittal</button></div>
<div class="head">
  <div>
    <h1>${e(settings.clinicName || '')}</h1>
    ${settings.clinicAddress ? `<div class="muted">${e(settings.clinicAddress)}</div>` : ''}
    ${settings.taxId ? `<div class="muted">TIN ${e(formatTin(settings.taxId, bir.branchCode))}</div>` : ''}
  </div>
  <div style="text-align:right">
    <div><strong>Claims transmittal</strong></div>
    <div style="font-family:monospace;font-size:16px">${e(batch.batchNumber)}</div>
    <div class="muted">${e(sent)}</div>
  </div>
</div>
<p>To: <strong>${e(batch.hmoName)}</strong>${hmo?.contactName ? `, attention ${e(hmo.contactName)}` : ''}${hmo?.address ? `<br><span class="muted">${e(hmo.address)}</span>` : ''}</p>
<p>Please find enclosed ${batch.claims.length} ${batch.claims.length === 1 ? 'claim' : 'claims'} for services given to your members, totalling <strong>${money(batch.totalClaimed)}</strong>.${hmo?.paymentTermsDays ? ` Payment is due within ${hmo.paymentTermsDays} days of receipt.` : ''}</p>
<table>
  <thead><tr><th>#</th><th>Member</th><th>Member ID</th><th>LOA no.</th><th>Invoice</th><th class="num">Amount</th></tr></thead>
  <tbody>
    ${batch.claims
      .map(
        (c: any, i: number) =>
          `<tr><td>${i + 1}</td><td>${e(c.patientName)}</td><td>${e(c.memberId || '')}</td><td>${e(c.loaNumber || '')}</td><td>${e(c.invoiceNumber)}</td><td class="num">${money(c.amount)}</td></tr>`
      )
      .join('')}
  </tbody>
  <tfoot><tr><td colspan="5">Total</td><td class="num">${money(batch.totalClaimed)}</td></tr></tfoot>
</table>
<p class="muted">Please quote ${e(batch.batchNumber)} on your remittance advice, and send BIR Form 2307 for any tax withheld.</p>
<div class="sign"><div>Prepared by</div><div>Received by (name, date)</div></div>
</body></html>`;
    after(() =>
      createAuditLog({
        userId: ctx.session.userId,
        userEmail: ctx.session.email,
        userRole: ctx.session.role,
        tenantId: ctx.tenantId,
        action: 'print',
        resource: 'hmo_claim',
        resourceId: id,
        isSensitive: true,
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
        userAgent: request.headers.get('user-agent') ?? undefined,
        requestMethod: 'GET',
        requestPath: request.nextUrl.pathname,
        description: `Printed transmittal ${batch.batchNumber} to ${batch.hmoName} (${batch.claims.length} ${batch.claims.length === 1 ? 'claim' : 'claims'})`,
        metadata: { invoices: batch.claims.map((c: any) => c.invoiceNumber) },
      })
    );
    return new NextResponse(withScriptNonce(html, request), { headers: PROTECTED_DOCUMENT_HEADERS });
  } catch (error) {
    console.error('Error printing transmittal:', error);
    return NextResponse.json({ success: false, error: 'Failed to print the transmittal' }, { status: 500 });
  }
}
