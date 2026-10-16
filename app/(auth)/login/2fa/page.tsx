import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readPending2fa, verifySession } from '@/app/lib/dal';
import TwoFactorForm from './TwoFactorForm';

export const dynamic = 'force-dynamic';

export default async function TwoFactorPage() {
  if (await verifySession()) {
    redirect('/dashboard');
  }
  if (!(await readPending2fa())) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2 tracking-tight">Two-factor authentication</h1>
          <p className="text-gray-500 text-sm sm:text-base">
            Enter the 6-digit code from your authenticator app to finish signing in.
          </p>
        </div>
        <TwoFactorForm />
        <p className="mt-8 text-center text-sm text-gray-500">
          <Link href="/login" className="underline">Use a different account</Link>
        </p>
      </div>
    </div>
  );
}
