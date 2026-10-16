'use client';

import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import { ADD_BUTTON, FieldError, Label, NoteArea, REMOVE_BUTTON, Section } from './visits/form/parts';
import PatientSearch, { type PatientOption } from './patients/PatientSearch';
import PatientSummary, { usePatientSummary } from './visits/form/PatientSummary';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { useUnsavedChanges } from './hooks/useUnsavedChanges';
import { formatApiError } from './utils/apiError';

type Urgency = 'routine' | 'urgent' | 'stat';

interface TestRow {
  _key: string;
  testType: string;
  testCode: string;
  description: string;
}

/** One order the server accepted. */
export interface PlacedOrder {
  _id: string;
  requestCode?: string;
  testType: string;
}

const URGENCIES: { value: Urgency; label: string; hint: string }[] = [
  { value: 'routine', label: 'Routine', hint: 'In the normal run of work' },
  { value: 'urgent', label: 'Urgent', hint: 'Ahead of routine work' },
  { value: 'stat', label: 'STAT', hint: 'Right away' },
];

const COLS = 'sm:grid-cols-[minmax(0,1.4fr)_8rem_minmax(0,1.4fr)_2.25rem]';

let seq = 0;
const rowKey = () => `t${++seq}`;
const emptyRow = (): TestRow => ({ _key: rowKey(), testType: '', testCode: '', description: '' });

/**
 * Order one or more lab tests for a patient. Shared details (urgency, fasting, instructions,
 * the outside lab) apply to every test; each test becomes its own lab request with its own code,
 * so results come back and are reviewed test by test.
 */
