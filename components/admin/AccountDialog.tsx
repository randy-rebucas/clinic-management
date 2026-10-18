'use client';

import { useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { Label } from '../visits/form/parts';
import { PROFILE_LINKS, USER_STATE, userState, type RoleOption, type UserRow, type UserStatus } from '@/lib/users';
import { ROLE_LABEL, StateBadge, initials, inviteLine, lastSeen, shortDate, useSend } from './users-shared';

type Confirm = 'suspend' | 'close' | 'reactivate' | 'reopen' | 'signout';

const SECONDARY = `inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-300 ${FOCUS_RING}`;
const PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const DANGER = `inline-flex items-center justify-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-6 py-5">
      <h3 className="text-sm font-bold tracking-tight text-gray-900">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function AccountDialog({
  user,
  roles,
  isYou,
  emailReady,
  onClose,
  onDone,
}: {
  user: UserRow;
  roles: RoleOption[];
  isYou: boolean;
  emailReady: boolean;
  onClose: () => void;
  /** Something changed: reload the list and say what happened. */
  onDone: (message: string) => void;
}) {
  const ids = useId();
  const send = useSend('That didn’t go through');
  const state = userState(user);
  const [roleId, setRoleId] = useState(user.role?._id ?? '');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = first(user.name);
  const chosen = roles.find((r) => r._id === roleId) ?? null;
  const roleChanged = !!roleId && roleId !== user.role?._id;
  const needsDoctorProfile = roleChanged && chosen?.name === 'doctor' && user.profile?.key !== 'doctorProfile';
  const locked = isYou || state === 'inactive';
  const invited = state === 'invited' || state === 'invite-expired';
  const canSignIn = user.status === 'active';
  const profile = user.profile ? PROFILE_LINKS[user.profile.key] : null;

  const run = async (request: () => ReturnType<typeof send>, message: (data: unknown) => string) => {
    setBusy(true);
    setError(null);
    const result = await request();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone(message(result.data));
  };

  const saveRole = () =>
    run(
      () => send(`/api/users/${user._id}/role`, 'PUT', { roleId }),
      () => `${user.name} is now ${chosen ? chosen.displayName : 'in a new role'}. They were signed out so the new role applies when they sign in again.`
    );

  const sendLink = () =>
    run(
      () => send(`/api/users/${user._id}/invite`, 'POST'),
      (data) =>
        (data as { kind?: string })?.kind === 'invite'
          ? `Sent ${user.name} a new invite to ${user.email}. The link works for 72 hours; the old one no longer does.`
          : `Sent ${user.name} a password reset link at ${user.email}. Their current password works until they use it.`
    );

  const setStatus = (status: UserStatus, done: string) =>
    run(() => send(`/api/users/${user._id}/status`, 'PUT', { status, reason: reason.trim() || undefined }), () => done);

  const confirmAction = () => {
    switch (confirm) {
      case 'suspend':
        return setStatus('suspended', `Suspended ${user.name}’s account. They were signed out and can’t sign in until it is reactivated.`);
      case 'close':
        return setStatus('inactive', `Closed ${user.name}’s account. They were signed out; their records stay under their name.`);
      case 'reactivate':
        return setStatus('active', `${user.name} can sign in again.`);
      case 'reopen':
        return setStatus('active', `Reopened ${user.name}’s account. They can sign in with their own password.`);
      case 'signout':
        return run(() => send(`/api/users/${user._id}/sessions`, 'DELETE'), () => `Signed ${user.name} out on every device.`);
    }
  };

  const CONFIRM: Record<Confirm, { title: string; body: ReactNode; button: string; danger?: boolean; reason?: boolean }> = {
    suspend: {
      title: `Suspend ${name}’s account?`,
      body: 'They are signed out at once and can’t sign in until an administrator reactivates the account. Nothing they recorded changes.',
      button: 'Suspend',
      reason: true,
    },
    close: {
      title: `Close ${name}’s account?`,
      body: 'For someone who has left the clinic. They are signed out at once and lose access. Everything they recorded stays, under their name, and the account can be reopened later.',
      button: 'Close account',
      danger: true,
      reason: true,
    },
    reactivate: { title: `Reactivate ${name}’s account?`, body: `${name} can sign in again with their own password.`, button: 'Reactivate' },
    reopen: {
      title: `Reopen ${name}’s account?`,
      body: `${name} can sign in again with their own password. The account counts against the plan’s account limit again.`,
      button: 'Reopen',
    },
    signout: {
      title: `Sign ${name} out everywhere?`,
      body: 'Every browser and phone they are signed in on is signed out within a minute. Their password doesn’t change; they sign in again as usual.',
      button: 'Sign out everywhere',
    },
  };

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-xl" labelledBy={`${ids}-title`}>
      <div className="flex items-start gap-3 border-b border-gray-200 px-6 py-5">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-sm font-semibold text-gray-700">
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${ids}-title`} className="truncate text-lg font-bold tracking-tight text-gray-900">
            {user.name}
            {isYou && <span className="ml-2 align-middle text-xs font-semibold text-gray-500">You</span>}
          </h2>
          <p className="truncate text-sm text-gray-600">{user.email}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <StateBadge state={state} />
            <span>{ROLE_LABEL(user.role)}</span>
          </p>
        </div>
      </div>

      {confirm ? (
        <div className="motion-panel-in px-6 py-5">
          <h3 className="text-base font-bold tracking-tight text-gray-900">{CONFIRM[confirm].title}</h3>
          <p className="mt-1.5 text-sm text-gray-600">{CONFIRM[confirm].body}</p>
          {CONFIRM[confirm].reason && (
            <div className="mt-4">
              <Label htmlFor={`${ids}-reason`} optional>
                Reason, for the audit log
              </Label>
              <input
                id={`${ids}-reason`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                autoComplete="off"
                placeholder={confirm === 'close' ? 'e.g. Left the clinic on Oct 15' : 'e.g. Phone reported lost'}
                className={FIELD}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          <Section title="Role">
            {isYou ? (
              <p className="text-sm text-gray-600">You can’t change your own role. Another administrator can.</p>
            ) : state === 'inactive' ? (
              <p className="text-sm text-gray-600">Reopen the account to change its role.</p>
            ) : null}
            <fieldset disabled={locked || busy} aria-label="Role" className={locked ? 'mt-3 opacity-60' : ''}>
              <div className="grid gap-2 sm:grid-cols-2">
                {roles
                  .filter((r) => r.isActive || r._id === user.role?._id)
                  .map((r) => {
                    const on = roleId === r._id;
                    return (
                      <label
                        key={r._id}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal ${
                          on ? 'border-brand-teal-dark bg-brand-teal-light/40' : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <input type="radio" name={`${ids}-role`} value={r._id} checked={on} onChange={() => setRoleId(r._id)} className="mt-0.5 accent-brand-teal-dark" />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-gray-900">{r.displayName}</span>
                          {r.description && <span className="block text-xs text-gray-500">{r.description}</span>}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </fieldset>
            {needsDoctorProfile && (
              <p className="mt-3 flex items-start gap-1.5 text-sm text-amber-800">
                <Svg d={ICON.alert} className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  A doctor also needs a doctor profile for hours, licences and prescriptions. To add a new doctor, use{' '}
                  <Link href="/doctors/new" className={`rounded font-semibold underline underline-offset-2 ${FOCUS_RING}`}>
                    Add a doctor
                  </Link>
                  .
                </span>
              </p>
            )}
            {roleChanged && (
              <div className="motion-panel-in mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-600">They’ll be signed out and sign in again with the new role.</p>
                <button type="button" onClick={saveRole} disabled={busy} className={PRIMARY}>
                  <Svg d={ICON.check} />
                  {busy ? 'Saving…' : 'Save role'}
                </button>
              </div>
            )}
          </Section>

          <Section title="Signing in">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-500">Last signed in</dt>
              <dd className="font-mono text-gray-900 tabular-nums">{lastSeen(user.lastLogin)}</dd>
              <dt className="text-gray-500">Two-step verification</dt>
              <dd className={user.totpEnabled ? 'text-gray-900' : 'text-amber-800'}>
                {user.totpEnabled ? 'On' : invited ? 'Set up after the invite' : 'Off'}
              </dd>
              <dt className="text-gray-500">Account made</dt>
              <dd className="font-mono text-gray-900 tabular-nums">{shortDate(user.createdAt)}</dd>
              {invited && (
                <>
                  <dt className="text-gray-500">Invite</dt>
                  <dd className={state === 'invite-expired' ? 'text-amber-800' : 'text-gray-900'}>{inviteLine(user, state)}</dd>
                </>
              )}
            </dl>
            {!user.totpEnabled && !invited && canSignIn && (
              <p className="mt-3 text-sm text-gray-600">
                {isYou ? 'Turn it on in Sign-in & security.' : `${name} turns it on from their own Sign-in & security page.`}
              </p>
            )}
            {!isYou && canSignIn && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={sendLink} disabled={busy || !emailReady} className={SECONDARY}>
                  {invited ? 'Send invite again' : 'Send a password reset link'}
                </button>
                {!invited && (
                  <button type="button" onClick={() => setConfirm('signout')} disabled={busy} className={SECONDARY}>
                    Sign out everywhere
                  </button>
                )}
              </div>
            )}
            {!isYou && canSignIn && !emailReady && (
              <p className="mt-2 text-sm text-gray-500">Email isn’t set up on this server, so invite and reset links can’t be sent.</p>
            )}
            {isYou && (
              <Link href="/settings" className={`mt-4 inline-flex rounded text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                Open Sign-in & security
              </Link>
            )}
          </Section>

          {!isYou && (
            <Section title="Access">
              <p className="text-sm text-gray-600">{USER_STATE[state].hint}.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {user.status === 'active' && (
                  <button type="button" onClick={() => setConfirm('suspend')} disabled={busy} className={SECONDARY}>
                    Suspend
                  </button>
                )}
                {user.status === 'suspended' && (
                  <button type="button" onClick={() => setConfirm('reactivate')} disabled={busy} className={SECONDARY}>
                    Reactivate
                  </button>
                )}
                {user.status !== 'inactive' ? (
                  <button
                    type="button"
                    onClick={() => setConfirm('close')}
                    disabled={busy}
                    className={`${SECONDARY} hover:border-red-600 hover:text-red-700`}
                  >
                    Close account
                  </button>
                ) : (
                  <button type="button" onClick={() => setConfirm('reopen')} disabled={busy} className={SECONDARY}>
                    Reopen
                  </button>
                )}
              </div>
            </Section>
          )}

          {profile && user.profile && (
            <Section title="Profile">
              <Link
                href={profile.href(user.profile.id)}
                className={`inline-flex items-center gap-1.5 rounded text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}
              >
                {profile.label}
                <Svg d={ICON.arrow} />
              </Link>
              <p className="mt-1 text-sm text-gray-500">Name, phone and work details live on the profile.</p>
            </Section>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className={`text-sm ${error ? 'font-medium text-red-700' : 'text-gray-500'}`} role={error ? 'alert' : undefined} aria-live="polite">
          {error ?? (busy ? 'Working…' : '')}
        </p>
        <div className="flex justify-end gap-2">
          {confirm ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setConfirm(null);
                  setError(null);
                }}
                disabled={busy}
                className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
              >
                Back
              </button>
              <button type="button" onClick={confirmAction} disabled={busy} aria-busy={busy} className={CONFIRM[confirm].danger ? DANGER : PRIMARY}>
                {busy ? 'Working…' : CONFIRM[confirm].button}
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} disabled={busy} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}>
              Done
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
