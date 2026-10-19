import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import { requireAdmin } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import connectDB from '@/lib/mongodb';
import SupportRequest from '@/models/SupportRequest';
import { supportReference } from '@/lib/platform-console';
import NewSupportRequest from '@/components/admin/NewSupportRequest';
import { SupportStatusBadge, ago } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

export default async function AdminSupportPage() {
  await requireAdmin();
  const session = await verifySession();
  if (!session?.tenantId) redirect('/login');

  await connectDB();
  const rows = await SupportRequest.find({ tenantId: new Types.ObjectId(session.tenantId) })
    .select('subject status lastReplyBy lastActivityAt createdAt')
    .sort({ lastActivityAt: -1, createdAt: -1 })
    .limit(50)
    .lean<any[]>();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Support</h1>
        <p className="mt-1 text-sm text-gray-600">Ask the MyClinicSoft team. Replies come here and to your email.</p>
      </div>

      <section aria-labelledby="yours">
        <h2 id="yours" className="text-sm font-semibold text-gray-900">Your clinic&rsquo;s requests</h2>
        <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {rows.map((r) => {
            const id = String(r._id);
            const answered = r.lastReplyBy === 'platform' && (r.status === 'open' || r.status === 'in-progress');
            return (
              <li key={id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/support/${id}`} className="block truncate font-medium text-brand-teal-deep hover:underline">{r.subject}</Link>
                  <p className="text-xs text-gray-500">{supportReference(id)}{answered ? ' · new reply from support' : ''}</p>
                </div>
                <SupportStatusBadge status={r.status} />
                <span className="w-20 text-right text-xs text-gray-500">{ago(new Date(r.lastActivityAt ?? r.createdAt).toISOString())}</span>
              </li>
            );
          })}
          {rows.length === 0 && <li className="px-4 py-6 text-sm text-gray-500">No requests yet.</li>}
        </ul>
      </section>

      <section aria-labelledby="new" className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 id="new" className="mb-4 text-sm font-semibold text-gray-900">New request</h2>
        <NewSupportRequest />
      </section>
    </div>
  );
}
