import 'server-only';
import { escapeHtml as e } from '@/lib/document-protection';
import { formatTin } from '@/lib/bir';

/**
 * Pieces every BIR sales invoice shares, whoever the seller is: a clinic's invoice to a patient
 * (lib/bir-invoice-html.ts) and DevCom Digital's invoice to a clinic for its subscription
 * (lib/platform-invoice-html.ts). The page styles, the seller block (registered name, address,
 * VAT or non-VAT TIN with branch code) and the permit / approved series footer.
 */

export const BIR_INVOICE_STYLES = `  @media print { @page { size: A5; margin: 10mm; } .no-print { display: none; } body { padding: 0; } }
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
`;

export function birSellerHeader(o: {
  registeredName: string;
  /** Shown under the registered name when it differs (the clinic's or trade name). */
  otherName?: string;
  address?: string;
  vat: boolean;
  tin: string;
  branchCode: string;
  contacts?: Array<string | undefined | null>;
}): string {
  const contacts = (o.contacts ?? []).filter(Boolean) as string[];
  return `<div class="seller">
  <h1>${e(o.registeredName)}</h1>
  ${o.otherName && o.registeredName !== o.otherName ? `<p>${e(o.otherName)}</p>` : ''}
  ${o.address ? `<p>${e(o.address)}</p>` : ''}
  <p><strong>${o.vat ? 'VAT REG TIN' : 'NON-VAT REG TIN'}:</strong> ${e(formatTin(o.tin, o.branchCode))}</p>
  ${contacts.length ? `<p>${contacts.map(e).join(' · ')}</p>` : ''}
</div>`;
}

export function birPermitFooter(o: { permitNumber: string; permitIssuedOn?: string; serialStart: number; serialEnd: number; timezone: string }): string {
  const range = o.serialEnd ? `${o.serialStart} to ${o.serialEnd}` : `from ${o.serialStart}`;
  return `<div class="foot">
  <p>BIR permit / acknowledgment certificate no. ${e(o.permitNumber)}${o.permitIssuedOn ? `, issued ${e(o.permitIssuedOn)}` : ''}. Approved series ${e(range)}.</p>
  <p>Printed ${e(new Date().toLocaleString('en-PH', { timeZone: o.timezone }))}. Reprints carry the same serial.</p>
</div>`;
}
