'use client';

import { useState } from 'react';
import { formatApiError } from '../utils/apiError';
import { FIELD, FOCUS_RING } from '../appointments/shared';
import { PROVIDER_LABEL, QR_MAX_BYTES, type PaymentAccountView } from '@/lib/payments/account-schema';
import type { PaymentProvider } from '@/lib/payments/providers';

const PRIMARY = `rounded-md bg-brand-teal-dark px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const OUTLINE = `rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 hover:border-gray-900 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const LABEL = 'mb-1.5 block text-sm font-medium text-gray-700';

type Online = { provider: PaymentProvider; label: string; keyHint: string };
type Note = { ok: boolean; text: string } | null;

async function call(url: string, method: string, body?: unknown): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) return { ok: false, error: formatApiError(json, 'That didn’t go through') };
    return { ok: true, data: json.data };
  } catch {
    return { ok: false, error: 'The server couldn’t be reached. Nothing was changed.' };
  }
}

/**
 * The payment accounts patients pay this clinic (or one doctor) into: online providers with the
 * clinic's own keys, and GCash/Maya QR or bank details shown on the pay page.
 */
export default function PaymentAccountsClient({
  initial,
  providers,
  scope,
  doctors,
}: {
  initial: PaymentAccountView[];
  providers: Online[];
  /** clinic: an admin managing everything; mine: a doctor managing their own. */
  scope: 'clinic' | 'mine';
  doctors?: Array<{ id: string; name: string }>;
}) {
  const [accounts, setAccounts] = useState(initial);
  const [editing, setEditing] = useState<PaymentAccountView | 'new' | null>(initial.length ? null : 'new');
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const replace = (a: PaymentAccountView) => setAccounts((list) => list.map((x) => (x.id === a.id ? a : a.isDefault && x.ownerType === a.ownerType && x.doctorId === a.doctorId ? { ...x, isDefault: false } : x)));

  async function act(a: PaymentAccountView, body: Record<string, unknown>, ok: string) {
    setBusy(a.id);
    const r = await call(`/api/payment-accounts/${a.id}`, 'PATCH', { label: a.label, ...body });
    setBusy(null);
    if (!r.ok) return setNote({ ok: false, text: r.error });
    replace(r.data);
    setNote({ ok: true, text: ok });
  }

  async function test(a: PaymentAccountView) {
    setBusy(a.id);
    const r = await call(`/api/payment-accounts/${a.id}/test`, 'POST');
    setBusy(null);
    setNote(r.ok ? { ok: true, text: `${PROVIDER_LABEL[a.provider]} accepted the key (${r.data.mode} mode).` } : { ok: false, text: r.error });
  }

  async function remove(a: PaymentAccountView) {
    if (!window.confirm(`Remove “${a.label}”? Patients can no longer pay into it. Payments already made stay on their invoices.`)) return;
    setBusy(a.id);
    const r = await call(`/api/payment-accounts/${a.id}`, 'DELETE');
    setBusy(null);
    if (!r.ok) return setNote({ ok: false, text: r.error });
    setAccounts((list) => list.filter((x) => x.id !== a.id));
    setNote({ ok: true, text: 'Account removed.' });
  }

  return (
    <div className="space-y-5">
      {note && (
        <p role={note.ok ? 'status' : 'alert'} className={`rounded-md border px-4 py-2.5 text-sm ${note.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {note.text}
        </p>
      )}

      {accounts.length === 0 && editing !== 'new' && (
        <p className="rounded-lg border border-dashed border-gray-300 px-5 py-8 text-center text-sm text-gray-600">No payment accounts yet.</p>
      )}

      <ul className="space-y-3">
        {accounts.map((a) => (
          <li key={a.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">
                  {a.label}{' '}
                  {a.isDefault && <span className="ml-1 rounded-full bg-brand-teal-light px-2 py-0.5 text-xs font-semibold text-brand-teal-deep">Default</span>}
                  {!a.enabled && <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">Off</span>}
                </p>
                <p className="text-sm text-gray-600">
                  {PROVIDER_LABEL[a.provider]}
                  {a.ownerType === 'doctor' ? ` · ${a.doctorName ?? 'Doctor'}’s own` : ' · Clinic'}
                  {a.online && a.secretLast4 ? ` · key …${a.secretLast4} (${a.mode ?? 'unknown'} mode)` : ''}
                </p>
                {a.online && (
                  <div className="mt-2 text-xs text-gray-600">
                    <p>
                      Webhook URL
                      {a.webhookSecretSet || a.provider === 'maya' ? '' : <span className="font-semibold text-amber-700"> (no webhook secret yet: payments won’t be recorded automatically)</span>}:
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="break-all font-mono text-gray-800">{a.webhookUrl}</span>
                      <button type="button" onClick={() => a.webhookUrl && navigator.clipboard?.writeText(a.webhookUrl)} className={`font-semibold text-brand-teal-dark hover:underline ${FOCUS_RING}`}>
                        Copy
                      </button>
                    </p>
                    {a.provider === 'paymongo' && <p className="mt-0.5 text-gray-500">Register it in PayMongo for checkout_session.payment.paid and payment.refunded.</p>}
                    {a.provider === 'xendit' && <p className="mt-0.5 text-gray-500">Register it in Xendit for payment session events (payment_session.completed).</p>}
                    {a.provider === 'maya' && <p className="mt-0.5 text-gray-500">Register it in Maya Business Manager for PAYMENT_SUCCESS.</p>}
                  </div>
                )}
                {a.manual && (
                  <p className="mt-1 text-sm text-gray-700">
                    {[a.manual.bankName, a.manual.accountName, a.manual.number].filter(Boolean).join(' · ')}
                    {a.manual.hasQr ? ' · QR code' : ''}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {!a.isDefault && a.enabled && (
                  <button type="button" disabled={busy !== null} onClick={() => act(a, { isDefault: true }, `“${a.label}” is now the default.`)} className={OUTLINE}>Make default</button>
                )}
                {a.online && <button type="button" disabled={busy !== null} onClick={() => test(a)} className={OUTLINE}>Test</button>}
                <button type="button" disabled={busy !== null} onClick={() => setEditing(a)} className={OUTLINE}>Edit</button>
                <button type="button" disabled={busy !== null} onClick={() => act(a, { enabled: !a.enabled }, a.enabled ? 'Turned off.' : 'Turned on.')} className={OUTLINE}>
                  {a.enabled ? 'Turn off' : 'Turn on'}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => remove(a)} className={`${OUTLINE} text-rose-700`}>Remove</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {editing ? (
        <AccountForm
          key={editing === 'new' ? 'new' : editing.id}
          existing={editing === 'new' ? null : editing}
          providers={providers}
          scope={scope}
          doctors={doctors}
          onCancel={accounts.length ? () => setEditing(null) : undefined}
          onSaved={(a, isNew) => {
            if (isNew) setAccounts((list) => [...list.map((x) => (a.isDefault && x.ownerType === a.ownerType && x.doctorId === a.doctorId ? { ...x, isDefault: false } : x)), a]);
            else replace(a);
            setEditing(null);
            setNote({ ok: true, text: isNew ? `“${a.label}” connected.` : 'Saved.' });
          }}
        />
      ) : (
        <button type="button" onClick={() => setEditing('new')} className={PRIMARY}>Add a payment account</button>
      )}
    </div>
  );
}

function AccountForm({
  existing,
  providers,
  scope,
  doctors,
  onCancel,
  onSaved,
}: {
  existing: PaymentAccountView | null;
  providers: Online[];
  scope: 'clinic' | 'mine';
  doctors?: Array<{ id: string; name: string }>;
  onCancel?: () => void;
  onSaved: (a: PaymentAccountView, isNew: boolean) => void;
}) {
  const kinds: Array<{ provider: PaymentProvider; label: string; keyHint?: string }> = [
    ...providers,
    { provider: 'manual_qr', label: PROVIDER_LABEL.manual_qr },
    { provider: 'bank_transfer', label: PROVIDER_LABEL.bank_transfer },
  ];
  const [provider, setProvider] = useState<PaymentProvider>(existing?.provider ?? kinds[0].provider);
  const [label, setLabel] = useState(existing?.label ?? '');
  const [owner, setOwner] = useState(existing ? (existing.ownerType === 'doctor' ? existing.doctorId ?? '' : 'clinic') : scope === 'mine' ? 'mine' : 'clinic');
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [publicKey, setPublicKey] = useState(existing?.publicKey ?? '');
  const [accountName, setAccountName] = useState(existing?.manual?.accountName ?? '');
  const [number, setNumber] = useState(existing?.manual?.number ?? '');
  const [bankName, setBankName] = useState(existing?.manual?.bankName ?? '');
  const [instructions, setInstructions] = useState(existing?.manual?.instructions ?? '');
  const [qrImage, setQrImage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = provider === 'paymongo' || provider === 'xendit' || provider === 'maya';
  const hint = kinds.find((k) => k.provider === provider)?.keyHint;

  function pickQr(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setError('Upload a PNG, JPEG or WebP image of the QR code.');
    if (file.size > QR_MAX_BYTES) return setError('The QR image is too large (300 KB at most). Crop it to the code.');
    const reader = new FileReader();
    reader.onload = () => setQrImage(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const common = {
      label,
      ...(online
        ? { ...(secretKey ? { secretKey } : {}), ...(webhookSecret ? { webhookSecret } : {}), ...(provider === 'maya' ? { publicKey } : {}) }
        : { manual: { accountName, number, bankName, instructions, ...(qrImage !== undefined ? { qrImage } : {}) } }),
    };
    const r = existing
      ? await call(`/api/payment-accounts/${existing.id}`, 'PATCH', common)
      : await call('/api/payment-accounts', 'POST', {
          ...common,
          provider,
          ownerType: owner === 'clinic' ? 'clinic' : 'doctor',
          ...(owner !== 'clinic' && owner !== 'mine' ? { doctorId: owner } : {}),
        });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSaved(r.data, !existing);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-base font-semibold text-gray-900">{existing ? `Edit “${existing.label}”` : 'Add a payment account'}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {!existing && (
          <div>
            <label htmlFor="pa-provider" className={LABEL}>Type</label>
            <select id="pa-provider" value={provider} onChange={(e) => setProvider(e.target.value as PaymentProvider)} className={FIELD}>
              {kinds.map((k) => <option key={k.provider} value={k.provider}>{k.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="pa-label" className={LABEL}>Name</label>
          <input id="pa-label" required maxLength={100} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={online ? 'e.g. Clinic PayMongo' : 'e.g. Clinic GCash'} className={FIELD} />
        </div>
        {!existing && scope === 'clinic' && doctors && doctors.length > 0 && (
          <div>
            <label htmlFor="pa-owner" className={LABEL}>Whose account</label>
            <select id="pa-owner" value={owner} onChange={(e) => setOwner(e.target.value)} className={FIELD}>
              <option value="clinic">The clinic&rsquo;s</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}&rsquo;s own (their professional fees)</option>)}
            </select>
          </div>
        )}
      </div>

      {online ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pa-sk" className={LABEL}>Secret key</label>
            <input id="pa-sk" type="password" autoComplete="off" required={!existing} value={secretKey} onChange={(e) => setSecretKey(e.target.value)} className={FIELD} />
            <p className="mt-1 text-xs text-gray-500">{hint}{existing ? '; blank keeps the current key' : ''}. Checked with the provider before it is saved.</p>
          </div>
          {provider === 'maya' ? (
            <div>
              <label htmlFor="pa-pk" className={LABEL}>Public key</label>
              <input id="pa-pk" required autoComplete="off" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder="pk-…" className={FIELD} />
              <p className="mt-1 text-xs text-gray-500">Maya needs both keys. It doesn&rsquo;t sign its notices, so payments are checked with Maya before they&rsquo;re recorded.</p>
            </div>
          ) : (
            <div>
              <label htmlFor="pa-wh" className={LABEL}>{provider === 'xendit' ? 'Webhook verification token' : 'Webhook secret'}</label>
              <input id="pa-wh" type="password" autoComplete="off" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} className={FIELD} />
              <p className="mt-1 text-xs text-gray-500">
                {provider === 'xendit'
                  ? 'From Xendit → Settings → Webhooks. Register this account’s webhook URL (shown after saving) for payment session events.'
                  : 'Shown by the provider when you register this account’s webhook URL (you’ll see it after saving).'}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {provider === 'bank_transfer' && (
            <div>
              <label htmlFor="pa-bank" className={LABEL}>Bank</label>
              <input id="pa-bank" maxLength={100} value={bankName} onChange={(e) => setBankName(e.target.value)} className={FIELD} />
            </div>
          )}
          <div>
            <label htmlFor="pa-name" className={LABEL}>Account name</label>
            <input id="pa-name" maxLength={150} value={accountName} onChange={(e) => setAccountName(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label htmlFor="pa-number" className={LABEL}>{provider === 'bank_transfer' ? 'Account number' : 'GCash / Maya number'}</label>
            <input id="pa-number" maxLength={60} value={number} onChange={(e) => setNumber(e.target.value)} className={FIELD} />
          </div>
          {provider === 'manual_qr' && (
            <div>
              <label htmlFor="pa-qr" className={LABEL}>QR code image</label>
              <input id="pa-qr" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => pickQr(e.target.files?.[0])} className="block w-full text-sm" />
              <p className="mt-1 text-xs text-gray-500">
                {qrImage ? 'New QR ready to save.' : existing?.manual?.hasQr ? 'A QR is saved; upload to replace it.' : 'Optional if you entered the number.'}
              </p>
            </div>
          )}
          <div className="sm:col-span-2">
            <label htmlFor="pa-instr" className={LABEL}>Note for the patient <span className="font-normal text-gray-500">(optional)</span></label>
            <input id="pa-instr" maxLength={500} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Put your invoice number in the message." className={FIELD} />
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={PRIMARY}>{busy ? (online && secretKey ? 'Checking the key…' : 'Saving…') : existing ? 'Save' : 'Connect account'}</button>
        {onCancel && <button type="button" onClick={onCancel} className={OUTLINE}>Cancel</button>}
      </div>
    </form>
  );
}
