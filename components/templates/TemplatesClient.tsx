'use client';

import { useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { AlertDialog } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { useTemplates } from './useTemplates';
import { TemplateContent, templateSummary, usageLabel } from './content';
import { TemplateEditDialog, type TemplatePatch } from './TemplateEditDialog';
import { SHORTCUT_RE, STARTER_TEMPLATES, type ClinicalTemplateDTO, type TemplateKind } from '@/lib/clinical-templates';

const BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const PRIMARY = `${BUTTON} bg-brand-teal-dark text-white hover:bg-brand-teal-deep`;
const SECONDARY = `${BUTTON} border border-gray-300 bg-white text-gray-900 hover:border-gray-900`;
const GHOST = `${BUTTON} text-gray-600 opacity-80 hover:bg-gray-100 hover:text-gray-900 group-hover:opacity-100 focus-visible:opacity-100`;

const TABS: { kind: TemplateKind; label: string; hint: string }[] = [
  {
    kind: 'visit',
    label: 'Visit notes',
    hint: 'Whole notes to start a visit from. On a visit note, “Apply template” fills the parts still empty and adds its diagnoses and medicines; “Save as template” keeps the note you’re writing.',
  },
  {
    kind: 'prescription',
    label: 'Saved prescriptions',
    hint: 'Medicines you often give together. “My usual” on a visit note or a prescription adds them, skipping any already listed.',
  },
  {
    kind: 'phrase',
    label: 'Phrases',
    hint: 'In any box of a visit note, type a dot, the shortcut and a space (“.nad ”) and the phrase takes its place.',
  },
];

type Notice = { tone: 'ok' | 'error'; text: string };

export default function TemplatesClient({ initialKind }: { initialKind: TemplateKind }) {
  const [kind, setKind] = useState<TemplateKind>(initialKind);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClinicalTemplateDTO | null>(null);
  const [deleting, setDeleting] = useState<ClinicalTemplateDTO | null>(null);
  const tpl = useTemplates();

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const choose = (k: TemplateKind) => {
    setKind(k);
    setNotice(null);
    setAdding(false);
    setOpen(null);
    // Keep the tab in the address, so "Manage templates" and the back button land here.
    window.history.replaceState(null, '', k === 'visit' ? '/templates' : `/templates?tab=${k}`);
  };
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = TABS.length;
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (next === null) return;
    e.preventDefault();
    choose(TABS[next].kind);
    tabRefs.current[next]?.focus();
  };

  const stored = useMemo(() => tpl.templates.filter((t) => !t.starter), [tpl.templates]);
  const counts = useMemo(() => {
    const c: Record<TemplateKind, number> = { visit: 0, prescription: 0, phrase: 0 };
    for (const t of stored) if (t.mine || t.shared) c[t.kind] += 1;
    return c;
  }, [stored]);

  const q = query.trim().toLowerCase();
  const matches = (t: ClinicalTemplateDTO) =>
    !q || [t.name, t.specialty, t.shortcut && `.${t.shortcut}`, t.ownerName, templateSummary(t)].some((s) => s?.toLowerCase().includes(q));
  const ofKind = stored.filter((t) => t.kind === kind);
  const mine = ofKind.filter((t) => t.mine && matches(t));
  const others = ofKind.filter((t) => !t.mine && t.shared && matches(t));
  const starters = kind === 'visit' ? STARTER_TEMPLATES.filter(matches) : [];
  const myShortcuts = useMemo(() => new Set(stored.filter((t) => t.kind === 'phrase' && t.mine && t.shortcut).map((t) => t.shortcut!)), [stored]);
  const nothingMatches = q && mine.length + others.length + starters.length === 0;

  const tab = TABS.find((t) => t.kind === kind)!;
  const loaded = !tpl.loading || tpl.templates.length > 0;

  /** Run a change and report it; resolves to whether it succeeded. */
  const run = async (fn: () => Promise<unknown>, ok: string): Promise<boolean> => {
    setNotice(null);
    try {
      await fn();
      setNotice({ tone: 'ok', text: ok });
      return true;
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Something went wrong. Try again.' });
      return false;
    }
  };

  const copy = (t: ClinicalTemplateDTO) =>
    run(async () => {
      const saved = await tpl.create({
        kind: t.kind,
        name: t.name,
        specialty: t.specialty,
        shortcut: t.shortcut,
        text: t.text,
        visit: t.kind === 'visit' ? (t.visit ?? {}) : undefined,
        medications: t.medications,
      });
      setOpen(saved._id);
    }, `“${t.name}” is now one of yours. Change it as you like; ${t.starter ? 'the starter' : 'the original'} stays as it was.`);

  const share = (t: ClinicalTemplateDTO) =>
    run(
      () => tpl.update(t._id, { shared: !t.shared }),
      t.shared
        ? t.mine
          ? `“${t.name}” is private again.`
          : `“${t.name}” is no longer shared; only ${t.ownerName ?? 'its owner'} sees it now.`
        : `“${t.name}” is shared with the clinic.`
    );

  const rowProps = {
    open,
    onToggle: (id: string) => setOpen((cur) => (cur === id ? null : id)),
    onEdit: (t: ClinicalTemplateDTO) => setEditing(t),
    onShare: share,
    onDelete: (t: ClinicalTemplateDTO) => setDeleting(t),
    onCopy: copy,
    onSavePhrase: (t: ClinicalTemplateDTO, input: PhraseInput) => run(() => tpl.update(t._id, input), `Saved .${input.shortcut}.`),
    myShortcuts,
  };

  return (
    <section className="px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">Templates</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600 sm:text-base">
              Notes, prescriptions and phrases you reuse. Yours stay private until you share them; shared ones can be used by everyone in the clinic and changed only by their owner.
            </p>
          </div>
          {kind === 'phrase' && !adding && (
            <button type="button" onClick={() => setAdding(true)} className={`${PRIMARY} shrink-0 px-4 py-2`}>
              <Svg d="M12 5v14M5 12h14" />
              New phrase
            </button>
          )}
        </header>

        <div role="tablist" aria-label="Kind of template" className="flex gap-1 overflow-x-auto border-b border-gray-200">
          {TABS.map((t, i) => (
            <button
              key={t.kind}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`tpl-tab-${t.kind}`}
              aria-selected={kind === t.kind}
              aria-controls="tpl-panel"
              tabIndex={kind === t.kind ? 0 : -1}
              onClick={() => choose(t.kind)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${kind === t.kind ? 'border-brand-teal-dark text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
            >
              {t.label}
              {loaded && !tpl.error && <span className="ml-1.5 font-mono text-xs font-medium tabular-nums text-gray-500">{counts[t.kind]}</span>}
            </button>
          ))}
        </div>

        <div id="tpl-panel" role="tabpanel" aria-labelledby={`tpl-tab-${kind}`} className="flex flex-col gap-5">
          <p className="max-w-3xl text-sm text-gray-600">{tab.hint}</p>

          {(ofKind.length > 0 || starters.length > 0 || q) && (
            <div className="relative max-w-md">
              <Svg d={ICON.search} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={kind === 'phrase' ? 'Search shortcuts and phrases' : 'Search by name, specialty, diagnosis or medicine'}
                aria-label="Search templates"
                className={`${FIELD} pl-9`}
              />
            </div>
          )}

          <div aria-live="polite">
            {notice && (
              <p
                role={notice.tone === 'error' ? 'alert' : 'status'}
                className={`motion-panel-in flex items-start justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-sm ${notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-brand-teal/30 bg-brand-teal-light text-brand-teal-deep'}`}
              >
                <span>{notice.text}</span>
                <button type="button" onClick={() => setNotice(null)} className={`-m-1 shrink-0 rounded p-1 opacity-70 hover:opacity-100 ${FOCUS_RING}`} aria-label="Dismiss">
                  <Svg d={ICON.x} className="h-4 w-4" />
                </button>
              </p>
            )}
          </div>

          {kind === 'phrase' && adding && (
            <div className="motion-panel-in rounded-lg border border-gray-200 bg-white">
              <h2 className="border-b border-gray-200 px-5 py-3 text-base font-bold tracking-tight text-gray-900">New phrase</h2>
              <div className="px-5 py-4">
                <PhraseEditor
                  others={stored.filter((t) => t.kind === 'phrase' && !t.mine && t.shared)}
                  onCancel={() => setAdding(false)}
                  onSave={async (input) => {
                    const ok = await run(() => tpl.create({ kind: 'phrase', ...input }), `Saved .${input.shortcut}. Type “.${input.shortcut} ” in a visit note to use it.`);
                    if (ok) setAdding(false);
                    return ok;
                  }}
                />
              </div>
            </div>
          )}

          {!loaded ? (
            <Skeleton />
          ) : tpl.error ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white px-5 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-red-50 text-red-600">
                <Svg d={ICON.alert} className="h-5 w-5" />
              </span>
              <p className="text-sm text-gray-700">Your templates didn’t load. {tpl.error}</p>
              <button type="button" onClick={tpl.reload} className={`${PRIMARY} px-4 py-2`}>
                Try again
              </button>
            </div>
          ) : nothingMatches ? (
            <div className="rounded-lg border border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-600">
              Nothing on this tab matches “{query.trim()}”.{' '}
              <button type="button" onClick={() => setQuery('')} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                Clear the search
              </button>
            </div>
          ) : (
            <div className={`flex flex-col gap-5 transition-opacity ${tpl.loading ? 'opacity-60' : ''}`}>
              {(!q || mine.length > 0) && (
                <Section title="Yours" count={mine.length}>
                  {mine.length === 0 ? (
                    <EmptyYours kind={kind} onAdd={() => setAdding(true)} />
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {mine.map((t, i) => (
                        <TemplateRow key={t._id} t={t} index={i} {...rowProps} />
                      ))}
                    </ul>
                  )}
                </Section>
              )}
              {others.length > 0 && (
                <Section title="Shared by colleagues" count={others.length}>
                  <ul className="divide-y divide-gray-100">
                    {others.map((t, i) => (
                      <TemplateRow key={t._id} t={t} index={i} {...rowProps} />
                    ))}
                  </ul>
                </Section>
              )}
              {starters.length > 0 && (
                <Section
                  title="Starter library"
                  count={starters.length}
                  note="Outlines for common visits with ICD-10 codes and blanks (___) to fill in. No medicines or doses: those depend on the patient. Apply one as it is, or make a copy to change it."
                >
                  <ul className="divide-y divide-gray-100">
                    {starters.map((t, i) => (
                      <TemplateRow key={t._id} t={t} index={i} {...rowProps} />
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <TemplateEditDialog
          key={editing._id}
          template={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch: TemplatePatch) => {
            await tpl.update(editing._id, patch);
            setNotice({ tone: 'ok', text: `Saved “${patch.name}”.` });
          }}
        />
      )}

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting ? `Delete “${deleting.name}”?` : ''}
        description={
          !deleting
            ? ''
            : !deleting.mine
              ? `It belongs to ${deleting.ownerName ?? 'a colleague'} and is shared, so it disappears for everyone who uses it. Deleting it is recorded in the audit log.`
              : deleting.shared
                ? 'It’s shared, so it disappears for colleagues who use it too. Notes already written from it don’t change.'
                : 'Notes already written from it don’t change. This can’t be undone.'
        }
      >
        <button type="button" onClick={() => setDeleting(null)} className={`${SECONDARY} px-4 py-2`}>
          Keep it
        </button>
        <button
          type="button"
          onClick={() => {
            const t = deleting;
            setDeleting(null);
            if (t) void run(() => tpl.remove(t._id), `Deleted “${t.name}”.`);
          }}
          className={`${BUTTON} bg-red-600 px-4 py-2 text-white hover:bg-red-700`}
        >
          Delete
        </button>
      </AlertDialog>
    </section>
  );
}

function Section({ title, count, note, children }: { title: string; count: number; note?: string; children: ReactNode }) {
  return (
    <section className="motion-panel-in overflow-hidden rounded-lg border border-gray-200 bg-white">
      <header className="border-b border-gray-200 px-5 py-3">
        <h2 className="flex items-baseline gap-2 text-base font-bold tracking-tight text-gray-900">
          {title}
          <span className="font-mono text-xs font-medium tabular-nums text-gray-500">{count}</span>
        </h2>
        {note && <p className="mt-0.5 max-w-3xl text-sm text-gray-500">{note}</p>}
      </header>
      {children}
    </section>
  );
}

function EmptyYours({ kind, onAdd }: { kind: TemplateKind; onAdd: () => void }) {
  if (kind === 'phrase') {
    return (
      <div className="px-5 py-6 text-sm text-gray-600">
        <p>No phrases yet. A phrase turns a few keystrokes into a sentence you write often, like “.nad” for “No acute distress”.</p>
        <button type="button" onClick={onAdd} className={`${SECONDARY} mt-3`}>
          <Svg d="M12 5v14M5 12h14" />
          New phrase
        </button>
      </div>
    );
  }
  return (
    <p className="px-5 py-6 text-sm text-gray-600">
      {kind === 'visit'
        ? 'You haven’t saved a visit template yet. On a visit note, choose “Save as template” to keep its notes, diagnoses and medicines for next time, or copy one from the starter library below.'
        : 'No saved prescriptions yet. On a visit note or a prescription, list the medicines you usually give together and choose “Save these”.'}
    </p>
  );
}

function Skeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white" aria-busy="true" aria-label="Loading templates">
      <div className="border-b border-gray-200 px-5 py-3">
        <div className="h-4 w-16 animate-pulse rounded bg-gray-100" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 border-b border-gray-100 px-5 py-4 last:border-0">
          <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-80 max-w-full animate-pulse rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

type PhraseInput = { name: string; shortcut: string; text: string };

function TemplateRow({
  t,
  index,
  open,
  onToggle,
  onEdit,
  onShare,
  onDelete,
  onCopy,
  onSavePhrase,
  myShortcuts,
}: {
  t: ClinicalTemplateDTO;
  index: number;
  open: string | null;
  onToggle: (id: string) => void;
  onEdit: (t: ClinicalTemplateDTO) => void;
  onShare: (t: ClinicalTemplateDTO) => void;
  onDelete: (t: ClinicalTemplateDTO) => void;
  onCopy: (t: ClinicalTemplateDTO) => Promise<boolean>;
  onSavePhrase: (t: ClinicalTemplateDTO, input: PhraseInput) => Promise<boolean>;
  myShortcuts: ReadonlySet<string>;
}) {
  const [editingPhrase, setEditingPhrase] = useState(false);
  const [copying, setCopying] = useState(false);
  const expanded = open === t._id;
  const panelId = `tpl-${t._id}`;
  const shadowed = t.kind === 'phrase' && !t.mine && t.shortcut && myShortcuts.has(t.shortcut);

  if (editingPhrase) {
    return (
      <li className="px-5 py-4">
        <PhraseEditor
          initial={{ name: t.name, shortcut: t.shortcut ?? '', text: t.text ?? '' }}
          onCancel={() => setEditingPhrase(false)}
          onSave={async (input) => {
            const ok = await onSavePhrase(t, input);
            if (ok) setEditingPhrase(false);
            return ok;
          }}
        />
      </li>
    );
  }

  return (
    <li className="motion-row-in group" style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}>
      <div className={`flex flex-col gap-2 px-5 py-3.5 transition-colors sm:flex-row sm:items-start sm:gap-4 ${expanded ? 'bg-gray-50/60' : 'hover:bg-gray-50'}`}>
        <button
          type="button"
          onClick={() => onToggle(t._id)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className={`-m-1 flex min-w-0 flex-1 items-start gap-2.5 rounded p-1 text-left ${FOCUS_RING}`}
        >
          <Svg d={ICON.chevR} className={`mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {t.kind === 'phrase' && <span className="font-mono text-sm font-semibold text-brand-teal-deep">.{t.shortcut}</span>}
              <span className="font-semibold text-gray-900">{t.name}</span>
              {t.mine && t.shared && <span className="rounded bg-brand-teal-light px-1.5 py-0.5 text-xs font-semibold text-brand-teal-deep">Shared</span>}
              {t.specialty && <span className="text-xs text-gray-500">{t.specialty}</span>}
            </span>
            {!expanded && <span className="mt-0.5 line-clamp-2 block text-sm text-gray-600">{templateSummary(t) || 'Empty'}</span>}
            {!t.starter && (
              <span className="mt-0.5 block text-xs text-gray-500">
                <span className="font-mono tabular-nums">{usageLabel(t)}</span>
                {!t.mine && t.ownerName ? ` · by ${t.ownerName}` : ''}
              </span>
            )}
            {shadowed && (
              <span className="mt-1 flex items-center gap-1.5 text-xs text-amber-800">
                <Svg d={ICON.alert} className="h-3.5 w-3.5 shrink-0" />
                You have your own .{t.shortcut}, so yours is the one you get when you type it.
              </span>
            )}
          </span>
        </button>

        <div className="flex shrink-0 flex-wrap gap-1 pl-6 sm:pl-0">
          {t.canEdit ? (
            <>
              <button type="button" className={GHOST} onClick={() => (t.kind === 'phrase' ? setEditingPhrase(true) : onEdit(t))} aria-label={`Edit ${t.name}`}>
                Edit
              </button>
              {(t.mine || t.shared) && (
                <button type="button" className={GHOST} onClick={() => onShare(t)} aria-label={`${t.shared ? 'Stop sharing' : 'Share'} ${t.name}`}>
                  {t.shared ? 'Stop sharing' : 'Share'}
                </button>
              )}
              <button type="button" className={`${GHOST} hover:bg-red-50 hover:text-red-700`} onClick={() => onDelete(t)} aria-label={`Delete ${t.name}`}>
                <Svg d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </button>
            </>
          ) : null}
          {!t.mine && (
            <button
              type="button"
              className={SECONDARY}
              disabled={copying}
              onClick={async () => {
                setCopying(true);
                await onCopy(t);
                setCopying(false);
              }}
              aria-label={`Make a copy of ${t.name}`}
            >
              {copying ? 'Copying…' : 'Make a copy'}
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="motion-panel-in border-t border-gray-100 bg-gray-50/60 py-3 pl-12 pr-5">
          <TemplateContent t={t} />
        </div>
      )}
    </li>
  );
}

function PhraseEditor({
  initial,
  others = [],
  onSave,
  onCancel,
}: {
  initial?: PhraseInput;
  /** Colleagues' shared phrases, to say when a shortcut is already theirs. */
  others?: ClinicalTemplateDTO[];
  /** Resolves to whether it was saved. */
  onSave: (input: PhraseInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const ids = useId();
  const [shortcut, setShortcut] = useState(initial?.shortcut ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: 'shortcut' | 'text'; message: string } | null>(null);

  const sc = shortcut.trim().replace(/^\./, '').toLowerCase();
  const theirs = others.find((t) => t.shortcut === sc);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!SHORTCUT_RE.test(sc)) {
      setError({ field: 'shortcut', message: 'Use 1–20 letters, numbers or dashes, starting with a letter or number.' });
      document.getElementById(`${ids}-sc`)?.focus();
      return;
    }
    if (!text.trim()) {
      setError({ field: 'text', message: 'Write the phrase.' });
      document.getElementById(`${ids}-text`)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ shortcut: sc, name: name.trim() || sc, text });
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (field: 'shortcut' | 'text') =>
    error?.field === field && (
      <p id={`${ids}-${field}-err`} className="mt-1.5 flex items-center gap-1.5 text-sm text-red-700">
        <Svg d={ICON.alert} className="h-4 w-4 shrink-0" />
        {error.message}
      </p>
    );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <div>
          <label htmlFor={`${ids}-sc`} className="mb-1.5 block text-sm font-medium text-gray-700">
            Shortcut
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-500">.</span>
            <input
              id={`${ids}-sc`}
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              maxLength={21}
              placeholder="nad"
              autoComplete="off"
              autoFocus={!initial}
              aria-invalid={error?.field === 'shortcut'}
              aria-describedby={error?.field === 'shortcut' ? `${ids}-shortcut-err` : theirs ? `${ids}-theirs` : undefined}
              className={`${FIELD} pl-6 font-mono ${error?.field === 'shortcut' ? 'border-red-400' : ''}`}
            />
          </div>
          {fieldError('shortcut')}
        </div>
        <div>
          <label htmlFor={`${ids}-name`} className="mb-1.5 block text-sm font-medium text-gray-700">
            Label <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Normal general survey" className={FIELD} />
        </div>
      </div>
      {theirs && !initial && (
        <p id={`${ids}-theirs`} className="text-sm text-gray-600">
          {theirs.ownerName ?? 'A colleague'} shares a .{sc} too. Once you save yours, yours is the one you get.
        </p>
      )}
      <div>
        <label htmlFor={`${ids}-text`} className="mb-1.5 block text-sm font-medium text-gray-700">
          Phrase
        </label>
        <textarea
          id={`${ids}-text`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Awake, alert, not in cardiorespiratory distress."
          aria-invalid={error?.field === 'text'}
          aria-describedby={error?.field === 'text' ? `${ids}-text-err` : undefined}
          className={`${FIELD} resize-y ${error?.field === 'text' ? 'border-red-400' : ''}`}
        />
        {fieldError('text')}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={SECONDARY}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? 'Saving…' : initial ? 'Save phrase' : 'Add phrase'}
        </button>
      </div>
    </form>
  );
}
