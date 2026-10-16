'use client';

import { SERIES, TipRow, useTooltip } from '../dashboards/charts';
import { AGE_BANDS } from '@/lib/patient-age-bands';

export interface PatientInsightsData {
  total: number;
  active: number;
  newThisMonth: number;
  months: { month: string; registered: number }[];
  ageBands: { label: string; min: number; max: number | null; count: number }[];
  sex: Record<string, number>;
  tags: { tag: string; count: number }[];
}

const SEX_ORDER = [
  { key: 'female', label: 'Female', color: SERIES.teal },
  { key: 'male', label: 'Male', color: SERIES.blue },
  { key: 'other', label: 'Other', color: SERIES.ochre },
  { key: 'unspecified', label: 'Not recorded', color: null },
] as const;

const monthLabel = (ym: string, opts: Intl.DateTimeFormatOptions) => new Date(`${ym}-15T12:00:00`).toLocaleDateString('en-US', opts);

/**
 * The roster at a glance, and a way into it: age bands and sex segments are buttons that
 * filter the list below. The figures are clinic-wide and do not shrink with the filter.
 */
export default function PatientInsights({
  data,
  activeAge,
  activeSex,
  onAgeBand,
  onSex,
}: {
  data: PatientInsightsData;
  activeAge: string | null;
  activeSex: string;
  onAgeBand: (band: (typeof AGE_BANDS)[number] | null) => void;
  onSex: (sex: string) => void;
}) {
  const tip = useTooltip();
  const monthMax = Math.max(1, ...data.months.map((m) => m.registered));
  const ageMax = Math.max(1, ...data.ageBands.map((b) => b.count));
  const sexTotal = SEX_ORDER.reduce((s, x) => s + (data.sex[x.key] || 0), 0);
  const inactive = Math.max(0, data.total - data.active);

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.3fr_1fr] -mr-px -mb-px">
        {/* Roster size + registrations by month */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="pi-roster">
          <h2 id="pi-roster" className="text-sm text-gray-600">Registered patients</h2>
          <div className="mt-2 flex items-baseline gap-3 flex-wrap">
            <p className="font-mono text-3xl font-semibold text-gray-900">{data.total.toLocaleString('en-US')}</p>
            {data.newThisMonth > 0 && (
              <p className="text-sm font-semibold text-brand-teal-deep">
                <span className="font-mono">+{data.newThisMonth}</span> this month
              </p>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            <span className="font-mono text-gray-700">{data.active.toLocaleString('en-US')}</span> active
            {inactive > 0 && (
              <>
                {' · '}
                <span className="font-mono text-gray-700">{inactive.toLocaleString('en-US')}</span> inactive
              </>
            )}
          </p>

          <div className="mt-5">
            <div className="flex h-16 items-end gap-[3px]" role="img" aria-label={`New registrations per month: ${data.months.map((m) => `${monthLabel(m.month, { month: 'short' })} ${m.registered}`).join(', ')}`}>
              {data.months.map((m, i) => {
                const current = i === data.months.length - 1;
                const h = Math.max(m.registered > 0 ? 6 : 2, (m.registered / monthMax) * 100);
                return (
                  <span
                    key={m.month}
                    className="motion-col-grow flex-1 rounded-t-[3px]"
                    style={{
                      height: `${h}%`,
                      background: m.registered > 0 ? (current ? '#0A7F7E' : SERIES.teal) : '#E5E7EB',
                      opacity: m.registered > 0 && !current ? 0.55 : 1,
                      animationDelay: `${i * 20}ms`,
                    }}
                    onPointerEnter={(e) =>
                      tip.showFor(
                        e.currentTarget,
                        <TipRow color={SERIES.teal} kind="bar" label={monthLabel(m.month, { month: 'long', year: 'numeric' })} value={m.registered} />
                      )
                    }
                    onPointerLeave={tip.hide}
                  />
                );
              })}
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-xs text-gray-500">
              <span>{monthLabel(data.months[0].month, { month: 'short' })}</span>
              <span className="text-gray-900 font-semibold">{monthLabel(data.months[data.months.length - 1].month, { month: 'short' })}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">New registrations, last 12 months</p>
          </div>
        </section>

        {/* Age bands: a histogram you can click */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="pi-age">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="pi-age" className="text-sm text-gray-600">Age</h2>
            {activeAge && (
              <button
                type="button"
                onClick={() => onAgeBand(null)}
                className="text-xs font-semibold text-brand-teal-dark hover:text-brand-teal-deep rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
              >
                Show all ages
              </button>
            )}
          </div>
          <div className="mt-4 grid grid-cols-8 items-end gap-1.5 h-32" role="group" aria-label="Filter by age band">
            {data.ageBands.map((band, i) => {
              const selected = activeAge === band.label;
              const dimmed = activeAge !== null && !selected;
              const h = band.count > 0 ? Math.max(6, (band.count / ageMax) * 100) : 2;
              return (
                <button
                  key={band.label}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Ages ${band.label}: ${band.count} patients${selected ? ', filtering' : ''}`}
                  onClick={() => onAgeBand(selected ? null : AGE_BANDS[i])}
                  onPointerEnter={(e) =>
                    tip.showFor(e.currentTarget, <TipRow color={SERIES.teal} kind="bar" label={`Ages ${band.label}`} value={band.count} />)
                  }
                  onPointerLeave={tip.hide}
                  className="group relative flex h-full items-end justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
                >
                  {/* Generous hit area: the whole column, not just the bar */}
                  <span className="absolute inset-0 rounded bg-gray-50 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                  <span
                    className="motion-col-grow relative w-full max-w-6 rounded-t transition-[background-color,opacity] duration-200"
                    style={{
                      height: `${h}%`,
                      background: band.count > 0 ? (selected ? '#0A7F7E' : SERIES.teal) : '#E5E7EB',
                      opacity: dimmed ? 0.3 : 1,
                      animationDelay: `${i * 25}ms`,
                    }}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 grid grid-cols-8 gap-1.5">
            {data.ageBands.map((band) => (
              <span
                key={band.label}
                className={`text-center font-mono text-xs ${activeAge === band.label ? 'font-semibold text-gray-900' : 'text-gray-500'}`}
              >
                {band.label}
              </span>
            ))}
          </div>
        </section>

        {/* Sex split: segments and legend rows both filter */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="pi-sex">
          <h2 id="pi-sex" className="text-sm text-gray-600">Sex</h2>
          {sexTotal === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No patients yet.</p>
          ) : (
            <>
              <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded" aria-hidden="true">
                {SEX_ORDER.filter((s) => (data.sex[s.key] || 0) > 0).map((s, i) => (
                  <span
                    key={s.key}
                    className={`motion-seg-grow h-full transition-opacity duration-200 ${s.color ? '' : 'ring-1 ring-inset ring-gray-300'}`}
                    style={{
                      flexGrow: data.sex[s.key],
                      flexBasis: 0,
                      background: s.color ?? '#F3F4F6',
                      opacity: activeSex !== 'all' && activeSex !== s.key ? 0.3 : 1,
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                ))}
              </div>
              <ul className="mt-3 divide-y divide-gray-100" role="group" aria-label="Filter by sex">
                {SEX_ORDER.filter((s) => (data.sex[s.key] || 0) > 0).map((s) => {
                  const filterable = s.key !== 'unspecified';
                  const selected = activeSex === s.key;
                  const n = data.sex[s.key] || 0;
                  const row = (
                    <>
                      <span className="flex items-center gap-2 text-gray-700">
                        <span
                          aria-hidden="true"
                          className={`h-2.5 w-2.5 rounded-sm ${s.color ? '' : 'ring-1 ring-inset ring-gray-400'}`}
                          style={s.color ? { background: s.color } : undefined}
                        />
                        <span className={selected ? 'font-semibold text-gray-900' : ''}>{s.label}</span>
                      </span>
                      <span className="font-mono tabular-nums text-gray-900">
                        {n.toLocaleString('en-US')}
                        <span className="ml-2 inline-block w-9 text-right text-gray-500">{Math.round((n / sexTotal) * 100)}%</span>
                      </span>
                    </>
                  );
                  return (
                    <li key={s.key}>
                      {filterable ? (
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onSex(selected ? 'all' : s.key)}
                          className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between rounded px-2 py-2 text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${selected ? 'bg-brand-teal-light/60' : ''}`}
                        >
                          {row}
                        </button>
                      ) : (
                        <div className="flex items-center justify-between py-2 text-sm">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
      {tip.node}
    </div>
  );
}

export function PatientInsightsSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.3fr_1fr] -mr-px -mb-px">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-r border-b border-gray-200 p-5 h-[236px]">
            <div className="h-3 w-28 rounded bg-gray-100" />
            <div className="mt-3 h-8 w-24 rounded bg-gray-100" />
            <div className="mt-10 h-20 rounded bg-gray-50" />
          </div>
        ))}
      </div>
    </div>
  );
}
