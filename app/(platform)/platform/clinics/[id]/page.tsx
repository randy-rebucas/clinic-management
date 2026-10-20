import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformPage } from '@/lib/platform-auth';
import { loadPlatformTenant } from '@/lib/platform-console';
import ClinicActions from '@/components/platform/ClinicActions';
import { CARD, H2, LINK, LifecycleBadge, SupportStatusBadge, ago, day, money, planLabel, usd } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export default async function PlatformClinicPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformPage();
  const { id } = await params;
  const c = await loadPlatformTenant(id);
  if (!c) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/platform/clinics" className={`${LINK} text-sm`}>Clinics</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{c.displayName || c.name}</h1>
          <LifecycleBadge lifecycle={c.lifecycle} />
        </div>
        <p className="text-sm text-gray-500">{c.subdomain} · joined {day(c.createdAt)}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className={`${CARD} p-5`} aria-labelledby="sub">
            <h2 id="sub" className={H2}>Subscription</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Fact label="Plan">{planLabel(c.subscription.plan)}{c.subscription.billingCycle === 'yearly' ? ' (yearly)' : ''}</Fact>
              <Fact label="Status">{planLabel(c.subscription.status)}</Fact>
              <Fact label="Period ends">{day(c.subscription.expiresAt)}</Fact>
              <Fact label="MRR">{c.mrr ? usd(c.mrr) : '—'}</Fact>
            </dl>
            <h3 className="mt-6 text-xs font-medium text-gray-500">Payments</h3>
            {c.payments.length ? (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {c.payments.map((p) => (
                      <tr key={p.transactionId}>
                        <td className="py-2 text-gray-700">{day(p.paidAt)}</td>
                        <td className="py-2 text-gray-700">{planLabel(p.plan)}, {p.billingCycle}</td>
                        <td className="py-2 text-gray-500">{p.status === 'completed' ? '' : planLabel(p.status)}</td>
                        <td className="py-2 text-right tabular-nums text-gray-900">{money(p.amount, p.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No payments yet.</p>
            )}
          </section>

          <section className={`${CARD} p-5`} aria-labelledby="usage">
            <h2 id="usage" className={H2}>Usage</h2>
            <dl className="mt-3 grid grid-cols-3 gap-4">
              <Fact label="Active staff">{c.usage.staff}</Fact>
              <Fact label="Patients">{c.usage.patients.toLocaleString('en-US')}</Fact>
              <Fact label="Appointments, 30 days">{c.usage.appointments30d.toLocaleString('en-US')}</Fact>
            </dl>
            <h3 className="mt-6 text-xs font-medium text-gray-500">Admins</h3>
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {c.admins.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="text-gray-900">{a.name} <span className="text-gray-500">{a.email}</span></span>
                  <span className="text-xs text-gray-500">Last sign-in: {ago(a.lastLogin)}</span>
                </li>
              ))}
              {c.admins.length === 0 && <li className="py-2 text-gray-500">No active admins.</li>}
            </ul>
          </section>

          <section className={`${CARD} p-5`} aria-labelledby="tickets">
            <h2 id="tickets" className={H2}>Support requests</h2>
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {c.tickets.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <Link href={`/platform/support/${t.id}`} className={`${LINK} min-w-0 flex-1 truncate`}>{t.subject}</Link>
                  <SupportStatusBadge status={t.status} />
                  <span className="w-20 text-right text-xs text-gray-500">{ago(t.lastActivityAt)}</span>
                </li>
              ))}
              {c.tickets.length === 0 && <li className="py-2 text-gray-500">None.</li>}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <section className={`${CARD} p-5`} aria-labelledby="contact">
            <h2 id="contact" className={H2}>Contact</h2>
            <dl className="mt-3 space-y-3">
              <Fact label="Registered name">{c.name}</Fact>
              <Fact label="Email">{c.email ?? '—'}</Fact>
              <Fact label="Phone">{c.phone ?? '—'}</Fact>
            </dl>
          </section>
          <section className={`${CARD} p-5`} aria-labelledby="actions">
            <h2 id="actions" className={`${H2} mb-4`}>Actions</h2>
            <ClinicActions clinicId={c.id} status={c.status} admins={c.admins} />
            <Link href={`/platform/notifications?clinic=${c.id}`} className={`${LINK} mt-5 inline-block text-sm`}>
              Send this clinic a notification
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
