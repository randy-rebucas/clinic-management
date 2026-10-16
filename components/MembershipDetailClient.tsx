'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg } from './appointments/shared';
import { AlertDialog } from './ui/Modal';
import { DetailsDialog, PointsDialog, TierDialog, useSend } from './memberships/Dialogs';
import { StateBadge, TierMark, ValidUntil, clock, memberName, pts, shortDate, type MembershipRow } from './memberships/shared';
import { TIER, benefitLabel, isPast, membershipState, renewedUntil, type MembershipTier } from '@/lib/memberships';
import type { MembershipPagePermissions } from '@/lib/memberships-page';

interface Person {
  _id: string;
  firstName: string;
  lastName: string;
  patientCode?: string;
  membership: { _id: string; tier: MembershipTier } | null;
}

interface Entry {
  type: 'earn' | 'redeem' | 'expire' | 'adjustment';
  points: number;
  description: string;
  relatedEntity?: { type: 'visit' | 'appointment' | 'invoice'; id: string };
  by: string | null;
  createdAt: string;
}

interface MembershipDetail extends Omit<MembershipRow, 'patient'> {
  patient: { _id: string; firstName: string; lastName: string; patientCode?: string; phone?: string; email?: string } | null;
  benefits: string[];
  notes?: string;
  referredBy: Person | null;
  referrals: Person[];
  transactions: Entry[];
}

type Dialog = null | 'points' | 'tier' | 'details' | 'renew' | 'suspend' | 'reactivate';

const ICONS = {
  ...ICON,
  plus: 'M12 4v16m8-8H4',
  ticket: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z',
  pencil: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  pause: 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z',
  stairs: 'M3 21h4v-4h4v-4h4V9h4V5',
};

const ENTRY_WORD: Record<Entry['type'], string> = { earn: 'Added', redeem: 'Used', expire: 'Expired', adjustment: 'Corrected' };
const HISTORY_SHOWN = 40;

/** Signed change an entry made to the balance. */
const delta = (e: Entry) => (e.type === 'earn' ? Math.abs(e.points) : e.type === 'adjustment' ? e.points : -Math.abs(e.points));

