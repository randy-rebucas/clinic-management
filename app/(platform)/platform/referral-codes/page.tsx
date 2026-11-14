import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { BadgeCheck, Building2, QrCode, Search, Wallet, X } from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform-auth';
import { listReferralCodes, referralRepOptions, type PlatformReferralRow } from '@/lib/rep-referral';
import { REFERRAL_MONTHS, loadReferralOverview } from '@/lib/platform-console';
import { LIFECYCLE_LABEL, type TenantLifecycle } from '@/lib/platform-metrics';
import { ColumnChart } from '@/components/platform/charts';
import {
  BarRow,
  CARD,
  FIELD,
  FOCUS_RING,
  H2,
  Initial,
  LIFECYCLE_COLOR,
  LINK,
  LifecycleBadge,
  ago,
  money,
} from '@/components/platform/shared';
import NewReferralCodeForm from '@/components/platform/NewReferralCodeForm';
import ReferralCodeTable from '@/components/platform/ReferralCodeTable';

export const dynamic = 'force-dynamic';

const STATES: TenantLifecycle[] = ['paying', 'cancelling', 'trial', 'trial-ended', 'lapsed', 'suspended'];

type CodeFilter = '' | 'active' | 'off' | 'ended';
const CODE_FILTERS: Array<{ key: CodeFilter; label: string }> = [
  { key: '', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'ended', label: 'Expired or used up' },
  { key: 'off', label: 'Off' },
];
const codeState = (c: PlatformReferralRow): Exclude<CodeFilter, ''> =>
  c.status === 'disabled' ? 'off' : c.expired || (c.maxUses !== null && c.uses >= c.maxUses) ? 'ended' : 'active';

const monthShort = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const monthLong = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function Stat({ icon: Icon, label, value, children }: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  label: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="flex size-7 items-center justify-center rounded-md bg-brand-teal-light text-brand-teal-deep">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums text-gray-900">{value}</div>
      {children && <div className="mt-1 text-xs text-gray-500">{children}</div>}
    </div>
  );
}

