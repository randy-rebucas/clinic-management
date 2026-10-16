import type { Metadata } from 'next';
import Link from 'next/link';
import { isInviteTokenFormat } from '@/lib/user-invite';
import SetPasswordForm from './SetPasswordForm';

export const dynamic = 'force-dynamic';

// The token is in the URL: never send it to other origins in the Referer header.
export const metadata: Metadata = {
  title: 'Set your password | My Clinic Software',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const value = typeof token === 'string' && isInviteTokenFormat(token) ? token : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2 tracking-tight">Set your password</h1>
          <p className="text-gray-500 text-sm sm:text-base">
            Choose a password with at least 12 characters. A short phrase of several words works well.
          </p>
        </div>
        {value ? (
          <SetPasswordForm token={value} />
        ) : (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
            <p className="font-semibold">This link is invalid or has expired.</p>
            <p className="mt-1">Ask your administrator to send a new one.</p>
          </div>
        )}
        <p className="mt-8 text-center text-sm text-gray-500">
          <Link href="/login" className="underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
