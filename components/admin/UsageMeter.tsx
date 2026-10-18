'use client';

import type { UsageRow } from '@/lib/plan-usage';
import { NEAR_LIMIT } from '@/lib/admin-overview.shared';
import { formatCount } from '@/components/dashboards/shared';
import { SERIES } from '@/components/dashboards/charts';

/** One plan limit as a meter: teal, amber from 80%, red at the limit. Used by /admin and /admin/subscription. */

export function usageAmount(row: UsageRow, v: number) {
  return row.key === 'storage' ? `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} GB` : formatCount(v);
}

export default function UsageMeter({ row, index }: { row: UsageRow; index: number }) {
  const limited = row.limit !== null && row.limit > 0;
  const share = limited ? row.current / (row.limit as number) : 0;
  const full = limited && share >= 1;
  const near = limited && !full && share >= NEAR_LIMIT;
  const fill = full ? '#BE123C' : near ? '#D97706' : SERIES.teal;

  return (
    <li className="px-5 py-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-gray-700">{row.label}</span>
        <span className="font-mono tabular-nums text-gray-900">
          {usageAmount(row, row.current)}
          {limited ? <span className="text-gray-500"> of {usageAmount(row, row.limit as number)}</span> : null}
        </span>
      </div>
      {limited ? (
        <>
          <div
            role="meter"
            aria-label={row.label}
            aria-valuemin={0}
            aria-valuemax={row.limit as number}
            aria-valuenow={Math.min(row.current, row.limit as number)}
            aria-valuetext={`${usageAmount(row, row.current)} of ${usageAmount(row, row.limit as number)}`}
            className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden"
          >
            <div
              className="motion-bar-grow h-full rounded-full"
              style={{ width: `${Math.min(100, share * 100)}%`, background: fill, animationDelay: `${index * 50}ms` }}
            />
          </div>
          {(full || near) && (
            <p className={`mt-1 text-xs font-medium ${full ? 'text-red-700' : 'text-amber-800'}`}>
              {full ? `Limit reached: ${row.blocks}` : `${Math.round(share * 100)}% used`}
            </p>
          )}
        </>
      ) : (
        <p className="mt-0.5 text-xs text-gray-500">No limit on this plan</p>
      )}
    </li>
  );
}
