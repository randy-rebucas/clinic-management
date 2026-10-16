import { SERIES, STATE } from '../dashboards/charts';
import type { StockStatus } from '@/lib/inventory';

/**
 * Stock against its reorder level: a thin bar for what is on hand and a tick where reordering
 * starts. The scale runs to twice the reorder level (or the stock, if higher), so "just above the
 * line" and "well stocked" look different. Decorative: the figures beside it carry the numbers.
 */
export default function StockBar({
  quantity,
  reorderLevel,
  status,
  delay = 0,
  className = '',
}: {
  quantity: number;
  reorderLevel: number;
  status: StockStatus;
  delay?: number;
  className?: string;
}) {
  const max = Math.max(reorderLevel * 2, quantity, 1);
  const fill = status === 'expired' ? '#D1D5DB' : status === 'low-stock' ? STATE.pending.fill : SERIES.teal;
  return (
    <span aria-hidden="true" className={`relative block h-3 ${className}`}>
      <span className="absolute inset-x-0 top-1/2 block h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-gray-100">
        {quantity > 0 && (
          <span className="motion-bar-grow block h-full rounded-full" style={{ width: `${(quantity / max) * 100}%`, background: fill, animationDelay: `${delay}ms` }} />
        )}
      </span>
      {reorderLevel > 0 && <span className="absolute top-0 block h-3 w-0.5 -translate-x-1/2 rounded-full bg-gray-500" style={{ left: `${(reorderLevel / max) * 100}%` }} />}
    </span>
  );
}
