'use client';

import { FormEvent, useState } from 'react';

export const PRIVACY_EMAIL = 'privacy@myclinicsoft.solutions';

const accountTypes = [
  { value: 'eMCR patient account', label: 'eMCR patient app' },
  { value: 'eMedRoute medical rep account', label: 'eMedRoute (medical representative app)' },
  { value: 'Clinic staff account', label: 'My MyClinicSoft staff account' },
  { value: 'Whole clinic', label: 'My whole clinic (clinic administrators only)' },
];

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3.5 py-2.5 text-base text-gray-900 placeholder:text-gray-400 transition-colors duration-150 hover:border-gray-400 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/25';

const labelClass = 'block text-sm font-semibold text-gray-700 mb-1.5';

/**
 * Like ContactForm, there is no public endpoint: the request is composed in the
 * visitor's own mail app and sent to the Data Protection Officer from their address.
 */
export default function DeletionRequestForm() {
  const [opened, setOpened] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const accountType = String(data.get('accountType') ?? '');
    const name = String(data.get('name') ?? '').trim();
    const signIn = String(data.get('signIn') ?? '').trim();
    const clinic = String(data.get('clinic') ?? '').trim();
    const details = String(data.get('details') ?? '').trim();
    const lines = [
      'Please delete my account and the personal data associated with it.',
      '',
      `Account: ${accountType}`,
      `Name: ${name}`,
      `Mobile number or email I sign in with: ${signIn}`,
    ];
    if (clinic) lines.push(`Clinic: ${clinic}`);
    if (details) lines.push('', details);
    const body = lines.join('\n');
    const subject = `[Account deletion] ${accountType}`;
    window.location.href = `mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <div>
        <label htmlFor="deletion-account" className={labelClass}>
          Which account? <span className="text-red-500">*</span>
        </label>
        <select id="deletion-account" name="accountType" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Choose an account
          </option>
          {accountTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="deletion-name" className={labelClass}>
            Full name <span className="text-red-500">*</span>
          </label>
          <input id="deletion-name" name="name" required autoComplete="name" className={inputClass} />
        </div>
        <div>
          <label htmlFor="deletion-sign-in" className={labelClass}>
            Mobile number or email <span className="text-red-500">*</span>
          </label>
          <input
            id="deletion-sign-in"
            name="signIn"
            required
            autoComplete="username"
            placeholder="The one you sign in with"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor="deletion-clinic" className={labelClass}>
          Clinic <span className="font-normal text-gray-400">(staff and clinic requests)</span>
        </label>
        <input id="deletion-clinic" name="clinic" autoComplete="organization" className={inputClass} />
      </div>
      <div>
        <label htmlFor="deletion-details" className={labelClass}>
          Anything else? <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          id="deletion-details"
          name="details"
          rows={3}
          placeholder="For example, dependents to remove, or clinics whose records you also want erased"
          className={`${inputClass} resize-y`}
        />
      </div>
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500 max-w-xs">
          Opens your email app with the request ready to send to {PRIVACY_EMAIL}.
        </p>
        <button
          type="submit"
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-md bg-brand-teal px-6 py-3 font-semibold text-white shadow-[0_6px_20px_rgba(14,165,164,0.3)] transition-colors duration-150 hover:bg-brand-teal-dark"
        >
          Write request
        </button>
      </div>
      {opened && (
        <p role="status" className="rounded-md border border-brand-teal/30 bg-brand-teal-light/60 px-4 py-3 text-sm text-brand-teal-deep">
          Your email app should have opened. If it didn&apos;t, write to{' '}
          <a href={`mailto:${PRIVACY_EMAIL}`} className="font-semibold underline underline-offset-2">
            {PRIVACY_EMAIL}
          </a>{' '}
          with the details above.
        </p>
      )}
    </form>
  );
}
