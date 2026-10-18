'use client';

import { useId, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { Label } from '../visits/form/parts';
import { SERIES } from '../dashboards/charts';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useSend } from './users-shared';
import {
  ACCESS,
  ACCESS_ITEMS,
  ACCESS_LABEL,
  allowedKeys,
  isAdminRole,
  isBuiltIn,
  type RoleRow,
  type RolesPage,
  type StandardRole,
} from '@/lib/roles';

const LOCK = 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z';
const PEOPLE = 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z';

const SECONDARY = `inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-300 ${FOCUS_RING}`;
const PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const GHOST = `rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 ${FOCUS_RING}`;

const TOTAL = ACCESS_ITEMS.length;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

type Notice = { tone: 'ok' | 'error'; text: string };
/** A saved result shown until the page's own data catches up (its version moves past `from`). */
type Saved = { from: string; grants: string[]; version: string };

export default function RolesPageClient({ data, initialRole }: { data: RolesPage; initialRole: string }) {
  const router = useRouter();
  const send = useSend('That didn’t save');
  const [refreshing, startRefresh] = useTransition();
  const [saved, setSaved] = useState<Record<string, Saved>>({});
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [selectedId, setSelectedId] = useState(() => {
    if (data.roles.some((r) => r._id === initialRole)) return initialRole;
    return (data.roles.find((r) => !isAdminRole(r.name)) ?? data.roles[0])?._id ?? '';
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ text: string; stale: boolean } | null>(null);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [adding, setAdding] = useState<StandardRole | null>(null);

  // The roles as they stand: the server's data, or what a save just returned until the refresh lands.
  const roles = useMemo(
    () =>
      data.roles.map((r) => {
        const s = saved[r._id];
        return s && s.from === r.version ? { ...r, grants: s.grants, version: s.version } : r;
      }),
    [data.roles, saved]
  );
  const allowedByRole = useMemo(() => new Map(roles.map((r) => [r._id, allowedKeys(r)])), [roles]);
  const role = roles.find((r) => r._id === selectedId) ?? null;

  const changesOf = (r: RoleRow) => {
    const draft = drafts[r._id];
    if (!draft) return { added: [] as string[], removed: [] as string[] };
    const now = allowedByRole.get(r._id)!;
    const next = new Set(draft);
    return { added: draft.filter((k) => !now.has(k)), removed: [...now].filter((k) => !next.has(k)) };
  };
  const dirtyIds = roles.filter((r) => {
    const c = changesOf(r);
    return c.added.length + c.removed.length > 0;
  });
  useUnsavedChanges(dirtyIds.length > 0, 'You have changes to roles that aren’t saved. Leave anyway?');

  const select = (id: string) => {
    setSelectedId(id);
    setSaveError(null);
    try {
      window.history.replaceState(null, '', `?role=${id}`);
    } catch {
      /* address bar only */
    }
  };

  const refresh = () => startRefresh(() => router.refresh());

  const toggle = (r: RoleRow, key: string, on: boolean) => {
    setSaveError(null);
    setDrafts((prev) => {
      const current = new Set(prev[r._id] ?? allowedByRole.get(r._id)!);
      if (on) current.add(key);
      else current.delete(key);
      return { ...prev, [r._id]: [...current] };
    });
  };

  const discard = (id: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSaveError(null);
  };

  const save = async (r: RoleRow) => {
    const draft = drafts[r._id];
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    const result = await send(`/api/roles/${r._id}/permissions`, 'PUT', { grants: draft, version: r.version });
    setSaving(false);
    if (!result.ok) {
      setSaveError({ text: result.error, stale: /someone else changed/i.test(result.error) });
      return;
    }
    const out = result.data as { grants: string[]; version: string; added: string[]; removed: string[] };
    setSaved((prev) => ({ ...prev, [r._id]: { from: r.version, grants: out.grants, version: out.version } }));
    discard(r._id);
    setNotice({ tone: 'ok', text: savedMessage(r, out.added, out.removed) });
    refresh();
  };

  const addRole = async (name: StandardRole, label: string) => {
    setAdding(name);
    const result = await send('/api/roles', 'POST', { name });
    setAdding(null);
    if (!result.ok) {
      setNotice({ tone: 'error', text: result.error });
      return;
    }
    const created = result.data as { _id: string };
    setNotice({ tone: 'ok', text: `Added the ${label} role with its standard access. Give it to someone from Users.` });
    select(created._id);
    refresh();
  };

  const othersWith = (key: string) =>
    roles.filter((r) => r._id !== selectedId && !isAdminRole(r.name) && allowedByRole.get(r._id)!.has(key)).map((r) => r.displayName);

  const personal = role ? data.personal.filter((p) => p.roleId === role._id) : [];
  const { added, removed } = role ? changesOf(role) : { added: [], removed: [] };
  const changeCount = added.length + removed.length;
  const draft = role ? new Set(drafts[role._id] ?? allowedByRole.get(role._id)!) : new Set<string>();
  const admin = role ? isAdminRole(role.name) : false;

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <header className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Roles</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">
          What each role lets people do. A change applies from the next page they open; nobody is signed out.
        </p>
      </header>

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`motion-panel-in flex items-start justify-between gap-4 rounded-lg border p-4 ${
            notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <p className="flex items-start gap-2 text-sm font-medium">
            <Svg d={notice.tone === 'error' ? ICON.alert : ICON.check} className="mt-0.5 h-4 w-4 shrink-0" />
            {notice.text}
          </p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 hover:bg-black/5 ${FOCUS_RING}`}>
            <Svg d={ICON.x} />
          </button>
        </div>
      )}

      {roles.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-gray-500">
            <Svg d={PEOPLE} className="h-5 w-5" />
          </span>
          <p className="mt-3 font-semibold text-gray-900">This clinic has no roles yet</p>
          <p className="mt-1 text-sm text-gray-500">Add the standard roles below; each starts with the usual access for its kind.</p>
          <MissingRoles missing={data.missing} adding={adding} onAdd={addRole} className="mx-auto mt-5 max-w-sm text-left" />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[18rem_1fr]">
          <nav aria-label="Roles" className="flex flex-col gap-4 lg:sticky lg:top-24">
            <ul className="overflow-hidden rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
              {roles.map((r, i) => {
                const current = r._id === selectedId;
                const isAdmin = isAdminRole(r.name);
                const count = allowedByRole.get(r._id)!.size;
                const unsaved = dirtyIds.some((d) => d._id === r._id);
                return (
                  <li key={r._id} className="motion-row-in" style={{ animationDelay: `${Math.min(i * 30, 180)}ms` }}>
                    <button
                      type="button"
                      onClick={() => select(r._id)}
                      aria-current={current ? 'true' : undefined}
                      className={`block w-full px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${
                        current ? 'bg-brand-teal-light/50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className={`truncate text-sm font-semibold ${current ? 'text-brand-teal-deep' : 'text-gray-900'}`}>{r.displayName}</span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-gray-500">{plural(r.people, 'person', 'people')}</span>
                      </span>
                      <span className="mt-2 flex items-center gap-2">
                        <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <span
                            className="motion-bar-grow block h-full rounded-full"
                            style={{ width: `${(count / TOTAL) * 100}%`, background: current ? '#0A7F7E' : SERIES.teal, animationDelay: `${Math.min(i * 40, 200)}ms` }}
                          />
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-gray-600">{isAdmin ? 'Everything' : `${count} of ${TOTAL}`}</span>
                      </span>
                      {(unsaved || !r.isActive) && (
                        <span className="mt-1.5 flex flex-wrap gap-x-3 text-xs">
                          {unsaved && <span className="font-medium text-amber-800">Changes not saved</span>}
                          {!r.isActive && <span className="text-gray-500">Not offered for new assignments</span>}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {data.missing.length > 0 && <MissingRoles missing={data.missing} adding={adding} onAdd={addRole} />}
          </nav>

          {role && (
            <section key={role._id} aria-labelledby="role-title" className="motion-panel-in flex min-w-0 flex-col gap-4">
              <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 id="role-title" className="text-lg font-bold tracking-tight text-gray-900">
                      {role.displayName}
                    </h2>
                    <p className={`mt-0.5 text-sm ${role.description ? 'text-gray-600' : 'text-gray-500'}`}>
                      {role.description ?? 'No description. It’s shown when choosing someone’s role.'}
                    </p>
                  </div>
                  <button type="button" onClick={() => setEditing(role)} className={`${SECONDARY} shrink-0`}>
                    Edit name and description
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  {role.people > 0 ? (
                    <Link
                      href={`/admin/users?role=${role._id}`}
                      className={`inline-flex items-center gap-1.5 rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}
                    >
                      <span className="font-mono tabular-nums">{role.people.toLocaleString('en-US')}</span> {role.people === 1 ? 'person has' : 'people have'} this role
                      <Svg d={ICON.arrow} />
                    </Link>
                  ) : (
                    <span className="text-gray-500">Nobody has this role yet</span>
                  )}
                  {!role.isActive && (
                    <span className="text-amber-800">
                      Not offered when choosing someone’s role{role.people > 0 ? '; the people who have it keep it' : ''}.
                    </span>
                  )}
                </div>
              </div>

              {admin ? (
                <div className="flex items-start gap-2 rounded-lg border border-brand-teal-light bg-brand-teal-light/40 p-4 text-sm text-brand-teal-deep">
                  <Svg d={LOCK} className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Administrators can do everything in the clinic, including changing roles. That can’t be narrowed; to give someone less, give them a
                    different role.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  Tick what {role.displayName.toLowerCase()} accounts may do. <Svg d={LOCK} className="inline h-3.5 w-3.5 -mt-0.5 text-gray-500" /> Built in
                  means the role always has it. Administrators can always do everything.
                </p>
              )}

              {ACCESS.map((group) => {
                const allowed = group.items.filter((it) => draft.has(it.key)).length;
                return (
                  <section key={group.key} aria-labelledby={`g-${group.key}`} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 px-5 py-3">
                      <h3 id={`g-${group.key}`} className="text-base font-bold tracking-tight text-gray-900">
                        {group.title}
                      </h3>
                      <span className="font-mono text-xs tabular-nums text-gray-500">
                        {allowed} of {group.items.length} allowed
                      </span>
                    </div>
                    <ul className="divide-y divide-gray-100">
                      {group.items.map((it) => (
                        <AccessRow
                          key={it.key}
                          id={`${role._id}-${it.key}`}
                          label={it.label}
                          checked={draft.has(it.key)}
                          builtIn={!admin && isBuiltIn(role.name, it.key)}
                          locked={admin || saving}
                          change={added.includes(it.key) ? 'added' : removed.includes(it.key) ? 'removed' : null}
                          others={admin ? [] : othersWith(it.key)}
                          onChange={(on) => toggle(role, it.key, on)}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}

              {personal.length > 0 && (
                <section aria-labelledby="personal-title" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <div className="border-b border-gray-200 px-5 py-3">
                    <h3 id="personal-title" className="text-base font-bold tracking-tight text-gray-900">
                      Extra access of their own
                    </h3>
                    <p className="mt-0.5 text-sm text-gray-500">
                      These people can also do the following. It was given to them personally, so it stays whatever this role allows.
                    </p>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {personal.map((p) => (
                      <li key={p.userId} className="px-5 py-3">
                        <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                        <p className="mt-0.5 text-sm text-gray-600">{p.keys.map((k) => ACCESS_LABEL[k]).join(' · ')}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(changeCount > 0 || saveError) && !admin && (
                <div className="motion-tray-in sticky bottom-4 z-10 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-[0_8px_30px_rgb(15_23_42/0.1)] sm:flex-row sm:items-center sm:justify-between">
                  <p className={`text-sm ${saveError ? 'font-medium text-red-700' : 'text-gray-700'}`} role={saveError ? 'alert' : undefined} aria-live="polite">
                    {saveError
                      ? saveError.text
                      : saving
                        ? 'Saving…'
                        : `${changeSummary(added.length, removed.length)} for ${role.displayName.toLowerCase()} accounts${
                            role.people > 0 ? ` (${plural(role.people, 'person', 'people')})` : ''
                          }.`}
                  </p>
                  <div className="flex shrink-0 justify-end gap-2">
                    {saveError?.stale ? (
                      <button
                        type="button"
                        onClick={() => {
                          discard(role._id);
                          refresh();
                        }}
                        disabled={refreshing}
                        className={PRIMARY}
                      >
                        <Svg d={ICON.refresh} />
                        Reload
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => discard(role._id)} disabled={saving} className={GHOST}>
                          Discard
                        </button>
                        <button type="button" onClick={() => save(role)} disabled={saving || changeCount === 0} aria-busy={saving} className={PRIMARY}>
                          <Svg d={ICON.check} />
                          {saving ? 'Saving…' : 'Save changes'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {editing && (
        <RoleDetailsDialog
          role={editing}
          send={send}
          onClose={() => setEditing(null)}
          onDone={(text) => {
            setEditing(null);
            setNotice({ tone: 'ok', text });
            refresh();
          }}
        />
      )}
    </div>
  );
}

function changeSummary(added: number, removed: number) {
  const parts = [added ? `${added} to allow` : '', removed ? `${removed} to take away` : ''].filter(Boolean);
  return parts.join(', ');
}

function savedMessage(r: RoleRow, added: string[], removed: string[]) {
  if (added.length + removed.length === 0) return `Nothing changed for ${r.displayName}.`;
  const list = (keys: string[]) =>
    keys.length <= 2 ? keys.map((k) => ACCESS_LABEL[k].toLowerCase()).join(' and ') : `${keys.length} more things`;
  const parts = [];
  if (added.length) parts.push(`can now ${list(added)}`);
  if (removed.length) parts.push(`can no longer ${list(removed)}`);
  return `Saved. ${r.displayName} accounts ${parts.join(', and ')}, from the next page they open.`;
}

function AccessRow({
  id,
  label,
  checked,
  builtIn,
  locked,
  change,
  others,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  builtIn: boolean;
  locked: boolean;
  change: 'added' | 'removed' | null;
  others: string[];
  onChange: (on: boolean) => void;
}) {
  const hint = `${id}-hint`;
  return (
    <li className={`flex items-start gap-3 px-5 py-2.5 transition-colors ${change ? 'bg-brand-teal-light/25' : ''}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={builtIn || locked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={hint}
        className={`mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-brand-teal-dark ${builtIn || locked ? 'cursor-not-allowed' : 'cursor-pointer'} ${FOCUS_RING}`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <label htmlFor={id} className={`text-sm ${checked ? 'text-gray-900' : 'text-gray-600'} ${builtIn || locked ? '' : 'cursor-pointer'}`}>
          {label}
        </label>
        <span id={hint} className="shrink-0 text-xs sm:text-right">
          {change === 'added' ? (
            <span className="font-semibold text-brand-teal-deep">Will be allowed</span>
          ) : change === 'removed' ? (
            <span className="font-semibold text-amber-800">Will be taken away</span>
          ) : builtIn ? (
            <span className="inline-flex items-center gap-1 text-gray-500">
              <Svg d={LOCK} className="h-3.5 w-3.5" />
              Built in
            </span>
          ) : others.length > 0 ? (
            <span className="text-gray-500">Also: {others.join(', ')}</span>
          ) : null}
        </span>
      </div>
    </li>
  );
}

function MissingRoles({
  missing,
  adding,
  onAdd,
  className = '',
}: {
  missing: RolesPage['missing'];
  adding: StandardRole | null;
  onAdd: (name: StandardRole, label: string) => void;
  className?: string;
}) {
  if (missing.length === 0) return null;
  return (
    <div className={`rounded-lg border border-dashed border-gray-300 px-4 py-3 ${className}`}>
      <p className="text-sm font-semibold text-gray-900">Not set up in this clinic</p>
      <ul className="mt-2 flex flex-col gap-2">
        {missing.map((m) => (
          <li key={m.name} className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700">{m.displayName}</span>
            <button type="button" onClick={() => onAdd(m.name, m.displayName)} disabled={adding !== null} className={`${SECONDARY} px-3 py-1.5`}>
              {adding === m.name ? 'Adding…' : 'Add'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoleDetailsDialog({
  role,
  send,
  onClose,
  onDone,
}: {
  role: RoleRow;
  send: ReturnType<typeof useSend>;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const ids = useId();
  const admin = isAdminRole(role.name);
  const [displayName, setDisplayName] = useState(role.displayName);
  const [description, setDescription] = useState(role.description ?? '');
  const [offered, setOffered] = useState(role.isActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameMissing = displayName.trim() === '';

  const submit = async () => {
    if (nameMissing) {
      setError('Give the role a name.');
      return;
    }
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { displayName: displayName.trim(), description: description.trim() };
    if (!admin) body.isActive = offered;
    const result = await send(`/api/roles/${role._id}`, 'PUT', body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone(
      !admin && offered !== role.isActive
        ? offered
          ? `${displayName.trim()} is offered again when choosing someone’s role.`
          : `${displayName.trim()} is no longer offered when choosing someone’s role. People who have it keep it.`
        : `Saved the ${displayName.trim()} role’s details.`
    );
  };

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-lg" labelledBy={`${ids}-title`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
            Edit the {role.displayName} role
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">The name and description appear wherever someone’s role is shown or chosen.</p>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          <div>
            <Label htmlFor={`${ids}-name`}>Name</Label>
            <input
              id={`${ids}-name`}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={100}
              autoComplete="off"
              aria-invalid={error !== null && nameMissing}
              className={FIELD}
            />
          </div>
          <div>
            <Label htmlFor={`${ids}-desc`} optional>
              Description
            </Label>
            <textarea
              id={`${ids}-desc`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="e.g. Front desk: bookings, check-in and payments"
              className={FIELD}
            />
          </div>
          {!admin && (
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={offered}
                onChange={(e) => setOffered(e.target.checked)}
                className={`mt-0.5 h-4 w-4 rounded border-gray-300 accent-brand-teal-dark ${FOCUS_RING}`}
              />
              <span className="text-sm">
                <span className="block font-medium text-gray-900">Offer this role when choosing someone’s role</span>
                <span className="block text-gray-500">Turning it off doesn’t change anyone who already has it.</span>
              </span>
            </label>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${error ? 'font-medium text-red-700' : 'text-gray-500'}`} role={error ? 'alert' : undefined} aria-live="polite">
            {error ?? ''}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={GHOST}>
              Cancel
            </button>
            <button type="submit" disabled={busy} aria-busy={busy} className={PRIMARY}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
