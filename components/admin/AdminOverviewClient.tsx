'use client';

import Link from 'next/link';
import type { AdminOverview, AttentionItem, ServiceRow } from '@/lib/admin-overview';
import UsageMeter from './UsageMeter';
import { IDLE_DAYS, TREND_DAYS } from '@/lib/admin-overview.shared';
import { EmptyState, FigureRow, Icon, Panel, formatCount } from '@/components/dashboards/shared';
import { RankedBars, SERIES, TrendChart } from '@/components/dashboards/charts';

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2';
const SECONDARY_BUTTON = `inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-gray-300 bg-white text-sm font-semibold text-gray-900 hover:border-gray-900 transition-colors duration-150 ${FOCUS_RING}`;
const PRIMARY_BUTTON = `inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-brand-teal-dark hover:bg-brand-teal-deep text-white text-sm font-semibold transition-colors duration-150 ${FOCUS_RING}`;

const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Needs your attention
// ---------------------------------------------------------------------------

const TONE: Record<AttentionItem['tone'], { chip: string; text: string }> = {
  red: { chip: 'bg-red-50 text-red-600', text: 'text-red-700' },
  amber: { chip: 'bg-amber-50 text-amber-700', text: 'text-amber-800' },
};

function Attention({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <section aria-labelledby="attention-title" className="rounded-lg border border-gray-200 bg-white px-5 py-4 flex items-center gap-4 motion-panel-in">
        <span className="shrink-0 w-10 h-10 rounded-md bg-brand-teal-light text-brand-teal-dark flex items-center justify-center">
          <Icon name="shield" className="w-5 h-5" />
        </span>
        <div>
          <h2 id="attention-title" className="text-base font-bold text-gray-900 tracking-tight">Nothing needs you right now</h2>
          <p className="text-sm text-gray-600 mt-0.5">The plan, the accounts and this server’s services are all in order.</p>
        </div>
      </section>
    );
  }

  return (
    <Panel
      title="Needs your attention"
      subtitle={items.some((i) => i.tone === 'red') ? 'Red items stop staff from working; amber ones are worth doing this week.' : 'Worth doing this week.'}
    >
      <ul className="divide-y divide-gray-100">
        {items.map((item, i) => (
          <li
            key={item.key}
            className="motion-row-in flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-3.5"
            style={{ animationDelay: `${Math.min(240, i * 40)}ms` }}
          >
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span className={`shrink-0 mt-0.5 w-8 h-8 rounded-md flex items-center justify-center ${TONE[item.tone].chip}`}>
                <Icon name="alert" className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${TONE[item.tone].text}`}>{item.text}</p>
                {item.detail && <p className="text-sm text-gray-600 mt-0.5">{item.detail}</p>}
              </div>
            </div>
            {item.href && item.action && (
              <Link
                href={item.href}
                className={`shrink-0 self-start sm:self-auto ml-11 sm:ml-0 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep rounded ${FOCUS_RING}`}
              >
                {item.action}
                <Icon name="arrow" className="w-4 h-4" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Plan and usage: one meter per limit
// ---------------------------------------------------------------------------

function PlanPanel({ plan }: { plan: AdminOverview['plan'] }) {
  const ended = plan.status !== 'active';
  const subtitle = plan.status === 'cancelled'
    ? 'Cancelled: its payment was refunded or declined'
    : ended
    ? plan.expiresOn
      ? `Ended ${plan.expiresOn}`
      : 'No active plan'
    : plan.expiresOn
      ? `Renews or ends ${plan.expiresOn}${plan.daysRemaining !== null ? ` · ${plural(plan.daysRemaining, 'day')} left` : ''}`
      : 'Does not expire';

  return (
    <Panel title={`${plan.label} plan`} subtitle={<span className={ended ? 'text-red-700 font-medium' : undefined}>{subtitle}</span>} viewAllHref="/admin/subscription" viewAllLabel="Subscription">
      {plan.usage ? (
        <ul className="py-2 divide-y divide-gray-100">
          {plan.usage.map((row, i) => (
            <UsageMeter key={row.key} row={row} index={i} />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-gray-500">Usage couldn’t be counted just now. Reload the page to try again.</p>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Accounts and services
// ---------------------------------------------------------------------------

function AccountsPanel({ accounts }: { accounts: AdminOverview['accounts'] }) {
  const lines = [
    accounts.invitesWaiting > 0 && { text: `${plural(accounts.invitesWaiting, 'invite')} not yet accepted`, tone: 'text-gray-700' },
    accounts.invitesExpired > 0 && { text: `${plural(accounts.invitesExpired, 'invite')} ran out`, tone: 'text-amber-800' },
    accounts.suspended > 0 && { text: `${plural(accounts.suspended, 'account')} suspended`, tone: 'text-gray-700' },
    accounts.idle > 0 && { text: `${plural(accounts.idle, 'account')} not used in ${IDLE_DAYS} days`, tone: 'text-amber-800' },
    accounts.inactive > 0 && { text: `${plural(accounts.inactive, 'account')} closed (inactive)`, tone: 'text-gray-500' },
  ].filter(Boolean) as { text: string; tone: string }[];

  return (
    <Panel title="Who can sign in" subtitle="Active and suspended accounts, by role" viewAllHref="/admin/users" viewAllLabel="Users">
      <RankedBars values={accounts.byRole} format={formatCount} label={(role) => role} empty="No staff accounts yet." />
      {lines.length > 0 && (
        <ul className="border-t border-gray-100 px-5 py-3 space-y-1">
          {lines.map((line) => (
            <li key={line.text} className={`text-sm ${line.tone}`}>
              {line.text}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ServiceState({ service }: { service: ServiceRow }) {
  // The database is checked live; the others are whether this server has them set up.
  if (service.ok) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
        {service.key === 'database' ? 'Working' : 'Set up'}
      </span>
    );
  }
  if (service.key === 'database') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-red-600" />
        Not answering
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600">
      <span aria-hidden="true" className="h-2 w-2 rounded-full ring-1 ring-inset ring-gray-400" />
      Not set up
    </span>
  );
}

function ServicesPanel({ services }: { services: ServiceRow[] }) {
  return (
    <Panel title="Services on this server" subtitle="Checked when this page opened">
      <ul className="divide-y divide-gray-100">
        {services.map((service) => (
          <li key={service.key} className="flex items-start justify-between gap-4 px-5 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{service.label}</p>
              <p className="text-sm text-gray-500 mt-0.5">{service.detail}</p>
            </div>
            <div className="shrink-0 pt-0.5">
              <ServiceState service={service} />
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-500">
        Email, SMS and file storage are set on the server, not in Clinic settings.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Recent administrative changes
// ---------------------------------------------------------------------------

function ActivityPanel({ activity }: { activity: AdminOverview['activity'] }) {
  return (
    <Panel
      title="Recent administrative changes"
      subtitle="Accounts, permissions, settings, exports and refused access"
      viewAllHref="/admin/audit-logs"
      viewAllLabel="Audit log"
    >
      {activity.length === 0 ? (
        <EmptyState icon="clipboard" title="No administrative changes recorded yet" hint="Account, permission and settings changes will be listed here." />
      ) : (
        <ul className="divide-y divide-gray-100">
          {activity.map((row, i) => (
            <li
              key={row.id}
              className="motion-row-in flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4 px-5 py-3"
              style={{ animationDelay: `${Math.min(240, i * 30)}ms` }}
            >
              <div className="min-w-0">
                <p className="text-sm text-gray-900">
                  <span className="font-semibold">{row.who}</span> <span className="text-gray-700">{row.what.charAt(0).toLowerCase() + row.what.slice(1)}</span>
                  {!row.success && <span className="ml-2 text-xs font-semibold text-red-700">Didn’t go through</span>}
                </p>
                {row.detail && <p className="text-sm text-gray-500 mt-0.5 truncate">{row.detail}</p>}
              </div>
              <time dateTime={row.at} className="shrink-0 font-mono text-xs text-gray-500 tabular-nums sm:pt-0.5">
                {row.when}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminOverviewClient({ overview }: { overview: AdminOverview }) {
  const { accounts, plan, signIns } = overview;
  const refusedTotal = signIns.reduce((s, d) => s + d.refused, 0);
  const signInTotal = signIns.reduce((s, d) => s + d.signIns, 0);
  const adminsExposed = accounts.adminsWithoutTwoStep.length;

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-2">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Administration</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            {overview.clinicName} · {plan.label} plan
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/audit-logs" className={SECONDARY_BUTTON}>
            Audit log
          </Link>
          <Link href="/admin/users" className={PRIMARY_BUTTON}>
            Manage users
          </Link>
        </div>
      </header>

      <Attention items={overview.attention} />

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <FigureRow
          figures={[
            {
              label: 'Accounts that can sign in',
              value: formatCount(accounts.total),
              detail: accounts.suspended ? `${formatCount(accounts.suspended)} suspended` : `${formatCount(accounts.active)} active`,
            },
            {
              label: 'Signed in, last 7 days',
              value: formatCount(accounts.signedInWeek),
              detail: `of ${formatCount(accounts.total)} accounts`,
            },
            {
              label: 'Use two-step verification',
              value: `${formatCount(accounts.withTwoStep)} of ${formatCount(accounts.total)}`,
              detail: adminsExposed ? `${plural(adminsExposed, 'administrator')} without it` : 'Every administrator has it',
              status: adminsExposed ? 'warning' : undefined,
            },
            {
              label: 'Refused access, 14 days',
              value: formatCount(refusedTotal),
              detail: 'Opened something their role doesn’t allow',
            },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6 items-start">
        <Panel
          title={`Sign-ins, last ${TREND_DAYS} days`}
          subtitle={`${plural(signInTotal, 'sign-in')}, and the times someone was refused access`}
          viewAllHref="/admin/audit-logs?kind=sign-in"
          viewAllLabel="Audit log"
        >
          <TrendChart
            days={signIns}
            today={overview.today}
            series={[
              { key: 'signIns', label: 'Sign-ins', color: SERIES.teal, kind: 'column' },
              { key: 'refused', label: 'Refused access', color: SERIES.blue, kind: 'line' },
            ]}
            format={formatCount}
            caption={`Sign-ins and refused access per day, last ${TREND_DAYS} days`}
          />
        </Panel>
        <PlanPanel plan={plan} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <AccountsPanel accounts={accounts} />
        <ServicesPanel services={overview.services} />
      </div>

      <ActivityPanel activity={overview.activity} />
    </div>
  );
}
