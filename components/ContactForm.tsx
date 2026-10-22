'use client';

import { FormEvent, useState } from 'react';
import { SUPPORT_EMAIL } from '@/components/PublicPage';

const topics = [
  { value: 'Support', label: 'Help with my clinic account' },
  { value: 'Patient question', label: 'I’m a patient / eMCR' },
  { value: 'Sales', label: 'Pricing or a demo' },
  { value: 'Billing', label: 'Billing' },
  { value: 'Feature request', label: 'Feature request' },
  { value: 'Bug report', label: 'Report a bug' },
  { value: 'Other', label: 'Something else' },
];

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3.5 py-2.5 text-base text-gray-900 placeholder:text-gray-400 transition-colors duration-150 hover:border-gray-400 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/25';

const labelClass = 'block text-sm font-semibold text-gray-700 mb-1.5';

/**
 * There is no public message endpoint, so the form composes the email in the
 * visitor's own mail app — nothing is sent until they press send there.
 */
export default function ContactForm({ defaultTopic = '' }: { defaultTopic?: string }) {
  const [opened, setOpened] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const clinic = String(data.get('clinic') ?? '').trim();
    const topic = String(data.get('topic') ?? 'Other');
    const message = String(data.get('message') ?? '').trim();
    const body = [message, '', '—', name, clinic && `Clinic: ${clinic}`].filter((l) => l !== '').join('\n');
    const subject = `[${topic}] Message from ${name}`;
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="contact-name" className={labelClass}>
            Your name <span className="text-red-500">*</span>
          </label>
          <input id="contact-name" name="name" required autoComplete="name" className={inputClass} />
        </div>
        <div>
          <label htmlFor="contact-clinic" className={labelClass}>
            Clinic <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input id="contact-clinic" name="clinic" autoComplete="organization" className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="contact-topic" className={labelClass}>
          What&apos;s it about? <span className="text-red-500">*</span>
        </label>
        <select id="contact-topic" name="topic" required defaultValue={defaultTopic} className={inputClass}>
          <option value="" disabled>
            Choose a topic
          </option>
          {topics.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="contact-message" className={labelClass}>
          Message <span className="text-red-500">*</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={6}
          required
          placeholder="How can we help?"
          className={`${inputClass} resize-y`}
        />
      </div>
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500 max-w-xs">
          Opens your email app with the message ready to send to {SUPPORT_EMAIL}.
        </p>
        <button
          type="submit"
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-md bg-brand-teal px-6 py-3 font-semibold text-white shadow-[0_6px_20px_rgba(14,165,164,0.3)] transition-colors duration-150 hover:bg-brand-teal-dark"
        >
          Write email
        </button>
      </div>
      {opened && (
        <p role="status" className="rounded-md border border-brand-teal/30 bg-brand-teal-light/60 px-4 py-3 text-sm text-brand-teal-deep">
          Your email app should have opened. If it didn&apos;t, write to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline underline-offset-2">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      )}
    </form>
  );
}
