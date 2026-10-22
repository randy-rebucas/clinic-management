'use client';

import { useState } from 'react';
import { callPlatform } from './platform-api';
import { ago } from './shared';

/** Email a subscription sales invoice to the clinic again (platform console). */
export default function InvoiceResendButton({ id, emailedAt }: { id: string; emailedAt: string | null }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(emailedAt ? `emailed ${ago(emailedAt)}` : 'not emailed');
  async function resend() {
    setBusy(true);
    const r = await callPlatform<{ emailedTo: string }>(`/api/platform/invoices/${id}/resend`, 'POST');
    setBusy(false);
    setText(r.ok ? `sent to ${r.data.emailedTo}` : r.error);
  }
  return (
    <span className="inline-flex items-center gap-2 text-gray-500">
      <span role="status">{text}</span>
      <button type="button" onClick={resend} disabled={busy} className="font-semibold text-brand-teal-dark hover:underline disabled:opacity-60">
        {busy ? 'Sending…' : 'Resend'}
      </button>
    </span>
  );
}
