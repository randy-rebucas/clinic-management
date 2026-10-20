import Link from 'next/link';
import { Types } from 'mongoose';
import { requirePlatformPage } from '@/lib/platform-auth';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import PlatformAnnouncement from '@/models/PlatformAnnouncement';
import AnnouncementForm from '@/components/platform/AnnouncementForm';
import { CARD, H2, LINK, ago } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

const PRIORITY = { normal: '', high: 'Important', urgent: 'Urgent' } as const;

export default async function PlatformNotificationsPage({ searchParams }: { searchParams: Promise<{ clinic?: string }> }) {
  await requirePlatformPage();
  const { clinic: clinicId } = await searchParams;

  await connectDB();
  const clinic =
    clinicId && Types.ObjectId.isValid(clinicId)
      ? await Tenant.findById(clinicId).select('name displayName').lean<any>()
      : null;
  const history = await PlatformAnnouncement.find({}).sort({ createdAt: -1 }).limit(30).lean<any[]>();
  const names = new Map(
    (
      await Tenant.find({ _id: { $in: [...new Set(history.flatMap((h) => h.tenantIds.map(String)))] } })
        .select('name displayName')
        .lean<any[]>()
    ).map((t) => [String(t._id), t.displayName || t.name])
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Notify clinics</h1>
        <p className="mt-1 text-sm text-gray-600">Maintenance windows, new features, billing notices. Clinics see these in their notifications.</p>
      </div>

      <section className={`${CARD} p-5`} aria-labelledby="compose">
        <h2 id="compose" className={`${H2} mb-4`}>
          {clinic ? (
            <>
              To {clinic.displayName || clinic.name} · <Link href="/platform/notifications" className={LINK}>send to every clinic instead</Link>
            </>
          ) : (
            'To every active clinic'
          )}
        </h2>
        <AnnouncementForm clinic={clinic ? { id: String(clinic._id), name: clinic.displayName || clinic.name } : undefined} />
      </section>

      <section className={CARD} aria-labelledby="sent">
        <h2 id="sent" className={`${H2} px-5 pt-5`}>Sent</h2>
        <ul className="mt-3 divide-y divide-gray-100">
          {history.map((h) => (
            <li key={String(h._id)} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">
                  {h.title}
                  {PRIORITY[h.priority as keyof typeof PRIORITY] && (
                    <span className="ml-2 text-xs font-semibold text-amber-800">{PRIORITY[h.priority as keyof typeof PRIORITY]}</span>
                  )}
                </p>
                <span className="text-xs text-gray-500">{ago(new Date(h.createdAt).toISOString())}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-600">{h.message}</p>
              <p className="mt-1 text-xs text-gray-500">
                {h.audience === 'admins' ? 'Admins' : 'All staff'} of{' '}
                {h.tenantIds.length ? h.tenantIds.map((id: unknown) => names.get(String(id)) ?? 'a removed clinic').join(', ') : 'every clinic'} ·{' '}
                {h.recipients} {h.recipients === 1 ? 'person' : 'people'} in {h.clinics} {h.clinics === 1 ? 'clinic' : 'clinics'} · by {h.sentByEmail}
              </p>
            </li>
          ))}
          {history.length === 0 && <li className="px-5 py-6 text-sm text-gray-500">Nothing sent yet.</li>}
        </ul>
      </section>
    </div>
  );
}
