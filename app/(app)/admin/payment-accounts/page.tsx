import { Types } from 'mongoose';
import { requireAdmin } from '@/app/lib/auth-helpers';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import { listAccounts } from '@/lib/payments/accounts';
import { availableOnlineProviders } from '@/lib/payments/registry';
import PaymentAccountsClient from '@/components/payments/PaymentAccountsClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment accounts' };

/** Where patients pay this clinic's bills: its own accounts, and its doctors' (admins only). */
export default async function PaymentAccountsPage() {
  const session = await requireAdmin();
  if (!session?.tenantId) throw new Error('No clinic on this session');
  await connectDB();
  const [accounts, doctors] = await Promise.all([
    listAccounts(session.tenantId),
    Doctor.find({ tenantId: new Types.ObjectId(session.tenantId), status: { $ne: 'inactive' } })
      .select('firstName lastName title')
      .sort({ lastName: 1 })
      .lean<any[]>(),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Payment accounts</h1>
        <p className="mt-1 text-sm text-gray-600">
          Patients pay the clinic&rsquo;s bills into these accounts, through the payment link on an invoice. Money goes straight to
          you; MyClinicSoft never holds it. A doctor&rsquo;s own account takes the invoices that bill their professional fee.
        </p>
      </div>
      <PaymentAccountsClient
        initial={accounts}
        providers={availableOnlineProviders()}
        scope="clinic"
        doctors={doctors.map((d) => ({ id: String(d._id), name: [d.title, d.firstName, d.lastName].filter(Boolean).join(' ') }))}
      />
    </div>
  );
}
