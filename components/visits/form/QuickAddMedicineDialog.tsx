'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { Modal } from '../../ui/Modal';
import { FIELD, FOCUS_RING } from '../../appointments/shared';
import { FORM_LABEL, MEDICINE_FORMS, MEDICINE_ROUTES, ROUTE_LABEL, type MedicineForm, type MedicineRoute } from '@/lib/medicines';

const BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const PRIMARY = `${BUTTON} bg-brand-teal-dark text-white hover:bg-brand-teal-deep`;
const SECONDARY = `${BUTTON} border border-gray-300 bg-white text-gray-900 hover:border-gray-900`;

export interface QuickAddDraft {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

/** A form's usual route, so most medicines need only the name, strength and category. */
const ROUTE_FOR: Partial<Record<MedicineForm, MedicineRoute>> = {
  tablet: 'oral',
  capsule: 'oral',
  syrup: 'oral',
  injection: 'im',
  cream: 'topical',
  inhaler: 'inhalation',
};

/**
 * Adds a medicine the doctor typed to the clinic's medicines list (POST /api/medicines) without
 * leaving the visit. The dose, frequency and duration already on the row become its usual ones.
 */
export function QuickAddMedicineDialog({ draft, onClose, onAdded }: { draft: QuickAddDraft; onClose: () => void; onAdded: (name: string) => void }) {
  const ids = useId();
  const [name, setName] = useState(draft.name);
  const [strength, setStrength] = useState(/\d/.test(draft.dosage) ? draft.dosage : '');
  const [form, setForm] = useState<MedicineForm>('tablet');
  const [route, setRoute] = useState<MedicineRoute>('oral');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    if (!name.trim() || !strength.trim() || !category.trim()) {
      setError('Enter the name, strength and category.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/medicines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          strength: strength.trim(),
          form,
          route,
          category: category.trim(),
          standardDosage: draft.dosage.trim(),
          standardFrequency: draft.frequency.trim(),
          duration: draft.duration.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      // Already on the list (409): nothing to add, so just use it.
      if (res.ok || res.status === 409) {
        onAdded(name.trim());
        onClose();
        return;
      }
      setError(res.status === 403 ? 'You don’t have permission to add medicines. Ask a clinic admin.' : json?.error || 'Could not add the medicine.');
    } catch {
      setError('Could not add the medicine. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} labelledBy={`${ids}-h`} className="max-w-md">
      {/* Not a <form>: the Modal renders inside the visit form. Enter adds here instead of saving the visit. */}
      <div
        className="flex flex-col gap-4 p-5"
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <div>
          <h2 id={`${ids}-h`} className="text-lg font-bold tracking-tight text-gray-900">
            Add to the medicines list
          </h2>
          <p className="mt-1 text-sm text-gray-600">Next time it shows up first when anyone in the clinic prescribes it.</p>
        </div>
        <div>
          <label htmlFor={`${ids}-name`} className="mb-1.5 block text-sm font-medium text-gray-700">
            Name
          </label>
          <input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={FIELD} placeholder="As it should print, e.g. Amoxicillin" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${ids}-strength`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Strength
            </label>
            <input id={`${ids}-strength`} value={strength} onChange={(e) => setStrength(e.target.value)} maxLength={200} autoFocus className={FIELD} placeholder="500 mg or 250 mg/5 mL" />
          </div>
          <div>
            <label htmlFor={`${ids}-category`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Category
            </label>
            <input id={`${ids}-category`} value={category} onChange={(e) => setCategory(e.target.value)} maxLength={200} className={FIELD} placeholder="e.g. Antibiotic" />
          </div>
          <div>
            <label htmlFor={`${ids}-form`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Form
            </label>
            <select
              id={`${ids}-form`}
              value={form}
              onChange={(e) => {
                const next = e.target.value as MedicineForm;
                setForm(next);
                if (ROUTE_FOR[next]) setRoute(ROUTE_FOR[next]!);
              }}
              className={FIELD}
            >
              {MEDICINE_FORMS.map((f) => (
                <option key={f} value={f}>
                  {FORM_LABEL[f]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-route`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Route
            </label>
            <select id={`${ids}-route`} value={route} onChange={(e) => setRoute(e.target.value as MedicineRoute)} className={FIELD}>
              {MEDICINE_ROUTES.map((r) => (
                <option key={r} value={r}>
                  {ROUTE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={SECONDARY}>
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy} className={PRIMARY}>
            {busy ? 'Adding…' : 'Add medicine'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
