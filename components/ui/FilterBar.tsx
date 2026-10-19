import type { ReactNode } from 'react';
import { SERIES } from '../dashboards/charts';

/**
 * A labelled bar that filters the list beneath it (the charts-as-filters rule): Chart Teal on a
 * gray-100 track, teal-dark when chosen, the rest at 30% while one is chosen.
 */
export default function FilterBar({
  label,
  meta,
  value,
  share,
  on,
  dim,
  disabled,
  index,
  ariaLabel,
  tone,
  onClick,
}: {
  label: string;
  meta?: ReactNode;
  value: ReactNode;
  share: number;
  on: boolean;
  dim: boolean;
  disabled?: boolean;
  index: number;
  ariaLabel: string;
  /** Overrides the label colour, e.g. red-700 for a bucket that needs attention. */
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors enabled:hover:bg-gray-50 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
    >
      <span className="flex items-baseline justify-between gap-3 text-sm">
        <span className={`min-w-0 truncate ${disabled ? 'text-gray-400' : tone ?? (on ? 'text-gray-900' : 'text-gray-700')} ${on ? 'font-semibold' : ''}`}>{label}</span>
        <span className={`shrink-0 font-mono tabular-nums ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{value}</span>
      </span>
      {meta && <span className="mt-0.5 block truncate text-xs text-gray-500">{meta}</span>}
      <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
        <span
          className="motion-bar-grow block h-full rounded-r"
          style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, background: on ? '#0A7F7E' : SERIES.teal, opacity: dim && !on ? 0.3 : 1, animationDelay: `${Math.min(index * 60, 240)}ms` }}
        />
      </span>
    </button>
  );
}
