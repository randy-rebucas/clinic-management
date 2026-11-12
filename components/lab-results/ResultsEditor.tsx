'use client';

import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { FieldError, NoteArea, REMOVE_BUTTON, Suggestions, useCombobox } from '../visits/form/parts';
import { formatApiError } from '../utils/apiError';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { flagFor, payloadFrom, rowKey, rowProblems, type Flag, type ResultRow } from './results';
import { panelFor, type PanelParameter } from './panels';

const COLS = 'sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_7.5rem_2.25rem]';

/** One lab request in the editor. An order of several tests gives one section per test. */
export interface ResultsSection {
  labId: string;
  /** Test name and request code, shown as the section's heading when there are several. */
  testType?: string;
  requestCode?: string;
  initialRows: ResultRow[];
  initialInterpretation: string;
}

/**
 * Enter or correct results in place. Each row is one value: name, result, the lab's reference
 * range and a flag that sets itself when value and range are both numbers (and can be changed).
 *
 * With several sections (the tests of one order still at the lab), every test's values are
 * entered here and each is saved to its own request; a test left empty stays at the lab.
 * Saving a result that was still at the lab marks it in.
 */
export default function ResultsEditor({
  sections,
  initialDate,
  waiting,
  today,
  onSaved,
  onCancel,
}: {
  sections: ResultsSection[];
  /** yyyy-MM-dd */
  initialDate: string;
  /** Still at the lab: saving marks it as in. */
  waiting: boolean;
  today: string;
  /** How many requests were saved. */
  onSaved: (saved: number) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const router = useRouter();
  const multi = sections.length > 1;
  const [rows, setRows] = useState<Record<string, ResultRow[]>>(() => Object.fromEntries(sections.map((s) => [s.labId, s.initialRows])));
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(sections.map((s) => [s.labId, s.initialInterpretation])));
  const [date, setDate] = useState(initialDate);
  // Sections already saved when a later one failed: they leave the form.
  const [saved, setSaved] = useState<string[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusRow = useRef<string | null>(null);
  const [initial] = useState(() => snapshotOf(rows, notes, date));

  const open = sections.filter((s) => !saved.includes(s.labId));
  const dirty = snapshotOf(rows, notes, date) !== initial;
  useUnsavedChanges(dirty && !busy, 'The results you entered are not saved. Leave anyway?');

  const problems = useMemo(() => Object.assign({}, ...open.map((s) => rowProblems(rows[s.labId] ?? []))) as Record<string, string>, [open, rows]);
  const payloads = Object.fromEntries(open.map((s) => [s.labId, payloadFrom(rows[s.labId] ?? [])]));
  const filledIn = (labId: string) => Object.keys(payloads[labId]?.results ?? {}).length;
  const filled = open.reduce((n, s) => n + filledIn(s.labId), 0);
  const dateProblem = date && date > today ? 'The result date is in the future.' : null;
  const problemCount = Object.keys(problems).length + (dateProblem ? 1 : 0) + (filled === 0 ? 1 : 0);

  const update = (labId: string, key: string, patch: Partial<ResultRow>) =>
    setRows((all) => ({
      ...all,
      [labId]: (all[labId] ?? []).map((r) => {
        if (r._key !== key) return r;
        const next = { ...r, ...patch };
        // A new value or range re-reads the flag when both are numbers; a hand-picked flag is otherwise kept.
        if (('value' in patch || 'range' in patch) && !('flag' in patch)) {
          const auto = flagFor(next.value, next.range);
          if (auto) next.flag = auto;
        }
        return next;
      }),
    }));
  const add = (labId: string) => {
    const _key = rowKey();
    focusRow.current = _key;
    setRows((all) => ({ ...all, [labId]: [...(all[labId] ?? []), { _key, name: '', value: '', range: '', flag: '' }] }));
  };
  const remove = (labId: string, key: string) => setRows((all) => ({ ...all, [labId]: (all[labId] ?? []).filter((x) => x._key !== key) }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problemCount > 0) return;
    setBusy(true);
    setError(null);
    // Several tests: only those with a value are saved; the rest stay at the lab.
    const targets = multi ? open.filter((s) => filledIn(s.labId) > 0) : open;
    const done: string[] = [];
    const failed: string[] = [];
    let firstError = '';
    for (const s of targets) {
      try {
        const res = await fetch(`/api/lab-results/${s.labId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payloads[s.labId],
            interpretation: (notes[s.labId] ?? '').trim(),
            ...(date ? { resultDate: date } : {}),
            ...(waiting ? { status: 'completed' } : {}),
          }),
        });
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(formatApiError(json, 'The results could not be saved'));
        done.push(s.labId);
      } catch (err) {
        firstError ||= err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'The server couldn’t be reached';
        failed.push(s.testType || 'the results');
      }
    }
    setBusy(false);
    if (failed.length === 0) {
      onSaved(done.length + saved.length);
      return;
    }
    setSaved((prev) => [...prev, ...done]);
    setError(
      multi && (done.length || saved.length)
        ? `${failed.join(', ')} could not be saved: ${firstError}. The others are saved; try again.`
        : `${firstError}. Your entries are still here; try again.`
    );
  };

  const status = error
    ? error
    : attempted && problemCount > 0
      ? filled === 0
        ? 'Enter at least one value, or attach the lab’s report below instead.'
        : `${problemCount === 1 ? 'One thing needs' : `${problemCount} things need`} fixing.`
      : waiting
        ? multi
          ? 'Saving marks each test with a value as in and tells the doctor who ordered them; a test left empty stays at the lab. With automatic lab messages on in Settings, the patient is told too.'
          : 'Saving marks the result as in and tells the doctor who ordered it. With automatic lab messages on in Settings, the patient is told too.'
        : dirty
          ? 'Unsaved changes.'
          : 'No changes yet.';

  const ready = multi ? open.filter((s) => filledIn(s.labId) > 0).length : 0;

  return (
    <form onSubmit={save} noValidate className="motion-panel-in">
      {open.map((s, si) => {
        const sid = `${ids}-s${si}`;
        const sectionRows = rows[s.labId] ?? [];
        const count = filledIn(s.labId);
        // A panel's parameters, offered as the name is typed; ones already on the form drop out.
        const panel = panelFor(s.testType) ?? [];
        const unitOf = new Map(panel.map((p) => [p.name.toLowerCase(), p.unit]));
        const used = new Set(sectionRows.map((r) => r.name.trim().toLowerCase()));
        const offered = panel.filter((p) => !used.has(p.name.toLowerCase()));
        return (
          <section key={s.labId} aria-labelledby={multi ? `${sid}-h` : undefined} className={multi && si > 0 ? 'border-t border-gray-200' : ''}>
            {multi && (
              <div className="flex flex-wrap items-baseline justify-between gap-2 bg-gray-50/60 px-5 py-2.5">
                <h3 id={`${sid}-h`} className="text-sm font-semibold text-gray-900">
                  {s.testType || 'Test'}
                  {s.requestCode && <span className="ml-2 font-mono text-xs font-normal text-gray-500">{s.requestCode}</span>}
                </h3>
                <span className={`text-xs ${count ? 'font-medium text-brand-teal-deep' : 'text-gray-500'}`}>
                  {count ? `${count} ${count === 1 ? 'value' : 'values'}` : waiting ? 'Empty: stays at the lab' : 'No values'}
                </span>
              </div>
            )}
            <div aria-hidden="true" className={`hidden gap-3 px-5 pt-4 text-xs font-medium text-gray-500 sm:grid ${COLS}`}>
              <span>Test</span>
              <span>Result</span>
              <span>Reference range</span>
              <span>Flag</span>
            </div>
            <ul className="divide-y divide-gray-100 sm:divide-y-0">
              {sectionRows.map((r, i) => {
                const rid = `${sid}-r${r._key}`;
                const err = attempted || r.name.trim() ? problems[r._key] : undefined;
                const label = r.name.trim() || `test ${i + 1}`;
                const unit = unitOf.get(r.name.trim().toLowerCase());
                return (
                  <li key={r._key} className={`motion-row-in grid gap-3 px-5 py-3 sm:items-start sm:py-2 ${COLS}`}>
                    <div>
                      <RowLabel htmlFor={`${rid}-n`}>Test</RowLabel>
                      <ParameterField
                        id={`${rid}-n`}
                        value={r.name}
                        onChange={(v) => update(s.labId, r._key, { name: v })}
                        onPicked={() => document.getElementById(`${rid}-v`)?.focus()}
                        options={offered}
                        inputRef={(el) => {
                          if (el && focusRow.current === r._key) {
                            focusRow.current = null;
                            el.focus();
                          }
                        }}
                        placeholder={panel.length ? `Type to search, e.g. ${offered[0]?.name ?? panel[0].name}` : 'e.g. Hemoglobin'}
                        invalid={Boolean(err)}
                        describedBy={err ? `${rid}-err` : undefined}
                      />
                    </div>
                    <div>
                      <RowLabel htmlFor={`${rid}-v`}>Result</RowLabel>
                      <input id={`${rid}-v`} value={r.value} onChange={(e) => update(s.labId, r._key, { value: e.target.value })} placeholder={unit ?? '13.2 g/dL'} maxLength={200} className={`${FIELD} font-mono tabular-nums`} />
                    </div>
                    <div>
                      <RowLabel htmlFor={`${rid}-g`}>Reference range</RowLabel>
                      <input id={`${rid}-g`} value={r.range} onChange={(e) => update(s.labId, r._key, { range: e.target.value })} placeholder={unit ? 'As on the report' : '12–16 g/dL'} maxLength={200} className={`${FIELD} font-mono tabular-nums`} />
                    </div>
                    <div>
                      <RowLabel htmlFor={`${rid}-f`}>Flag</RowLabel>
                      <select id={`${rid}-f`} value={r.flag} onChange={(e) => update(s.labId, r._key, { flag: e.target.value as '' | Flag })} className={FIELD}>
                        <option value="">—</option>
                        <option value="normal">In range</option>
                        <option value="high">High</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(s.labId, r._key)}
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
            <div className={`flex flex-col gap-3 px-5 py-3 ${multi ? 'sm:flex-row sm:items-start' : ''}`}>
              {/* A panel (CBC, urinalysis…) reports several values; this adds a line for one more. */}
              <button
                type="button"
                onClick={() => add(s.labId)}
                aria-label={`Add a parameter${s.testType ? ` to ${s.testType}` : ''}`}
                className={`inline-flex shrink-0 items-center gap-1 self-start rounded px-1 py-1.5 text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}
              >
                <Svg d="M12 4v16m8-8H4" className="h-3.5 w-3.5" />
                Add parameter
              </button>
              {multi && (
                <div className="min-w-0 flex-1">
                  <label htmlFor={`${sid}-int`} className="sr-only">
                    Interpretation for {s.testType ?? 'this test'}
                  </label>
                  <NoteArea id={`${sid}-int`} rows={1} value={notes[s.labId] ?? ''} onChange={(v) => setNotes((n) => ({ ...n, [s.labId]: v }))} placeholder={`Interpretation for ${s.testType ?? 'this test'} (optional)`} />
                </div>
              )}
            </div>
          </section>
        );
      })}

      <div className={`grid gap-4 border-t border-gray-200 px-5 py-4 ${multi ? '' : 'sm:grid-cols-[10rem_minmax(0,1fr)]'}`}>
        <div className={multi ? 'sm:max-w-[10rem]' : ''}>
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
        {!multi && open[0] && (
          <div>
            <label htmlFor={`${ids}-int`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Interpretation <span className="font-normal text-gray-500">(optional)</span>
            </label>
            <NoteArea id={`${ids}-int`} rows={2} value={notes[open[0].labId] ?? ''} onChange={(v) => setNotes((n) => ({ ...n, [open[0].labId]: v }))} placeholder="e.g. Mild anaemia; repeat CBC in 4 weeks" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-b-lg border-t border-gray-200 bg-gray-50/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
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
            {busy ? 'Saving…' : waiting ? (multi && ready > 1 ? `Save ${ready} results` : 'Save results') : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
  );
}

const snapshotOf = (rows: Record<string, ResultRow[]>, notes: Record<string, string>, date: string) =>
  JSON.stringify([Object.entries(rows).map(([id, rs]) => [id, rs.map((r) => [r.name, r.value, r.range, r.flag])]), notes, date]);

function RowLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-gray-600 sm:sr-only">
      {children}
    </label>
  );
}

/**
 * A result line's name: type freely, or pick one of the test's standard parameters from the
 * list that narrows as you type (arrow keys and Enter work). Picking moves on to the result.
 */
function ParameterField({
  id,
  value,
  onChange,
  onPicked,
  options,
  inputRef,
  placeholder,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onPicked: () => void;
  options: PanelParameter[];
  /** Lets the editor focus a line it just added. */
  inputRef: (el: HTMLInputElement | null) => void;
  placeholder: string;
  invalid: boolean;
  describedBy?: string;
}) {
  const q = value.trim().toLowerCase();
  // Names starting with what was typed first, then names containing it.
  const items = q
    ? [...options.filter((o) => o.name.toLowerCase().startsWith(q)), ...options.filter((o) => !o.name.toLowerCase().startsWith(q) && o.name.toLowerCase().includes(q))].filter(
        (o) => o.name.toLowerCase() !== q
      )
    : options;
  const box = useCombobox<PanelParameter>(items, (o) => {
    onChange(o.name);
    onPicked();
  });
  const listId = `${id}-list`;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role={options.length ? 'combobox' : undefined}
        aria-expanded={options.length ? box.show : undefined}
        aria-controls={options.length ? listId : undefined}
        aria-autocomplete={options.length ? 'list' : undefined}
        aria-activedescendant={box.show && box.highlight >= 0 ? `${listId}-${box.highlight}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          box.open();
          box.reset();
        }}
        onFocus={box.open}
        onBlur={box.close}
        onKeyDown={box.onKeyDown}
        placeholder={placeholder}
        maxLength={100}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`${FIELD} ${invalid ? 'border-red-400' : ''}`}
      />
      {box.show && (
        <Suggestions
          id={listId}
          label="Parameters of this test"
          items={items}
          highlight={box.highlight}
          onHighlight={box.setHighlight}
          onPick={box.pick}
          render={(o) => (
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-gray-900">{o.name}</span>
              {o.unit && !o.unit.startsWith('e.g.') && <span className="font-mono text-xs text-gray-500">{o.unit}</span>}
            </span>
          )}
        />
      )}
    </div>
  );
}