export default async function PlatformReferralCodesPage({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  await requirePlatformPage();
  const sp = await searchParams;
  const show = (CODE_FILTERS.find((f) => f.key && f.key === sp.show)?.key ?? '') as CodeFilter;
  const q = (sp.q ?? '').trim().slice(0, 60);
  const [codes, reps, o] = await Promise.all([listReferralCodes(), referralRepOptions(), loadReferralOverview()]);

  const needle = q.toLowerCase();
  const matches = (c: PlatformReferralRow) =>
    !needle || [c.code, c.rep.name, c.rep.email, c.rep.company ?? '', c.label ?? ''].some((s) => s.toLowerCase().includes(needle));
  const searched = codes.filter(matches);
  const shown = show ? searched.filter((c) => codeState(c) === show) : searched;
  const countOf = (key: CodeFilter) => (key ? searched.filter((c) => codeState(c) === key).length : searched.length);
  const activeCodes = codes.filter((c) => codeState(c) === 'active');
  const paying = o.byLifecycle.paying + o.byLifecycle.cancelling;
  const payRate = o.referred ? Math.round((paying / o.referred) * 100) : null;
  const last12 = o.byMonth.reduce((s, m) => s + m.count, 0);
  const repMax = Math.max(0, ...o.topReps.map((r) => r.clinics));

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ show, q, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return `/platform/referral-codes${s ? `?${s}` : ''}#codes`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Rep referrals</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-gray-500">
          A clinic that registers with a rep’s code or link, or enters it later on its billing page, gets that rep added to its
          representatives, so it can ask them to sponsor its plan. Reps make their own code in the eMedRoute app; make custom ones here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Building2} label="Clinics referred" value={o.referred}>
          Credited to the first code each used · {last12} in {REFERRAL_MONTHS} months
        </Stat>
        <Stat icon={BadgeCheck} label="Now paying" value={paying}>
          {payRate === null ? 'No referred clinics yet' : `${payRate}% of referred clinics`}
        </Stat>
        <Stat icon={Wallet} label="MRR from referrals" value={money(o.referredMrr, o.currency)}>
          From referred clinics that pay
        </Stat>
        <Stat icon={QrCode} label="Active codes" value={activeCodes.length}>
          {activeCodes.filter((c) => c.source === 'rep').length} reps’ own · {activeCodes.filter((c) => c.source !== 'rep').length} custom
        </Stat>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <section className={`${CARD} p-4 lg:col-span-2`} aria-labelledby="by-month">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="by-month" className={H2}>Clinics referred per month</h2>
            <span className="text-xs text-gray-500">By the month the code was used</span>
          </div>
          <div className="mt-3">
            <ColumnChart
              label="Clinics linked to a rep through a referral code, per month"
              height={190}
              format={{ kind: 'count', unit: ['clinic', 'clinics'] }}
              points={o.byMonth.map((m) => ({ label: monthShort(m.month), full: monthLong(m.month), value: m.count }))}
            />
          </div>
        </section>

        <section className={`${CARD} p-4`} aria-labelledby="by-state">
          <h2 id="by-state" className={H2}>Where referred clinics are now</h2>
          {o.referred === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No clinic has used a code yet.</p>
          ) : (
            <>
              <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                {STATES.filter((s) => o.byLifecycle[s] > 0).map((s) => (
                  <div
                    key={s}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{ width: `${(o.byLifecycle[s] / o.referred) * 100}%`, backgroundColor: LIFECYCLE_COLOR[s] }}
                  />
                ))}
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {STATES.map((s) => (
                  <li key={s} className={`flex items-center justify-between gap-3 ${o.byLifecycle[s] ? '' : 'text-gray-400'}`}>
                    <Link href={`/platform/clinics?state=${s}`} className={`inline-flex items-center gap-2 rounded hover:underline ${FOCUS_RING}`}>
                      <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: LIFECYCLE_COLOR[s] }} />
                      {LIFECYCLE_LABEL[s]}
                    </Link>
                    <span className="tabular-nums">{o.byLifecycle[s]}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-gray-500">State links open the clinics list for every clinic, referred or not.</p>
            </>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <section className={`${CARD} p-4`} aria-labelledby="top-reps">
          <h2 id="top-reps" className={H2}>Top referring reps</h2>
          <p className="text-xs text-gray-500">Clinics referred, and how many of them pay</p>
          {o.topReps.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">Nobody has referred a clinic yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {o.topReps.map((r) => (
                <BarRow
                  key={r.id}
                  label={r.company ? `${r.name} · ${r.company}` : r.name}
                  href={`/platform/reps/${r.id}`}
                  value={r.clinics}
                  max={repMax}
                  right={`${r.clinics} · ${r.paying} paying`}
                />
              ))}
            </ul>
          )}
        </section>

        <section className={CARD} aria-labelledby="recent">
          <h2 id="recent" className={`${H2} px-4 pt-4`}>Latest referrals</h2>
          {o.recent.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-500">None yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {o.recent.map((r) => (
                <li key={r.clinicId} className="flex items-center gap-3 px-4 py-2.5">
                  <Initial name={r.clinicName} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/platform/clinics/${r.clinicId}`} className={`${LINK} block truncate`}>{r.clinicName}</Link>
                    <p className="truncate text-xs text-gray-500">
                      <span className="font-mono">{r.code}</span> ·{' '}
                      <Link href={`/platform/reps/${r.rep.id}`} className="hover:text-gray-800 hover:underline">{r.rep.name}</Link> · {ago(r.at)}
                    </p>
                  </div>
                  <LifecycleBadge lifecycle={r.lifecycle} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <section id="codes" className={`${CARD} min-w-0 scroll-mt-6 lg:col-span-2`} aria-labelledby="codes-title">
          <div className="space-y-3 px-4 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="codes-title" className={H2}>Codes</h2>
                <p className="text-xs text-gray-500">Clinics: every clinic that linked the rep with this code, even if another rep referred it first.</p>
              </div>
              <form action="/platform/referral-codes#codes" role="search" className="relative w-full sm:w-64">
                {show && <input type="hidden" name="show" value={show} />}
                <label htmlFor="code-q" className="sr-only">Search codes</label>
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="code-q"
                  name="q"
                  type="text"
                  inputMode="search"
                  autoComplete="off"
                  defaultValue={q}
                  placeholder="Code, rep or label"
                  className={`${FIELD} py-1.5 pl-9 pr-9`}
                />
                {q && (
                  <Link href={href({ q: undefined })} aria-label="Clear search" className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700 ${FOCUS_RING}`}>
                    <X className="size-4" />
                  </Link>
                )}
              </form>
            </div>
            <nav aria-label="Filter codes" className="flex flex-wrap gap-1.5 text-sm">
              {CODE_FILTERS.map((f) => {
                const on = show === f.key;
                return (
                  <Link
                    key={f.key || 'all'}
                    href={href({ show: f.key || undefined })}
                    aria-current={on ? 'page' : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 ring-1 ring-inset ${FOCUS_RING} ${
                      on ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-white text-gray-700 ring-gray-200 hover:ring-gray-400'
                    }`}
                  >
                    {f.label}
                    <span className={`tabular-nums ${on ? 'text-slate-300' : 'text-gray-500'}`}>{countOf(f.key)}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          {codes.length > 0 && shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">
              No codes match. <Link href="/platform/referral-codes#codes" className={LINK}>Clear filters</Link>
            </p>
          ) : (
            <ReferralCodeTable codes={shown} />
          )}
        </section>

        <section className={`${CARD} p-4`} aria-labelledby="new-code">
          <h2 id="new-code" className={`${H2} flex items-center gap-2`}>
            <QrCode aria-hidden="true" className="size-4 text-brand-teal-deep" /> New custom code
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">For a campaign or event: optional label, use limit and end date.</p>
          <div className="mt-4">
            <NewReferralCodeForm reps={reps} />
          </div>
        </section>
      </div>
    </div>
  );
}
