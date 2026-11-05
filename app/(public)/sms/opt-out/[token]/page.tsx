import type { Metadata } from 'next';
import { NO_INDEX } from '@/lib/seo';
import { getSettings } from '@/lib/settings';
import { maskPhone } from '@/lib/phone';
import { readSmsOptOutToken } from '@/lib/sms-opt-out-link';
import SmsOptOutClient from '@/components/SmsOptOutClient';

export const metadata: Metadata = { title: 'Stop text messages', robots: NO_INDEX };
export const dynamic = 'force-dynamic';

/** Where a promotional text's opt-out link lands. Opening it changes nothing until they confirm. */
export default async function SmsOptOutPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = readSmsOptOutToken(token);
  const clinicName = link ? (await getSettings(link.tenantId))?.clinicName || 'this clinic' : '';

  return (
    <div className="relative min-h-[70vh] bg-white">
      <div className="relative mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-16">
        {link ? (
          <SmsOptOutClient token={token} clinicName={clinicName} phone={maskPhone(link.phone)} />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">This link doesn&rsquo;t work</h1>
            <p className="mt-2 text-gray-600">It may have expired. Ask the clinic to stop sending you texts.</p>
          </div>
        )}
      </div>
    </div>
  );
}
