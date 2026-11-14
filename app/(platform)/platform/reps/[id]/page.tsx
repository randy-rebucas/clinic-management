import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BadgeCheck,
  Building2,
  CalendarCheck2,
  ChevronLeft,
  CreditCard,
  Gift,
  HandCoins,
  Mail,
  MapPin,
  Package,
  Phone,
  Ticket,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform-auth';
import { REP_MONTHS, loadPlatformRep, type VisitStatus } from '@/lib/platform-reps';
import { BarRow, CARD, H2, LINK, Initial, activityOf, ago, day, pct, php } from '@/components/platform/shared';
import { PlanText, RepStateBadge } from '@/components/platform/RepBits';
import { ColumnChart } from '@/components/platform/charts';

export const dynamic = 'force-dynamic';

function Stat({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note?: string }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-brand-teal-light text-brand-teal-deep">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <p className="text-xs font-medium text-gray-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
    </div>
  );
}

function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gray-400" />
      <div className="min-w-0">
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-gray-900">{children}</dd>
      </div>
    </div>
  );
}

const SPONSOR_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Waiting for an answer', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  accepted: { label: 'Accepted', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  declined: { label: 'Declined', tone: 'bg-gray-100 text-gray-600 ring-gray-200' },
  cancelled: { label: 'Withdrawn', tone: 'bg-gray-100 text-gray-600 ring-gray-200' },
  ended: { label: 'Ended', tone: 'bg-gray-100 text-gray-600 ring-gray-200' },
};

const VISIT_ORDER: Array<{ status: VisitStatus; label: string }> = [
  { status: 'completed', label: 'Completed' },
  { status: 'scheduled', label: 'Scheduled' },
  { status: 'requested', label: 'Requested' },
  { status: 'cancelled', label: 'Cancelled' },
  { status: 'declined', label: 'Declined by clinic' },
  { status: 'no-show', label: 'No-show' },
];

