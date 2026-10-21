import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { requirePlatformPage } from '@/lib/platform-auth';
import { loadVoucherSheet } from '@/lib/platform-emcr';
import PrintButton from '@/components/platform/PrintButton';
import { BatchStatusBadge, LINK, php } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Print eMCR vouchers' };

const PER_PAGE = 10;

/**
 * A4 sheets of eMCR vouchers, ten to a page (2 × 5, 95 × 55 mm, dashed cut lines). Reading the
 * codes is audited. Unpaid and void batches print with a watermark so a sheet that leaks before
 * the cash arrives can't be mistaken for working vouchers.
 */
const PRINT_CSS = `
@page { size: A4; margin: 10mm; }
.voucher-sheet { width: 190mm; height: 277mm; display: grid; grid-template-columns: repeat(2, 95mm); grid-auto-rows: 55.4mm; background: #fff; }
.voucher-card { position: relative; overflow: hidden; border: 0.3mm dashed #9ca3af; margin: -0.15mm; padding: 4mm 4.5mm; display: flex; flex-direction: column; color: #0f172a; }
.voucher-qr svg { width: 100%; height: 100%; display: block; }
.voucher-mark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.voucher-mark span { transform: rotate(-18deg); border: 0.8mm solid currentColor; border-radius: 2mm; padding: 1mm 3mm; font-weight: 800; font-size: 15pt; letter-spacing: 0.04em; white-space: nowrap; opacity: 0.8; background: rgba(255,255,255,0.75); }
@media print {
  html, body { background: #fff !important; }
  body header, .no-print { display: none !important; }
  main { max-width: none !important; padding: 0 !important; margin: 0 !important; }
  body > div { background: #fff !important; min-height: 0 !important; }
  .voucher-sheets { gap: 0 !important; padding: 0 !important; background: #fff !important; }
  .voucher-sheet { box-shadow: none !important; break-after: page; }
  .voucher-sheet:last-child { break-after: auto; }
  .voucher-card, .voucher-mark span { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

function validity(days: number): string {
  if (days === 365 || days === 366) return 'Valid for 1 year from activation';
  if (days % 365 === 0) return `Valid for ${days / 365} years from activation`;
  return `Valid for ${days} days from activation`;
}

export default async function PrintVouchersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const session = await requirePlatformPage();
  const { id } = await params;
  const { all } = await searchParams;
  const showAll = all === '1';
  const sheet = await loadVoucherSheet(id, session.email);
  if (!sheet) notFound();
  const { batch, codes } = sheet;

  const shown = showAll ? codes : codes.filter((c) => c.status === 'unsold');
  const cards = await Promise.all(
    shown.map(async (c) => ({
      ...c,
      qr: await QRCode.toString(JSON.stringify({ type: 'emcr_voucher', code: c.code.replace(/-/g, '') }), {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 0,
      }),
    }))
  );
  const pages: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += PER_PAGE) pages.push(cards.slice(i, i + PER_PAGE));

  const batchMark = batch.status === 'unpaid' ? 'UNPAID — NOT ACTIVE YET' : batch.status === 'void' ? 'VOID' : null;
  const hidden = codes.length - shown.length;

  return (
    <div className="space-y-4">
      <style>{PRINT_CSS}</style>

      <div className="no-print space-y-3">
        <Link href={`/platform/vouchers/${batch.id}`} className={`${LINK} text-sm`}>Batch {batch.batchNumber}</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Print vouchers</h1>
          <BatchStatusBadge status={batch.status} />
          <div className="ml-auto flex items-center gap-3">
            <Link href={`/platform/vouchers/${batch.id}/print${showAll ? '' : '?all=1'}`} className={`${LINK} text-sm`}>
              {showAll ? 'Unused codes only' : 'Show all codes'}
            </Link>
            {cards.length > 0 && <PrintButton label={`Print ${cards.length} ${cards.length === 1 ? 'voucher' : 'vouchers'}`} />}
          </div>
        </div>
        <p className="text-sm text-gray-600">
          {batch.clinicName} · {pages.length} A4 {pages.length === 1 ? 'page' : 'pages'}, ten vouchers each.
          {!showAll && hidden > 0 ? ` ${hidden} redeemed or void ${hidden === 1 ? 'code is' : 'codes are'} left out.` : ''}
          {batch.status === 'unpaid' && ' The batch is unpaid: the codes won’t work until it is marked paid, and each voucher says so.'}
          {batch.status === 'void' && ' The batch is void: these vouchers don’t work.'}
        </p>
        <p className="text-xs text-gray-500">Viewing these codes was written to the audit log. In the print dialog, choose A4, scale 100%, no headers or footers.</p>
      </div>

      {cards.length === 0 ? (
        <p className="no-print rounded-lg border border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-600">
          No unused codes to print in this batch.
        </p>
      ) : (
        <div className="voucher-sheets flex flex-col gap-6 overflow-x-auto bg-gray-100 p-6">
          {pages.map((page, p) => (
            <div key={p} className="voucher-sheet mx-auto shrink-0 shadow-md">
              {page.map((c) => {
                const mark = batchMark ?? (c.status === 'void' ? 'VOID' : c.status === 'redeemed' ? 'USED' : null);
                return (
                  <article key={c.code} className="voucher-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[15pt] font-extrabold leading-none tracking-tight text-brand-teal-deep">eMCR</p>
                        <p className="mt-[1mm] truncate text-[7.5pt] font-medium text-gray-600">{batch.clinicName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[17pt] font-extrabold leading-none tabular-nums">{php(batch.faceValue)}</p>
                        <p className="mt-[1mm] text-[6.5pt] text-gray-600">{validity(batch.days)}</p>
                      </div>
                    </div>

                    <div className="mt-[2.5mm] flex flex-1 items-center gap-[3.5mm]">
                      <div className="voucher-qr h-[24mm] w-[24mm] shrink-0" dangerouslySetInnerHTML={{ __html: c.qr }} />
                      <div className="min-w-0">
                        <p className="text-[6.5pt] font-semibold uppercase tracking-wider text-gray-500">Activation code</p>
                        <p className="whitespace-nowrap font-mono text-[14pt] font-bold leading-tight tracking-wide">{c.code}</p>
                        <p className="mt-[1.5mm] text-[7pt] leading-snug text-gray-700">
                          Open the eMCR app → Activation → enter this code, or scan the QR.
                        </p>
                      </div>
                    </div>

                    <p className="mt-[1.5mm] text-[5.5pt] text-gray-500">
                      One use only. Keep this voucher private until you activate. {batch.batchNumber}
                    </p>

                    {mark && (
                      <div className={`voucher-mark ${mark === 'VOID' || mark === 'USED' ? 'text-gray-700' : 'text-rose-700'}`} aria-hidden="true">
                        <span>{mark}</span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
