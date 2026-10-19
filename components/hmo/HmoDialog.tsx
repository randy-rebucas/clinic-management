'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { FieldError, Label } from '../visits/form/parts';
import { useSend } from '../admin/users-shared';
import { HMO_KINDS, HMO_KIND_LABEL, type HmoKind, type HmoRow } from '@/lib/hmo';

const PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const GHOST = `rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`;
const SEGMENT = 'cursor-pointer rounded px-3 py-1.5 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal';

interface Form {
  name: string;
  kind: HmoKind;
  code: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  paymentTermsDays: string;
  withholdingServicesRate: string;
  withholdingProfessionalRate: string;
  requiresLoa: boolean;
  notes: string;
  active: boolean;
}

type FieldKey = 'name' | 'email' | 'paymentTermsDays' | 'withholdingServicesRate' | 'withholdingProfessionalRate';

const initial = (row: HmoRow | null): Form => ({
  name: row?.name ?? '',
  kind: row?.kind ?? 'hmo',
  code: row?.code ?? '',
  contactName: row?.contactName ?? '',
  email: row?.email ?? '',
  phone: row?.phone ?? '',
  address: row?.address ?? '',
  paymentTermsDays: String(row?.paymentTermsDays ?? 30),
  withholdingServicesRate: String(row?.withholdingServicesRate ?? 2),
  withholdingProfessionalRate: String(row?.withholdingProfessionalRate ?? 10),
  requiresLoa: row?.requiresLoa ?? true,
  notes: row?.notes ?? '',
  active: row?.active ?? true,
});

const pct = (s: string) => s.trim() !== '' && Number.isFinite(Number(s)) && Number(s) >= 0 && Number(s) <= 100;

