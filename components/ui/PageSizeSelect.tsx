'use client';

import { PAGE_SIZE_OPTIONS } from '@/lib/page-size';

/** "Show [5] per page" control for list footers. */
export default function PageSizeSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: number;
  onChange: (size: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-gray-600">
        Show
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="rounded-md border border-gray-300 bg-white py-1 pl-2 pr-7 font-mono text-sm text-gray-900 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30 disabled:opacity-50"
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <span className="text-sm text-gray-600">per page</span>
    </div>
  );
}
