import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { myDoctorProfileId } from '@/lib/doctor-access';
import { listAccounts } from '@/lib/payments/accounts';
import { availableOnlineProviders } from '@/lib/payments/registry';
import PaymentAccountsClient from '@/components/payments/PaymentAccountsClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My payment account' };

/** A doctor's own account for their professional fees (overrides the clinic's on those invoices). */
export default async function MyPaymentAccountPage() {
  const session = await verifySession();
  if (!session?.tenantId) redirect('/login');
  const doctorId = await myDoctorProfileId(session.tenantId, session.userId);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">My payment account</h1>
        <p className="mt-1 text-sm text-gray-600">
          Invoices that bill your professional fee are paid into your own account instead of the clinic&rsquo;s. Without one, they
          go to the clinic&rsquo;s.
        </p>
      </div>
      {doctorId ? (
        <PaymentAccountsClient
          initial={await listAccounts(session.tenantId, { ownerType: 'doctor', doctorId })}
          providers={availableOnlineProviders()}
          scope="mine"
        />
      ) : (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-6 text-sm text-gray-700">
          Your account isn&rsquo;t linked to a doctor profile, so there&rsquo;s nothing to set up here.
        </p>
      )}
    </div>
  );
}
