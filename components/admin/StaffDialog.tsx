'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { FieldError, Label } from '../visits/form/parts';
import { StateBadge, inviteLine, lastSeen, useSend } from './users-shared';
import {
  STAFF_STATUS,
  STAFF_STATUSES,
  STAFF_TYPE,
  STAFF_TYPES,
  TYPE_FIELDS,
  accountState,
  staffName,
  type StaffRow,
  type StaffStatus,
  type StaffType,
} from '@/lib/staff';
import type { UserStatus } from '@/lib/users';

const PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const GHOST = `rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`;
const SEGMENT = 'flex rounded-md border border-gray-300 bg-white p-1';
const PHONE = /^[+0-9 ()-]{7,20}$/;
const EMAIL = /^\S+@\S+\.\S+$/;

interface Form {
  staffType: StaffType;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string;
  employeeId: string;
  department: string;
  specialization: string;
  licenseNumber: string;
  certification: string;
  hireDate: string;
  address: string;
  status: StaffStatus;
}

type FieldKey = 'firstName' | 'lastName' | 'email' | 'phone';

function initialForm(row: StaffRow | null, type: StaffType): Form {
  return {
    staffType: row?.staffType ?? type,
    firstName: row?.firstName ?? '',
    lastName: row?.lastName ?? '',
    email: row?.email ?? '',
    phone: row?.phone ?? '',
    title: row?.title ?? '',
    employeeId: row?.employeeId ?? '',
    department: row?.department ?? '',
    specialization: row?.specialization ?? '',
    licenseNumber: row?.licenseNumber ?? '',
    certification: row?.certification ?? '',
    // Dates are stored at midnight UTC from a date field; read them back the same way.
    hireDate: row?.hireDate ? row.hireDate.slice(0, 10) : '',
    address: row?.address ?? '',
    status: row?.status ?? 'active',
  };
}

function problems(f: Form): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  if (!f.firstName.trim()) out.firstName = 'Enter their first name.';
  if (!f.lastName.trim()) out.lastName = 'Enter their last name.';
  if (!f.email.trim()) out.email = 'Enter their email address; their invite goes there.';
  else if (!EMAIL.test(f.email.trim())) out.email = 'This doesn’t look like an email address.';
  if (!f.phone.trim()) out.phone = 'Enter a phone number.';
  else if (!PHONE.test(f.phone.trim())) out.phone = 'Use digits, spaces, +, ( ) or - only (7 to 20 characters).';
  return out;
}

