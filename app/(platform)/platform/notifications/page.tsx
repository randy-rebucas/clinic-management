import Link from 'next/link';
import { Types } from 'mongoose';
import type { ComponentType, ReactNode } from 'react';
import { Building2, ExternalLink, Eye, LifeBuoy, Megaphone, MessagesSquare, Send, ShieldCheck, Users, X } from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform-auth';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { ANNOUNCEMENT_WINDOW_DAYS, loadAnnouncements, type AnnouncementRow } from '@/lib/platform-console';
import AnnouncementForm from '@/components/platform/AnnouncementForm';
import { CARD, H2, LINK, ago, day } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

const n = (v: number) => v.toLocaleString('en-US');

function PriorityBadge({ priority }: { priority: AnnouncementRow['priority'] }) {
  if (priority === 'normal') return null;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        priority === 'urgent' ? 'bg-rose-50 text-rose-800 ring-rose-200' : 'bg-amber-50 text-amber-800 ring-amber-200'
      }`}
    >
      {priority === 'urgent' ? 'Urgent' : 'Important'}
    </span>
  );
}

function MiniStat({ icon: Icon, label, value, note }: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  label: string;
  value: ReactNode;
  note: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-teal-light text-brand-teal-deep">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className="text-lg font-semibold tabular-nums text-gray-900">{value}</dd>
        <dd className="text-xs text-gray-500">{note}</dd>
      </div>
    </div>
  );
}

/** "12 of 40 read" over a thin bar, or a note when reads weren't tracked. */
function ReadMeter({ read, of }: { read: number | null; of: number }) {
  if (read === null) return <span className="text-xs text-gray-400">Reads not tracked</span>;
  const pct = of > 0 ? Math.round((read / of) * 100) : 0;
  return (
    <div className="w-full sm:w-40">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 text-gray-600"><Eye aria-hidden="true" className="size-3.5" /> {n(read)} of {n(of)} read</span>
        <span className="tabular-nums text-gray-900">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-100" aria-hidden="true">
        {read > 0 && <div className="h-full rounded-full bg-brand-teal-dark" style={{ width: `${Math.max(pct, 2)}%` }} />}
      </div>
    </div>
  );
}

export default async function PlatformNotificationsPage({ searchParams }: { searchParams: Promise<{ clinic?: string }> }) {
  await requirePlatformPage();
  const { clinic: clinicId } = await searchParams;

  await connectDB();
  const [clinic, { rows, window: w }] = await Promise.all([
    clinicId && Types.ObjectId.isValid(clinicId)
      ? Tenant.findById(clinicId).select('name displayName').lean<{ _id: Types.ObjectId; name: string; displayName?: string } | null>()
      : null,
    loadAnnouncements(),
  ]);
  const clinicName = clinic ? clinic.displayName || clinic.name : null;
  const readPct = w.tracked ? Math.round((w.read / w.tracked) * 100) : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Notify clinics</h1>
        <p className="mt-0.5 text-sm text-gray-500">Maintenance windows, new features, billing notices. Clinics see these in their notifications.</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <section className={`${CARD} p-4 lg:col-span-2`} aria-labelledby="compose">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 id="compose" className={`${H2} flex items-center gap-2`}>
              <Send aria-hidden="true" className="size-4 text-brand-teal-deep" /> New notice
            </h2>
            {clinic && clinicName ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-teal-light py-0.5 pl-2.5 pr-1 text-sm text-brand-teal-deep">
                <Building2 aria-hidden="true" className="size-3.5" />
                Only {clinicName}
                <Link href="/platform/notifications" aria-label="Send to every clinic instead" className="rounded-full p-0.5 hover:bg-white/70">
                  <X aria-hidden="true" className="size-3.5" />
                </Link>
              </span>
            ) : (
              <span className="text-sm text-gray-500">To every active clinic</span>
            )}
          </div>
          <AnnouncementForm clinic={clinic && clinicName ? { id: String(clinic._id), name: clinicName } : undefined} />
        </section>

        <div className="space-y-5">
          <section className={`${CARD} p-4`} aria-labelledby="window">
            <h2 id="window" className={H2}>Last {ANNOUNCEMENT_WINDOW_DAYS} days</h2>
            <dl className="mt-3 space-y-4">
              <MiniStat icon={Megaphone} label="Notices sent" value={n(w.sent)} note={w.sent ? `${n(w.reached)} ${w.reached === 1 ? 'person' : 'people'} reached` : 'Nothing sent'} />
              <MiniStat
                icon={Eye}
                label="Read"
                value={readPct === null ? '—' : `${readPct}%`}
                note={readPct === null ? 'Tracked for notices sent from now on' : `${n(w.read)} of ${n(w.tracked)} notifications opened`}
              />
            </dl>
          </section>

          <section className={`${CARD} p-4`} aria-labelledby="which">
            <h2 id="which" className={H2}>Which tool?</h2>
            <ul className="mt-3 space-y-3 text-sm">
              <li className="flex gap-2.5">
                <Megaphone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-teal-deep" />
                <p className="text-gray-700"><span className="font-medium text-gray-900">Notify</span> (here): a notice in the bell, pushed when it matters. Can’t be replied to.</p>
              </li>
              <li className="flex gap-2.5">
                <MessagesSquare aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-teal-deep" />
                <p className="text-gray-700">
                  <Link href="/platform/chat/broadcast" className={LINK}>Chat broadcast</Link>: a support chat message to many people. They can reply.
                </p>
              </li>
              <li className="flex gap-2.5">
                <LifeBuoy aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-teal-deep" />
                <p className="text-gray-700">
                  <Link href="/platform/support" className={LINK}>Support</Link>: answering one request by email.
                </p>
              </li>
            </ul>
          </section>
        </div>
      </div>

      <section className={CARD} aria-labelledby="sent">
        <div className="flex items-baseline justify-between px-4 pt-4">
          <h2 id="sent" className={H2}>Sent</h2>
          {rows.length > 0 && <span className="text-xs text-gray-500">Latest {rows.length}</span>}
        </div>
        <ul className="mt-3 divide-y divide-gray-100">
          {rows.map((h) => (
            <li key={h.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start">
              <span
                className={`hidden size-8 shrink-0 items-center justify-center rounded-full sm:flex ${
                  h.priority === 'urgent' ? 'bg-rose-50 text-rose-700' : h.priority === 'high' ? 'bg-amber-50 text-amber-700' : 'bg-brand-teal-light text-brand-teal-deep'
                }`}
              >
                <Megaphone aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-gray-900">{h.title}</p>
                  <PriorityBadge priority={h.priority} />
                </div>
                <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-sm text-gray-600">{h.message}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    {h.audience === 'admins' ? <ShieldCheck aria-hidden="true" className="size-3.5" /> : <Users aria-hidden="true" className="size-3.5" />}
                    {h.audience === 'admins' ? 'Admins' : 'All staff'} of {h.clinicNames.length ? h.clinicNames.join(', ') : 'every clinic'}
                  </span>
                  <span>{n(h.recipients)} {h.recipients === 1 ? 'person' : 'people'} in {n(h.clinics)} {h.clinics === 1 ? 'clinic' : 'clinics'}</span>
                  {h.actionUrl && (
                    <span className="inline-flex items-center gap-1"><ExternalLink aria-hidden="true" className="size-3" /> {h.actionUrl}</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                <span className="text-xs text-gray-500" title={day(h.createdAt)}>{ago(h.createdAt)} · {h.sentByEmail}</span>
                <ReadMeter read={h.read} of={h.recipients} />
              </div>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-4 py-10 text-center">
              <Megaphone aria-hidden="true" className="mx-auto size-7 text-gray-300" />
              <p className="mt-2 text-sm text-gray-600">Nothing sent yet.</p>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
