import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  CircleDollarSign,
  ExternalLink,
  FileText,
  LifeBuoy,
  Mail,
  Phone,
  Building2,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform-auth';
import { ACTIVITY_WEEKS, loadPlatformTenant } from '@/lib/platform-console';
import ClinicActions from '@/components/platform/ClinicActions';
import InvoiceResendButton from '@/components/platform/InvoiceResendButton';
import { ColumnChart } from '@/components/platform/charts';
import {
  CARD,
  H2,
  LINK,
  Initial,
  LifecycleBadge,
  SupportStatusBadge,
  activityOf,
  ago,
  day,
  money,
  planLabel,
  relDays,
} from '@/components/platform/shared';

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

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

function ContactRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
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

/** The clinic's own site, when ROOT_DOMAIN says where clinics live. */
function clinicUrl(subdomain: string): string | null {
  const root = process.env.ROOT_DOMAIN?.trim().replace(/^\./, '');
  if (!root) return null;
  const local = /localhost|127\.0\.0\.1/.test(root);
  return `${local ? 'http' : 'https'}://${subdomain}.${root}`;
}

const weekLabel = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default async function PlatformClinicPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformPage();
  const { id } = await params;
  const c = await loadPlatformTenant(id);
  if (!c) notFound();

  const name = c.displayName || c.name;
  const url = clinicUrl(c.subdomain);
  const ends = relDays(c.subscription.expiresAt);
  const weeks = c.usage.appointmentsByWeek;
  const recent4 = weeks.slice(-4).reduce((a, w) => a + w.count, 0);
  const prior4 = weeks.slice(-8, -4).reduce((a, w) => a + w.count, 0);
  const revenue = c.lifetimeRevenue[0];
  const paidCount = c.payments.filter((p) => p.status === 'completed').length;

  const progress = c.periodProgress;
  const isTrial = c.subscription.plan === 'trial';

  return (
    <div className="space-y-6">
      <Link href="/platform/clinics" className={`${LINK} inline-flex items-center gap-1 text-sm`}>
        <ChevronLeft aria-hidden="true" className="size-4" /> Clinics
      </Link>

      <div className={`${CARD} flex flex-wrap items-center gap-4 p-5`}>
        <Initial name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-gray-900">{name}</h1>
            <LifecycleBadge lifecycle={c.lifecycle} />
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" className={`${LINK} inline-flex items-center gap-1`}>
                {c.subdomain} <ExternalLink aria-hidden="true" className="size-3.5" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <span>{c.subdomain}</span>
            )}
            <span>Joined {day(c.createdAt)}</span>
          </p>
        </div>
        <Link
          href={`/platform/notifications?clinic=${c.id}`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold sm:w-auto text-gray-900 hover:border-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
        >
          <Bell aria-hidden="true" className="size-4" /> Notify clinic
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Wallet} label="MRR" value={c.mrr ? money(c.mrr, c.mrrCurrency) : '—'} note={c.mrr ? `${planLabel(c.subscription.plan)} at list price` : 'Not paying'} />
        <Stat
          icon={CircleDollarSign}
          label="Paid to date"
          value={revenue ? money(revenue.amount, revenue.currency) : '—'}
          note={`${paidCount} ${paidCount === 1 ? 'payment' : 'payments'}${c.lifetimeRevenue.length > 1 ? ', plus other currencies' : ''}`}
        />
        <Stat icon={UserRound} label="Patients" value={c.usage.patients.toLocaleString('en-US')} note={`${c.usage.staff} active staff`} />
        <Stat icon={CalendarDays} label="Appointments, 30 days" value={c.usage.appointments30d.toLocaleString('en-US')} note="Booked in the last 30 days" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className={`${CARD} p-5`} aria-labelledby="activity">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="activity" className={H2}>Appointments per week</h2>
                <p className="text-xs text-gray-500">By the week they&rsquo;re for, the last {ACTIVITY_WEEKS} weeks.</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold tabular-nums text-gray-900">{recent4.toLocaleString('en-US')}</p>
                <p className="text-xs text-gray-500">in the last 4 weeks ({prior4.toLocaleString('en-US')} the 4 before)</p>
              </div>
            </div>
            {weeks.some((w) => w.count > 0) ? (
              <div className="mt-4">
                <ColumnChart
                  label={`Appointments per week at ${name}`}
                  format={{ kind: 'count', unit: ['appointment', 'appointments'] }}
                  points={weeks.map((w, i) => ({
                    label: i % 2 === (weeks.length - 1) % 2 ? weekLabel(w.weekStart) : '',
                    full: `Week of ${weekLabel(w.weekStart)}${i === weeks.length - 1 ? ' (this week)' : ''}`,
                    value: w.count,
                  }))}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center py-12 text-center">
                <CalendarDays aria-hidden="true" className="size-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">No appointments in the last {ACTIVITY_WEEKS} weeks.</p>
              </div>
            )}
          </section>

          <section className={`${CARD} p-5`} aria-labelledby="sub">
            <h2 id="sub" className={H2}>Subscription</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Fact label="Plan">
                {planLabel(c.subscription.plan)}
                {c.subscription.billingCycle === 'yearly' && !isTrial ? <span className="ml-1 text-xs text-gray-500">yearly</span> : null}
              </Fact>
              <Fact label="Status">{planLabel(c.subscription.status)}</Fact>
              <Fact label={isTrial ? 'Trial ends' : 'Period ends'}>{day(c.subscription.expiresAt)}</Fact>
              <Fact label="MRR">{c.mrr ? money(c.mrr, c.mrrCurrency) : '—'}</Fact>
            </dl>
            {ends && (
              <div className="mt-4">
                {progress !== null && (
                  <div className="mb-1.5 h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                    <div
                      className={`h-full rounded-full ${ends.overdue ? 'bg-rose-500' : ends.soon ? 'bg-amber-500' : 'bg-brand-teal-dark'}`}
                      style={{ width: `${Math.max(progress * 100, 2)}%` }}
                    />
                  </div>
                )}
                <p className={`text-xs ${ends.overdue ? 'text-rose-700' : ends.soon ? 'text-amber-700' : 'text-gray-500'}`}>
                  {ends.overdue ? `Ended ${ends.text}` : `Ends ${ends.text}`}
                  {progress !== null && ` · ${Math.round(progress * 100)}% of the ${isTrial ? 'trial' : 'period'} used`}
                </p>
              </div>
            )}

            <h3 className="mt-6 text-xs font-medium text-gray-500">Payments</h3>
            {c.payments.length ? (
              <div className="relative mt-2 overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="text-left text-xs text-gray-500">
                    <tr className="border-b border-gray-100">
                      <th className="py-2 font-medium">Paid</th>
                      <th className="py-2 font-medium">Plan</th>
                      <th className="py-2 text-right font-medium">Amount</th>
                      <th className="py-2 pl-4 text-right font-medium">Invoice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {c.payments.map((p) => (
                      <tr key={p.transactionId}>
                        <td className="py-2 text-gray-700">{day(p.paidAt)}</td>
                        <td className="py-2 text-gray-700">
                          {planLabel(p.plan)}, {p.billingCycle}
                          {p.status !== 'completed' && (
                            <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-700">{planLabel(p.status)}</span>
                          )}
                        </td>
                        <td className={`py-2 text-right tabular-nums ${p.status === 'completed' ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                          {money(p.amount, p.currency)}
                        </td>
                        <td className="py-2 pl-4 text-right text-xs">
                          {p.invoice?.serialNo ? (
                            <span className="inline-flex flex-wrap items-center justify-end gap-2">
                              <a href={`/api/platform/invoices/${p.invoice.id}`} target="_blank" rel="noreferrer" className={`${LINK} inline-flex items-center gap-1`}>
                                <FileText aria-hidden="true" className="size-3.5" />
                                {p.invoice.serialNo}
                              </a>
                              {p.invoice.status === 'cancelled' ? (
                                <span className="text-rose-700">cancelled</span>
                              ) : (
                                <InvoiceResendButton id={p.invoice.id} emailedAt={p.invoice.emailedAt} />
                              )}
                            </span>
                          ) : p.invoice ? (
                            <span className="text-amber-700" title={p.invoice.heldReason ?? undefined}>Invoice waiting</span>
                          ) : (
                            <span className="text-gray-400">No invoice</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No payments yet.</p>
            )}
          </section>

          <section className={`${CARD} p-5`} aria-labelledby="admins">
            <div className="flex items-center justify-between">
              <h2 id="admins" className={H2}>Admins</h2>
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <Users aria-hidden="true" className="size-3.5" /> {c.usage.staff} active staff in all
              </span>
            </div>
            <ul className="mt-3 divide-y divide-gray-100 text-sm">
              {c.admins.map((a) => {
                const act = activityOf(a.lastLogin);
                return (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <Initial name={a.name || a.email} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900">{a.name}</p>
                      <p className="truncate text-xs text-gray-500">{a.email}</p>
                    </div>
                    <span className="flex items-center gap-2 text-xs text-gray-500">
                      <span className={`size-2 rounded-full ${act.tone}`} title={act.label} aria-hidden="true" />
                      {a.lastLogin ? `Signed in ${ago(a.lastLogin).toLowerCase()}` : 'Never signed in'}
                    </span>
                  </li>
                );
              })}
              {c.admins.length === 0 && <li className="py-2 text-gray-500">No active admins.</li>}
            </ul>
          </section>

          <section className={`${CARD} p-5`} aria-labelledby="tickets">
            <h2 id="tickets" className={H2}>Support requests</h2>
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {c.tickets.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <LifeBuoy aria-hidden="true" className="size-4 shrink-0 text-gray-400" />
                  <Link href={`/platform/support/${t.id}`} className={`${LINK} min-w-0 flex-1 truncate`}>{t.subject}</Link>
                  <SupportStatusBadge status={t.status} />
                  <span className="w-20 text-right text-xs text-gray-500">{ago(t.lastActivityAt)}</span>
                </li>
              ))}
              {c.tickets.length === 0 && <li className="py-2 text-gray-500">No support requests from this clinic.</li>}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <section className={`${CARD} p-5`} aria-labelledby="contact">
            <h2 id="contact" className={H2}>Contact</h2>
            <dl className="mt-4 space-y-4">
              <ContactRow icon={Building2} label="Registered name">{c.name}</ContactRow>
              <ContactRow icon={Mail} label="Email">
                {c.email ? <a href={`mailto:${c.email}`} className={LINK}>{c.email}</a> : '—'}
              </ContactRow>
              <ContactRow icon={Phone} label="Phone">
                {c.phone ? <a href={`tel:${c.phone}`} className={LINK}>{c.phone}</a> : '—'}
              </ContactRow>
            </dl>
          </section>
          <section className={`${CARD} p-5`} aria-labelledby="actions">
            <h2 id="actions" className={`${H2} mb-4 flex items-center gap-2`}>
              <ShieldCheck aria-hidden="true" className="size-4 text-gray-400" /> Actions
            </h2>
            <ClinicActions clinicId={c.id} status={c.status} admins={c.admins} />
          </section>
        </aside>
      </div>
    </div>
  );
}
