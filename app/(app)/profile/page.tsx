import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { loadAccount } from '@/lib/account';
import Link from 'next/link';
import ProfileClient from '@/components/account/ProfileClient';
import { myDoctorProfileId } from '@/lib/doctor-access';

export const metadata = { title: 'Your profile' };

export default async function ProfilePage() {
  const session = await verifySession();
  if (!session) redirect('/login');

  const account = await loadAccount(session.userId);
  if (!account) redirect('/login');

  const doctorId = session.tenantId ? await myDoctorProfileId(session.tenantId, session.userId) : null;
  return (
    <>
      <ProfileClient initial={account} />
      {doctorId && (
        <p className="mx-auto mt-6 max-w-3xl px-4 text-sm text-gray-600 sm:px-6 lg:px-8">
          Patients can pay your professional fees into your own account.{' '}
          <Link href="/profile/payment-account" className="font-semibold text-brand-teal-dark hover:underline">
            Set up my payment account
          </Link>
        </p>
      )}
    </>
  );
}
