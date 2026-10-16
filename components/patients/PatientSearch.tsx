'use client';

import { useEffect, useId, useState } from 'react';
import { FIELD, ICON, Svg } from '../appointments/shared';

export interface PatientOption {
  _id: string;
  firstName: string;
  lastName: string;
  patientCode?: string;
  email?: string;
  phone?: string;
}

/**
 * Patient picker: a combobox that searches on the server (20 best matches) as you type.
 * Typing again clears the choice, so a half-edited name never stays "selected".
 */
export default function PatientSearch({
  label = 'Patient',
  value,
  onChange,
  autoFocus,
  optional = false,
}: {
  label?: string;
  value: PatientOption | null;
  onChange: (patient: PatientOption | null) => void;
  autoFocus?: boolean;
  /** The form can be saved without a patient (e.g. a document filed later). */
  optional?: boolean;
}) {
  const ids = useId();
  const [query, setQuery] = useState(value ? `${value.firstName} ${value.lastName}` : '');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<PatientOption[]>([]);
  const [searchState, setSearchState] = useState<{ key: string; failed: boolean } | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  useEffect(() => {
    if (query === debounced) return;
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query, debounced]);

  useEffect(() => {
    if (value || !debounced.trim()) return;
    const controller = new AbortController();
    const key = debounced.trim();
    fetch(`/api/patients?${new URLSearchParams({ search: key, limit: '20' })}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json) => {
        setResults(json?.success ? json.data : []);
        setSearchState({ key, failed: !json?.success });
      })
      .catch(() => {
        if (!controller.signal.aborted) setSearchState({ key, failed: true });
      });
    return () => controller.abort();
  }, [debounced, value]);

  const key = debounced.trim();
  const settled = searchState?.key === key;
  const showList = listOpen && !value && query.trim() !== '';
  const listId = `${ids}-list`;
  const optionId = (i: number) => `${ids}-opt-${i}`;

  const choose = (p: PatientOption) => {
    onChange(p);
    setQuery(`${p.firstName} ${p.lastName}`);
    setListOpen(false);
    setHighlight(-1);
  };

  return (
    <div className="relative">
      <label htmlFor={`${ids}-input`} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {optional && <span className="font-normal text-gray-500"> (optional)</span>}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Svg d={ICON.search} />
        </span>
        <input
          id={`${ids}-input`}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && highlight >= 0 ? optionId(highlight) : undefined}
          autoComplete="off"
          required={!optional}
          autoFocus={autoFocus}
          value={query}
          placeholder="Search by name, patient code or phone"
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) onChange(null);
            setListOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => !value && setListOpen(true)}
          onBlur={() => setTimeout(() => setListOpen(false), 120)}
          onKeyDown={(e) => {
            if (!showList || results.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(results.length - 1, h + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === 'Enter' && highlight >= 0) {
              e.preventDefault();
              choose(results[highlight]);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setListOpen(false);
            }
          }}
          className={`${FIELD} pl-9 ${value ? 'border-brand-teal-dark' : ''}`}
        />
        {value && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-brand-teal-dark">
            <Svg d={ICON.check} />
          </span>
        )}
      </div>
      {value && (value.patientCode || value.phone) && (
        <p className="mt-1.5 font-mono text-xs text-gray-500">{[value.patientCode, value.phone].filter(Boolean).join(' · ')}</p>
      )}
      {showList && (
        <div className="motion-panel-in absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-[0_8px_30px_rgb(15,23,42,0.1)]">
          {settled && results.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Matching patients">
              {results.map((p, i) => (
                <li
                  key={p._id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={highlight === i}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(p)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`cursor-pointer rounded-md px-3 py-2 ${highlight === i ? 'bg-brand-teal-light/60' : ''}`}
                >
                  <span className="block text-sm font-semibold text-gray-900">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="block font-mono text-xs text-gray-500">
                    {[p.patientCode, p.phone, p.email].filter(Boolean).join(' · ') || 'No contact details'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p id={listId} className="px-3 py-3 text-sm text-gray-500">
              {!key || !settled
                ? key
                  ? 'Searching…'
                  : 'Keep typing to search.'
                : searchState?.failed
                  ? 'Patient search is unavailable. Check your connection and type again.'
                  : `No patient matches “${key}”. Register them from Patients first.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