/** Newest first, with the balance each entry left, worked back from today's balance. */
function withBalances(transactions: Entry[], balance: number) {
  const entries = [...transactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const out: (Entry & { after: number })[] = [];
  let running = balance;
  for (const e of entries) {
    out.push({ ...e, after: running });
    running -= delta(e);
  }
  return out;
}

export default function MembershipDetailClient({
  membershipId,
  permissions,
  saved,
}: {
  membershipId: string;
  permissions: MembershipPagePermissions;
  saved: string | null;
}) {
  const res = useKeyedFetch<MembershipDetail>(`/api/memberships/${membershipId}`);
  const send = useSend('The membership could not be updated');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(saved === 'enrolled' ? 'enrolled' : null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const m = res.value;

  const done = (message: string) => {
    setDialog(null);
    setActionError(null);
    setNotice(message);
    res.reload();
  };

  const put = async (body: unknown, message: string) => {
    if (busy) return;
    setBusy(true);
    const r = await send(`/api/memberships/${membershipId}`, 'PUT', body);
    setBusy(false);
    setDialog(null);
    if (!r.ok) {
      setNotice(null);
      setActionError(r.error);
      return;
    }
    done(message);
  };

  // --- Not loaded ----------------------------------------------------------------

  if (!m && res.error) {
    const missing = /not found/i.test(res.error);
    const denied = /permission|forbidden|cannot/i.test(res.error);
    return (
      <Shell>
        <BackLink />
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
          <div className={`mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md ${missing || denied ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
            <Svg d={missing || denied ? ICONS.ticket : ICONS.alert} className="h-5 w-5" />
          </div>
          <p className="font-semibold text-gray-900">{missing ? 'Membership not found' : denied ? 'You can’t open this membership' : 'This membership didn’t load'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {missing ? 'It may belong to another clinic.' : denied ? 'Ask a clinic admin if you need access to memberships.' : `${res.error}. Check your connection and try again.`}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/memberships" className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              All memberships
            </Link>
            {!missing && !denied && (
              <button type="button" onClick={res.reload} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Try again
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (!m) {
    return (
      <Shell>
        <BackLink />
        <div className="animate-pulse space-y-6" aria-hidden="true">
          <div className="space-y-2">
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="h-4 w-96 max-w-full rounded bg-gray-100" />
          </div>
          <div className="h-24 rounded-lg border border-gray-200 bg-white" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="h-72 rounded-lg border border-gray-200 bg-white" />
            <div className="h-56 rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>
        <span className="sr-only" role="status">
          Loading membership…
        </span>
      </Shell>
    );
  }

  // --- Loaded --------------------------------------------------------------------

  const state = membershipState(m);
  const name = memberName(m);
  const first = m.patient?.firstName ?? 'The member';
  const inDate = state === 'active' || state === 'due';
  const held = state === 'suspended' || state === 'inactive';
  const t = TIER[m.tier];
  const canRenew = permissions.canRenew && (state === 'due' || state === 'expired');
  const canReactivate = permissions.canManage && held;
  const lapsedWhileHeld = held && isPast(m.expiryDate);
  const nextEnd = renewedUntil(m.expiryDate);
  const history = withBalances(m.transactions, m.points);
  const shown = showAll ? history : history.slice(0, HISTORY_SHOWN);

  return (
    <Shell>
      <BackLink />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{name}</h1>
            <StateBadge state={state} />
            <span className="font-mono text-sm text-gray-500">{m.membershipNumber}</span>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:text-base text-gray-600">
            <TierMark tier={m.tier} />
            <span aria-hidden="true">·</span>
            <span>
              {inDate ? (
                <>
                  <span className="font-mono">{m.discountPercentage}%</span> off every bill
                </>
              ) : (
                'No discount while ' + (state === 'expired' ? 'expired' : state)
              )}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Member since <span className="font-mono">{shortDate(m.joinDate)}</span>
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canRenew && (
            <SecondaryButton onClick={() => setDialog('renew')} disabled={busy} icon={ICONS.refresh}>
              Renew
            </SecondaryButton>
          )}
          {canReactivate && (
            <SecondaryButton onClick={() => setDialog('reactivate')} disabled={busy} icon={ICONS.check}>
              Reactivate
            </SecondaryButton>
          )}
          {permissions.canManage && (
            <SecondaryButton onClick={() => setDialog('tier')} disabled={busy} icon={ICONS.stairs}>
              Change tier
            </SecondaryButton>
          )}
          {permissions.canManage && (
            <SecondaryButton onClick={() => setDialog('details')} disabled={busy} icon={ICONS.pencil}>
              End date &amp; notes
            </SecondaryButton>
          )}
          {permissions.canPoints && inDate && (
            <button
              type="button"
              onClick={() => setDialog('points')}
              className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}
            >
              <Svg d={ICONS.plus} />
              Add or use points
            </button>
          )}
          {permissions.canManage && inDate && (
            <button
              type="button"
              onClick={() => setDialog('suspend')}
              disabled={busy}
              aria-label={`Suspend ${name}’s membership`}
              title="Suspend"
              className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.pause} className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div role="status" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          <p>
            {notice === 'enrolled' ? (
              <>
                {first} is enrolled as <span className="font-mono">{m.membershipNumber}</span>. Their {t.label} discount is offered on every bill made for them from now on.
              </>
            ) : (
              notice
            )}
          </p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-green-700 hover:text-green-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.x} />
          </button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <p>{actionError}</p>
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss error" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.x} />
          </button>
        </div>
      )}

      {state === 'expired' && (
        <Banner tone="red" action={canRenew ? { label: 'Renew for a year', onClick: () => setDialog('renew') } : undefined}>
          {m.expiryDate ? (
            <>
              This membership ended on <span className="font-mono">{shortDate(m.expiryDate)}</span>.
            </>
          ) : (
            'This membership has expired.'
          )}{' '}
          Its discount isn’t offered on bills, and points can’t be added or used until it is renewed. The points are kept.
        </Banner>
      )}
      {state === 'due' && m.expiryDate && (
        <Banner tone="amber" action={canRenew ? { label: 'Renew', onClick: () => setDialog('renew') } : undefined}>
          <ValidUntil iso={m.expiryDate} />. Renewing keeps the {t.label} discount and the points; {first} gets reminders by text and email until then.
        </Banner>
      )}
      {held && (
        <Banner tone="gray" action={canReactivate ? { label: 'Reactivate', onClick: () => setDialog('reactivate') } : undefined}>
          This membership is {state}. Its discount isn’t offered on bills and points can’t be added or used. {permissions.canManage ? '' : 'Someone who manages memberships can reactivate it.'}
        </Banner>
      )}

      {/* Summary strip */}
      <div className="motion-panel-in overflow-hidden rounded-lg border border-gray-200 bg-white">
        <dl className="grid -mr-px -mb-px grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Cell label="Points">
            <p className="font-mono text-2xl font-semibold tabular-nums text-gray-900">{pts(m.points)}</p>
            <p className="mt-1 text-sm text-gray-500">
              <span className="font-mono">{pts(m.totalPointsEarned)}</span> earned, <span className="font-mono">{pts(m.totalPointsRedeemed)}</span> used in all
            </p>
          </Cell>
          <Cell label="Discount on bills">
            <p className={`font-mono text-2xl font-semibold tabular-nums ${inDate ? 'text-gray-900' : 'text-gray-400 line-through decoration-2'}`}>{m.discountPercentage}%</p>
            <p className="mt-1 text-sm text-gray-500">{inDate ? 'Offered on the invoice form' : 'Not offered until it is active again'}</p>
          </Cell>
          <Cell label="Valid until">
            <p className="text-lg font-semibold text-gray-900">{m.expiryDate ? <span className="font-mono">{shortDate(m.expiryDate)}</span> : 'No end date'}</p>
            <p className="mt-1 text-sm">
              {m.expiryDate ? <ValidUntil iso={m.expiryDate} /> : <span className="text-gray-500">Stays active until changed</span>}
              {m.renewalDate && (
                <span className="text-gray-500">
                  {' '}
                  · renewed <span className="font-mono">{shortDate(m.renewalDate)}</span>
                </span>
              )}
            </p>
          </Cell>
          <Cell label="Referrals">
            <p className="font-mono text-2xl font-semibold tabular-nums text-gray-900">{m.referrals.length}</p>
            <p className="mt-1 truncate text-sm text-gray-500">
              {m.referredBy ? `Was referred by ${m.referredBy.firstName} ${m.referredBy.lastName}` : 'Joined without a referral'}
            </p>
          </Cell>
        </dl>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel
          id="mem-history"
          title="Points history"
          aside={
            history.length > 0 && (
              <span className="text-sm text-gray-500">
                <span className="font-mono">{history.length}</span> {history.length === 1 ? 'entry' : 'entries'}
              </span>
            )
          }
        >
          {history.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="font-semibold text-gray-900">No points yet</p>
              <p className="mt-1 text-sm text-gray-500">
                {permissions.canPoints && inDate ? 'Add points for a visit or a referral, and use them against a bill.' : 'Points added or used will be listed here.'}
              </p>
              {permissions.canPoints && inDate && (
                <button type="button" onClick={() => setDialog('points')} className={`mt-4 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
                  Add points
                </button>
              )}
            </div>
          ) : (
            <>
              <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-2 text-xs font-medium text-gray-500 sm:grid">
                <span>What</span>
                <span className="text-right">Change</span>
                <span className="text-right">Balance</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {shown.map((e, i) => {
                  const d = delta(e);
                  return (
                    <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 px-5 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem]">
                      <span className="min-w-0">
                        <span className="block text-gray-900">
                          <span className="font-semibold">{ENTRY_WORD[e.type] ?? e.type}</span>
                          <span className="text-gray-700"> · {e.description}</span>
                        </span>
                        <span className="block text-xs text-gray-500">
                          <span className="font-mono">
                            {shortDate(e.createdAt)} {clock(e.createdAt)}
                          </span>
                          {e.by ? ` · ${e.by}` : ''}
                          {e.relatedEntity?.type === 'invoice' && (
                            <>
                              {' · '}
                              <Link href={`/invoices/${e.relatedEntity.id}`} className={`rounded font-medium text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                                Invoice
                              </Link>
                            </>
                          )}
                        </span>
                      </span>
                      <span className={`text-right font-mono tabular-nums ${d > 0 ? 'text-gray-900' : 'text-gray-600'}`}>
                        {d > 0 ? '+' : '−'}
                        {pts(Math.abs(d))}
                      </span>
                      <span className="col-start-2 text-right font-mono text-xs tabular-nums text-gray-500 sm:col-start-auto sm:text-sm">
                        <span className="sm:hidden">left </span>
                        {pts(e.after)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {history.length > shown.length && (
                <div className="border-t border-gray-100 px-5 py-2.5">
                  <button type="button" onClick={() => setShowAll(true)} className={`rounded text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                    Show all <span className="font-mono">{history.length}</span> entries
                  </button>
                </div>
              )}
            </>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel id="mem-member" title="Member">
            <dl className="divide-y divide-gray-100">
              <Field label="Patient">
                {m.patient ? (
                  permissions.canSeePatient ? (
                    <Link href={`/patients/${m.patient._id}`} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                      {name}
                    </Link>
                  ) : (
                    name
                  )
                ) : (
                  <span className="text-gray-500">Patient record unavailable</span>
                )}
                {m.patient?.patientCode && <span className="block font-mono text-xs text-gray-500">{m.patient.patientCode}</span>}
              </Field>
              <Field label="Phone">{m.patient?.phone ? <span className="font-mono">{m.patient.phone}</span> : <span className="text-gray-500">None on file</span>}</Field>
              <Field label="Email">{m.patient?.email ? <span className="break-all">{m.patient.email}</span> : <span className="text-gray-500">None on file</span>}</Field>
            </dl>
            {m.patient && !m.patient.phone && !m.patient.email && <p className="border-t border-gray-100 px-5 py-3 text-xs text-amber-800">Renewal reminders can’t reach them without a phone number or email.</p>}
          </Panel>

          <Panel id="mem-benefits" title={`${t.label} benefits`}>
            <ul className="divide-y divide-gray-100">
              <li className="flex items-center gap-2.5 px-5 py-2.5 text-sm text-gray-900">
                <Svg d={ICONS.check} className="h-4 w-4 shrink-0 text-brand-teal-dark" />
                <span>
                  <span className="font-mono">{m.discountPercentage}%</span> off every bill
                </span>
              </li>
              {(m.benefits.length ? m.benefits : t.benefits).map((b) => (
                <li key={b} className="flex items-center gap-2.5 px-5 py-2.5 text-sm text-gray-900">
                  <Svg d={ICONS.check} className="h-4 w-4 shrink-0 text-brand-teal-dark" />
                  {benefitLabel(b)}
                </li>
              ))}
            </ul>
          </Panel>

          {(m.referredBy || m.referrals.length > 0) && (
            <Panel id="mem-referrals" title="Referrals">
              <ul className="divide-y divide-gray-100">
                {m.referredBy && <PersonRow p={m.referredBy} note="Referred them" />}
                {m.referrals.map((p) => (
                  <PersonRow key={p._id} p={p} note="They referred" />
                ))}
              </ul>
            </Panel>
          )}

          {m.notes && (
            <Panel id="mem-notes" title="Notes for staff">
              <p className="whitespace-pre-wrap px-5 py-4 text-sm text-gray-700">{m.notes}</p>
            </Panel>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {dialog === 'points' && (
        <PointsDialog membershipId={m._id} name={first} balance={m.points} canCorrect={permissions.canManage} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog === 'tier' && <TierDialog membershipId={m._id} name={first} current={m.tier} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'details' && <DetailsDialog membershipId={m._id} expiryDate={m.expiryDate} notes={m.notes} active={m.status === 'active'} onClose={() => setDialog(null)} onDone={done} />}

      <AlertDialog
        open={dialog === 'renew'}
        onOpenChange={(o) => !o && !busy && setDialog(null)}
        title={`Renew until ${shortDate(nextEnd.toISOString())}?`}
        description={
          <>
            One year from {m.expiryDate && !isPast(m.expiryDate) ? `the current end date, ${shortDate(m.expiryDate)}` : 'today'}. {first} stays {t.label} and keeps their{' '}
            <span className="font-mono">{pts(m.points)}</span> points.
          </>
        }
      >
        <ConfirmButtons busy={busy} onCancel={() => setDialog(null)} onConfirm={() => put({ action: 'renew' }, `Renewed until ${shortDate(nextEnd.toISOString())}.`)} label="Renew" />
      </AlertDialog>

      <AlertDialog
        open={dialog === 'suspend'}
        onOpenChange={(o) => !o && !busy && setDialog(null)}
        title={`Suspend ${first}’s membership?`}
        description="While it is suspended, the discount isn’t offered on bills and points can’t be added or used. The points and end date are kept, and it can be reactivated at any time."
      >
        <ConfirmButtons busy={busy} onCancel={() => setDialog(null)} onConfirm={() => put({ status: 'suspended' }, 'Membership suspended.')} label="Suspend" />
      </AlertDialog>

      <AlertDialog
        open={dialog === 'reactivate'}
        onOpenChange={(o) => !o && !busy && setDialog(null)}
        title={lapsedWhileHeld ? `Reactivate until ${shortDate(nextEnd.toISOString())}?` : 'Reactivate this membership?'}
        description={
          lapsedWhileHeld
            ? 'Its end date passed while it was ' + state + ', so reactivating also renews it for a year from today.'
            : `The ${t.label} discount is offered on bills again and points can be added and used.`
        }
      >
        <ConfirmButtons
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() => (lapsedWhileHeld ? put({ action: 'renew' }, `Reactivated and renewed until ${shortDate(nextEnd.toISOString())}.`) : put({ status: 'active' }, 'Membership reactivated.'))}
          label="Reactivate"
        />
      </AlertDialog>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">{children}</div>
    </section>
  );
}

function BackLink() {
  return (
    <Link href="/memberships" className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
      <Svg d={ICONS.chevL} />
      All memberships
    </Link>
  );
}

function Panel({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="motion-panel-in overflow-hidden rounded-lg border border-gray-200 bg-white" aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <h2 id={id} className="text-base font-bold tracking-tight text-gray-900">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-r border-b border-gray-200 p-5">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="mt-2">{children}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4 px-5 py-3 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words text-gray-900">{children}</dd>
    </div>
  );
}

function PersonRow({ p, note }: { p: Person; note: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm">
      <span className="min-w-0">
        {p.membership ? (
          <Link href={`/memberships/${p.membership._id}`} className={`block truncate rounded font-semibold text-gray-900 hover:text-brand-teal-deep ${FOCUS_RING}`}>
            {p.firstName} {p.lastName}
          </Link>
        ) : (
          <span className="block truncate font-semibold text-gray-900">
            {p.firstName} {p.lastName}
          </span>
        )}
        <span className="block text-xs text-gray-500">
          {note}
          {p.membership ? ` · ${TIER[p.membership.tier]?.label ?? ''} member` : ' · not a member'}
        </span>
      </span>
      {p.patientCode && <span className="shrink-0 font-mono text-xs text-gray-500">{p.patientCode}</span>}
    </li>
  );
}

function Banner({ tone, action, children }: { tone: 'red' | 'amber' | 'gray'; action?: { label: string; onClick: () => void }; children: ReactNode }) {
  const tones = {
    red: { box: 'border-red-200 bg-red-50 text-red-800', btn: 'border-red-300 text-red-800 hover:border-red-800' },
    amber: { box: 'border-amber-200 bg-amber-50 text-amber-800', btn: 'border-amber-300 text-amber-900 hover:border-amber-900' },
    gray: { box: 'border-gray-200 bg-gray-50 text-gray-700', btn: 'border-gray-300 text-gray-900 hover:border-gray-900' },
  }[tone];
  return (
    <div className={`motion-chip-in flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${tones.box}`}>
      <p className="flex items-start gap-2">
        <Svg d={ICONS.alert} className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{children}</span>
      </p>
      {action && (
        <button type="button" onClick={action.onClick} className={`shrink-0 rounded-md border bg-white px-3 py-1.5 text-sm font-semibold transition-colors ${tones.btn} ${FOCUS_RING}`}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function SecondaryButton({ onClick, disabled, icon, children }: { onClick: () => void; disabled?: boolean; icon: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait ${FOCUS_RING}`}
    >
      <Svg d={icon} />
      {children}
    </button>
  );
}

function ConfirmButtons({ busy, onCancel, onConfirm, label }: { busy: boolean; onCancel: () => void; onConfirm: () => void; label: string }) {
  return (
    <>
      <button type="button" onClick={onCancel} disabled={busy} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}>
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        aria-busy={busy}
        className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
      >
        {busy ? 'Saving…' : label}
      </button>
    </>
  );
}
