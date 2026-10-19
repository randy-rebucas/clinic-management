'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FIELD, FOCUS_RING } from '../appointments/shared';
import { useSend } from './users-shared';
import type { DeveloperPageData } from '@/lib/developer-page';

const SCOPES: Array<{ value: string; label: string }> = [
  { value: 'patients:read', label: 'Read patients' },
  { value: 'patients:write', label: 'Create patients' },
  { value: 'appointments:read', label: 'Read appointments' },
  { value: 'appointments:write', label: 'Book appointments' },
  { value: 'doctors:read', label: 'Read doctors' },
  { value: 'invoices:read', label: 'Read invoices' },
];

const EVENTS: Array<{ value: string; label: string }> = [
  { value: 'patient.created', label: 'A patient is registered' },
  { value: 'appointment.created', label: 'An appointment is booked' },
  { value: 'appointment.status_changed', label: 'An appointment’s status changes' },
  { value: 'invoice.paid', label: 'An invoice is paid in full' },
];

const PRIMARY = `rounded-md bg-brand-teal-dark px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const OUTLINE = `rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 hover:border-gray-900 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const CARD = 'rounded-lg border border-gray-200 bg-white';

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

function Secret({ label, value, onDone }: { label: string; value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">{label}</p>
      <p className="mt-0.5 text-xs text-amber-900">Copy it now. It won&rsquo;t be shown again.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1.5 font-mono text-xs text-gray-900 ring-1 ring-amber-200">{value}</code>
        <button
          type="button"
          className={OUTLINE}
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => setCopied(true)).catch(() => {});
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className={OUTLINE} onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

function Checks({ name, options, value, onChange }: { name: string; options: typeof SCOPES; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-gray-700">{name}</legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal"
              checked={value.includes(o.value)}
              onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))}
            />
            {o.label} <code className="text-xs text-gray-500">{o.value}</code>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function PlanNote({ what }: { what: string }) {
  return (
    <p className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-700">
      {what} come with the Professional and Enterprise plans.{' '}
      <a href="/admin/subscription" className="font-medium text-brand-teal-deep hover:underline">See plans</a>
    </p>
  );
}

