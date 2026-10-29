import Link from 'next/link';
import { Types } from 'mongoose';
import { requirePlatformPage } from '@/lib/platform-auth';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { listSupportBroadcasts } from '@/lib/support-chat';
import { SupportBroadcastForm } from '@/components/platform/SupportChat';
import { CARD, H2, LINK, ago } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

export default async function PlatformChatBroadcastPage({ searchParams }: { searchParams: Promise<{ clinic?: string }> }) {
  await requirePlatformPage();
  const { clinic: clinicId } = await searchParams;
  await connectDB();
  const clinic =
    clinicId && Types.ObjectId.isValid(clinicId)
      ? await Tenant.findById(clinicId).select('name displayName').lean<{ _id: Types.ObjectId; name: string; displayName?: string } | null>()
      : null;
  const clinicName = clinic ? clinic.displayName || clinic.name : null;
  const history = await listSupportBroadcasts();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/platform/chat" className={`${LINK} text-sm`}>Support chat</Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">Broadcast a message</h1>
        <p className="mt-1 text-sm text-gray-600">
          A chat message from MyClinicSoft Support to many people at once, {clinicName ? `in ${clinicName}` : 'in every active clinic'}.
          For a notice that should also reach phones, use <Link href="/platform/notifications" className={LINK}>Notify</Link>.
        </p>
      </div>
      <section className={`${CARD} p-5`}>
        <SupportBroadcastForm clinic={clinic && clinicName ? { id: String(clinic._id), name: clinicName } : undefined} />
      </section>

      <section className={CARD} aria-labelledby="sent">
        <h2 id="sent" className={`${H2} px-5 pt-5`}>Sent</h2>
        <ul className="mt-3 divide-y divide-gray-100">
          {history.map((h) => (
            <li key={h.id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs text-gray-500">
                  {h.audience === 'admins' ? 'Admins' : 'All staff'} of {h.clinicNames.length ? h.clinicNames.join(', ') : 'every clinic'} ·{' '}
                  {h.recipients} {h.recipients === 1 ? 'person' : 'people'} in {h.clinics} {h.clinics === 1 ? 'clinic' : 'clinics'} · by {h.sentByEmail}
                </p>
                <span className="text-xs text-gray-500">{ago(h.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{h.body}</p>
            </li>
          ))}
          {history.length === 0 && <li className="px-5 py-6 text-sm text-gray-500">Nothing sent yet.</li>}
        </ul>
      </section>
    </div>
  );
}
