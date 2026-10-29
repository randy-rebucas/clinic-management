import type { Metadata } from 'next';
import Link from 'next/link';
import { NO_INDEX } from '@/lib/seo';
import { formatInviteCode, parseInviteCode } from '@/lib/emcr/invite';

/**
 * Target of an eMCR app invite (the texted link and the printed slip's QR): opens the app on the
 * invite, or sends the person to the store with the code to type in after installing. The page
 * never looks the code up, so it says nothing about whether it is valid.
 */
export const metadata: Metadata = { title: 'Your eMCR invite', robots: NO_INDEX };

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const code = parseInviteCode((await params).code);

  return (
    <section className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-3 text-2xl font-bold text-gray-900">Your clinic invited you to eMCR</h1>
        {code ? (
          <>
            <p className="text-gray-600">See your health records, visits and prescriptions in the eMCR app.</p>
            <p className="mt-6 text-sm text-gray-500">Your invite code</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-widest text-gray-900">{formatInviteCode(code)}</p>
            <div className="mt-8 flex flex-col gap-3">
              <a
                href={`myclinicsoft://invite?c=${code}`}
                className="rounded-md bg-brand-teal-dark px-4 py-3 font-semibold text-white hover:bg-brand-teal-deep"
              >
                Open in the eMCR app
              </a>
              <Link href="/download" className="rounded-md border border-gray-300 bg-white px-4 py-3 font-semibold text-gray-900 hover:border-gray-900">
                Get the app
              </Link>
            </div>
            <p className="mt-6 text-sm text-gray-600">
              New to eMCR? Install it, choose <span className="font-medium text-gray-900">I have an invite from my clinic</span>, and enter
              the code above. We’ll text a sign-in code to the number your clinic has for you.
            </p>
            <p className="mt-3 text-sm text-gray-600">
              Already set up?{' '}
              <Link href="/my-qr" className="font-semibold text-brand-teal-dark hover:underline">
                Get a sign-in QR
              </Link>{' '}
              for another device, for you or your child.
            </p>
          </>
        ) : (
          <p className="text-gray-600">This invite link isn’t complete. Check the text message, or ask your clinic for a new invite.</p>
        )}
      </div>
    </section>
  );
}
