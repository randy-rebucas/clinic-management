import type { Metadata } from 'next';
import { NO_INDEX } from '@/lib/seo';
import RepSignupConfirmClient from '@/components/RepSignupConfirmClient';

export const metadata: Metadata = { title: 'Confirm your registration', robots: NO_INDEX };
export const dynamic = 'force-dynamic';

/** Where the signup email lands. Opening it changes nothing until they press the button. */
export default async function RepSignupConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="relative min-h-[70vh] bg-white">
      <div className="relative mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-16">
        <RepSignupConfirmClient token={token ?? ''} />
      </div>
    </div>
  );
}
