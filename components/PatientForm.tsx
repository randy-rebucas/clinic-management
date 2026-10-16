'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import { ADD_BUTTON, FieldError, Label, NoteArea, REMOVE_BUTTON, Section } from './visits/form/parts';
import { useUnsavedChanges } from './hooks/useUnsavedChanges';
import {
  CIVIL_STATUSES,
  CONDITION_STATUSES,
  CONTACT_RELATIONSHIPS,
  FAMILY_RELATIONS,
  SERVER_FIELDS,
  SEVERITIES,
  ageText,
  draftFrom,
  localDateKey,
  payloadOf,
  problemsOf,
  rowKey,
  snapshot,
  type FieldKey,
  type PatientDraft,
  type PatientRecord,
  type Sex,
} from './patients/form';

interface PatientFormProps {
  /** The record being edited; omit to register a new patient. */
  patient?: PatientRecord | null;
  /** Called with the patient's id once the server has saved them. */
  onSaved: (id: string) => void;
  onCancel: () => void;
}

const SEXES: { value: Exclude<Sex, ''>; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
];

export default function PatientForm({ patient, onSaved, onCancel }: PatientFormProps) {
  const ids = useId();
  const router = useRouter();
  const editing = Boolean(patient?._id);

  const [today] = useState(() => localDateKey(new Date()));
  const [draft, setDraft] = useState<PatientDraft>(() => draftFrom(patient));
  const [savedSnap, setSavedSnap] = useState(() => snapshot(draftFrom(patient)));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [serverProblems, setServerProblems] = useState<Partial<Record<FieldKey, string>>>({});
  const failureRef = useRef<HTMLDivElement>(null);
  const focusRow = useRef<string | null>(null);

  const dirty = snapshot(draft) !== savedSnap;
  useUnsavedChanges(dirty && !done, editing ? 'Your changes to this patient are not saved. Leave anyway?' : 'This registration is not saved. Leave anyway?');

  const problems = useMemo(() => problemsOf(draft, today), [draft, today]);
  const problemCount = Object.keys(problems.fields).length + Object.keys(problems.rows).length;
  const shown: Partial<Record<FieldKey, string>> = { ...serverProblems, ...(attempted ? problems.fields : {}) };
  const rowProblem = (key: string) => (attempted ? problems.rows[key] : undefined);

  const matches = usePossibleMatches(editing ? null : matchQuery(draft));

  const set = <K extends FieldKey>(key: K, value: PatientDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setServerProblems((p) => {
      if (!(key in p)) return p;
      const next = { ...p };
      delete next[key];
      return next;
    });
  };

  // --- Repeating rows ------------------------------------------------------------

  type ListKey = 'allergies' | 'conditions' | 'family';
  const addRow = (list: ListKey) => {
    const _key = rowKey();
    focusRow.current = _key;
    setDraft((d) => {
      if (list === 'allergies') return { ...d, allergies: [...d.allergies, { _key, substance: '', reaction: '', severity: 'unknown' }] };
      if (list === 'conditions') return { ...d, conditions: [...d.conditions, { _key, condition: '', status: 'active', diagnosisDate: '', notes: '' }] };
      return { ...d, family: [...d.family, { _key, condition: '', relation: '' }] };
    });
  };
  const updateRow = <L extends ListKey>(list: L, key: string, patch: Partial<PatientDraft[L][number]>) =>
    setDraft((d) => ({ ...d, [list]: (d[list] as PatientDraft[L][number][]).map((r) => (r._key === key ? { ...r, ...patch } : r)) }));
  const removeRow = (list: ListKey, key: string) => setDraft((d) => ({ ...d, [list]: (d[list] as { _key: string }[]).filter((r) => r._key !== key) }));
  const focusNewRow = (key: string) => (el: HTMLInputElement | null) => {
    if (el && focusRow.current === key) {
      focusRow.current = null;
      el.focus();
    }
  };

  // --- Save ----------------------------------------------------------------------

  const focusFirstProblem = () => {
    requestAnimationFrame(() => {
      const marked = document.querySelector<HTMLElement>('[data-patient-form] [aria-invalid="true"], [data-patient-form] [data-invalid="true"]');
      const el = marked?.matches('input,select,textarea') ? marked : marked?.querySelector<HTMLElement>('input,select,textarea');
      el?.focus();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  const fail = (message: string) => {
    setFailure(message);
    requestAnimationFrame(() => failureRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || done) return;
    setAttempted(true);
    if (problemCount > 0) {
      focusFirstProblem();
      return;
    }
    setSaving(true);
    setFailure(null);
    try {
      const res = await fetch(editing ? `/api/patients/${patient!._id}` : '/api/patients', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadOf(draft)),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        const issues: { path?: string; message?: string }[] = Array.isArray(json?.issues) ? json.issues : [];
        const mapped: Partial<Record<FieldKey, string>> = {};
        let unplaced = 0;
        for (const issue of issues) {
          const field = issue.path ? SERVER_FIELDS[issue.path] : undefined;
          if (field && !mapped[field]) mapped[field] = sentence(issue.message || 'Check this field.');
          else if (!field) unplaced++;
        }
        setServerProblems(mapped);
        const placed = Object.keys(mapped).length;
        if (placed && !unplaced) {
          setFailure(`${placed === 1 ? 'One field was' : `${placed} fields were`} not accepted. ${placed === 1 ? 'It is' : 'They are'} marked below.`);
          focusFirstProblem();
        } else if (json?.error && json.error !== 'Validation failed') {
          fail(json.error);
        } else {
          fail(`The patient couldn’t be saved (error ${res.status}). Everything you entered is still here; try again.`);
        }
        return;
      }
      setDone(true);
      setSavedSnap(snapshot(draft));
      onSaved(String(json.data?._id ?? patient?._id));
    } catch {
      fail('The server couldn’t be reached. Everything you entered is still here; try again.');
    } finally {
      setSaving(false);
    }
  };

  const age = ageText(draft.dateOfBirth, today);
  const civilOptions = draft.civilStatus && !CIVIL_STATUSES.includes(draft.civilStatus) ? [...CIVIL_STATUSES, draft.civilStatus] : CIVIL_STATUSES;
  const id = (name: string) => `${ids}-${name}`;
  const field = (key: FieldKey) => ({ id: id(key), value: draft[key] as string, onChange: (v: string) => set(key, v as never), error: shown[key] });

  const status = saving
    ? editing
      ? 'Saving the changes…'
      : 'Registering…'
    : done
      ? 'Saved. Opening the record…'
      : attempted && problemCount > 0
        ? `${problemCount === 1 ? 'One thing needs' : `${problemCount} things need`} fixing before this can be saved.`
        : matches.length > 0
          ? 'Check the possible match above before registering.'
          : editing
            ? dirty
              ? 'Unsaved changes.'
              : 'No changes yet.'
            : dirty
              ? 'Saving gives them the next patient code and opens their record.'
              : 'Fields not marked optional are needed to register.';
  const statusTone = attempted && problemCount > 0 && !saving ? 'font-medium text-red-700' : matches.length > 0 && !saving && !done ? 'font-medium text-amber-800' : 'text-gray-600';

  return (
    <form data-patient-form onSubmit={handleSubmit} noValidate autoComplete="off" className="flex flex-col gap-6">
      {failure && (
        <div ref={failureRef} role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <p>{failure}</p>
          <button type="button" onClick={() => setFailure(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICON.x} />
          </button>
        </div>
      )}

      {/* Personal details */}
      <Section id={id('personal')} title="Personal details" hint="As written on their ID.">
        <div className="grid gap-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_7rem]">
            <TextField label="First name" {...field('firstName')} maxLength={100} />
            <TextField label="Middle name" optional {...field('middleName')} maxLength={100} />
            <TextField label="Last name" {...field('lastName')} maxLength={100} />
            <TextField label="Suffix" optional {...field('suffix')} placeholder="Jr., III" maxLength={20} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextField
              label="Date of birth"
              type="date"
              mono
              min="1900-01-01"
              max={today}
              {...field('dateOfBirth')}
              hint={age ?? undefined}
            />
            <fieldset data-invalid={shown.sex ? 'true' : undefined} aria-describedby={shown.sex ? id('sex-err') : undefined}>
              <legend className="mb-1.5 block text-sm font-medium text-gray-700">Sex</legend>
              <div className={`flex gap-1 rounded-md border bg-white p-1 ${shown.sex ? 'border-red-400' : 'border-gray-300'}`}>
                {SEXES.map((o) => (
                  <label
                    key={o.value}
                    className="flex-1 cursor-pointer rounded px-2 py-1 text-center text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 has-[:checked]:bg-brand-teal-dark has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1"
                  >
                    <input type="radio" name={id('sex')} value={o.value} checked={draft.sex === o.value} onChange={() => set('sex', o.value)} className="sr-only" />
                    {o.label}
                  </label>
                ))}
              </div>
              {shown.sex && <FieldError id={id('sex-err')}>{shown.sex}</FieldError>}
            </fieldset>
            <div>
              <Label htmlFor={id('civilStatus')} optional>
                Civil status
              </Label>
              <select id={id('civilStatus')} value={draft.civilStatus} onChange={(e) => set('civilStatus', e.target.value)} className={FIELD}>
                <option value="">Not given</option>
                {civilOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <TextField label="Nationality" optional {...field('nationality')} placeholder="Filipino" maxLength={100} />
            <TextField label="Occupation" optional {...field('occupation')} maxLength={100} />
          </div>
        </div>
      </Section>

      {/* Contact and address */}
      <Section id={id('contact')} title="Contact and address">
        <div className="grid gap-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Mobile number" type="tel" inputMode="tel" mono {...field('phone')} placeholder="0917 123 4567" maxLength={30} />
            <TextField label="Email" type="email" optional {...field('email')} maxLength={254} />
          </div>
          <TextField label="House number, street and barangay" {...field('street')} maxLength={200} />
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem]">
            <TextField label="City or municipality" {...field('city')} maxLength={200} />
            <TextField label="Province" {...field('province')} maxLength={200} />
            <TextField label="ZIP code" inputMode="numeric" mono {...field('zipCode')} maxLength={20} />
          </div>
        </div>
      </Section>

      {matches.length > 0 && <PossibleMatches matches={matches} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section id={id('ec')} title="Emergency contact" hint="Who to call if something happens while they are here.">
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <TextField className="sm:col-span-2" label="Name" optional {...field('ecName')} maxLength={200} />
            <TextField label="Phone" type="tel" inputMode="tel" mono optional {...field('ecPhone')} maxLength={30} />
            <TextField label="Relationship" optional {...field('ecRelationship')} list={id('rel-list')} maxLength={100} />
            <datalist id={id('rel-list')}>
              {CONTACT_RELATIONSHIPS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
        </Section>
        <Section id={id('ids')} title="PhilHealth and other IDs">
          <div className="grid gap-4 px-5 py-4">
            <TextField label="PhilHealth number" mono optional {...field('philHealth')} placeholder="12-345678901-2" maxLength={50} />
            <TextField label="Other government ID" optional {...field('govId')} placeholder="ID type and number, e.g. UMID 0028-1234567-8" maxLength={100} />
          </div>
        </Section>
      </div>

      {/* Allergies */}
      <Section id={id('allergies')} title="Allergies" hint="Shown at the top of their record and beside every visit note.">
        <RowList
          headers={['Allergic to', 'Reaction', 'Severity']}
          cols="sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_10rem_2.25rem]"
          empty="None on file. Add any the patient reports."
          addLabel="Add allergy"
          onAdd={() => addRow('allergies')}
        >
          {draft.allergies.map((a, i) => {
            const err = rowProblem(a._key);
            const rid = id(`al-${a._key}`);
            const name = a.substance.trim() || `allergy ${i + 1}`;
            return (
              <Row key={a._key} cols="sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_10rem_2.25rem]" error={err && <FieldError id={`${rid}-err`}>{err}</FieldError>}>
                <div>
                  <RowLabel htmlFor={`${rid}-s`}>Allergic to</RowLabel>
                  <input
                    ref={focusNewRow(a._key)}
                    id={`${rid}-s`}
                    value={a.substance}
                    onChange={(e) => updateRow('allergies', a._key, { substance: e.target.value })}
                    placeholder="e.g. Penicillin"
                    maxLength={200}
                    aria-invalid={Boolean(err)}
                    aria-describedby={err ? `${rid}-err` : undefined}
                    className={`${FIELD} ${err ? 'border-red-400' : ''}`}
                  />
                </div>
                <div>
                  <RowLabel htmlFor={`${rid}-r`}>Reaction</RowLabel>
                  <input id={`${rid}-r`} value={a.reaction} onChange={(e) => updateRow('allergies', a._key, { reaction: e.target.value })} placeholder="e.g. Hives, swelling" maxLength={500} className={FIELD} />
                </div>
                <div>
                  <RowLabel htmlFor={`${rid}-sev`}>Severity</RowLabel>
                  <select id={`${rid}-sev`} value={a.severity} onChange={(e) => updateRow('allergies', a._key, { severity: e.target.value })} className={FIELD}>
                    {(SEVERITIES.some((o) => o.value === a.severity) ? SEVERITIES : [...SEVERITIES, { value: a.severity, label: a.severity }]).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <RemoveButton label={`Remove ${name}`} onClick={() => removeRow('allergies', a._key)} />
              </Row>
            );
          })}
        </RowList>
      </Section>

      {/* Medical history */}
      <Section id={id('history')} title="Medical history" hint="What the doctor should know before the first consultation.">
        <h3 id={id('cond-h')} className="px-5 pt-4 text-sm font-semibold text-gray-900">
          Conditions
        </h3>
        <RowList
          labelledBy={id('cond-h')}
          headers={['Condition', 'Status', 'Since']}
          cols="sm:grid-cols-[minmax(0,1fr)_9rem_10rem_2.25rem]"
          empty="None on file."
          addLabel="Add condition"
          onAdd={() => addRow('conditions')}
        >
          {draft.conditions.map((c, i) => {
            const err = rowProblem(c._key);
            const rid = id(`co-${c._key}`);
            const name = c.condition.trim() || `condition ${i + 1}`;
            const dateErr = Boolean(err && c.condition.trim());
            return (
              <Row key={c._key} cols="sm:grid-cols-[minmax(0,1fr)_9rem_10rem_2.25rem]" error={err && <FieldError id={`${rid}-err`}>{err}</FieldError>}>
                <div>
                  <RowLabel htmlFor={`${rid}-c`}>Condition</RowLabel>
                  <input
                    ref={focusNewRow(c._key)}
                    id={`${rid}-c`}
                    value={c.condition}
                    onChange={(e) => updateRow('conditions', c._key, { condition: e.target.value })}
                    placeholder="e.g. Hypertension"
                    maxLength={500}
                    aria-invalid={Boolean(err) && !dateErr}
                    aria-describedby={err ? `${rid}-err` : undefined}
                    className={`${FIELD} ${err && !dateErr ? 'border-red-400' : ''}`}
                  />
                </div>
                <div>
                  <RowLabel htmlFor={`${rid}-st`}>Status</RowLabel>
                  <select id={`${rid}-st`} value={c.status} onChange={(e) => updateRow('conditions', c._key, { status: e.target.value as typeof c.status })} className={FIELD}>
                    {CONDITION_STATUSES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <RowLabel htmlFor={`${rid}-d`}>Since</RowLabel>
                  <input
                    id={`${rid}-d`}
                    type="date"
                    max={today}
                    value={c.diagnosisDate}
                    onChange={(e) => updateRow('conditions', c._key, { diagnosisDate: e.target.value })}
                    aria-invalid={dateErr}
                    aria-describedby={dateErr ? `${rid}-err` : undefined}
                    className={`${FIELD} font-mono tabular-nums ${dateErr ? 'border-red-400' : ''}`}
                  />
                </div>
                <RemoveButton label={`Remove ${name}`} onClick={() => removeRow('conditions', c._key)} />
              </Row>
            );
          })}
        </RowList>

        <h3 id={id('fam-h')} className="border-t border-gray-200 px-5 pt-4 text-sm font-semibold text-gray-900">
          In the family
        </h3>
        <RowList
          labelledBy={id('fam-h')}
          headers={['Condition', 'Who had it']}
          cols="sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_2.25rem]"
          empty="None on file."
          addLabel="Add family history"
          onAdd={() => addRow('family')}
        >
          {draft.family.map((f, i) => {
            const err = rowProblem(f._key);
            const rid = id(`fa-${f._key}`);
            const name = f.condition.trim() || `family history ${i + 1}`;
            return (
              <Row key={f._key} cols="sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_2.25rem]" error={err && <FieldError id={`${rid}-err`}>{err}</FieldError>}>
                <div>
                  <RowLabel htmlFor={`${rid}-c`}>Condition</RowLabel>
                  <input
                    ref={focusNewRow(f._key)}
                    id={`${rid}-c`}
                    value={f.condition}
                    onChange={(e) => updateRow('family', f._key, { condition: e.target.value })}
                    placeholder="e.g. Diabetes"
                    maxLength={100}
                    aria-invalid={Boolean(err)}
                    aria-describedby={err ? `${rid}-err` : undefined}
                    className={`${FIELD} ${err ? 'border-red-400' : ''}`}
                  />
                </div>
                <div>
                  <RowLabel htmlFor={`${rid}-r`}>Who had it</RowLabel>
                  <input id={`${rid}-r`} value={f.relation} onChange={(e) => updateRow('family', f._key, { relation: e.target.value })} list={id('fam-list')} placeholder="e.g. Mother" maxLength={500} className={FIELD} />
                </div>
                <RemoveButton label={`Remove ${name}`} onClick={() => removeRow('family', f._key)} />
              </Row>
            );
          })}
        </RowList>
        <datalist id={id('fam-list')}>
          {FAMILY_RELATIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>

        <div className="border-t border-gray-200 px-5 py-4">
          <Label htmlFor={id('medicalHistory')} optional>
            Other history
          </Label>
          <NoteArea id={id('medicalHistory')} rows={3} value={draft.medicalHistory} onChange={(v) => set('medicalHistory', v)} placeholder="Past operations, hospital stays, regular medicines, smoking or drinking" />
          {shown.medicalHistory && <FieldError id={id('medicalHistory-err')}>{shown.medicalHistory}</FieldError>}
        </div>
      </Section>

      {/* Save bar */}
      <div className="motion-tray-in sticky bottom-4 z-20 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-[0_8px_30px_rgb(15,23,42,0.1)] sm:flex-row sm:items-center sm:justify-between">
        <p className={`text-sm ${statusTone}`} aria-live="polite">
          {status}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (dirty && !done && !window.confirm(editing ? 'Discard your changes to this patient?' : 'Discard this registration?')) return;
              onCancel();
            }}
            className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || done || (editing && !dirty)}
            aria-busy={saving}
            className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-wait ${FOCUS_RING}`}
          >
            <Svg d={ICON.check} />
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Register patient'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Fields and rows
// ---------------------------------------------------------------------------

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  optional,
  mono,
  className,
  type = 'text',
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  mono?: boolean;
  className?: string;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  min?: string;
  max?: string;
  list?: string;
  inputMode?: 'text' | 'tel' | 'numeric' | 'email';
}) {
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`${FIELD} ${mono ? 'font-mono tabular-nums' : ''} ${error ? 'border-red-400' : ''}`}
        {...rest}
      />
      {error ? (
        <FieldError id={`${id}-err`}>{error}</FieldError>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-gray-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A ruled list of editable rows with column headings (wide screens) and an add button at the foot. */
function RowList({
  headers,
  cols,
  empty,
  addLabel,
  onAdd,
  labelledBy,
  children,
}: {
  headers: string[];
  cols: string;
  empty: string;
  addLabel: string;
  onAdd: () => void;
  labelledBy?: string;
  children: ReactNode[];
}) {
  // Under a sub-heading the list sits close to it; directly under the panel header it needs air.
  const top = labelledBy ? 'pt-1.5' : 'pt-4';
  return (
    <div>
      {children.length > 0 ? (
        <>
          <div aria-hidden="true" className={`hidden gap-3 px-5 ${top} text-xs font-medium text-gray-500 sm:grid ${cols}`}>
            {headers.map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
          <ul aria-labelledby={labelledBy} className="divide-y divide-gray-100 sm:divide-y-0">
            {children}
          </ul>
        </>
      ) : (
        <p className={`px-5 ${top} text-sm text-gray-500`}>{empty}</p>
      )}
      <div className="px-5 py-4">
        <button type="button" onClick={onAdd} className={ADD_BUTTON}>
          <Svg d="M12 4v16m8-8H4" />
          {addLabel}
        </button>
      </div>
    </div>
  );
}

function Row({ cols, error, children }: { cols: string; error?: ReactNode; children: ReactNode }) {
  return (
    <li className={`motion-row-in grid gap-3 px-5 py-3 sm:items-start sm:py-2 ${cols}`}>
      {children}
      {error && <div className="sm:col-span-full sm:-mt-1">{error}</div>}
    </li>
  );
}

function RowLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-gray-600 sm:sr-only">
      {children}
    </label>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`${REMOVE_BUTTON} justify-self-end sm:mt-0.5 sm:justify-self-auto`}>
      <Svg d={ICON.x} />
    </button>
  );
}

const sentence = (s: string) => {
  const t = s.trim();
  return t ? `${t[0].toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}` : t;
};

// ---------------------------------------------------------------------------
// Possible duplicates
// ---------------------------------------------------------------------------

interface PossibleMatch {
  _id: string;
  patientCode: string | null;
  name: string;
  dateOfBirth: string | null;
  phone: string | null;
  reasons: ('name' | 'birth' | 'phone')[];
}

/** Query string for the duplicate check, or null until there is enough to compare. */
function matchQuery(d: PatientDraft): string | null {
  const first = d.firstName.trim();
  const last = d.lastName.trim();
  const digits = d.phone.replace(/\D/g, '');
  const byName = first.length >= 2 && last.length >= 2;
  const byBirth = last.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(d.dateOfBirth);
  const byPhone = digits.length >= 7;
  if (!byName && !byBirth && !byPhone) return null;
  const q = new URLSearchParams();
  if (first) q.set('firstName', first);
  if (last) q.set('lastName', last);
  if (byBirth) q.set('dateOfBirth', d.dateOfBirth);
  if (byPhone) q.set('phone', digits);
  return q.toString();
}

/** Patients already registered here who may be this person; keeps the last answer while a newer one loads. */
function usePossibleMatches(query: string | null) {
  const [result, setResult] = useState<{ q: string; items: PossibleMatch[] } | null>(null);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/patients/possible-duplicates?${query}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((json) => setResult({ q: query, items: json?.success && Array.isArray(json.data) ? json.data : [] }))
        .catch(() => {
          if (!controller.signal.aborted) setResult({ q: query, items: [] });
        });
    }, 500);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);
  return query ? (result?.items ?? []) : [];
}

function matchReason(r: PossibleMatch['reasons']) {
  const parts: string[] = [];
  if (r.includes('name') && r.includes('birth')) parts.push('name and birth date');
  else if (r.includes('name')) parts.push('name');
  else if (r.includes('birth')) parts.push('last name and birth date');
  if (r.includes('phone')) parts.push('phone number');
  return parts.length ? `Same ${parts.join(' and ')}` : 'Similar details';
}

function PossibleMatches({ matches }: { matches: PossibleMatch[] }) {
  const n = matches.length;
  return (
    <div role="status" className="motion-chip-in rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm">
      <div className="flex items-start gap-2.5">
        <Svg d={ICON.alert} className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-900">Already registered?</p>
          <p className="mt-0.5 text-amber-800">
            {n === 1 ? 'One patient here matches' : `${n} patients here match`} what you’ve entered. Open {n === 1 ? 'the record' : 'each record'} to check before registering them again.
          </p>
          <ul className="mt-3 divide-y divide-amber-200/80 border-t border-amber-200/80">
            {matches.map((m) => (
              <li key={m._id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                <span className="min-w-0">
                  <Link href={`/patients/${m._id}`} target="_blank" rel="noopener" className={`rounded font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2 hover:decoration-amber-900 ${FOCUS_RING}`}>
                    {m.name}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </Link>
                  {m.patientCode && <span className="ml-2 font-mono text-xs text-amber-800">{m.patientCode}</span>}
                </span>
                <span className="text-xs text-amber-800">
                  {matchReason(m.reasons)}
                  {m.dateOfBirth && (
                    <>
                      {' · born '}
                      <span className="font-mono tabular-nums">{new Date(m.dateOfBirth).toLocaleDateString('en-PH', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
