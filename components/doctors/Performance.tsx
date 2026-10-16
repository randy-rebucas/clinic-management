'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { FOCUS_RING } from '../appointments/shared';
import { SERIES } from '../dashboards/charts';
import { useMoney } from '../invoices/shared';
import { DOCTOR_STATE, doctorName, statusOf } from './shared';
import { addDays } from '@/lib/doctors';

interface Report {
  doctor: { _id: string; name: string; firstName: string; lastName: string; title?: string; status?: string; specialization: string };
  summary: {
    totalAppointments: number;
    completedAppointments: number;
    noShowAppointments: number;
    cancelledAppointments: number;
    totalVisits: number;
    totalPrescriptions: number;
    totalRevenue: number;
    totalBilled: number;
  };
}

type Period = 'month' | 'last-month' | '90';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: '90', label: 'Last 90 days' },
];

function rangeFor(period: Period, today: string) {
  if (period === 'month') return { start: `${today.slice(0, 7)}-01`, end: today };
  if (period === 'last-month') {
    const firstThis = `${today.slice(0, 7)}-01`;
    const end = addDays(firstThis, -1);
    return { start: `${end.slice(0, 7)}-01`, end };
  }
  return { start: addDays(today, -89), end: today };
}

const fmtDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Who saw how many patients in a period, for the people who run the clinic (the productivity
 * report's rule: admins and accountants). One ruled table, most seen first, with the seen count
 * drawn as a bar on one scale so the spread between doctors reads without a chart of its own.
 */
export default function DoctorPerformance({ today }: { today: string }) {
  const { money } = useMoney();
  const [period, setPeriod] = useState<Period>('month');
  const { start, end } = rangeFor(period, today);
  const res = useKeyedFetch<{ reports: Report[] }>(`/api/doctors/productivity?startDate=${start}&endDate=${end}`);
  const loaded = res.value !== null;

  const rows = (res.value?.reports ?? [])
    .filter((r) => r.doctor.status === 'active' || r.summary.totalAppointments > 0 || r.summary.totalVisits > 0)
    .sort((a, b) => b.summary.completedAppointments - a.summary.completedAppointments || a.doctor.name.localeCompare(b.doctor.name));
  const maxSeen = Math.max(1, ...rows.map((r) => r.summary.completedAppointments));
  const total = rows.reduce(
    (t, r) => ({
      booked: t.booked + r.summary.totalAppointments - r.summary.cancelledAppointments,
      seen: t.seen + r.summary.completedAppointments,
      noShow: t.noShow + r.summary.noShowAppointments,
      visits: t.visits + r.summary.totalVisits,
      rx: t.rx + r.summary.totalPrescriptions,
      collected: t.collected + r.summary.totalRevenue,
    }),
    { booked: 0, seen: 0, noShow: 0, visits: 0, rx: 0, collected: 0 }
  );
  const rate = (seen: number, noShow: number) => (seen + noShow > 0 ? Math.round((noShow / (seen + noShow)) * 100) : null);

  return (
    <section className="motion-panel-in overflow-hidden rounded-lg border border-gray-200 bg-white" aria-labelledby="perf-h">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="perf-h" className="text-base font-bold tracking-tight text-gray-900">
            Workload by doctor
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-gray-500">
            <span className="font-mono">
              {fmtDay(start)} – {fmtDay(end)}
            </span>
            . Booked leaves out cancelled. The no-show share is of appointments that were due (seen plus no-shows). Collected is what was paid on invoices for their visits.
          </p>
        </div>
        <div className="inline-flex shrink-0 gap-1 rounded-md border border-gray-200 bg-white p-1" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded px-3.5 py-1.5 text-sm font-medium transition-colors ${FOCUS_RING} ${period === p.key ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!loaded ? (
        res.error ? (
          <p className="px-5 py-6 text-sm text-gray-600">
            The figures didn&apos;t load ({res.error}).{' '}
            <button type="button" onClick={res.reload} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
              Try again
            </button>
          </p>
        ) : (
          <div className="m-5 h-48 animate-pulse rounded bg-gray-50" aria-hidden="true" />
        )
      ) : rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-gray-500">No appointments or visit notes in this period.</p>
      ) : (
        <div className={`overflow-x-auto transition-opacity duration-200 ${res.loading ? 'opacity-60' : ''}`} aria-busy={res.loading}>
          <table className="w-full min-w-[46rem] text-sm">
            <caption className="sr-only">Workload by doctor, {fmtDay(start)} to {fmtDay(end)}</caption>
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60 text-gray-500">
                <th scope="col" className="px-5 py-2.5 text-left font-medium">Doctor</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Booked</th>
                <th scope="col" className="w-48 px-3 py-2.5 text-left font-medium">Seen</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">No-shows</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Visit notes</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Prescriptions</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Collected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => {
                const s = r.summary;
                const st = statusOf(r.doctor);
                const share = rate(s.completedAppointments, s.noShowAppointments);
                return (
                  <tr key={r.doctor._id} className="motion-row-in hover:bg-gray-50" style={{ animationDelay: `${Math.min(i * 25, 240)}ms` }}>
                    <th scope="row" className="px-5 py-3 text-left font-normal">
                      <Link href={`/doctors/${r.doctor._id}`} className={`rounded font-semibold text-gray-900 hover:text-brand-teal-deep ${FOCUS_RING}`}>
                        {doctorName(r.doctor)}
                      </Link>
                      <span className="block text-xs text-gray-500">
                        {r.doctor.specialization}
                        {st !== 'active' && ` · ${DOCTOR_STATE[st].label.toLowerCase()}`}
                      </span>
                    </th>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-900">{s.totalAppointments - s.cancelledAppointments}</td>
                    <td className="px-3 py-3">
                      <span className="font-mono font-semibold tabular-nums text-gray-900">{s.completedAppointments}</span>
                      <span aria-hidden="true" className="mt-1 block h-1.5 rounded-r bg-gray-100">
                        <span className="motion-bar-grow block h-full rounded-r" style={{ width: `${(s.completedAppointments / maxSeen) * 100}%`, background: SERIES.teal, animationDelay: `${Math.min(i * 40, 240)}ms` }} />
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-900">
                      {s.noShowAppointments}
                      {share !== null && <span className="ml-2 inline-block w-10 text-gray-500">{share}%</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-900">{s.totalVisits}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-900">{s.totalPrescriptions}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-gray-900">{money(s.totalRevenue)}</td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 1 && (
              <tfoot>
                <tr className="border-t border-gray-200 font-semibold text-gray-900">
                  <th scope="row" className="px-5 py-3 text-left">
                    All doctors
                  </th>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{total.booked}</td>
                  <td className="px-3 py-3 font-mono tabular-nums">{total.seen}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {total.noShow}
                    {rate(total.seen, total.noShow) !== null && <span className="ml-2 inline-block w-10 font-normal text-gray-500">{rate(total.seen, total.noShow)}%</span>}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{total.visits}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{total.rx}</td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums">{money(total.collected)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}
