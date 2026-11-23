import type { Metadata } from 'next';
import Link from 'next/link';
import QRCode from 'qrcode';
import { NO_INDEX } from '@/lib/seo';
import { readVoucherPurchase } from '@/lib/emcr/voucher-purchase';
import RefreshWhilePending from '@/components/voucher/RefreshWhilePending';

export const metadata: Metadata = { title: 'Your eMCR activation code', robots: NO_INDEX, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

const CARD = 'rounded-xl border border-gray-200 bg-white p-6 shadow-[0_20px_50px_rgb(15,23,42,0.08)] sm:p-8';

/**
 * Where PayMongo returns the buyer of an online eMCR voucher. The token in the link is the
 * secret: it shows the code once paid, and checks PayMongo while the payment is confirming.
 */
export default async function VoucherResultPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await readVoucherPurchase(token);

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-16">
        {view.state === 'missing' && (
          <div className={CARD}>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">This voucher link doesn&rsquo;t work</h1>
            <p className="mt-2 text-gray-600">
              Check the link in your email. If you paid and can&rsquo;t find your code, contact support with your PayMongo receipt.
            </p>
            <Link href="/voucher" className="mt-6 inline-flex font-semibold text-brand-teal-dark hover:underline">
              Buy a voucher
            </Link>
          </div>
        )}

        {view.state === 'pending' && (
          <div className={CARD} role="status" aria-live="polite">
            <RefreshWhilePending />
            <div className="mb-5 h-10 w-10 animate-spin rounded-full border-4 border-brand-teal-light border-t-brand-teal-dark motion-reduce:animate-none" aria-hidden="true" />
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Confirming your payment…</h1>
            <p className="mt-2 text-gray-600">
              This usually takes a few seconds. Your code appears here as soon as PayMongo confirms, and we email it to you too.
            </p>
            <p className="mt-4 text-sm text-gray-500">
              Didn&rsquo;t finish paying?{' '}
              <Link href="/voucher" className="font-semibold text-brand-teal-dark hover:underline">
                Start again
              </Link>
            </p>
          </div>
        )}

        {view.state === 'paid' && <PaidVoucher code={view.code} redeemed={view.redeemed} email={view.email} />}
      </div>
    </div>
  );
}

async function PaidVoucher({ code, redeemed, email }: { code: string; redeemed: boolean; email: string }) {
  // Same QR the printed clinic vouchers carry, so the app's "Scan the voucher QR" reads it.
  const qr = await QRCode.toDataURL(JSON.stringify({ type: 'emcr_voucher', code: code.replace(/-/g, '') }), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 360,
  });
  return (
    <div className={CARD}>
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-teal-dark">Payment received</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900">Your eMCR activation code</h1>

      <p className="mt-5 select-all rounded-md bg-gray-50 px-4 py-4 text-center font-mono text-2xl font-bold tracking-widest text-gray-900 sm:text-3xl">
        {code}
      </p>
      {redeemed ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          This code has been used, and eMCR is active on the account that entered it.
        </p>
      ) : (
        <p className="mt-3 text-sm text-gray-600">Sent to {email}. Keep it private: anyone with the code can use it once.</p>
      )}

      {!redeemed && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`QR code for activation code ${code}`} className="mx-auto mt-6 h-48 w-48" />
          <h2 className="mt-6 font-semibold text-gray-900">How to activate</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-gray-700">
            <li>Open the eMCR app and sign in.</li>
            <li>
              Go to <strong>More → Activation</strong>.
            </li>
            <li>Type the code, or tap &ldquo;Scan the voucher QR&rdquo; and scan the QR above.</li>
          </ol>
        </>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/download"
          className="inline-flex flex-1 items-center justify-center rounded-md bg-brand-teal-dark px-4 py-2.5 font-semibold text-white hover:bg-brand-teal-deep"
        >
          Get the eMCR app
        </Link>
        <Link
          href="/voucher"
          className="inline-flex flex-1 items-center justify-center rounded-md border border-gray-300 px-4 py-2.5 font-semibold text-gray-900 hover:border-gray-900"
        >
          Buy another
        </Link>
      </div>
    </div>
  );
}
