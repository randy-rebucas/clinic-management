'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Account } from '@/lib/account';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import SignatureSection from './SignatureSection';
import {
  ACCOUNT_UPDATED_EVENT,
  AccountHeader,
  FIELD,
  FOCUS_RING,
  Field,
  Notice,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  Section,
  dateLabel,
  describe,
  initials,
  readJson,
  type FieldErrors,
} from './shared';

interface Draft {
  firstName: string;
  lastName: string;
  title: string;
  phone: string;
}

function draftOf(account: Account): Draft {
  if (account.profile) {
    const { firstName, lastName, title, phone } = account.profile;
    return { firstName, lastName, title, phone };
  }
  // No staff profile: split the account name at its last space.
  const name = account.name.trim();
  const cut = name.lastIndexOf(' ');
  return {
    firstName: cut > 0 ? name.slice(0, cut) : name,
    lastName: cut > 0 ? name.slice(cut + 1) : '',
    title: '',
    phone: '',
  };
}

const sameDraft = (a: Draft, b: Draft) =>
  a.firstName.trim() === b.firstName.trim() &&
  a.lastName.trim() === b.lastName.trim() &&
  a.title.trim() === b.title.trim() &&
  a.phone.trim() === b.phone.trim();

export default function ProfileClient({ initial }: { initial: Account }) {
  const [account, setAccount] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const saved = draftOf(account);
  const dirty = !sameDraft(draft, saved);
  useUnsavedChanges(dirty, 'You have unsaved changes to your profile. Leave without saving?');

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft((d) => ({ ...d, [key]: e.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
    setNotice(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = await readJson(res);
      if (!res.ok || !body.success) {
        setErrors(body.fieldErrors ?? {});
        setNotice({ tone: 'error', text: body.error || 'Could not save your profile. Try again.' });
        return;
      }
      const next = body.data as Account;
      setAccount(next);
      setDraft(draftOf(next));
      setErrors({});
      setNotice({ tone: 'success', text: 'Profile saved.' });
      window.dispatchEvent(new CustomEvent(ACCOUNT_UPDATED_EVENT, { detail: { name: next.name } }));
    } catch {
      setNotice({ tone: 'error', text: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  }

  const displayName = [account.profile?.title, account.name].filter(Boolean).join(' ');
  const hasProfile = !!account.profile;

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <AccountHeader title="Your profile" subtitle="How you appear to the rest of the clinic." current="profile" />

        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-teal-light text-lg font-bold text-brand-teal-deep"
          >
            {initials(account.name)}
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold tracking-tight text-gray-900 truncate">{displayName}</p>
            <p className="text-sm text-gray-600 truncate">
              {account.roleLabel}
              {account.clinicName ? ` · ${account.clinicName}` : ''}
            </p>
          </div>
        </div>

        <div>
          <Section
            id="details"
            title="Your details"
            description={
              hasProfile
                ? 'Your name and title appear on visits, prescriptions and messages. Your phone is for clinic staff only.'
                : 'Your name appears on records you create and in messages.'
            }
          >
            <form onSubmit={save} noValidate className="flex flex-col">
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                {hasProfile && (
                  <div className="sm:col-span-2 sm:max-w-[12rem]">
                    <Field id="title" label="Title" hint="Optional, e.g. Dr., RN" errors={errors.title}>
                      <input
                        id="title"
                        value={draft.title}
                        onChange={set('title')}
                        maxLength={20}
                        autoComplete="honorific-prefix"
                        className={FIELD}
                        {...describe('title', errors.title, true)}
                      />
                    </Field>
                  </div>
                )}
                <Field id="firstName" label="First name" errors={errors.firstName}>
                  <input
                    id="firstName"
                    value={draft.firstName}
                    onChange={set('firstName')}
                    maxLength={60}
                    required
                    autoComplete="given-name"
                    className={FIELD}
                    {...describe('firstName', errors.firstName)}
                  />
                </Field>
                <Field id="lastName" label="Last name" errors={errors.lastName}>
                  <input
                    id="lastName"
                    value={draft.lastName}
                    onChange={set('lastName')}
                    maxLength={60}
                    required
                    autoComplete="family-name"
                    className={FIELD}
                    {...describe('lastName', errors.lastName)}
                  />
                </Field>
                {hasProfile && (
                  <Field
                    id="phone"
                    label={account.profile?.phoneRequired ? 'Phone' : 'Phone (optional)'}
                    errors={errors.phone}
                  >
                    <input
                      id="phone"
                      type="tel"
                      value={draft.phone}
                      onChange={set('phone')}
                      maxLength={30}
                      required={account.profile?.phoneRequired}
                      autoComplete="tel"
                      inputMode="tel"
                      className={FIELD}
                      {...describe('phone', errors.phone)}
                    />
                  </Field>
                )}
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between rounded-b-lg">
                <div className="min-h-[1.5rem]" aria-live="polite">
                  {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    disabled={!dirty || saving}
                    onClick={() => {
                      setDraft(saved);
                      setErrors({});
                      setNotice(null);
                    }}
                  >
                    Discard
                  </button>
                  <button type="submit" className={PRIMARY_BUTTON} disabled={!dirty || saving}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            </form>
          </Section>

          {account.doctorId && <SignatureSection doctorName={displayName} />}

          <Section id="account" title="Account" description="Set by your clinic. Ask an administrator if any of this is wrong.">
            <dl className="divide-y divide-gray-100">
              <Row label="Sign-in email">
                <span className="break-all">{account.email}</span>
              </Row>
              <Row label="Role">{account.roleLabel}</Row>
              {account.clinicName && <Row label="Clinic">{account.clinicName}</Row>}
              <Row label="Member since">{dateLabel(account.createdAt)}</Row>
              {account.doctorId && (
                <Row label="Doctor record">
                  <Link
                    href={`/doctors/${account.doctorId}`}
                    className={`font-semibold text-brand-teal-dark hover:text-brand-teal-deep rounded ${FOCUS_RING}`}
                  >
                    Licences, hours and specialty
                  </Link>
                </Row>
              )}
            </dl>
          </Section>

          <Section id="security" title="Sign-in & security" description="Your password, two-step verification and where you are signed in.">
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-700">
                Two-step verification is{' '}
                <span className={`font-semibold ${account.totpEnabled ? 'text-brand-teal-deep' : 'text-amber-800'}`}>
                  {account.totpEnabled ? 'on' : 'off'}
                </span>
                .{!account.totpEnabled && ' Turn it on so a stolen password alone can’t open patient records.'}
              </p>
              <Link href="/settings" className={SECONDARY_BUTTON}>
                Manage sign-in
              </Link>
            </div>
          </Section>
        </div>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{children}</dd>
    </div>
  );
}
