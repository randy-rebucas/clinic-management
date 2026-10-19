import { NextRequest, NextResponse, after } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Doctor from '@/models/Doctor';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter, tenantFilter } from '@/lib/api/tenant-session';
import { getSettings } from '@/lib/settings';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { escapeHtml as e, PROTECTED_DOCUMENT_HEADERS, withScriptNonce } from '@/lib/document-protection';
import { logPrinted } from '@/lib/audit';
import { philhealthSettingsOf } from '@/lib/philhealth';

/**
 * GET: the claim worksheet: every detail the PhilHealth claim forms (CF1, CF2) ask for, from the
 * bill, the patient record and the visit, laid out for encoding in eClaims and for the member to
 * check and sign. It is the clinic's working copy, not a PhilHealth form.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Claim');

  try {
    await connectDB();
    const inv = await Invoice.findOne({ _id: new Types.ObjectId(id), tenantId: ctx.tenantObjectId })
      .populate({ path: 'patient', select: 'firstName lastName middleName sex dateOfBirth address phone', match: patientTenantFilter(ctx.tenantId) })
      .populate({ path: 'visit', select: 'visitCode date diagnoses', match: tenantFilter(ctx.tenantId) })
      .lean<any>();
    if (!inv?.philhealth) return notFound('Claim');
    const [settings, tz, doctor] = await Promise.all([
      getSettings(ctx.tenantId),
      getTenantTimezone(ctx.tenantId),
      inv.professionalFeeDoctor ? Doctor.findOne({ _id: inv.professionalFeeDoctor, tenantId: ctx.tenantObjectId }).select('title firstName lastName licenseNumber philhealthPan').lean<any>() : null,
    ]);
    const ph = inv.philhealth;
    const p = inv.patient || {};
    const phs = philhealthSettingsOf(settings.philhealthSettings);
    const currency = settings.billingSettings?.currency || 'PHP';
    const money = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(Number(n) || 0);
    const day = (d?: Date | string) => (d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: tz }) : '');
    const dob = p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '';
    const address = p.address && typeof p.address === 'object' ? [p.address.street, p.address.city, p.address.state, p.address.zipCode].filter(Boolean).join(', ') : p.address || '';
    const diagnoses: { code?: string; description?: string; primary?: boolean }[] = inv.visit?.diagnoses ?? [];
    const services = Number(inv.subtotal) || 0;
    const pf = Number(inv.professionalFee) || 0;
    const statutory = (inv.discounts || []).find((d: any) => d.type === 'senior' || d.type === 'pwd');
    const discounts = (inv.discounts || []).reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0);
    const patientShare = Math.max(0, (Number(inv.total) || 0) - (Number(ph.amount) || 0));
    const row = (k: string, v: string) => `<tr><th>${e(k)}</th><td>${v || '<span class="blank">&nbsp;</span>'}</td></tr>`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>PhilHealth claim worksheet ${e(inv.invoiceNumber)}</title>
<style>
  @media print { @page { size: A4; margin: 14mm; } .no-print { display: none; } }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; max-width: 820px; margin: 0 auto; padding: 24px; font-size: 13px; line-height: 1.45; }
  h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #9ca3af; }
  .muted { color: #4b5563; } .note { font-size: 11px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 4px 6px; vertical-align: top; border-bottom: 1px solid #e5e7eb; }
  th { width: 34%; color: #4b5563; font-weight: normal; }
  .money td, .money th { text-align: right; } .money th:first-child { text-align: left; }
  .blank { display: inline-block; min-width: 180px; border-bottom: 1px solid #9ca3af; }
  .sign { display: flex; gap: 40px; margin-top: 40px; } .sign div { flex: 1; border-top: 1px solid #111827; padding-top: 4px; font-size: 12px; }
  .print { text-align: center; margin-bottom: 16px; } .print button { padding: 10px 22px; background: #0f766e; color: #fff; border: 0; border-radius: 6px; font-size: 15px; cursor: pointer; }
</style></head>
<body>
<div class="no-print print"><button data-print>Print worksheet</button></div>
<h1>PhilHealth claim worksheet</h1>
<p class="muted">${e(settings.clinicName || '')} · Bill ${e(inv.invoiceNumber)}${ph.claimNumber ? ` · Claim ${e(ph.claimNumber)}` : ''}</p>
<p class="note">The clinic’s working copy of the details for PhilHealth Claim Forms 1 and 2, for encoding in eClaims. It is not a PhilHealth form.</p>

<h2>Health care institution</h2>
<table>
  ${row('Name', e(settings.clinicName || ''))}
  ${row('PhilHealth accreditation no.', e(phs.hciAccreditationNo))}
  ${row('Address', e(settings.clinicAddress || ''))}
</table>

<h2>Member and patient (CF1)</h2>
<table>
  ${row('PhilHealth Identification Number', `<strong style="font-family:monospace">${e(ph.pin)}</strong>`)}
  ${row('Patient is the', ph.relationship === 'dependent' ? 'Dependent' : 'Member')}
  ${ph.relationship === 'dependent' ? row('Member’s name', e(ph.memberName || '')) : ''}
  ${row('Patient', e([p.lastName ? `${p.lastName},` : '', p.firstName, p.middleName].filter(Boolean).join(' ')))}
  ${row('Sex', e(p.sex ? String(p.sex).charAt(0).toUpperCase() + String(p.sex).slice(1) : ''))}
  ${row('Date of birth', e(dob))}
  ${row('Address', e(address))}
  ${row('Contact number', e(p.phone || ''))}
</table>

<h2>Care given (CF2)</h2>
<table>
  ${row('Date seen', e(day(ph.servedOn)))}
  ${row('Case rate', `<span style="font-family:monospace">${e(ph.caseRateCode)}</span> ${e(ph.caseRateDescription || '')}`)}
  ${row(
    'Diagnoses',
    diagnoses.length
      ? diagnoses.map((d) => `${d.code ? `<span style="font-family:monospace">${e(d.code)}</span> ` : ''}${e(d.description || '')}${d.primary ? ' (primary)' : ''}`).join('<br>')
      : ''
  )}
  ${row('Attending doctor', doctor ? e(`${doctor.title || 'Dr.'} ${doctor.firstName} ${doctor.lastName}`) : '')}
  ${row('Doctor’s PhilHealth accreditation', doctor?.philhealthPan ? `<span style="font-family:monospace">${e(doctor.philhealthPan)}</span>` : '')}
</table>

<h2>Charges and benefit</h2>
<table class="money">
  <tr><th></th><th>Actual charges</th><th>PhilHealth benefit</th></tr>
  <tr><th>Facility (HCI) fees</th><td>${money(services)}</td><td>${money(ph.hciAmount)}</td></tr>
  <tr><th>Professional fee</th><td>${money(pf)}</td><td>${money(ph.pfAmount)}</td></tr>
  ${discounts > 0 ? `<tr><th>Less discounts${statutory ? ` (${statutory.type === 'senior' ? 'senior citizen' : 'PWD'}, after the PhilHealth deduction)` : ''}</th><td>−${money(discounts)}</td><td></td></tr>` : ''}
  <tr><th><strong>Total</strong></th><td><strong>${money(inv.total)}</strong></td><td><strong>${money(ph.amount)}</strong></td></tr>
  <tr><th>Paid by the patient</th><td colspan="2">${money(patientShare)}</td></tr>
</table>

<div class="sign">
  <div>Member or representative (signature over printed name, date)</div>
  <div>Attending doctor</div>
  <div>Billing officer</div>
</div>
</body></html>`;
    after(() => logPrinted({ session: ctx.session, tenantId: ctx.tenantId, resource: 'invoice', resourceId: id, patientId: p._id, what: 'a PhilHealth claim worksheet', request }));
    return new NextResponse(withScriptNonce(html, request), { headers: PROTECTED_DOCUMENT_HEADERS });
  } catch (error) {
    console.error('Error printing PhilHealth worksheet:', error);
    return NextResponse.json({ success: false, error: 'Failed to print the worksheet' }, { status: 500 });
  }
}
