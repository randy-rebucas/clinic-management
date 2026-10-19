'use client';

import { useId, useMemo, useState, type FormEvent } from 'react';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { useTemplates } from './useTemplates';
import { SHORTCUT_RE, type ClinicalTemplateDTO, type TemplateKind } from '@/lib/clinical-templates';

const BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const PRIMARY = `${BUTTON} bg-brand-teal-dark text-white hover:bg-brand-teal-deep`;
const SECONDARY = `${BUTTON} border border-gray-300 bg-white text-gray-900 hover:border-gray-900`;
const GHOST = `${BUTTON} text-gray-600 hover:bg-gray-100 hover:text-gray-900`;

const TABS: { kind: TemplateKind; label: string; blurb: string }[] = [
  { kind: 'visit', label: 'Visit notes', blurb: 'Whole-visit templates. Apply one from a new visit with “Apply template”; save one from a note with “Save as template”.' },
  { kind: 'prescription', label: 'Prescriptions', blurb: 'Medicines you often give together. Add them from a visit or prescription with “My usual”.' },
  { kind: 'phrase', label: 'Phrases', blurb: 'Type a dot, the shortcut and a space in any visit note, e.g. “.nad ”, to insert the phrase.' },
];

function describeTemplate(t: ClinicalTemplateDTO): string {
  if (t.kind === 'phrase') return t.text ?? '';
  const meds = (t.medications ?? []).map((m) => [m.name, m.dosage, m.frequency, m.duration].filter(Boolean).join(' '));
  if (t.kind === 'prescription') return meds.join(' · ');
  const dx = (t.visit?.diagnoses ?? []).map((d) => [d.code, d.description].filter(Boolean).join(' ')).join('; ');
  return [t.visit?.chiefComplaint, dx, meds.length ? `${meds.length} medicine${meds.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
}

export default function TemplatesClient() {
  const [kind, setKind] = useState<TemplateKind>('visit');
  const tpl = useTemplates();
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const list = useMemo(() => tpl.templates.filter((t) => t.kind === kind && !t.starter), [tpl.templates, kind]);
  const mine = list.filter((t) => t.mine);
  const others = list.filter((t) => !t.mine);
  const tab = TABS.find((t) => t.kind === kind)!;

  /** Run a change and report it; resolves to whether it succeeded. */
  const run = async (fn: () => Promise<unknown>, ok: string): Promise<boolean> => {
    setNotice(null);
    try {
      await fn();
      setNotice({ tone: 'ok', text: ok });
      return true;
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' });
      return false;
    }
  };

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Templates</h1>
          <p className="mt-1 text-sm sm:text-base text-gray-600">Your saved notes, prescriptions and phrases. Shared ones are visible to everyone in the clinic.</p>
        </header>

        <nav aria-label="Template type" className="flex gap-1 border-b border-gray-200">
          {TABS.map((t) => {
            const active = t.kind === kind;
            const count = tpl.templates.filter((x) => x.kind === t.kind && !x.starter).length;
            return (
              <button
                key={t.kind}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  setKind(t.kind);
                  setNotice(null);
                }}
                className={`relative px-3 py-2 text-sm font-semibold transition-colors ${FOCUS_RING} ${active ? 'text-brand-teal-deep' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {t.label}
                {count > 0 && <span className="ml-1.5 font-mono text-xs text-gray-500">{count}</span>}
                {active && <span aria-hidden="true" className="absolute inset-x-3 -bottom-px h-0.5 bg-brand-teal-dark" />}
              </button>
            );
          })}
        </nav>

        <p className="text-sm text-gray-600">{tab.blurb}</p>

        <div aria-live="polite">
          {notice && (
            <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded-md px-3 py-2 text-sm ring-1 ${notice.tone === 'error' ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30'}`}>
              {notice.text}
            </p>
          )}
        </div>

        {kind === 'phrase' && (
          <PhraseEditor
            onSave={(input) => run(() => tpl.create({ kind: 'phrase', ...input }), `Saved .${input.shortcut}.`)}
          />
        )}

        {tpl.loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : tpl.error ? (
          <p role="alert" className="text-sm text-red-700">{tpl.error}</p>
        ) : (
          <>
            <TemplateList
              title="Yours"
              items={mine}
              empty={kind === 'phrase' ? 'No phrases yet. Add one above.' : 'Nothing saved yet.'}
              onRename={(t, name) => run(() => tpl.update(t._id, { name }), 'Renamed.')}
              onShare={(t, shared) => run(() => tpl.update(t._id, { shared }), shared ? `“${t.name}” is shared with the clinic.` : `“${t.name}” is private again.`)}
              onEditPhrase={(t, input) => run(() => tpl.update(t._id, input), 'Phrase saved.')}
              onDelete={(t) => {
                if (window.confirm(`Delete “${t.name}”? This can’t be undone.`)) void run(() => tpl.remove(t._id), `Deleted “${t.name}”.`);
              }}
            />
            {others.length > 0 && <TemplateList title="Shared by colleagues" items={others} empty="" />}
          </>
        )}
      </div>
    </section>
  );
}

