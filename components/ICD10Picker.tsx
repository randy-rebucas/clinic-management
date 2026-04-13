'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface ICD10Result {
  code: string;
  description: string;
}

interface Props {
  value?: string;
  description?: string;
  onChange: (code: string, description: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function ICD10Picker({
  value,
  description,
  onChange,
  placeholder = 'Search diagnosis (e.g. diabetes, hypertension…)',
  disabled = false,
  className = '',
}: Props) {
  const [query, setQuery] = useState(description ?? value ?? '');
  const [results, setResults] = useState<ICD10Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/icd10?q=${encodeURIComponent(q)}&limit=10`);
      const json = await res.json();
      setResults(json.data ?? []);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    search(debouncedQuery);
  }, [debouncedQuery, search]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (result: ICD10Result) => {
    setQuery(`${result.code} – ${result.description}`);
    setOpen(false);
    onChange(result.code, result.description);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    onChange('', '');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value) onChange('', '');
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-16 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && (
            <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full" />
          )}
          {query && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              aria-label="Clear"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.map((r) => (
            <li key={r.code}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(r)}
                className="w-full text-left px-3 py-2.5 hover:bg-blue-50 text-sm flex gap-3 items-start"
              >
                <span className="shrink-0 font-mono text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mt-0.5">
                  {r.code}
                </span>
                <span className="text-gray-700 leading-snug">{r.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && query.length >= 2 && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-sm text-gray-400">
          No ICD-10 codes found for &quot;{query}&quot;
        </div>
      )}
    </div>
  );
}
