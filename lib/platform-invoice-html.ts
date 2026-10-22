import 'server-only';
import { escapeHtml as e, protectionHead } from '@/lib/document-protection';
import { BIR_INVOICE_STYLES, birPermitFooter, birSellerHeader } from '@/lib/bir-invoice-parts';
import { planLabel } from '@/lib/subscription-period';
import type { BillingIssuer } from '@/lib/platform-config-schema';
import type { PlatformInvoiceBuyer } from '@/models/PlatformInvoice';

/**
 * DevCom Digital's sales invoice to a clinic for a MyClinicSoft subscription (RR 7-2024): the
 * seller and permit footer shared with clinic invoices (lib/bir-invoice-parts.ts), one line for
 * the plan, the VAT breakdown or the non-VAT legend, and a CANCELLED stamp once refunded.
 */
export function platformInvoiceHTML(opts: {
  invoice: {
    serialNo?: string;
    status: string;
    plan: string;
    billingCycle: 'monthly' | 'yearly';
    paidThrough?: Date | string;
    paidAt: Date | string;
    issuedAt?: Date | string;
    amount: number;
    currency?: string;
    vatableSales?: number;
    vatAmount?: number;
    transactionId?: string;
    orderId: string;
    seller?: BillingIssuer;
    buyer?: PlatformInvoiceBuyer;
    cancelledReason?: string;
  };
  timezone: string;
}): string {
  const { invoice: inv, timezone } = opts;
  const s = inv.seller;
  if (!s) throw new Error('Invoice has no seller details yet');
  const vat = s.vatRegime === 'vat';
  const money = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: inv.currency || 'PHP' }).format(Number(n) || 0);
  const day = (d?: Date | string) => (d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone }) : '');
  const buyer = inv.buyer ?? { registeredName: '', tin: '', address: '', email: '' };
  const cycle = inv.billingCycle === 'yearly' ? 'one year' : 'one month';
  const description = `MyClinicSoft ${planLabel(inv.plan)} plan, ${cycle}${inv.paidThrough ? ` (paid through ${day(inv.paidThrough)})` : ''}`;
  const row = (label: string, value: string, strong = false) =>
    `<tr${strong ? ' class="strong"' : ''}><td>${e(label)}</td><td class="num">${value}</td></tr>`;
  const cancelled = inv.status === 'cancelled';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Sales Invoice ${e(inv.serialNo)}</title>
${protectionHead()}
<style>
${BIR_INVOICE_STYLES}
  .void { margin: 10px 0; border: 3px solid #b91c1c; color: #b91c1c; text-align: center; font-weight: bold; font-size: 18px; letter-spacing: 0.12em; padding: 6px; }
  .note { margin-top: 10px; font-size: 12px; color: #374151; }
</style>
</head>
<body>
<div class="no-print print-button"><button data-print>Print sales invoice</button></div>

${birSellerHeader({ registeredName: s.sellerName, otherName: s.tradeName || undefined, address: s.address, vat, tin: s.tin.replace(/\D/g, ''), branchCode: s.branchCode })}

<div class="title">
  <h2>SALES INVOICE</h2>
  <div>No. <span class="serial">${e(inv.serialNo)}</span></div>
</div>
${cancelled ? `<div class="void">CANCELLED${inv.cancelledReason ? ` · ${e(inv.cancelledReason)}` : ''}</div>` : ''}

<table class="buyer">
  <tr><td class="k">Date</td><td>${e(day(inv.issuedAt ?? inv.paidAt))}</td><td class="k">Reference</td><td>${e(inv.transactionId || inv.orderId)}</td></tr>
  <tr><td class="k">Sold to</td><td colspan="3">${e(buyer.registeredName)}</td></tr>
  <tr><td class="k">Address</td><td colspan="3">${buyer.address ? e(buyer.address) : '<span class="line">&nbsp;</span>'}</td></tr>
  <tr><td class="k">TIN</td><td colspan="3">${buyer.tin ? e(buyer.tin) : '<span class="line">&nbsp;</span>'}</td></tr>
</table>

<table class="items">
  <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
  <tbody><tr><td>${e(description)}</td><td class="num">1</td><td class="num">${money(inv.amount)}</td><td class="num">${money(inv.amount)}</td></tr></tbody>
</table>

<div class="totals">
  ${
    vat
      ? `<table class="vat">
        ${row('VATable sales', money(inv.vatableSales ?? 0))}
        ${row('VAT-exempt sales', money(0))}
        ${row('Zero-rated sales', money(0))}
        ${row(`VAT amount (${s.vatRate}%)`, money(inv.vatAmount ?? 0))}
      </table>`
      : ''
  }
  <table class="sum">
    ${row(vat ? 'Total sales (VAT inclusive)' : 'Total sales', money(inv.amount))}
    ${row('Total amount due', money(inv.amount), true)}
  </table>
</div>

<div class="pays">Received ${money(inv.amount)} on ${e(day(inv.paidAt))} through PayMongo${inv.transactionId ? ` (ref ${e(inv.transactionId)})` : ''}.</div>

${vat ? '' : '<p class="legend">THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX.</p>'}
${s.footerNote ? `<p class="note">${e(s.footerNote)}</p>` : ''}

${birPermitFooter({ permitNumber: s.permitNumber, permitIssuedOn: s.permitIssuedOn, serialStart: s.serialStart, serialEnd: s.serialEnd, timezone })}
</body>
</html>`;
}