function TemplateList({
  title,
  items,
  empty,
  onRename,
  onShare,
  onEditPhrase,
  onDelete,
}: {
  title: string;
  items: ClinicalTemplateDTO[];
  empty: string;
  onRename?: (t: ClinicalTemplateDTO, name: string) => void;
  onShare?: (t: ClinicalTemplateDTO, shared: boolean) => void;
  onEditPhrase?: (t: ClinicalTemplateDTO, input: { name: string; shortcut: string; text: string }) => Promise<boolean>;
  onDelete?: (t: ClinicalTemplateDTO) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 px-5 py-3 text-base font-bold tracking-tight text-gray-900">{title}</h2>
      {items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((t) =>
            editing === t._id && t.kind === 'phrase' && onEditPhrase ? (
              <li key={t._id} className="px-5 py-4">
                <PhraseEditor
                  initial={{ name: t.name, shortcut: t.shortcut ?? '', text: t.text ?? '' }}
                  onCancel={() => setEditing(null)}
                  onSave={async (input) => {
                    const ok = await onEditPhrase(t, input);
                    if (ok) setEditing(null);
                    return ok;
                  }}
                />
              </li>
            ) : (
              <li key={t._id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    {t.kind === 'phrase' && <span className="font-mono text-sm font-semibold text-brand-teal-deep">.{t.shortcut}</span>}
                    <span className="font-semibold text-gray-900">{t.name}</span>
                    {t.specialty && <span className="text-xs text-gray-500">{t.specialty}</span>}
                    {t.shared && <span className="rounded bg-brand-teal-light px-1.5 py-0.5 text-xs font-semibold text-brand-teal-deep">Shared</span>}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{describeTemplate(t)}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Used {t.usageCount} {t.usageCount === 1 ? 'time' : 'times'}
                    {!t.mine && t.ownerName ? ` · by ${t.ownerName}` : ''}
                  </p>
                </div>
                {t.mine && (
                  <div className="flex shrink-0 flex-wrap gap-1">
                    {t.kind === 'phrase' && onEditPhrase ? (
                      <button type="button" className={GHOST} onClick={() => setEditing(t._id)}>
                        Edit
                      </button>
                    ) : (
                      onRename && (
                        <button
                          type="button"
                          className={GHOST}
                          onClick={() => {
                            const name = window.prompt('Rename template', t.name)?.trim();
                            if (name && name !== t.name) onRename(t, name);
                          }}
                        >
                          Rename
                        </button>
                      )
                    )}
                    {onShare && (
                      <button type="button" className={GHOST} onClick={() => onShare(t, !t.shared)}>
                        {t.shared ? 'Make private' : 'Share'}
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" className={`${GHOST} hover:bg-red-50 hover:text-red-700`} onClick={() => onDelete(t)} aria-label={`Delete ${t.name}`}>
                        <Svg d={ICON.x} />
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

function PhraseEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { name: string; shortcut: string; text: string };
  /** Resolves to whether it was saved; the new-phrase form clears only on success. */
  onSave: (input: { name: string; shortcut: string; text: string }) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const ids = useId();
  const [shortcut, setShortcut] = useState(initial?.shortcut ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const sc = shortcut.trim().replace(/^\./, '').toLowerCase();
    if (!SHORTCUT_RE.test(sc)) return setError('Use 1–20 letters, numbers or dashes for the shortcut.');
    if (!text.trim()) return setError('Write the phrase.');
    setBusy(true);
    setError(null);
    try {
      const ok = await onSave({ shortcut: sc, name: name.trim() || sc, text });
      if (ok && !initial) {
        setShortcut('');
        setName('');
        setText('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`flex flex-col gap-3 ${initial ? '' : 'rounded-lg border border-gray-200 bg-white p-5'}`}>
      {!initial && <h2 className="text-base font-bold tracking-tight text-gray-900">New phrase</h2>}
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div>
          <label htmlFor={`${ids}-sc`} className="mb-1.5 block text-sm font-medium text-gray-700">
            Shortcut
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-500">.</span>
            <input id={`${ids}-sc`} value={shortcut} onChange={(e) => setShortcut(e.target.value)} maxLength={21} placeholder="nad" className={`${FIELD} pl-6 font-mono`} autoComplete="off" />
          </div>
        </div>
        <div>
          <label htmlFor={`${ids}-name`} className="mb-1.5 block text-sm font-medium text-gray-700">
            Label <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Normal general survey" className={FIELD} />
        </div>
      </div>
      <div>
        <label htmlFor={`${ids}-text`} className="mb-1.5 block text-sm font-medium text-gray-700">
          Phrase
        </label>
        <textarea id={`${ids}-text`} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000} placeholder="Awake, alert, not in cardiorespiratory distress." className={`${FIELD} resize-y`} />
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className={SECONDARY}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? 'Saving…' : initial ? 'Save phrase' : 'Add phrase'}
        </button>
      </div>
    </form>
  );
}