export default function LabResultForm({
  initialPatient,
  initialVisitId,
  onPlaced,
  onCancel,
}: {
  initialPatient: PatientOption | null;
  initialVisitId?: string;
  onPlaced: (patient: PatientOption, orders: PlacedOrder[]) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const router = useRouter();
  const [patient, setPatient] = useState<PatientOption | null>(initialPatient);
  const [visitId, setVisitId] = useState(initialVisitId ?? '');
  const [tests, setTests] = useState<TestRow[]>(() => [emptyRow()]);
  const [urgency, setUrgency] = useState<Urgency>('routine');
  const [fasting, setFasting] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [preparation, setPreparation] = useState('');
  const [labName, setLabName] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder[]>([]);
  const focusRow = useRef<string | null>(null);

  const summary = usePatientSummary(patient?._id ?? null);
  const insights = useKeyedFetch<{ tests: { name: string; count: number }[] }>('/api/lab-results/insights');
  const common = (insights.value?.tests ?? []).slice(0, 8).map((t) => t.name);

  const filled = tests.filter((t) => t.testType.trim());
  const dirty = Boolean(patient && patient._id !== initialPatient?._id) || filled.length > 0 || Boolean(instructions || preparation || labName);
  useUnsavedChanges(dirty && !busy, 'This lab order is not placed yet. Leave anyway?');

  // Tests already out for this patient, so the same one isn't ordered twice by accident.
  const stillOut = useMemo(() => {
    const out = new Map<string, { code?: string; date: string }>();
    for (const l of summary.data?.labs ?? []) {
      const name = l.request?.testType?.trim().toLowerCase();
      if (name && !out.has(name)) out.set(name, { code: l.requestCode, date: l.orderDate });
    }
    return out;
  }, [summary.data]);

  const rowProblems = useMemo(() => {
    const out: Record<string, string> = {};
    const seen = new Set<string>();
    for (const t of tests) {
      const name = t.testType.trim().toLowerCase();
      if (!name) {
        if (t.testCode.trim() || t.description.trim()) out[t._key] = 'Name the test, or remove this row.';
        continue;
      }
      if (seen.has(name)) out[t._key] = `${t.testType.trim()} is already on this order.`;
      seen.add(name);
    }
    return out;
  }, [tests]);
  const patientProblem = patient ? null : 'Choose the patient these tests are for.';
  const noTests = filled.length === 0;
  const problemCount = (patientProblem ? 1 : 0) + Object.keys(rowProblems).length + (noTests ? 1 : 0);

  const updateRow = (key: string, patch: Partial<TestRow>) => setTests((ts) => ts.map((t) => (t._key === key ? { ...t, ...patch } : t)));
  const addRow = (testType = '') => {
    // A suggestion fills the first empty row before adding one.
    if (testType) {
      const empty = tests.find((t) => !t.testType.trim());
      if (empty) {
        updateRow(empty._key, { testType });
        return;
      }
    }
    const row = { ...emptyRow(), testType };
    if (!testType) focusRow.current = row._key;
    setTests((ts) => [...ts, row]);
  };
  const onList = (name: string) => tests.some((t) => t.testType.trim().toLowerCase() === name.toLowerCase());

  const focusFirstProblem = () =>
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('[data-lab-order] [aria-invalid="true"], [data-lab-order] [data-invalid="true"] input');
      el?.focus();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problemCount > 0 || !patient) {
      focusFirstProblem();
      return;
    }
    setBusy(true);
    setFailure(null);
    const done: PlacedOrder[] = [...placed];
    const left: TestRow[] = [];
    let firstError: string | null = null;
    // One request per test, in order; whatever fails stays on the form to try again.
    for (const t of tests) {
      if (!t.testType.trim()) continue;
      try {
        const res = await fetch('/api/lab-results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patient: patient._id,
            ...(visitId ? { visit: visitId } : {}),
            status: 'ordered',
            request: {
              testType: t.testType.trim(),
              ...(t.testCode.trim() ? { testCode: t.testCode.trim() } : {}),
              ...(t.description.trim() ? { description: t.description.trim() } : {}),
              urgency,
              fastingRequired: fasting,
              ...(instructions.trim() ? { specialInstructions: instructions.trim() } : {}),
              ...(preparation.trim() ? { preparationNotes: preparation.trim() } : {}),
            },
            ...(labName.trim() ? { thirdPartyLab: { labName: labName.trim(), integrationType: 'manual' } } : {}),
          }),
        });
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(formatApiError(json, `${t.testType.trim()} could not be ordered`));
        done.push({ _id: String(json.data._id), requestCode: json.data.requestCode, testType: t.testType.trim() });
      } catch (err) {
        firstError ??= err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'The server couldn’t be reached';
        left.push(t);
      }
    }
    setBusy(false);
    if (left.length === 0) {
      onPlaced(patient, done);
      return;
    }
    setPlaced(done);
    setTests(left);
    setFailure(
      done.length
        ? `${done.length} of ${done.length + left.length} tests were ordered. ${left.length === 1 ? 'The one' : `The ${left.length}`} still on the form ${left.length === 1 ? 'was' : 'were'} not: ${firstError}. Try again.`
        : `${firstError}. Nothing was ordered; try again.`
    );
  };

  const n = filled.length;
  const status = busy
    ? 'Placing the order…'
    : attempted && problemCount > 0
      ? `${problemCount === 1 ? 'One thing needs' : `${problemCount} things need`} fixing before the order can be placed.`
      : n === 0
        ? 'Add the tests to order.'
        : `Placing the order makes ${n === 1 ? 'one lab request' : `${n} lab requests`}, each with its own request form to print.`;

  return (
    <form data-lab-order onSubmit={submit} noValidate className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {failure && (
          <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            <div>
              <p>{failure}</p>
              {placed.length > 0 && (
                <p className="mt-1 font-normal">
                  Already ordered:{' '}
                  {placed.map((o, i) => (
                    <span key={o._id}>
                      <a href={`/lab-results/${o._id}`} target="_blank" rel="noopener" className={`rounded font-semibold underline underline-offset-2 ${FOCUS_RING}`}>
                        {o.testType}
                      </a>
                      {i < placed.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </p>
              )}
            </div>
            <button type="button" onClick={() => setFailure(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
              <Svg d={ICON.x} />
            </button>
          </div>
        )}

        <Section id={`${ids}-who`} title="Patient">
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div data-invalid={attempted && patientProblem ? 'true' : undefined}>
              <PatientSearch
                value={patient}
                onChange={(p) => {
                  setPatient(p);
                  setVisitId('');
                }}
                autoFocus={!initialPatient}
              />
              {attempted && patientProblem && <FieldError id={`${ids}-patient-err`}>{patientProblem}</FieldError>}
            </div>
            {patient && (summary.data?.visits.length ?? 0) > 0 && (
              <div>
                <Label htmlFor={`${ids}-visit`} optional>
                  From visit
                </Label>
                <select id={`${ids}-visit`} value={visitId} onChange={(e) => setVisitId(e.target.value)} className={FIELD}>
                  <option value="">Not linked to a visit</option>
                  {summary.data!.visits.map((v) => (
                    <option key={v._id} value={v._id}>
                      {v.visitCode} · {new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {v.chiefComplaint ? ` · ${v.chiefComplaint.slice(0, 40)}` : ''}
                    </option>
                  ))}
                  {visitId && !summary.data!.visits.some((v) => v._id === visitId) && <option value={visitId}>The visit you came from</option>}
                </select>
                <p className="mt-1.5 text-xs text-gray-500">Linked tests show on the visit under “From this visit”.</p>
              </div>
            )}
          </div>
        </Section>

        <Section
          id={`${ids}-tests`}
          title="Tests"
          hint="Each test gets its own request code, so results come back and are reviewed one by one."
        >
          {common.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
              <span className="text-sm text-gray-500">Often ordered here:</span>
              {common.map((name) => {
                const on = onList(name);
                return (
                  <button
                    key={name}
                    type="button"
                    disabled={on}
                    onClick={() => addRow(name)}
                    aria-label={on ? `${name} is on the order` : `Add ${name}`}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-medium transition-colors ${on ? 'cursor-default border-brand-teal/30 bg-brand-teal-light text-brand-teal-deep' : `border-gray-300 bg-white text-gray-700 hover:border-brand-teal-dark hover:bg-brand-teal-light/50 hover:text-brand-teal-deep ${FOCUS_RING}`}`}
                  >
                    <Svg d={on ? ICON.check : 'M12 4v16m8-8H4'} className="h-3.5 w-3.5" />
                    {name}
                  </button>
                );
              })}
            </div>
          )}
          <div aria-hidden="true" className={`hidden gap-3 px-5 pt-3 text-xs font-medium text-gray-500 sm:grid ${COLS}`}>
            <span>Test</span>
            <span>Code</span>
            <span>Details for the lab</span>
          </div>
          <ul className="divide-y divide-gray-100 sm:divide-y-0">
            {tests.map((t, i) => {
              const rid = `${ids}-t${t._key}`;
              const err = attempted || t.testType.trim() ? rowProblems[t._key] : undefined;
              const out = t.testType.trim() ? stillOut.get(t.testType.trim().toLowerCase()) : undefined;
              const label = t.testType.trim() || `test ${i + 1}`;
              return (
                <li key={t._key} className={`motion-row-in grid gap-3 px-5 py-3 sm:items-start sm:py-2 ${COLS}`}>
                  <div>
                    <RowLabel htmlFor={`${rid}-n`}>Test</RowLabel>
                    <input
                      ref={(el) => {
                        if (el && focusRow.current === t._key) {
                          focusRow.current = null;
                          el.focus();
                        }
                      }}
                      id={`${rid}-n`}
                      value={t.testType}
                      onChange={(e) => updateRow(t._key, { testType: e.target.value })}
                      list={`${ids}-common`}
                      placeholder="e.g. CBC, Urinalysis, FBS"
                      maxLength={300}
                      aria-invalid={Boolean(err) || (attempted && noTests && i === 0)}
                      aria-describedby={err ? `${rid}-err` : out ? `${rid}-out` : undefined}
                      className={`${FIELD} ${err || (attempted && noTests && i === 0) ? 'border-red-400' : ''}`}
                    />
                  </div>
                  <div>
                    <RowLabel htmlFor={`${rid}-c`}>Code</RowLabel>
                    <input id={`${rid}-c`} value={t.testCode} onChange={(e) => updateRow(t._key, { testCode: e.target.value })} placeholder="Optional" maxLength={100} className={`${FIELD} font-mono`} />
                  </div>
                  <div>
                    <RowLabel htmlFor={`${rid}-d`}>Details for the lab</RowLabel>
                    <input id={`${rid}-d`} value={t.description} onChange={(e) => updateRow(t._key, { description: e.target.value })} placeholder="Optional, e.g. with differential count" maxLength={2000} className={FIELD} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setTests((ts) => (ts.length === 1 ? [emptyRow()] : ts.filter((x) => x._key !== t._key)))}
                    aria-label={`Remove ${label}`}
                    title={`Remove ${label}`}
                    className={`${REMOVE_BUTTON} justify-self-end sm:mt-0.5 sm:justify-self-auto`}
                  >
                    <Svg d={ICON.x} />
                  </button>
                  {(err || out) && (
                    <div className="sm:col-span-full sm:-mt-1">
                      {err ? (
                        <FieldError id={`${rid}-err`}>{err}</FieldError>
                      ) : (
                        out && (
                          <p id={`${rid}-out`} className="flex items-start gap-1.5 text-sm text-amber-800">
                            <Svg d={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {t.testType.trim()} is already waiting for a result{out.code ? ` (${out.code}` : ''}
                            {out.code ? `, ordered ${new Date(out.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : ''}. Order it again only if a new sample is needed.
                          </p>
                        )
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <datalist id={`${ids}-common`}>
            {common.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div className="px-5 py-4">
            <button type="button" onClick={() => addRow()} className={ADD_BUTTON}>
              <Svg d="M12 4v16m8-8H4" />
              Add test
            </button>
            {attempted && noTests && <FieldError id={`${ids}-none`}>Add at least one test.</FieldError>}
          </div>
        </Section>

        <Section id={`${ids}-how`} title="For every test on this order">
          <div className="grid gap-4 px-5 py-4">
            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-gray-700">Urgency</legend>
              <div className="inline-flex flex-wrap gap-1 rounded-md border border-gray-300 bg-white p-1">
                {URGENCIES.map((u) => (
                  <label
                    key={u.value}
                    title={u.hint}
                    className="cursor-pointer rounded px-3.5 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 has-[:checked]:bg-brand-teal-dark has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1"
                  >
                    <input type="radio" name={`${ids}-urgency`} value={u.value} checked={urgency === u.value} onChange={() => setUrgency(u.value)} className="sr-only" />
                    {u.label}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-gray-500">{URGENCIES.find((u) => u.value === urgency)?.hint}.</p>
            </fieldset>

            <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-gray-900">
              <input type="checkbox" checked={fasting} onChange={(e) => setFasting(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-brand-teal-dark" />
              The patient must fast before the sample is taken
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor={`${ids}-ins`} optional>
                  Instructions for the lab
                </Label>
                <NoteArea id={`${ids}-ins`} rows={2} value={instructions} onChange={setInstructions} placeholder="e.g. Rule out dengue; repeat platelets if low" />
              </div>
              <div>
                <Label htmlFor={`${ids}-prep`} optional>
                  Preparation for the patient
                </Label>
                <NoteArea id={`${ids}-prep`} rows={2} value={preparation} onChange={setPreparation} placeholder={fasting ? 'e.g. No food after 10 PM; water is fine' : 'e.g. First morning urine sample'} />
              </div>
            </div>

            <div className="sm:max-w-sm">
              <Label htmlFor={`${ids}-lab`} optional>
                Outside lab
              </Label>
              <input id={`${ids}-lab`} value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="Leave empty if done here" maxLength={300} className={FIELD} />
            </div>
          </div>
        </Section>

        <div className="motion-tray-in sticky bottom-4 z-20 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-[0_8px_30px_rgb(15,23,42,0.1)] sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${attempted && problemCount > 0 && !busy ? 'font-medium text-red-700' : 'text-gray-600'}`} aria-live="polite">
            {status}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (dirty && !window.confirm('Discard this lab order?')) return;
                onCancel();
              }}
              disabled={busy}
              className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
            >
              <Svg d={ICON.check} />
              {busy ? 'Ordering…' : n > 1 ? `Order ${n} tests` : 'Order test'}
            </button>
          </div>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
        {patient ? (
          summary.error ? null : <PatientSummary summary={summary} />
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 px-5 py-6 text-center text-sm text-gray-500">Choose the patient to see the tests still waiting for them, their conditions and last visits here.</div>
        )}
      </aside>
    </form>
  );
}

function RowLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-gray-600 sm:sr-only">
      {children}
    </label>
  );
}