export default function DevelopersClient({ data, readOnly }: { data: DeveloperPageData; readOnly: boolean }) {
  const router = useRouter();
  const send = useSend('That didn’t go through');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [shown, setShown] = useState<{ label: string; value: string } | null>(null);

  const [keyName, setKeyName] = useState('');
  const [keyScopes, setKeyScopes] = useState<string[]>(['patients:read', 'appointments:read']);
  const [hookUrl, setHookUrl] = useState('');
  const [hookDesc, setHookDesc] = useState('');
  const [hookEvents, setHookEvents] = useState<string[]>(['appointment.created', 'appointment.status_changed']);

  async function act(key: string, url: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown, ok: (d: any) => void) {
    setBusy(key);
    setNotice(null);
    const r = await send(url, method, body);
    setBusy(null);
    if (!r.ok) return setNotice({ tone: 'error', text: r.error });
    ok(r.data);
    router.refresh();
  }

  const endpointUrl = new Map(data.endpoints.map((e) => [e.id, e.url]));
  const disabled = readOnly || !!busy;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Developers</h1>
        <p className="mt-1 text-sm text-gray-600">
          Connect other systems to your clinic: API keys for the REST API at <code className="text-xs">{data.apiBase}</code>, and webhooks that tell
          your systems when things happen.
        </p>
      </div>

      {shown && <Secret label={shown.label} value={shown.value} onDone={() => setShown(null)} />}
      {notice && (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`text-sm ${notice.tone === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>
          {notice.text}
        </p>
      )}

      {/* ── API keys ── */}
      <section aria-labelledby="keys" className="space-y-4">
        <h2 id="keys" className="text-base font-semibold text-gray-900">API keys</h2>
        {!data.plan.apiAccess && <PlanNote what="API keys" />}

        <ul className={`${CARD} divide-y divide-gray-100`}>
          {data.keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${k.revokedAt ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{k.name}</p>
                <p className="text-xs text-gray-500">
                  <code>{k.preview}</code> · {k.scopes.join(', ')}
                </p>
              </div>
              <p className="text-xs text-gray-500">
                {k.revokedAt ? `Revoked ${when(k.revokedAt)}` : `Last used ${k.lastUsedAt ? when(k.lastUsedAt) : 'never'}`}
              </p>
              {!k.revokedAt && (
                <button
                  type="button"
                  className={`${OUTLINE} text-rose-700 hover:border-rose-700`}
                  disabled={disabled}
                  onClick={() => {
                    if (!window.confirm(`Revoke "${k.name}"? Anything using it stops working at once.`)) return;
                    act(`revoke-${k.id}`, `/api/developer/api-keys/${k.id}`, 'DELETE', undefined, () => setNotice({ tone: 'ok', text: 'Key revoked.' }));
                  }}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
          {data.keys.length === 0 && <li className="px-4 py-6 text-sm text-gray-500">No keys yet.</li>}
        </ul>

        {data.plan.apiAccess && (
          <form
            className={`${CARD} space-y-4 p-4`}
            onSubmit={(e) => {
              e.preventDefault();
              act('key', '/api/developer/api-keys', 'POST', { name: keyName, scopes: keyScopes }, (d) => {
                setShown({ label: `API key “${d.name}”`, value: d.key });
                setKeyName('');
              });
            }}
          >
            <h3 className="text-sm font-semibold text-gray-900">New key</h3>
            <div>
              <label htmlFor="key-name" className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
              <input id="key-name" required maxLength={100} placeholder="e.g. Lab system sync" value={keyName} onChange={(e) => setKeyName(e.target.value)} className={`${FIELD} max-w-sm`} />
            </div>
            <Checks name="What it may do" options={SCOPES} value={keyScopes} onChange={setKeyScopes} />
            <button type="submit" className={PRIMARY} disabled={disabled || !keyName.trim() || keyScopes.length === 0}>
              {busy === 'key' ? 'Creating…' : 'Create key'}
            </button>
          </form>
        )}
      </section>

      {/* ── Webhooks ── */}
      <section aria-labelledby="hooks" className="space-y-4">
        <h2 id="hooks" className="text-base font-semibold text-gray-900">Webhooks</h2>
        {!data.plan.webhooks && <PlanNote what="Webhooks" />}

        <ul className="space-y-3">
          {data.endpoints.map((e) => (
            <li key={e.id} className={`${CARD} p-4`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-sm text-gray-900">{e.url}</p>
                  {e.description && <p className="text-sm text-gray-600">{e.description}</p>}
                  <p className="mt-1 text-xs text-gray-500">{e.events.join(', ')}</p>
                  {!e.enabled && <p className="mt-1 text-xs font-medium text-rose-700">Off{e.disabledReason ? `: ${e.disabledReason}` : ''}</p>}
                  {e.enabled && e.consecutiveFailures > 0 && (
                    <p className="mt-1 text-xs font-medium text-amber-700">{e.consecutiveFailures} failed deliveries in a row</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={OUTLINE}
                    disabled={disabled || !e.enabled || !data.plan.webhooks}
                    onClick={() =>
                      act(`test-${e.id}`, `/api/developer/webhooks/${e.id}/test`, 'POST', {}, (d) =>
                        setNotice(
                          d.status === 'succeeded'
                            ? { tone: 'ok', text: `Test event delivered (HTTP ${d.responseStatus}).` }
                            : { tone: 'error', text: `Test event failed: ${d.error ?? `HTTP ${d.responseStatus}`}.` }
                        )
                      )
                    }
                  >
                    {busy === `test-${e.id}` ? 'Sending…' : 'Send test'}
                  </button>
                  <button
                    type="button"
                    className={OUTLINE}
                    disabled={disabled || (!e.enabled && !data.plan.webhooks)}
                    onClick={() =>
                      act(`toggle-${e.id}`, `/api/developer/webhooks/${e.id}`, 'PATCH', { enabled: !e.enabled }, () =>
                        setNotice({ tone: 'ok', text: e.enabled ? 'Endpoint switched off.' : 'Endpoint switched on.' })
                      )
                    }
                  >
                    {e.enabled ? 'Switch off' : 'Switch on'}
                  </button>
                  <button
                    type="button"
                    className={OUTLINE}
                    disabled={disabled || !data.plan.webhooks}
                    onClick={() => {
                      if (!window.confirm('Issue a new signing secret? The current one stops working at once.')) return;
                      act(`rotate-${e.id}`, `/api/developer/webhooks/${e.id}`, 'PATCH', { rotateSecret: true }, (d) =>
                        setShown({ label: `New signing secret for ${e.url}`, value: d.secret })
                      );
                    }}
                  >
                    New secret
                  </button>
                  <button
                    type="button"
                    className={`${OUTLINE} text-rose-700 hover:border-rose-700`}
                    disabled={disabled}
                    onClick={() => {
                      if (!window.confirm(`Remove ${e.url}?`)) return;
                      act(`del-${e.id}`, `/api/developer/webhooks/${e.id}`, 'DELETE', undefined, () => setNotice({ tone: 'ok', text: 'Endpoint removed.' }));
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
          {data.endpoints.length === 0 && <li className={`${CARD} px-4 py-6 text-sm text-gray-500`}>No endpoints yet.</li>}
        </ul>

        {data.plan.webhooks && (
          <form
            className={`${CARD} space-y-4 p-4`}
            onSubmit={(e) => {
              e.preventDefault();
              act('hook', '/api/developer/webhooks', 'POST', { url: hookUrl, description: hookDesc || undefined, events: hookEvents }, (d) => {
                setShown({ label: `Signing secret for ${hookUrl}`, value: d.secret });
                setHookUrl('');
                setHookDesc('');
              });
            }}
          >
            <h3 className="text-sm font-semibold text-gray-900">New endpoint</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="hook-url" className="mb-1.5 block text-sm font-medium text-gray-700">URL</label>
                <input id="hook-url" type="url" required placeholder="https://example.com/hooks/myclinicsoft" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} className={FIELD} />
              </div>
              <div>
                <label htmlFor="hook-desc" className="mb-1.5 block text-sm font-medium text-gray-700">Description <span className="font-normal text-gray-500">(optional)</span></label>
                <input id="hook-desc" maxLength={200} value={hookDesc} onChange={(e) => setHookDesc(e.target.value)} className={FIELD} />
              </div>
            </div>
            <Checks name="Send these events" options={EVENTS} value={hookEvents} onChange={setHookEvents} />
            <button type="submit" className={PRIMARY} disabled={disabled || !hookUrl.trim() || hookEvents.length === 0}>
              {busy === 'hook' ? 'Adding…' : 'Add endpoint'}
            </button>
          </form>
        )}

        {data.deliveries.length > 0 && (
          <div className={`${CARD} overflow-x-auto`}>
            <h3 className="px-4 pt-4 text-sm font-semibold text-gray-900">Recent deliveries</h3>
            <table className="mt-2 w-full min-w-[680px] text-sm">
              <thead className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
                <tr>
                  <th className="px-4 py-2">Event</th>
                  <th className="px-4 py-2">Endpoint</th>
                  <th className="px-4 py-2">Result</th>
                  <th className="px-4 py-2">Sent</th>
                  <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2 font-mono text-xs text-gray-900">{d.event}</td>
                    <td className="max-w-[16rem] truncate px-4 py-2 text-xs text-gray-600">{endpointUrl.get(d.endpointId) ?? 'Removed endpoint'}</td>
                    <td className="px-4 py-2 text-xs">
                      {d.status === 'succeeded' && <span className="text-emerald-700">Delivered{d.responseStatus ? ` · ${d.responseStatus}` : ''}</span>}
                      {d.status === 'failed' && <span className="text-rose-700">Failed · {d.error ?? `HTTP ${d.responseStatus}`}</span>}
                      {d.status === 'pending' && (
                        <span className="text-amber-700">
                          {d.attempts ? `Retrying (${d.attempts} tries) · next ${when(d.nextAttemptAt)}` : 'Queued'}
                          {d.error ? ` · ${d.error}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600">{when(d.lastAttemptAt ?? d.createdAt)}</td>
                    <td className="px-4 py-2 text-right">
                      {d.status !== 'pending' && endpointUrl.has(d.endpointId) && (
                        <button
                          type="button"
                          className={OUTLINE}
                          disabled={disabled || !data.plan.webhooks}
                          onClick={() =>
                            act(`retry-${d.id}`, `/api/developer/deliveries/${d.id}/retry`, 'POST', {}, (r) =>
                              setNotice(r.status === 'succeeded' ? { tone: 'ok', text: 'Delivered.' } : { tone: 'error', text: `Still failing: ${r.error ?? `HTTP ${r.responseStatus}`}.` })
                            )
                          }
                        >
                          Send again
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="docs" className={`${CARD} space-y-3 p-4 text-sm text-gray-700`}>
        <h2 id="docs" className="text-sm font-semibold text-gray-900">Getting started</h2>
        <p>Send the key as a bearer token:</p>
        <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">{`curl ${data.apiBase}/me \\\n  -H "Authorization: Bearer mcs_…"`}</pre>
        <p>
          Each webhook is a JSON <code>POST</code> with an <code>MCS-Signature: t=…,v1=…</code> header. Check it by computing
          HMAC-SHA256 of <code>{'`${t}.${rawBody}`'}</code> with your signing secret and comparing it to <code>v1</code>; reject
          timestamps more than five minutes old. Answer with any 2xx within 10 seconds. Failed deliveries are retried for about a day.
        </p>
      </section>
    </div>
  );
}
