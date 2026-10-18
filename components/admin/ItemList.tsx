'use client';

import { useState } from 'react';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { Label } from '../visits/form/parts';

/** A list of short items: type one and press Enter (or a comma); each shows as a removable chip. */
export default function ItemList({
  id,
  label,
  values,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const items = draft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length) {
      const seen = new Set(values.map((v) => v.toLowerCase()));
      onChange([...values, ...items.filter((i) => !seen.has(i.toLowerCase()))]);
    }
    setDraft('');
  };
  return (
    <div>
      <Label htmlFor={id} optional>
        {label}
      </Label>
      {values.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={label}>
          {values.map((v) => (
            <li key={v} className="inline-flex items-center gap-1 rounded-md bg-gray-100 py-1 pl-2.5 pr-1 text-sm text-gray-900">
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                className={`rounded p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 ${FOCUS_RING}`}
              >
                <Svg d={ICON.x} className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={commit}
        maxLength={200}
        autoComplete="off"
        placeholder={placeholder}
        className={FIELD}
      />
    </div>
  );
}
