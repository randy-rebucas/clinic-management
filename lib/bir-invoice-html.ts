import 'server-only';
import { escapeHtml as e } from '@/lib/document-protection';
import { formatTin, type BirSettings } from '@/lib/bir';

interface Parts {
  head: string;
  watermark: string;
  banner: string;
  seal: string;
}

const METHOD: Record<string, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  check: 'Check',
  insurance: 'Insurance',
  hmo: 'HMO',
  cwt: 'Creditable withholding tax (BIR 2307)',
  online: 'Online payment',
  other: 'Other',
};

/**
 * The BIR sales invoice (RR 7-2024): seller's registered name, TIN with branch code and VAT
 * status; serial; buyer; the VAT breakdown or the non-VAT legend; the senior citizen / PWD
 * details the law asks for; and the permit and approved serial range at the foot.
 */
export function birInvoiceHTML(opts: {
  invoice: any;
  bir: BirSettings;
  clinic: { name: string; address: string; phone: string; email: string; tin: string };
  currency: string;
  timezone: string;
  protection: Parts;
}): string {
  const { invoice, bir, clinic, protection } = opts;
  const vat = bir.regime === 'vat';
  const b = invoice.taxBreakdown || {};
  const patient = invoice.patient || {};
  const statutory = (invoice.discounts || []).find((d: any) => d.type === 'senior' || d.type === 'pwd');
  const money = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: opts.currency }).format(Number(n) || 0);
  const issued = invoice.bir?.issuedAt ? new Date(invoice.bir.issuedAt) : new Date();
  const date = issued.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: opts.timezone });
  const address =
    patient.address && typeof patient.address === 'object'
      ? [patient.address.street, patient.address.city, [patient.address.state, patient.address.zipCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : patient.address || '';
  const paid = (invoice.payments || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
  const registeredName = bir.registeredName.trim() || clinic.name;
  const range = bir.serialEnd ? `${bir.serialStart} to ${bir.serialEnd}` : `from ${bir.serialStart}`;

  const row = (label: string, value: string, strong = false) =>
    `<tr${strong ? ' class="strong"' : ''}><td>${e(label)}</td><td class="num">${value}</td></tr>`;

  const gross = Number(b.grossSales) || (Number(invoice.subtotal) || 0) + (Number(invoice.professionalFee) || 0);
  const otherDiscounts = (invoice.discounts || []).filter((d: any) => d !== statutory && Number(d.amount) > 0);

  const summary = statutory
    ? [
        row(vat && bir.pricesIncludeVat ? 'Total sales (VAT inclusive)' : 'Total sales', money(gross)),
        vat && Number(b.lessVat) > 0 ? row('Less: VAT', `−${money(b.lessVat)}`) : '',
        row('Amount net of VAT', money(gross - (Number(b.lessVat) || 0))),
        row(`Less: ${statutory.type === 'senior' ? 'Senior citizen' : 'PWD'} discount (${Number(statutory.percentage) || 20}%)`, `−${money(statutory.amount)}`),
        row('Amount due', money(invoice.total), true),
      ].join('')
    : [
        row('Total sales', money(gross)),
        ...otherDiscounts.map((d: any) => row(`Less: discount${d.reason ? ` (${d.reason})` : ''}`, `−${money(d.amount)}`)),
        vat && !bir.pricesIncludeVat ? row(`Add: VAT (${bir.vatRate}%)`, money(b.vatAmount)) : '',
        row('Total amount due', money(invoice.total), true),
      ].join('');

  const vatBox = vat
    ? `<table class="vat">
        ${row('VATable sales', money(b.vatableSales))}
        ${row('VAT-exempt sales', money(b.vatExemptSales))}
        ${row('Zero-rated sales', money(b.zeroRatedSales))}
        ${row(`VAT amount (${bir.vatRate}%)`, money(b.vatAmount))}
      </table>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Sales Invoice ${e(invoice.bir?.serialNo)}</title>
${protection.head}
<style>
  @media print { @page { size: A5; margin: 10mm; } .no-print { display: none; } body { padding: 0; } }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; max-width: 760px; margin: 0 auto; padding: 20px; font-size: 13px; line-height: 1.45; }
  .seller { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 10px; }
  .seller h1 { font-size: 18px; margin: 0; letter-spacing: 0.02em; }
  .seller p { margin: 2px 0; }
  .title { display: flex; justify-content: space-between; align-items: baseline; margin: 14px 0 8px; }
  .title h2 { font-size: 20px; margin: 0; letter-spacing: 0.08em; }
  .serial { font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold; color: #b91c1c; }
  .buyer { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  .buyer td { padding: 3px 0; vertical-align: top; }
  .buyer td.k { width: 120px; color: #4b5563; }
  .line { border-bottom: 1px solid #9ca3af; min-width: 160px; display: inline-block; }
  table.items { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
  table.items th, table.items td { border: 1px solid #d1d5db; padding: 5px 7px; }
  table.items th { background: #f3f4f6; text-align: left; font-size: 12px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { display: flex; gap: 16px; justify-content: space-between; align-items: flex-start; }
  .totals table { border-collapse: collapse; }
  .totals td { padding: 3px 6px; }
  .totals .sum { min-width: 280px; }
  .totals tr.strong td { border-top: 2px solid #111827; font-weight: bold; font-size: 15px; }
  table.vat { font-size: 12px; color: #374151; }
  .sc { margin-top: 12px; border: 1px dashed #9ca3af; padding: 8px 10px; }
  .sc td { padding: 3px 8px 3px 0; }
  .legend { margin-top: 12px; text-align: center; font-weight: bold; letter-spacing: 0.04em; }
  .foot { margin-top: 18px; border-top: 1px solid #d1d5db; padding-top: 8px; font-size: 11px; color: #4b5563; }
  .pays { margin-top: 10px; font-size: 12px; color: #374151; }
  .print-button { text-align: center; margin-bottom: 14px; }
  .print-button button { padding: 10px 22px; background: #0f766e; color: #fff; border: 0; border-radius: 6px; font-size: 15px; cursor: pointer; }
</style>
</head>
<body>
${protection.watermark}
<div class="no-print print-button"><button data-print>Print sales invoice</button></div>
${protection.banner}

<div class="seller">
  <h1>${e(registeredName)}</h1>
  ${registeredName !== clinic.name ? `<p>${e(clinic.name)}</p>` : ''}
  ${clinic.address ? `<p>${e(clinic.address)}</p>` : ''}
  <p><strong>${vat ? 'VAT REG TIN' : 'NON-VAT REG TIN'}:</strong> ${e(formatTin(clinic.tin, bir.branchCode))}</p>
  ${clinic.phone || clinic.email ? `<p>${[clinic.phone, clinic.email].filter(Boolean).map(e).join(' · ')}</p>` : ''}
</div>

<div class="title">
  <h2>SALES INVOICE</h2>
  <div>No. <span class="serial">${e(invoice.bir?.serialNo)}</span></div>
</div>

<table class="buyer">
  <tr><td class="k">Date</td><td>${e(date)}</td><td class="k">Reference</td><td>${e(invoice.invoiceNumber)}</td></tr>
  <tr><td class="k">Sold to</td><td colspan="3">${e([patient.firstName, patient.lastName].filter(Boolean).join(' '))}</td></tr>
  <tr><td class="k">Address</td><td colspan="3">${address ? e(address) : '<span class="line">&nbsp;</span>'}</td></tr>
  <tr><td class="k">TIN</td><td colspan="3"><span class="line">&nbsp;</span></td></tr>
</table>

<table class="items">
  <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
  <tbody>
    ${(invoice.items || [])
      .map((it: any) => {
        const name = typeof it.serviceId === 'object' && it.serviceId?.name ? it.serviceId.name : it.description || 'Service';
        const tag = vat && it.vatClass && it.vatClass !== 'vatable' ? ` <small>(${it.vatClass === 'exempt' ? 'VAT-exempt' : 'zero-rated'})</small>` : '';
        return `<tr><td>${e(name)}${tag}</td><td class="num">${e(it.quantity || 1)}</td><td class="num">${money(it.unitPrice)}</td><td class="num">${money(it.total)}</td></tr>`;
      })
      .join('')}
    ${Number(invoice.professionalFee) > 0 ? `<tr><td>Professional fee${invoice.professionalFeeNotes ? ` — ${e(invoice.professionalFeeNotes)}` : ''}</td><td class="num">1</td><td class="num">${money(invoice.professionalFee)}</td><td class="num">${money(invoice.professionalFee)}</td></tr>` : ''}
  </tbody>
</table>

<div class="totals">
  ${vatBox}
  <table class="sum">${summary}</table>
</div>

${
  statutory
    ? `<div class="sc"><table>
        <tr><td>${statutory.type === 'senior' ? 'Senior citizen' : 'PWD'} name</td><td>${e([patient.firstName, patient.lastName].filter(Boolean).join(' '))}</td></tr>
        <tr><td>${statutory.type === 'senior' ? 'OSCA ID no.' : 'PWD ID no.'}</td><td>${e(statutory.idNumber || '')}</td></tr>
        <tr><td>Signature</td><td><span class="line" style="min-width:220px">&nbsp;</span></td></tr>
      </table></div>`
    : ''
}

${
  (invoice.payments || []).length
    ? `<div class="pays">Received ${money(paid)}: ${(invoice.payments || [])
        .map((p: any) => `${e(METHOD[p.method] || p.method)} ${money(p.amount)}${p.referenceNo ? ` (ref ${e(p.referenceNo)})` : ''}`)
        .join('; ')}.${Number(invoice.outstandingBalance) > 0 ? ` Balance ${money(invoice.outstandingBalance)}.` : ''}</div>`
    : ''
}

${vat ? '' : '<p class="legend">THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX.</p>'}

${protection.seal}

<div class="foot">
  <p>BIR permit / acknowledgment certificate no. ${e(bir.permitNumber)}${bir.permitIssuedOn ? `, issued ${e(bir.permitIssuedOn)}` : ''}. Approved series ${e(range)}.</p>
  <p>Printed ${e(new Date().toLocaleString('en-PH', { timeZone: opts.timezone }))}. Reprints carry the same serial.</p>
</div>
</body>
</html>`;
}
