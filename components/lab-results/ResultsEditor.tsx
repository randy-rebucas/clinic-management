'use client';

import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { ADD_BUTTON, FieldError, NoteArea, REMOVE_BUTTON } from '../visits/form/parts';
import { formatApiError } from '../utils/apiError';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { flagFor, payloadFrom, rowKey, rowProblems, type Flag, type ResultRow } from './results';

const COLS = 'sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_7.5rem_2.25rem]';

/**
 * Enter or correct a result's values in place. Each row is one test: name, value, the lab's
 * reference range and a flag that sets itself when value and range are both numbers (and can
 * be changed). Saving a result that was still at the lab marks it in.
 */
export default function ResultsEditor({
  labId,
  initialRows,
  initialInterpretation,
  initialDate,
  waiting,
  today,
  onSaved,
  onCancel,
}: {
  labId: string;
  initialRows: ResultRow[];
  initialInterpretation: string;
  /** yyyy-MM-dd */
  initialDate: string;
  /** Still at the lab: saving marks it as in. */
  waiting: boolean;
  today: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [interpretation, setInterpretation] = useState(initialInterpretation);
  const [date, setDate] = useState(initialDate);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusRow = useRef<string | null>(null);
  const [initial] = useState(() => snapshotOf(initialRows, initialInterpretation, initialDate));

  const snapshot = snapshotOf(rows, interpretation, date);
  const dirty = snapshot !== initial;
  useUnsavedChanges(dirty && !busy, 'The results you entered are not saved. Leave anyway?');

  const problems = useMemo(() => rowProblems(rows), [rows]);
  const payload = payloadFrom(rows);
  const filled = Object.keys(payload.results).length;
  const dateProblem = date && date > today ? 'The result date is in the future.' : null;
  const problemCount = Object.keys(problems).length + (dateProblem ? 1 : 0) + (filled === 0 ? 1 : 0);

  const update = (key: string, patch: Partial<ResultRow>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r._key !== key) return r;
        const next = { ...r, ...patch };
        // A new value or range re-reads the flag when both are numbers; a hand-picked flag is otherwise kept.
        if (('value' in patch || 'range' in patch) && !('flag' in patch)) {
          const auto = flagFor(next.value, next.range);
          if (auto) next.flag = auto;
        }
        return next;
      })
    );
  const add = () => {
    const _key = rowKey();
    focusRow.current = _key;
    setRows((rs) => [...rs, { _key, name: '', value: '', range: '', flag: '' }]);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problemCount > 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lab-results/${labId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          interpretation: interpretation.trim(),
          ...(date ? { resultDate: date } : {}),
          ...(waiting ? { status: 'completed' } : {}),
        }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(formatApiError(json, 'The results could not be saved'));
        return;
      }
      onSaved();
    } catch {
      setError('The server couldn’t be reached. Your entries are still here; try again.');
    } finally {
      setBusy(false);
    }
  };

  const status = error
    ? error
    : attempted && problemCount > 0
      ? filled === 0
        ? 'Enter at least one value, or attach the lab’s report below instead.'
        : `${problemCount === 1 ? 'One thing needs' : `${problemCount} things need`} fixing.`
      : waiting
        ? 'Saving marks the result as in. If automatic lab messages are on in Settings, the patient is told it’s ready.'
        : dirty
          ? 'Unsaved changes.'
          : 'No changes yet.';

  return (
    <form onSubmit={save} noValidate className="motion-panel-in">
      <div aria-hidden="true" className={`hidden gap-3 px-5 pt-4 text-xs font-medium text-gray-500 sm:grid ${COLS}`}>
        <span>Test</span>
        <span>Result</span>
        <span>Reference range</span>
        <span>Flag</span>
      </div>
      <ul className="divide-y divide-gray-100 sm:divide-y-0">
        {rows.map((r, i) => {
          const rid = `${ids}-r${r._key}`;
          const err = attempted || r.name.trim() ? problems[r._key] : undefined;
          const label = r.name.trim() || `test ${i + 1}`;
          return (
            <li key={r._key} className={`motion-row-in grid gap-3 px-5 py-3 sm:items-start sm:py-2 ${COLS}`}>
              <div>
                <RowLabel htmlFor={`${rid}-n`}>Test</RowLabel>
                <input
                  ref={(el) => {
                    if (el && focusRow.current === r._key) {
                      focusRow.current = null;
                      el.focus();
                    }
                  }}
                  id={`${rid}-n`}
                  value={r.name}
                  onChange={(e) => update(r._key, { name: e.target.value })}
                  placeholder="e.g. Hemoglobin"
                  maxLength={100}
                  aria-invalid={Boolean(err)}
                  aria-describedby={err ? `${rid}-err` : undefined}
                  className={`${FIELD} ${err ? 'border-red-400' : ''}`}
                />
              </div>
              <div>
                <RowLabel htmlFor={`${rid}-v`}>Result</RowLabel>
                <input id={`${rid}-v`} value={r.value} onChange={(e) => update(r._key, { value: e.target.value })} placeholder="13.2 g/dL" maxLength={200} className={`${FIELD} font-mono tabular-nums`} />
              </div>
              <div>
                <RowLabel htmlFor={`${rid}-g`}>Reference range</RowLabel>
                <input id={`${rid}-g`} value={r.range} onChange={(e) => update(r._key, { range: e.target.value })} placeholder="12–16 g/dL" maxLength={200} className={`${FIELD} font-mono tabular-nums`} />
              </div>
              <div>
                <RowLabel htmlFor={`${rid}-f`}>Flag</RowLabel>
                <select id={`${rid}-f`} value={r.flag} onChange={(e) => update(r._key, { flag: e.target.value as '' | Flag })} className={FIELD}>
                  <option value="">—</option>
                  <option value="normal">In range</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((x) => x._key !== r._key))}
                aria-label={`Remove ${label}`}
                title={`Remove ${label}`}
                className={`${REMOVE_BUTTON} justify-self-end sm:mt-0.5 sm:justify-self-auto`}
              >
                <Svg d={ICON.x} />
              </button>
              {err && (
                <div className="sm:col-span-full sm:-mt-1">
                  <FieldError id={`${rid}-err`}>{err}</FieldError>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="px-5 py-3">
        <button type="button" onClick={add} className={ADD_BUTTON}>
          <Svg d="M12 4v16m8-8H4" />
          Add test
        </button>
      </div>

      <div className="grid gap-4 border-t border-gray-200 px-5 py-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div>
          <label htmlFor={`${ids}-date`} className="mb-1.5 block text-sm font-medium text-gray-700">
            Result date
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={Boolean(dateProblem)}
            aria-describedby={dateProblem ? `${ids}-date-err` : undefined}
            className={`${FIELD} font-mono tabular-nums ${dateProblem ? 'border-red-400' : ''}`}
          />
          {dateProblem && <FieldError id={`${ids}-date-err`}>{dateProblem}</FieldError>}
        </div>
        <div>
          <label htmlFor={`${ids}-int`} className="mb-1.5 block text-sm font-medium text-gray-700">
            Interpretation <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <NoteArea id={`${ids}-int`} rows={2} value={interpretation} onChange={setInterpretation} placeholder="e.g. Mild anaemia; repeat CBC in 4 weeks" />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className={`text-sm ${error || (attempted && problemCount > 0) ? 'font-medium text-red-700' : 'text-gray-600'}`} role={error ? 'alert' : undefined} aria-live="polite">
          {status}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (dirty && !window.confirm('Discard the results you entered?')) return;
              onCancel();
            }}
            disabled={busy}
            className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || (!waiting && !dirty)}
            aria-busy={busy}
            className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            <Svg d={ICON.check} />
            {busy ? 'Saving…' : waiting ? 'Save results' : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
  );
}

const snapshotOf = (rows: ResultRow[], interpretation: string, date: string) =>
  JSON.stringify([rows.map((r) => [r.name, r.value, r.range, r.flag]), interpretation, date]);

function RowLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-gray-600 sm:sr-only">
      {children}
    </label>
  );
}