const monthShort = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const monthLong = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default async function PlatformRepPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformPage();
  const { id } = await params;
  const r = await loadPlatformRep(id);
  if (!r) notFound();

  const fullName = [r.title, r.name].filter(Boolean).join(' ');
  const act = activityOf(r.lastLogin);
  const byStatus = r.visitLog.byStatus;
  const visitTotal = Object.values(byStatus).reduce((a, b) => a + (b ?? 0), 0);
  const visitMax = Math.max(0, ...VISIT_ORDER.map((v) => byStatus[v.status] ?? 0));
  const completed = byStatus.completed ?? 0;
  // Of visits that reached an outcome, the share that happened.
  const decided = completed + (byStatus.cancelled ?? 0) + (byStatus['no-show'] ?? 0) + (byStatus.declined ?? 0);
  const monthly = r.visitLog.byMonth;
  const inWindow = monthly.reduce((a, m) => a + m.completed + m.other, 0);
  const referred = r.clinics.filter((c) => c.referredByThisRep).length;
  const accepted = r.sponsorships.filter((s) => s.status === 'accepted').length;
  const planPaid = r.payments.reduce((a, p) => a + p.amount, 0);

  return (
    <div className="space-y-6">
      <Link href="/platform/reps" className={`${LINK} inline-flex items-center gap-1 text-sm`}>
        <ChevronLeft aria-hidden="true" className="size-4" /> Medical reps
      </Link>

      <div className={`${CARD} flex flex-wrap items-center gap-4 p-5`}>
        <Initial name={r.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-gray-900">{fullName}</h1>
            <RepStateBadge state={r.state} />
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1"><Building2 aria-hidden="true" className="size-3.5" /> {r.company}</span>
            {r.territory && <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="size-3.5" /> {r.territory}</span>}
            <span className="inline-flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${act.tone}`} aria-hidden="true" />
              {r.hasLogin ? `Signed in ${ago(r.lastLogin).toLowerCase()}` : 'No login yet'}
            </span>
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <a href={`mailto:${r.email}`} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:flex-none">
            <Mail aria-hidden="true" className="size-4" /> Email
          </a>
          {r.phone && (
            <a href={`tel:${r.phone}`} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:flex-none">
              <Phone aria-hidden="true" className="size-4" /> Call
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={CalendarCheck2} label="Completed visits" value={String(completed)} note={decided ? `${pct(completed / decided)} of visits that reached an outcome` : 'No finished visits yet'} />
        <Stat icon={Building2} label="Clinics" value={String(r.clinics.length)} note={`${referred} referred by this rep`} />
        <Stat icon={HandCoins} label="Sponsoring" value={String(accepted)} note={`${r.sponsorships.length} ${r.sponsorships.length === 1 ? 'offer' : 'offers'} in all`} />
        <Stat icon={CreditCard} label="Plan payments" value={planPaid ? php(planPaid) : '—'} note={`${r.payments.length} ${r.payments.length === 1 ? 'payment' : 'payments'} for their own plan`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className={`${CARD} p-5 lg:col-span-2`} aria-labelledby="visits-chart">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="visits-chart" className={H2}>Clinic visits per month</h2>
              <p className="text-xs text-gray-500">Every visit by the date it&rsquo;s for, any outcome, the last {REP_MONTHS} months.</p>
            </div>
            <p className="text-right text-sm text-gray-500"><span className="text-lg font-semibold tabular-nums text-gray-900">{inWindow}</span> in {REP_MONTHS} months</p>
          </div>
          {inWindow > 0 ? (
            <div className="mt-4">
              <ColumnChart
                label={`Clinic visits per month for ${r.name}`}
                format={{ kind: 'count', unit: ['visit', 'visits'] }}
                points={monthly.map((m, i) => ({
                  label: monthShort(m.month),
                  full: i === monthly.length - 1 ? `${monthLong(m.month)} (so far)` : monthLong(m.month),
                  value: m.completed + m.other,
                }))}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center py-12 text-center">
              <CalendarCheck2 aria-hidden="true" className="size-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">No visits in the last {REP_MONTHS} months.</p>
            </div>
          )}
        </section>

        <section className={`${CARD} p-5`} aria-labelledby="outcomes">
          <h2 id="outcomes" className={H2}>Visit outcomes</h2>
          <p className="mb-4 text-xs text-gray-500">All {visitTotal} {visitTotal === 1 ? 'visit' : 'visits'} on record.</p>
          {visitTotal > 0 ? (
            <ul className="space-y-3">
              {VISIT_ORDER.map((v) => {
                const n = byStatus[v.status] ?? 0;
                return <BarRow key={v.status} label={v.label} value={n} max={visitMax} right={String(n)} />;
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-gray-500">No visits yet.</p>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className={CARD} aria-labelledby="clinics">
            <div className="flex items-baseline justify-between px-5 pt-5">
              <h2 id="clinics" className={H2}>Clinics</h2>
              <span className="text-xs text-gray-500">{r.clinics.length} linked</span>
            </div>
            {r.clinics.length ? (
              <ul className="mt-3 divide-y divide-gray-100 text-sm">
                {r.clinics.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                    <Initial name={c.name} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/platform/clinics/${c.id}`} className={`${LINK} block truncate`}>{c.name}</Link>
                      <span className="text-xs text-gray-500">{c.subdomain}</span>
                    </div>
                    {c.referredByThisRep && (
                      <span className="inline-flex items-center gap-1 rounded bg-brand-teal-light px-2 py-0.5 text-xs font-medium text-brand-teal-deep">
                        <Gift aria-hidden="true" className="size-3" /> Referred
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-gray-500">Not linked to any clinic yet.</p>
            )}
          </section>

          <section className={CARD} aria-labelledby="sponsorships">
            <h2 id="sponsorships" className={`${H2} px-5 pt-5`}>Clinic sponsorships</h2>
            {r.sponsorships.length ? (
              <ul className="mt-3 divide-y divide-gray-100 text-sm">
                {r.sponsorships.map((s) => {
                  const st = SPONSOR_STATUS[s.status] ?? { label: s.status, tone: 'bg-gray-100 text-gray-600 ring-gray-200' };
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link href={`/platform/clinics/${s.clinicId}`} className={`${LINK} block truncate`}>{s.clinic}</Link>
                        <p className="text-xs text-gray-500">
                          Since {day(s.createdAt)}
                          {s.paidThrough ? ` · paid through ${day(s.paidThrough)}` : ''}
                          {s.payments ? ` · ${s.payments} payment${s.payments === 1 ? '' : 's'}` : ''}
                        </p>
                      </div>
                      <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.tone}`}>{st.label}</span>
                    </li>
                  );
                })}
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
                  <li key={c.code} className="flex items-center gap-3 px-5 py-2.5">
                    <Ticket aria-hidden="true" className="size-4 shrink-0 text-gray-400" />
                    <span className="flex-1">
                      <span className={`font-mono font-semibold ${c.status === 'disabled' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{c.code}</span>
                      <span className="ml-2 text-xs text-gray-500">{c.source === 'rep' ? 'Own code' : 'Custom'}{c.status === 'disabled' ? ' · off' : ''}</span>
                    </span>
                    <span className="tabular-nums text-gray-700">{c.uses}{c.maxUses !== null ? ` / ${c.maxUses}` : ''} {c.uses === 1 && c.maxUses === null ? 'clinic' : 'clinics'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-gray-500">No codes yet.</p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className={`${CARD} p-5`} aria-labelledby="profile">
            <h2 id="profile" className={H2}>Profile</h2>
            <dl className="mt-4 space-y-4">
              <Fact icon={Mail} label="Email"><a href={`mailto:${r.email}`} className={LINK}>{r.email}</a></Fact>
              <Fact icon={Phone} label="Phone">{r.phone ? <a href={`tel:${r.phone}`} className={LINK}>{r.phone}</a> : '—'}</Fact>
              <Fact icon={Package} label="Products">
                {r.products.length ? (
                  <span className="flex flex-wrap gap-1">
                    {r.products.map((p) => <span key={p} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{p}</span>)}
                  </span>
                ) : '—'}
              </Fact>
              <Fact icon={UsersRound} label="Team">
                {r.team ? `${r.team.name} · ${r.team.seats} seat${r.team.seats === 1 ? '' : 's'}${r.team.until ? ` · until ${day(r.team.until)}` : ''}` : '—'}
              </Fact>
              <Fact icon={CalendarCheck2} label="Booking plan"><PlanText plan={r.plan} /></Fact>
              <Fact icon={BadgeCheck} label="Joined">{day(r.createdAt)}</Fact>
            </dl>
            {r.bio && <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-700">{r.bio}</p>}
          </section>

          <section className={`${CARD} p-5`} aria-labelledby="activation">
            <div className="flex items-center justify-between">
              <h2 id="activation" className={H2}>Activation fee</h2>
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${r.activation.paid ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}`}>
                {r.activation.paid ? 'Paid' : r.activation.status === 'pending' ? 'Not paid yet' : r.activation.status}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-gray-500">Amount</dt><dd className="tabular-nums text-gray-900">{r.activation.amount !== null ? php(r.activation.amount) : '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Date</dt><dd className="text-gray-900">{day(r.activation.date)}</dd></div>
              <div><dt className="text-xs text-gray-500">Method</dt><dd className="text-gray-900">{r.activation.method ?? '—'}</dd></div>
              <div className="min-w-0"><dt className="text-xs text-gray-500">Reference</dt><dd className="truncate font-mono text-xs text-gray-900">{r.activation.reference ?? '—'}</dd></div>
            </dl>
          </section>

          <section className={`${CARD} p-5`} aria-labelledby="payments">
            <h2 id="payments" className={H2}>Booking plan payments</h2>
            {r.payments.length ? (
              <ul className="mt-3 divide-y divide-gray-100 text-sm">
                {r.payments.map((p, i) => (
                  <li key={`${p.paidAt}-${i}`} className="flex justify-between py-2">
                    <span className="text-gray-700">{day(p.paidAt)} <span className="text-xs text-gray-500">· {p.cycle}</span></span>
                    <span className="tabular-nums text-gray-900">{php(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-500">No payments for their own plan.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