/** What saving a status change does to sign-in, offered as a ticked choice. */
function accessOffer(row: StaffRow | null, status: StaffStatus): { to: UserStatus; label: string; hint: string } | null {
  const acc = row?.account;
  if (!row || !acc || status === row.status) return null;
  if (status === 'inactive' && acc.status !== 'inactive')
    return { to: 'inactive', label: 'Close their sign-in too', hint: 'They’re signed out at once. Everything they recorded stays under their name.' };
  if (status === 'on-leave' && acc.status === 'active')
    return { to: 'suspended', label: 'Suspend their sign-in while they’re away', hint: 'They’re signed out until you mark them active again.' };
  if (status === 'active' && acc.status === 'suspended')
    return { to: 'active', label: 'Let them sign in again', hint: 'Their sign-in was suspended.' };
  if (status === 'active' && acc.status === 'inactive')
    return { to: 'active', label: 'Reopen their sign-in', hint: 'The account counts against the plan’s account limit again.' };
  return null;
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

export default function StaffDialog({
  row,
  defaultType,
  isYou,
  emailReady,
  onClose,
  onSaved,
}: {
  /** null = add someone new. */
  row: StaffRow | null;
  defaultType: StaffType;
  isYou: boolean;
  emailReady: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const ids = useId();
  const send = useSend('The staff member couldn’t be saved');
  const [form, setForm] = useState<Form>(() => initialForm(row, defaultType));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyAccess, setApplyAccess] = useState(true);
  const refs = useRef<Partial<Record<FieldKey, HTMLInputElement | null>>>({});

  const editing = row !== null;
  const issues = tried ? problems(form) : {};
  const fields = TYPE_FIELDS[form.staffType];
  const offer = isYou ? null : accessOffer(row, form.status);
  const state = row ? accountState(row) : null;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    const found = problems(form);
    const firstBad = (Object.keys(found) as FieldKey[])[0];
    if (firstBad) {
      refs.current[firstBad]?.focus();
      return;
    }
    setBusy(true);
    setError(null);

    const body: Record<string, unknown> = {
      staffType: form.staffType,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      employeeId: form.employeeId.trim(),
      department: form.department.trim(),
      address: form.address.trim(),
      hireDate: form.hireDate,
    };
    for (const key of fields) body[key] = form[key].trim();
    if (editing) {
      body.status = form.status;
      if (offer && applyAccess) body.account = { status: offer.to };
    }

    const result = await send(editing ? `/api/staff/${row._id}` : '/api/staff', editing ? 'PUT' : 'POST', body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const name = `${form.firstName.trim()} ${form.lastName.trim()}`;
    const email = form.email.trim();
    if (!editing) {
      const account = (result.data as { account?: string })?.account;
      const job = STAFF_TYPE[form.staffType].label.toLowerCase();
      onSaved(
        account === 'invited'
          ? emailReady
            ? `Added ${name} as a ${job}. An invite to set their password is on its way to ${email}; the link works for 72 hours.`
            : `Added ${name} as a ${job}. Email isn’t set up on this server, so no invite went out; send one from their row once it is.`
          : account === 'linked'
            ? `Added ${name} as a ${job}, linked to the account this clinic already has for ${email}.`
            : `Added ${name} as a ${job}, but no sign-in account was made. Check that the ${STAFF_TYPE[form.staffType].label} role is set up on Roles.`
      );
      return;
    }
    const data = result.data as { accountError?: string | null };
    if (data?.accountError) {
      onSaved(`Saved ${name}’s details, but their sign-in didn’t change: ${data.accountError}`);
      return;
    }
    const access = offer && applyAccess ? { inactive: ' Their sign-in is closed.', suspended: ' Their sign-in is suspended.', active: ' They can sign in again.' }[offer.to] : '';
    onSaved(`Saved ${name}’s details.${access}`);
  };

  const input = (key: FieldKey, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <Label htmlFor={`${ids}-${key}`}>{label}</Label>
      <input
        id={`${ids}-${key}`}
        ref={(el) => {
          refs.current[key] = el;
        }}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={!!issues[key]}
        aria-describedby={issues[key] ? `${ids}-${key}-err` : undefined}
        autoComplete="off"
        className={`${FIELD} ${issues[key] ? 'border-red-400' : ''}`}
        {...props}
      />
      {issues[key] && <FieldError id={`${ids}-${key}-err`}>{issues[key]}</FieldError>}
    </div>
  );

  const optional = (key: Exclude<keyof Form, FieldKey | 'staffType' | 'status' | 'address'>, label: string, placeholder?: string, type = 'text') => (
    <div>
      <Label htmlFor={`${ids}-${key}`} optional>
        {label}
      </Label>
      <input
        id={`${ids}-${key}`}
        type={type}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={FIELD}
      />
    </div>
  );

  const issueCount = Object.keys(issues).length;

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-2xl" labelledBy={`${ids}-title`} closeOnBackdrop={false}>
      <form onSubmit={save} noValidate>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
            {editing ? staffName(row) : 'Add a staff member'}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {editing
              ? `${STAFF_TYPE[row.staffType].label}. To change someone’s job, add them again under the new one and mark this profile inactive.`
              : 'They get an emailed invite to set their own password. Doctors are added from the Doctors page.'}
          </p>
        </div>

        <div className="divide-y divide-gray-100">
          {!editing && (
            <Section title="Job">
              <div className={SEGMENT} role="radiogroup" aria-label="Job">
                {STAFF_TYPES.map((t) => {
                  const on = form.staffType === t;
                  return (
                    <label
                      key={t}
                      className={`flex-1 cursor-pointer rounded px-3 py-1.5 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal ${
                        on ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <input type="radio" name={`${ids}-type`} value={t} checked={on} onChange={() => set('staffType', t)} className="sr-only" />
                      {STAFF_TYPE[t].label}
                    </label>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="Name and contact">
            <div className="grid gap-4 sm:grid-cols-2">
              {input('firstName', 'First name')}
              {input('lastName', 'Last name')}
              {input('email', 'Email', { type: 'email', inputMode: 'email' })}
              {input('phone', 'Phone', { type: 'tel', inputMode: 'tel', placeholder: '0917 123 4567' })}
            </div>
            {editing && row.account && form.email.trim().toLowerCase() !== row.email.toLowerCase() && (
              <p className="mt-3 flex items-start gap-1.5 text-sm text-amber-800">
                <Svg d={ICON.alert} className="mt-0.5 h-4 w-4 shrink-0" />
                They sign in with their email, so they’ll be signed out and use the new address from now on.
              </p>
            )}
          </Section>

          <Section title="Work">
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.includes('title') && optional('title', 'Title', 'e.g. RN')}
              {fields.includes('specialization') && optional('specialization', 'Specialization', 'e.g. Pediatrics')}
              {fields.includes('certification') && optional('certification', 'Certification', 'e.g. CPA')}
              {fields.includes('licenseNumber') && optional('licenseNumber', 'Licence number')}
              {optional('employeeId', 'Employee ID')}
              {optional('department', 'Department')}
              {optional('hireDate', 'Started on', undefined, 'date')}
            </div>
            <div className="mt-4">
              <Label htmlFor={`${ids}-address`} optional>
                Home address
              </Label>
              <textarea
                id={`${ids}-address`}
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                rows={2}
                maxLength={500}
                autoComplete="off"
                className={FIELD}
              />
            </div>
          </Section>

          {editing && (
            <Section title="Status">
              <div className={`${SEGMENT} max-w-md`} role="radiogroup" aria-label="Status">
                {STAFF_STATUSES.map((s) => {
                  const on = form.status === s;
                  return (
                    <label
                      key={s}
                      className={`flex-1 cursor-pointer rounded px-3 py-1.5 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal ${
                        on ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${ids}-status`}
                        value={s}
                        checked={on}
                        onChange={() => {
                          set('status', s);
                          setApplyAccess(true);
                        }}
                        className="sr-only"
                      />
                      {STAFF_STATUS[s].label}
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-sm text-gray-500">{STAFF_STATUS[form.status].hint}.</p>
              {offer && (
                <label className="motion-panel-in mt-3 flex cursor-pointer items-start gap-2.5 rounded-md border border-gray-200 bg-gray-50/60 px-3 py-2.5">
                  <input type="checkbox" checked={applyAccess} onChange={(e) => setApplyAccess(e.target.checked)} className="mt-0.5 accent-brand-teal-dark" />
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{offer.label}</span>
                    <span className="block text-sm text-gray-500">{offer.hint}</span>
                  </span>
                </label>
              )}
              {isYou && form.status !== row.status && (
                <p className="mt-3 text-sm text-gray-600">This is your own profile, so your sign-in stays as it is.</p>
              )}
            </Section>
          )}

          {editing && (
            <Section title="Signing in">
              {row.account && state && state !== 'none' ? (
                <>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                    <StateBadge state={state} />
                    {state === 'invited' || state === 'invite-expired' ? (
                      <span className={state === 'invite-expired' ? 'text-amber-800' : ''}>{inviteLine(row.account, state)}</span>
                    ) : (
                      <span>
                        Last signed in <span className="font-mono tabular-nums text-gray-900">{lastSeen(row.account.lastLogin)}</span>
                      </span>
                    )}
                  </p>
                  <Link href="/admin/users" className={`mt-3 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                    Role, password reset and two-step on Users
                    <Svg d={ICON.arrow} />
                  </Link>
                </>
              ) : (
                <p className="text-sm text-gray-600">
                  No sign-in account is linked to this profile, so they can’t sign in. That happens when the {STAFF_TYPE[row.staffType].label} role
                  isn’t set up in this clinic; add it on{' '}
                  <Link href="/admin/roles" className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                    Roles
                  </Link>{' '}
                  and add them again.
                </p>
              )}
            </Section>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-gray-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p
            className={`text-sm ${error || issueCount ? 'font-medium text-red-700' : 'text-gray-500'}`}
            role={error ? 'alert' : undefined}
            aria-live="polite"
          >
            {error ??
              (issueCount
                ? `${issueCount} ${issueCount === 1 ? 'thing needs' : 'things need'} fixing.`
                : busy
                  ? 'Saving…'
                  : editing
                    ? ''
                    : emailReady
                      ? `Saving emails ${form.email.trim() || 'them'} an invite.`
                      : 'Email isn’t set up, so no invite will go out yet.')}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={GHOST}>
              Cancel
            </button>
            <button type="submit" disabled={busy} aria-busy={busy} className={PRIMARY}>
              <Svg d={ICON.check} />
              {busy ? 'Saving…' : editing ? 'Save changes' : `Add ${STAFF_TYPE[form.staffType].label.toLowerCase()}`}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