function problems(f: Form): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  if (!f.name.trim()) out.name = 'Enter the name, as it appears on the member’s card.';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) out.email = 'That doesn’t look like an email address.';
  if (!/^\d+$/.test(f.paymentTermsDays.trim())) out.paymentTermsDays = 'Whole days, 0 or more.';
  if (!pct(f.withholdingServicesRate)) out.withholdingServicesRate = 'A percentage from 0 to 100.';
  if (!pct(f.withholdingProfessionalRate)) out.withholdingProfessionalRate = 'A percentage from 0 to 100.';
  return out;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="px-6 py-5">
      <h3 className="text-sm font-bold tracking-tight text-gray-900">{title}</h3>
      {hint && <p className="mt-0.5 text-sm text-gray-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Add or change an HMO, insurer or company account the clinic bills. */
export default function HmoDialog({ row, rows, onClose, onSaved }: { row: HmoRow | null; rows: HmoRow[]; onClose: () => void; onSaved: (message: string) => void }) {
  const ids = useId();
  const send = useSend('The HMO couldn’t be saved');
  const [form, setForm] = useState<Form>(() => initial(row));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<Partial<Record<FieldKey, HTMLInputElement | null>>>({});
  const editing = row !== null;
  const issues = tried ? problems(form) : {};
  const issueCount = Object.keys(issues).length;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const sameName = form.name.trim() ? rows.find((r) => r._id !== row?._id && r.name.trim().toLowerCase() === form.name.trim().toLowerCase()) : undefined;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    const found = problems(form);
    const first = (Object.keys(found) as FieldKey[])[0];
    if (first) {
      refs.current[first]?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      name: form.name.trim(),
      kind: form.kind,
      code: form.code.trim(),
      contactName: form.contactName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      paymentTermsDays: Number(form.paymentTermsDays),
      withholdingServicesRate: Number(form.withholdingServicesRate),
      withholdingProfessionalRate: Number(form.withholdingProfessionalRate),
      requiresLoa: form.requiresLoa,
      notes: form.notes.trim(),
      active: form.active,
    };
    const result = await send(editing ? `/api/hmos/${row._id}` : '/api/hmos', editing ? 'PUT' : 'POST', body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(editing ? `Saved ${body.name}.` : `Added ${body.name}. Pick it on an invoice’s insurer section to bill it.`);
  };

  const input = (key: FieldKey | 'code' | 'contactName' | 'phone' | 'address', label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, optional = false) => {
    const err = (issues as Record<string, string | undefined>)[key];
    return (
      <div>
        <Label htmlFor={`${ids}-${key}`} optional={optional}>
          {label}
        </Label>
        <input
          id={`${ids}-${key}`}
          ref={(el) => {
            refs.current[key as FieldKey] = el;
          }}
          value={form[key] as string}
          onChange={(e) => set(key, e.target.value)}
          aria-invalid={!!err}
          aria-describedby={err ? `${ids}-${key}-err` : undefined}
          autoComplete="off"
          {...props}
          className={`${FIELD} ${err ? 'border-red-400' : ''} ${props.className ?? ''}`}
        />
        {err && <FieldError id={`${ids}-${key}-err`}>{err}</FieldError>}
      </div>
    );
  };

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-2xl" labelledBy={`${ids}-title`} closeOnBackdrop={false}>
      <form onSubmit={save} noValidate>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
            {editing ? row.name : 'Add an HMO'}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">Claims to it are sent together in transmittals, and its payments are matched to them.</p>
        </div>

        <div className="divide-y divide-gray-100">
          <Section title="Who it is">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <div>
                  {input('name', 'Name', { maxLength: 200, placeholder: 'e.g. Maxicare Healthcare Corp.' })}
                  {sameName && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-sm text-amber-800">
                      <Svg d={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Already on the list.
                    </p>
                  )}
                </div>
                {input('code', 'Short code', { maxLength: 50, className: 'font-mono uppercase' }, true)}
              </div>
              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-gray-700">Kind</legend>
                <div className="grid grid-cols-3 gap-1 rounded-md border border-gray-300 bg-white p-1">
                  {HMO_KINDS.map((k) => {
                    const on = form.kind === k;
                    return (
                      <label key={k} className={`${SEGMENT} ${on ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                        <input type="radio" name={`${ids}-kind`} checked={on} onChange={() => set('kind', k)} className="sr-only" />
                        {HMO_KIND_LABEL[k]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </Section>

          <Section title="Sending claims">
            <div className="grid gap-4 sm:grid-cols-2">
              {input('contactName', 'Claims contact', { maxLength: 200 }, true)}
              {input('email', 'Email', { type: 'email', maxLength: 254 }, true)}
              {input('phone', 'Phone', { maxLength: 50, inputMode: 'tel', className: 'font-mono' }, true)}
              {input('paymentTermsDays', 'Pays within (days)', { inputMode: 'numeric', className: 'font-mono tabular-nums' })}
              <div className="sm:col-span-2">{input('address', 'Address for transmittals', { maxLength: 500 }, true)}</div>
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input type="checkbox" checked={form.requiresLoa} onChange={(e) => set('requiresLoa', e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
              <span>
                <span className="font-semibold text-gray-900">Needs an LOA on every claim</span>
                <span className="block text-gray-500">A claim without the letter of authorization number can’t be put in a transmittal.</span>
              </span>
            </label>
          </Section>

          <Section title="Tax it withholds" hint="Expanded withholding tax, certified on BIR Form 2307. Used to suggest what to expect; the real figure is entered from each remittance.">
            <div className="grid gap-4 sm:grid-cols-2">
              {input('withholdingServicesRate', 'On clinic services (%)', { inputMode: 'decimal', className: 'font-mono tabular-nums' })}
              {input('withholdingProfessionalRate', 'On professional fees (%)', { inputMode: 'decimal', className: 'font-mono tabular-nums' })}
            </div>
          </Section>

          <Section title="Notes for billing staff">
            <Label htmlFor={`${ids}-notes`} optional>
              Notes
            </Label>
            <textarea id={`${ids}-notes`} value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} maxLength={5000} className={FIELD} />
            {editing && (
              <label className="mt-4 flex items-start gap-3 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
                <span>
                  <span className="font-semibold text-gray-900">Still accepted</span>
                  <span className="block text-gray-500">Off, it’s no longer offered on new invoices. Claims already made are kept.</span>
                </span>
              </label>
            )}
          </Section>
        </div>

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-gray-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${error || issueCount ? 'font-medium text-red-700' : 'text-gray-500'}`} role={error ? 'alert' : undefined} aria-live="polite">
            {error ?? (issueCount ? `${issueCount} ${issueCount === 1 ? 'thing needs' : 'things need'} fixing.` : busy ? 'Saving…' : 'Changes are recorded in the audit log.')}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={GHOST}>
              Cancel
            </button>
            <button type="submit" disabled={busy} aria-busy={busy} className={PRIMARY}>
              <Svg d={ICON.check} />
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add the HMO'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
