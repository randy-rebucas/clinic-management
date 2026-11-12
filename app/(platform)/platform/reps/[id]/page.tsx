import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformPage } from '@/lib/platform-auth';
import { loadPlatformRep } from '@/lib/platform-reps';
import { CARD, H2, LINK, ago, day, php } from '@/components/platform/shared';
import { PlanText, RepStateBadge } from '@/components/platform/RepBits';

export const dynamic = 'force-dynamic';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

const SPONSOR_STATUS: Record<string, string> = {
  pending: 'Waiting for an answer',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Withdrawn',
  ended: 'Ended',
};

export default async function PlatformRepPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformPage();
  const { id } = await params;
  const r = await loadPlatformRep(id);
  if (!r) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/platform/reps" className={`${LINK} text-sm`}>Medical reps</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{[r.title, r.name].filter(Boolean).join(' ')}</h1>
          <RepStateBadge state={r.state} />
        </div>
        <p className="text-sm text-gray-500">{[r.company, r.territory].filter(Boolean).join(' · ')}</p>
      </div>

      <section className={`${CARD} p-5`} aria-labelledby="profile">
        <h2 id="profile" className={H2}>Profile</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Email">{r.email}</Fact>
          <Fact label="Phone">{r.phone ?? '—'}</Fact>
          <Fact label="Joined">{day(r.createdAt)}</Fact>
          <Fact label="Last sign-in">{r.hasLogin ? ago(r.lastLogin) : 'No login yet'}</Fact>
          <Fact label="Products">{r.products.length ? r.products.join(', ') : '—'}</Fact>
          <Fact label="Visits">{r.visits.completed} completed · {r.visits.cancelled} cancelled · {r.visits.total} total</Fact>
          <Fact label="Booking plan"><PlanText plan={r.plan} /></Fact>
          <Fact label="Team">{r.team ? `${r.team.name} · ${r.team.seats} seat${r.team.seats === 1 ? '' : 's'}${r.team.until ? ` · until ${day(r.team.until)}` : ''}` : '—'}</Fact>
        </dl>
        {r.bio && <p className="mt-4 text-sm text-gray-700">{r.bio}</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${CARD} p-5`} aria-labelledby="activation">
          <h2 id="activation" className={H2}>Activation fee</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Fact label="Status">{r.activation.paid ? 'Paid' : r.activation.status === 'pending' ? 'Not paid yet' : r.activation.status}</Fact>
            <Fact label="Date">{day(r.activation.date)}</Fact>
            <Fact label="Amount">{r.activation.amount !== null ? php(r.activation.amount) : '—'}</Fact>
            <Fact label="Method">{r.activation.method ?? '—'}</Fact>
            <Fact label="Reference"><span className="font-mono text-xs">{r.activation.reference ?? '—'}</span></Fact>
          </dl>
        </section>

        <section className={`${CARD} p-5`} aria-labelledby="payments">
          <h2 id="payments" className={H2}>Booking plan payments</h2>
          {r.payments.length ? (
            <ul className="mt-3 divide-y divide-gray-100 text-sm">
              {r.payments.map((p, i) => (
                <li key={`${p.paidAt}-${i}`} className="flex justify-between py-2">
                  <span className="text-gray-700">{day(p.paidAt)} · {p.cycle}</span>
                  <span className="tabular-nums text-gray-900">{php(p.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-gray-500">No payments for their own plan.</p>
          )}
        </section>
      </div>

      <section className={CARD} aria-labelledby="clinics">
        <h2 id="clinics" className={`${H2} px-5 pt-5`}>Clinics ({r.clinics.length})</h2>
        {r.clinics.length ? (
          <ul className="mt-3 divide-y divide-gray-100 text-sm">
            {r.clinics.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                <span>
                  <Link href={`/platform/clinics/${c.id}`} className={LINK}>{c.name}</Link>
                  <span className="ml-2 text-xs text-gray-500">{c.subdomain}</span>
                </span>
                {c.referredByThisRep && <span className="text-xs text-brand-teal-deep">Referred by this rep</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-gray-500">Not linked to any clinic yet.</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={CARD} aria-labelledby="sponsorships">
          <h2 id="sponsorships" className={`${H2} px-5 pt-5`}>Clinic sponsorships</h2>
          {r.sponsorships.length ? (
            <ul className="mt-3 divide-y divide-gray-100 text-sm">
              {r.sponsorships.map((s) => (
                <li key={s.id} className="px-5 py-2.5">
                  <Link href={`/platform/clinics/${s.clinicId}`} className={LINK}>{s.clinic}</Link>
                  <p className="text-xs text-gray-500">
                    {SPONSOR_STATUS[s.status] ?? s.status} · since {day(s.createdAt)}
                    {s.paidThrough ? ` · paid through ${day(s.paidThrough)}` : ''}
                    {s.payments ? ` · ${s.payments} payment${s.payments === 1 ? '' : 's'}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-gray-500">No sponsorships.</p>
          )}
        </section>

        <section className={CARD} aria-labelledby="codes">
          <div className="flex items-baseline justify-between px-5 pt-5">
            <h2 id="codes" className={H2}>Referral codes</h2>
            <Link href="/platform/referral-codes" className={`${LINK} text-xs`}>Manage</Link>
          </div>
          {r.codes.length ? (
            <ul className="mt-3 divide-y divide-gray-100 text-sm">
              {r.codes.map((c) => (
                <li key={c.code} className="flex justify-between px-5 py-2.5">
                  <span>
                    <span className="font-mono font-semibold text-gray-900">{c.code}</span>
                    <span className="ml-2 text-xs text-gray-500">{c.source === 'rep' ? 'Own code' : 'Custom'}{c.status === 'disabled' ? ' · off' : ''}</span>
                  </span>
                  <span className="tabular-nums text-gray-700">{c.uses}{c.maxUses !== null ? ` / ${c.maxUses}` : ''} clinics</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-gray-500">No codes yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
