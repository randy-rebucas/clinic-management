'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { SERIES } from '../dashboards/charts';
import { Field, Section, describe } from '../account/shared';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useSend } from './users-shared';
import { AUTOMATIONS, AUTOMATION_GROUPS, whenText, type AutomationGroup } from '@/lib/clinic-automations';
import {
  CURRENCIES,
  INVOICE_PREFIX,
  WEEKDAY_LABEL,
  clock12,
  minutesOf,
  type ClinicSettingsForm,
  type ClinicSettingsPageData,
  type DayHours,
  type Weekday,
} from '@/lib/clinic-settings';
import { SERIAL_PREFIX, VAT_CLASS_LABEL, birSetupProblems, formatSerial, formatTin, type BirSettings } from '@/lib/bir';
import { VAT_CLASSES } from '@/lib/invoice-totals';

const PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const GHOST = `rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-60 ${FOCUS_RING}`;
const OUTLINE = `rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`;
const SEGMENT = 'cursor-pointer rounded px-3 py-1.5 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal';
const ROW = 'flex items-start justify-between gap-4 px-5 py-4';

/** Sections of the page, in order: the in-page index and the unsaved-change marks use these. */
const SECTIONS = [
  { id: 'clinic', title: 'Clinic details', keys: ['clinicName', 'clinicAddress', 'clinicPhone', 'clinicEmail', 'clinicWebsite', 'taxId', 'licenseNumber', 'ptr'] },
  { id: 'hours', title: 'Opening hours', keys: ['businessHours', 'timezone'] },
  { id: 'appointments', title: 'Appointments', keys: ['defaultDuration', 'appointmentReminders'] },
  { id: 'billing', title: 'Billing', keys: ['currency', 'taxRate', 'invoicePrefix', 'allowPartialPayments'] },
  { id: 'bir', title: 'BIR invoicing', keys: ['bir'] },
  { id: 'queue', title: 'Queue', keys: ['autoAssignRooms', 'displayQueuePublicly'] },
  { id: 'prescriptions', title: 'Prescriptions', keys: ['prescriptionPaperSize', 'prescriptionDigitalSignatureEnabled'] },
  { id: 'screens', title: 'Staff screens', keys: ['sidebarCollapsed'] },
  { id: 'automations', title: 'Automations', keys: ['automations'] },
  { id: 'services', title: 'Outside services', keys: [] },
] as const satisfies readonly { id: string; title: string; keys: readonly (keyof ClinicSettingsForm)[] }[];

type Errors = Partial<Record<string, string[]>>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function problems(f: ClinicSettingsForm): Errors {
  const out: Errors = {};
  if (!f.clinicName.trim()) out.clinicName = ['Enter the clinic’s name. It heads every printout.'];
  if (f.clinicEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.clinicEmail.trim())) out.clinicEmail = ['That doesn’t look like an email address.'];
  for (const d of f.businessHours) {
    if (!d.closed && minutesOf(d.close) <= minutesOf(d.open)) out[`hours-${d.day}`] = [`${WEEKDAY_LABEL[d.day]} closes before it opens.`];
  }
  if (!Number.isInteger(f.defaultDuration) || f.defaultDuration < 5 || f.defaultDuration > 480) out.defaultDuration = ['Whole minutes, from 5 to 480.'];
  if (!Number.isFinite(f.taxRate) || f.taxRate < 0 || f.taxRate > 100) out.taxRate = ['A percentage from 0 to 100.'];
  if (!INVOICE_PREFIX.test(f.invoicePrefix.trim())) out.invoicePrefix = ['Up to 10 letters, numbers, - or _.'];
  if (!SERIAL_PREFIX.test(f.bir.serialPrefix.trim())) out.birSerialPrefix = ['Up to 6 letters, numbers or -.'];
  const bir = birSetupProblems(f.bir, f.taxId);
  if (bir.length) out.bir = bir;
  return out;
}

/** The API body for what changed, grouped the way the Settings document stores it. */
function changesBody(f: ClinicSettingsForm, base: ClinicSettingsForm) {
  const body: Record<string, unknown> = {};
  const changed = (k: keyof ClinicSettingsForm) => !same(f[k], base[k]);
  for (const k of ['clinicName', 'clinicAddress', 'clinicPhone', 'clinicEmail', 'clinicWebsite', 'taxId', 'licenseNumber', 'ptr'] as const) {
    if (changed(k)) body[k] = f[k].trim();
  }
  if (changed('businessHours')) body.businessHours = f.businessHours;
  if (changed('timezone')) body.timezone = f.timezone;
  if (changed('defaultDuration')) body.appointmentSettings = { defaultDuration: f.defaultDuration };
  if (changed('appointmentReminders')) body.communicationSettings = { appointmentReminders: f.appointmentReminders };
  const billing: Record<string, unknown> = {};
  if (changed('currency')) billing.currency = f.currency;
  if (changed('taxRate')) billing.taxRate = f.taxRate;
  if (changed('invoicePrefix')) billing.invoicePrefix = f.invoicePrefix.trim();
  if (changed('allowPartialPayments')) billing.allowPartialPayments = f.allowPartialPayments;
  if (Object.keys(billing).length) body.billingSettings = billing;
  const queue: Record<string, unknown> = {};
  if (changed('autoAssignRooms')) queue.autoAssignRooms = f.autoAssignRooms;
  if (changed('displayQueuePublicly')) queue.displayQueuePublicly = f.displayQueuePublicly;
  if (Object.keys(queue).length) body.queueSettings = queue;
  if (changed('prescriptionPaperSize')) body.prescriptionPaperSize = f.prescriptionPaperSize;
  if (changed('prescriptionDigitalSignatureEnabled')) body.prescriptionDigitalSignatureEnabled = f.prescriptionDigitalSignatureEnabled;
  if (changed('sidebarCollapsed')) body.displaySettings = { sidebarCollapsed: f.sidebarCollapsed };
  if (changed('bir')) body.birSettings = { ...f.bir, registeredName: f.bir.registeredName.trim(), permitNumber: f.bir.permitNumber.trim(), serialPrefix: f.bir.serialPrefix.trim().toUpperCase() };
  const autos = Object.fromEntries(Object.entries(f.automations).filter(([k, v]) => base.automations[k] !== v));
  if (Object.keys(autos).length) body.automationSettings = autos;
  return body;
}

function ago(iso: string, now: number) {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

export default function ClinicSettingsClient({ data }: { data: ClinicSettingsPageData }) {
  const router = useRouter();
  const send = useSend('The settings couldn’t be saved');
  const [base, setBase] = useState(data.form);
  const [form, setForm] = useState(data.form);
  const [version, setVersion] = useState(data.version);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const set = <K extends keyof ClinicSettingsForm>(key: K, value: ClinicSettingsForm[K]) => {
    setSaved(null);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setAutomation = (key: string, on: boolean) => set('automations', { ...form.automations, [key]: on });

  const dirtySections = SECTIONS.filter((s) => (s.keys as readonly (keyof ClinicSettingsForm)[]).some((k) => !same(form[k], base[k])));
  const changeCount = useMemo(() => {
    let n = 0;
    for (const k of Object.keys(form) as (keyof ClinicSettingsForm)[]) {
      if (k === 'automations') n += Object.keys(form.automations).filter((a) => form.automations[a] !== base.automations[a]).length;
      else if (k === 'businessHours') n += form.businessHours.filter((d, i) => !same(d, base.businessHours[i])).length;
      else if (!same(form[k], base[k])) n += 1;
    }
    return n;
  }, [form, base]);
  const dirty = changeCount > 0;
  useUnsavedChanges(dirty, 'You have settings that aren’t saved. Leave anyway?');

  const errors = tried ? problems(form) : {};
  const errorCount = Object.keys(errors).length;
  const now = Date.parse(data.now);

  const save = async () => {
    setTried(true);
    const found = problems(form);
    const first = Object.keys(found)[0];
    if (first) {
      const id = first.startsWith('hours-') ? `set-${first}-close` : first === 'bir' ? 'set-bir-enabled' : `set-${first}`;
      document.getElementById(id)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const result = await send('/api/settings', 'PUT', { ...changesBody(form, base), version });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const next = (result.data as { version?: string } | null)?.version;
    if (next) setVersion(next);
    setBase(form);
    setTried(false);
    setSaved(`Saved ${changeCount} ${changeCount === 1 ? 'change' : 'changes'}. They apply from now on and are recorded in the audit log.`);
    router.refresh();
  };

  const discard = () => {
    setForm(base);
    setTried(false);
    setError(null);
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Clinic settings</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">
          How the clinic appears on printouts and messages, when it’s open, and what the system does on its own.
        </p>
        {data.lastChange && (
          <p className="mt-2 text-sm text-gray-500">
            Last changed {ago(data.lastChange.at, now)} by {data.lastChange.who}
            {data.lastChange.what ? <>: <span className="font-mono text-xs">{data.lastChange.what}</span></> : null}.{' '}
            <Link href="/admin/audit-logs" className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
              See every change
            </Link>
          </p>
        )}
      </header>

      {saved && !dirty && (
        <p role="status" className="motion-panel-in flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          <Svg d={ICON.check} className="mt-0.5 h-4 w-4 shrink-0" />
          {saved}
        </p>
      )}

      <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-24 space-y-0.5 text-sm">
            {SECTIONS.map((s) => {
              const changed = dirtySections.some((d) => d.id === s.id);
              return (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}>
                    {s.title}
                    {changed && <span className="text-xs font-semibold text-brand-teal-deep">Changed</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          <ClinicSection form={form} set={set} errors={errors} />
          <HoursSection form={form} set={set} errors={errors} timezones={data.timezones} base={base} now={data.now} />
          <AppointmentsSection form={form} set={set} errors={errors} services={data.services} />
          <BillingSection form={form} set={set} errors={errors} />
          <BirSection form={form} set={set} errors={errors} />
          <QueueSection form={form} set={set} displayPath={data.displayPath} />
          <PrescriptionsSection form={form} set={set} />
          <Section id="screens" title="Staff screens" description="What staff see the first time they sign in on a device.">
            <SwitchRow
              id="set-sidebarCollapsed"
              label="Start with the sidebar folded"
              hint="Shows only icons in the left menu. Each person can still open it, and their choice is kept on that device."
              on={form.sidebarCollapsed}
              onChange={(v) => set('sidebarCollapsed', v)}
            />
          </Section>
          <AutomationsSection form={form} base={base} onChange={setAutomation} services={data.services} />
          <ServicesSection services={data.services} />
        </div>
      </div>

      {(dirty || error) && (
        <div className="motion-tray-in sticky bottom-4 z-20 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-5 py-3 shadow-[0_8px_30px_rgb(15_23_42/0.1)] sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${error || errorCount ? 'font-medium text-red-700' : 'text-gray-700'}`} role={error ? 'alert' : undefined} aria-live="polite">
            {error ??
              (errorCount
                ? `${errorCount} ${errorCount === 1 ? 'thing needs' : 'things need'} fixing before saving.`
                : `${changeCount} unsaved ${changeCount === 1 ? 'change' : 'changes'} in ${dirtySections.map((s) => s.title.toLowerCase()).join(', ')}.`)}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={discard} disabled={busy} className={GHOST}>
              Discard
            </button>
            <button type="button" onClick={save} disabled={busy || !dirty} aria-busy={busy} className={PRIMARY}>
              <Svg d={ICON.check} />
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type SetFn = <K extends keyof ClinicSettingsForm>(key: K, value: ClinicSettingsForm[K]) => void;

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function Switch({ id, on, onChange, label }: { id?: string; on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 ${on ? 'bg-brand-teal-dark' : 'bg-gray-300'} ${FOCUS_RING}`}
    >
      <span aria-hidden="true" className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${on ? 'translate-x-[1.375rem]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function SwitchRow({ id, label, hint, on, onChange, children }: { id?: string; label: string; hint?: ReactNode; on: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  return (
    <div className={ROW}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {hint && <div className="mt-0.5 text-sm text-gray-500">{hint}</div>}
        {children}
      </div>
      <Switch id={id} on={on} onChange={onChange} label={label} />
    </div>
  );
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="motion-panel-in mt-1.5 flex items-start gap-1.5 text-sm text-amber-800">
      <Svg d={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function TextField({ k, label, hint, values, set, errors, ...props }: { k: 'clinicName' | 'clinicAddress' | 'clinicPhone' | 'clinicEmail' | 'clinicWebsite' | 'taxId' | 'licenseNumber' | 'ptr'; label: string; hint?: ReactNode; values: ClinicSettingsForm; set: SetFn; errors: Errors } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'form'>) {
  const id = `set-${k}`;
  return (
    <Field id={id} label={label} hint={hint} errors={errors[k]}>
      <input id={id} value={values[k]} onChange={(e) => set(k, e.target.value)} autoComplete="off" {...describe(id, errors[k], !!hint)} {...props} className={`${FIELD} ${errors[k] ? 'border-red-400' : ''} ${props.className ?? ''}`} />
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function ClinicSection({ form, set, errors }: { form: ClinicSettingsForm; set: SetFn; errors: Errors }) {
  return (
    <Section
      id="clinic"
      title="Clinic details"
      description="Printed at the head of receipts, prescriptions, medical certificates, lab requests and referral letters, and signed on messages to patients."
    >
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField k="clinicName" label="Clinic name" values={form} set={set} errors={errors} maxLength={200} />
        </div>
        <div className="sm:col-span-2">
          <TextField k="clinicAddress" label="Address" values={form} set={set} errors={errors} maxLength={500} />
        </div>
        <TextField k="clinicPhone" label="Phone" values={form} set={set} errors={errors} maxLength={50} inputMode="tel" className="font-mono tabular-nums" />
        <TextField k="clinicEmail" label="Email" values={form} set={set} errors={errors} maxLength={254} type="email" />
        <TextField k="clinicWebsite" label="Website" hint="Included in welcome messages to new patients." values={form} set={set} errors={errors} maxLength={500} placeholder="https://" />
        <TextField k="taxId" label="TIN" hint="Printed on official receipts." values={form} set={set} errors={errors} maxLength={100} className="font-mono tabular-nums" />
      </div>
      <div className="border-t border-gray-100 p-5">
        <p className="text-sm font-semibold text-gray-900">Clinic licence and PTR</p>
        <p className="mt-0.5 text-sm text-gray-500">Printed on prescriptions, lab requests and letters only when the signing doctor’s own profile has none.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <TextField k="licenseNumber" label="Licence number" values={form} set={set} errors={errors} maxLength={100} className="font-mono tabular-nums" />
          <TextField k="ptr" label="PTR number" values={form} set={set} errors={errors} maxLength={100} className="font-mono tabular-nums" />
        </div>
      </div>
    </Section>
  );
}

function HoursSection({ form, set, errors, timezones, base, now }: { form: ClinicSettingsForm; set: SetFn; errors: Errors; timezones: string[]; base: ClinicSettingsForm; now: string }) {
  const days = form.businessHours;
  const open = days.filter((d) => !d.closed);
  // One scale for every bar: the earliest opening to the latest closing, at least 7 AM–7 PM.
  const lo = Math.min(7 * 60, ...open.map((d) => minutesOf(d.open)));
  const hi = Math.max(19 * 60, ...open.map((d) => (minutesOf(d.close) > minutesOf(d.open) ? minutesOf(d.close) : minutesOf(d.open))));
  const weekMinutes = open.reduce((s, d) => s + Math.max(0, minutesOf(d.close) - minutesOf(d.open)), 0);
  const update = (day: Weekday, patch: Partial<DayHours>) => set('businessHours', days.map((d) => (d.day === day ? { ...d, ...patch } : d)));
  const monday = days[0];
  const copyMonday = () => set('businessHours', days.map((d) => (['tuesday', 'wednesday', 'thursday', 'friday'].includes(d.day) ? { ...monday, day: d.day } : d)));
  const weekdaysMatch = days.slice(1, 5).every((d) => d.closed === monday.closed && d.open === monday.open && d.close === monday.close);
  const zoneTime = (() => {
    try {
      return new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: form.timezone });
    } catch {
      return null;
    }
  })();

  return (
    <Section
      id="hours"
      title="Opening hours"
      description="Draws the clinic day on the dashboard and appointments, the doctors’ week, and marks closed days on the booking calendar."
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-gray-100 px-5 py-3 text-sm">
        <p className="text-gray-600">
          Open <span className="font-mono tabular-nums text-gray-900">{open.length}</span> days,{' '}
          <span className="font-mono tabular-nums text-gray-900">{Math.round((weekMinutes / 60) * 10) / 10}</span> hours a week
        </p>
        {!weekdaysMatch && (
          <button type="button" onClick={copyMonday} className={OUTLINE}>
            Copy Monday to Tuesday–Friday
          </button>
        )}
      </div>
      <ul className="divide-y divide-gray-100">
        {days.map((d) => {
          const err = errors[`hours-${d.day}`];
          const from = minutesOf(d.open);
          const to = minutesOf(d.close);
          const valid = to > from;
          return (
            <li key={d.day} className="grid grid-cols-[6.5rem_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-5 py-3 sm:grid-cols-[6.5rem_auto_auto_minmax(0,1fr)]">
              <span className="text-sm font-semibold text-gray-900">{WEEKDAY_LABEL[d.day]}</span>
              <Switch on={!d.closed} onChange={(v) => update(d.day, { closed: !v })} label={`Open on ${WEEKDAY_LABEL[d.day]}`} />
              {d.closed ? (
                <span className="text-sm text-gray-500 sm:col-span-2">Closed</span>
              ) : (
                <>
                  <span className="flex items-center gap-1.5">
                    <input
                      id={`set-hours-${d.day}-open`}
                      type="time"
                      value={d.open}
                      onChange={(e) => e.target.value && update(d.day, { open: e.target.value })}
                      aria-label={`${WEEKDAY_LABEL[d.day]} opens at`}
                      className={`${FIELD} w-[7.5rem] px-2 font-mono tabular-nums`}
                    />
                    <span className="text-sm text-gray-500">to</span>
                    <input
                      id={`set-hours-${d.day}-close`}
                      type="time"
                      value={d.close}
                      onChange={(e) => e.target.value && update(d.day, { close: e.target.value })}
                      aria-label={`${WEEKDAY_LABEL[d.day]} closes at`}
                      aria-invalid={!!err || undefined}
                      className={`${FIELD} w-[7.5rem] px-2 font-mono tabular-nums ${err ? 'border-red-400' : ''}`}
                    />
                  </span>
                  <span className="col-span-3 block h-1.5 rounded bg-gray-100 sm:col-span-1" aria-hidden="true">
                    {valid && (
                      <span
                        className="block h-full rounded transition-[margin,width] duration-200"
                        style={{ marginLeft: `${((from - lo) / (hi - lo)) * 100}%`, width: `${((to - from) / (hi - lo)) * 100}%`, background: SERIES.teal }}
                      />
                    )}
                  </span>
                </>
              )}
              {err && <p className="col-span-full -mt-1 text-sm font-medium text-red-700">{err[0]}</p>}
            </li>
          );
        })}
      </ul>
      <div className="flex justify-between border-t border-gray-100 px-5 py-2 font-mono text-xs tabular-nums text-gray-500" aria-hidden="true">
        <span>Bars run {clock12(`${String(Math.floor(lo / 60)).padStart(2, '0')}:${String(lo % 60).padStart(2, '0')}`)}</span>
        <span>to {clock12(`${String(Math.floor(hi / 60) % 24).padStart(2, '0')}:${String(hi % 60).padStart(2, '0')}`)}</span>
      </div>
      <div className="border-t border-gray-100 p-5">
        <Field id="set-timezone" label="Time zone" hint={zoneTime ? `It was ${zoneTime} there when this page opened.` : undefined}>
          <select id="set-timezone" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} className={`${FIELD} sm:max-w-sm`} {...describe('set-timezone', undefined, !!zoneTime)}>
            {timezones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </Field>
        {form.timezone !== base.timezone && (
          <Warn>Every clinic day will start and end in {form.timezone.replace(/_/g, ' ')}: today’s schedule, the queue, reports and when reminders go out.</Warn>
        )}
      </div>
    </Section>
  );
}

function AppointmentsSection({ form, set, errors, services }: { form: ClinicSettingsForm; set: SetFn; errors: Errors; services: ClinicSettingsPageData['services'] }) {
  return (
    <Section id="appointments" title="Appointments">
      <div className="p-5">
        <Field id="set-defaultDuration" label="Usual length" hint="Offered first when booking, used for bookings made without a length, and how long they are drawn on the schedule." errors={errors.defaultDuration}>
          <span className="flex items-center gap-2">
            <input
              id="set-defaultDuration"
              type="number"
              min={5}
              max={480}
              step={5}
              value={Number.isFinite(form.defaultDuration) ? form.defaultDuration : ''}
              onChange={(e) => set('defaultDuration', e.target.value === '' ? NaN : Number(e.target.value))}
              className={`${FIELD} w-24 font-mono tabular-nums ${errors.defaultDuration ? 'border-red-400' : ''}`}
              {...describe('set-defaultDuration', errors.defaultDuration, true)}
            />
            <span className="text-sm text-gray-600">minutes</span>
          </span>
        </Field>
      </div>
      <div className="border-t border-gray-100">
        <SwitchRow
          id="set-appointmentReminders"
          label="Remind patients of their appointments"
          hint={`A text at ${whenText('{01:00}', form.timezone)} the day before each booking, with a link to confirm it; patients with a follow-up date the next day get one too.`}
          on={form.appointmentReminders}
          onChange={(v) => set('appointmentReminders', v)}
        >
          {form.appointmentReminders && !services.sms && (
            <Warn>Text messages aren’t set up on this server, so no reminder goes out. See Outside services below.</Warn>
          )}
        </SwitchRow>
      </div>
    </Section>
  );
}

function BillingSection({ form, set, errors }: { form: ClinicSettingsForm; set: SetFn; errors: Errors }) {
  const prefix = INVOICE_PREFIX.test(form.invoicePrefix.trim()) ? form.invoicePrefix.trim() : 'INV';
  return (
    <Section id="billing" title="Billing" description="Applies to invoices made from now on. Invoices already made keep their currency, tax and number.">
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field id="set-currency" label="Currency">
          <select id="set-currency" value={form.currency} onChange={(e) => set('currency', e.target.value)} className={FIELD}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="set-invoicePrefix" label="Invoice numbers start with" hint={<>Next invoices read like <span className="font-mono">{prefix}-000124</span>.</>} errors={errors.invoicePrefix}>
          <input
            id="set-invoicePrefix"
            value={form.invoicePrefix}
            onChange={(e) => set('invoicePrefix', e.target.value.toUpperCase())}
            maxLength={10}
            autoComplete="off"
            className={`${FIELD} font-mono uppercase ${errors.invoicePrefix ? 'border-red-400' : ''}`}
            {...describe('set-invoicePrefix', errors.invoicePrefix, true)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            id="set-taxRate"
            label="Tax rate"
            hint={
              form.taxRate > 0
                ? `Every invoice is taxed at ${form.taxRate}%, and staff can’t type a tax amount of their own.`
                : 'At 0, invoices carry no tax unless staff type an amount on the invoice.'
            }
            errors={errors.taxRate}
          >
            <span className="flex items-center gap-2">
              <input
                id="set-taxRate"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={Number.isFinite(form.taxRate) ? form.taxRate : ''}
                onChange={(e) => set('taxRate', e.target.value === '' ? 0 : Number(e.target.value))}
                className={`${FIELD} w-28 font-mono tabular-nums ${errors.taxRate ? 'border-red-400' : ''}`}
                {...describe('set-taxRate', errors.taxRate, true)}
              />
              <span className="text-sm text-gray-600">%</span>
            </span>
          </Field>
        </div>
      </div>
      <div className="border-t border-gray-100">
        <SwitchRow
          id="set-allowPartialPayments"
          label="Accept part payments"
          hint={form.allowPartialPayments ? 'Staff can record any amount up to the balance.' : 'A payment must cover the whole balance; anything less is refused.'}
          on={form.allowPartialPayments}
          onChange={(v) => set('allowPartialPayments', v)}
        />
      </div>
    </Section>
  );
}

function BirSection({ form, set, errors }: { form: ClinicSettingsForm; set: SetFn; errors: Errors }) {
  const ids = useId();
  const b = form.bir;
  const put = (patch: Partial<BirSettings>) => set('bir', { ...b, ...patch });
  const num = (v: string) => (v === '' ? 0 : Math.max(0, Math.floor(Number(v)) || 0));
  const vat = b.regime === 'vat';
  return (
    <Section
      id="bir"
      title="BIR invoicing"
      description="Issue BIR sales invoices: the clinic’s registration and VAT status printed on each, serials from the range BIR approved, and the VAT and senior citizen / PWD rules worked out. Check these details against your Certificate of Registration (Form 2303) and your permit, or with your accountant."
    >
      <SwitchRow
        id="set-bir-enabled"
        label="Issue BIR sales invoices"
        hint={
          b.enabled
            ? 'New invoices follow BIR rules and print as sales invoices. A serial is given the first time each one is printed, and its amounts can’t change after that.'
            : 'Off, invoices print as plain receipts using the tax rate under Billing.'
        }
        on={b.enabled}
        onChange={(v) => put({ enabled: v })}
      >
        {errors.bir && (
          <ul className="mt-2 space-y-0.5 text-sm font-medium text-red-700" role="alert">
            {errors.bir.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </SwitchRow>

      <div className={`grid gap-4 border-t border-gray-100 p-5 sm:grid-cols-2 ${b.enabled ? '' : 'opacity-70'}`}>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-semibold text-gray-800">Registered as</legend>
          <div className="grid max-w-md grid-cols-2 gap-1 rounded-md border border-gray-300 bg-white p-1">
            {(
              [
                { v: 'vat', label: 'VAT-registered', hint: 'Charges 12% VAT' },
                { v: 'non_vat', label: 'Non-VAT', hint: 'Percentage tax; no VAT' },
              ] as const
            ).map((o) => {
              const on = b.regime === o.v;
              return (
                <label key={o.v} className={`${SEGMENT} ${on ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  <input type="radio" name={`${ids}-regime`} checked={on} onChange={() => put({ regime: o.v })} className="sr-only" />
                  <span className="block font-semibold">{o.label}</span>
                  <span className={`block text-xs ${on ? 'text-white' : 'text-gray-500'}`}>{o.hint}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {vat && (
          <>
            <Field id="set-bir-vatRate" label="VAT rate">
              <span className="flex items-center gap-2">
                <input
                  id="set-bir-vatRate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={b.vatRate}
                  onChange={(e) => put({ vatRate: e.target.value === '' ? 0 : Number(e.target.value) })}
                  className={`${FIELD} w-28 font-mono tabular-nums`}
                />
                <span className="text-sm text-gray-600">%</span>
              </span>
            </Field>
            <Field id="set-bir-pfVat" label="Professional fees are">
              <select id="set-bir-pfVat" value={b.professionalFeeVatClass} onChange={(e) => put({ professionalFeeVatClass: e.target.value as BirSettings['professionalFeeVatClass'] })} className={FIELD}>
                {VAT_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {VAT_CLASS_LABEL[c]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <SwitchRowPlain
                label="Price-list prices include VAT"
                hint={b.pricesIncludeVat ? 'A ₱112 service is ₱100 plus ₱12 VAT; the patient pays ₱112.' : 'VAT is added on top: a ₱100 service bills ₱112.'}
                on={b.pricesIncludeVat}
                onChange={(v) => put({ pricesIncludeVat: v })}
              />
            </div>
          </>
        )}

        <Field id="set-bir-registeredName" label="Registered name" hint="As on Form 2303, if it isn’t the clinic name above.">
          <input id="set-bir-registeredName" value={b.registeredName} onChange={(e) => put({ registeredName: e.target.value })} maxLength={200} placeholder={form.clinicName} className={FIELD} />
        </Field>
        <Field id="set-bir-branchCode" label="Branch code" hint={<>TIN prints as <span className="font-mono">{formatTin(form.taxId, b.branchCode) || '000-000-000-00000'}</span>.</>}>
          <input
            id="set-bir-branchCode"
            value={b.branchCode}
            onChange={(e) => put({ branchCode: e.target.value.replace(/\D/g, '').slice(0, 5) })}
            inputMode="numeric"
            className={`${FIELD} w-32 font-mono tabular-nums`}
          />
        </Field>
        <Field id="set-bir-permitNumber" label="Permit or acknowledgment certificate no.">
          <input id="set-bir-permitNumber" value={b.permitNumber} onChange={(e) => put({ permitNumber: e.target.value })} maxLength={100} className={`${FIELD} font-mono`} />
        </Field>
        <Field id="set-bir-permitIssuedOn" label="Issued on">
          <input id="set-bir-permitIssuedOn" type="date" value={b.permitIssuedOn} onChange={(e) => put({ permitIssuedOn: e.target.value })} className={`${FIELD} w-auto font-mono`} />
        </Field>
      </div>

      <div className="border-t border-gray-100 p-5">
        <p className="text-sm font-semibold text-gray-900">Approved serial range</p>
        <p className="mt-0.5 text-sm text-gray-500">
          Serials are given in order with none skipped. When a range runs out, invoices stop printing until a new range is entered.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field id="set-birSerialPrefix" label="Prefix" errors={errors.birSerialPrefix}>
            <input
              id="set-birSerialPrefix"
              value={b.serialPrefix}
              onChange={(e) => put({ serialPrefix: e.target.value.toUpperCase() })}
              maxLength={6}
              placeholder="None"
              className={`${FIELD} font-mono uppercase ${errors.birSerialPrefix ? 'border-red-400' : ''}`}
            />
          </Field>
          <Field id="set-bir-serialStart" label="First number">
            <input id="set-bir-serialStart" inputMode="numeric" value={b.serialStart || ''} onChange={(e) => put({ serialStart: num(e.target.value) })} className={`${FIELD} font-mono tabular-nums`} />
          </Field>
          <Field id="set-bir-serialEnd" label="Last number" hint="Blank if the permit sets no end.">
            <input id="set-bir-serialEnd" inputMode="numeric" value={b.serialEnd || ''} onChange={(e) => put({ serialEnd: num(e.target.value) })} className={`${FIELD} font-mono tabular-nums`} />
          </Field>
        </div>
        {b.serialStart > 0 && (
          <p className="mt-2 text-sm text-gray-600">
            Serials read <span className="font-mono">{formatSerial(SERIAL_PREFIX.test(b.serialPrefix) ? b.serialPrefix : '', b.serialStart)}</span>
            {b.serialEnd > 0 && (
              <>
                {' '}
                to <span className="font-mono">{formatSerial(SERIAL_PREFIX.test(b.serialPrefix) ? b.serialPrefix : '', b.serialEnd)}</span>
              </>
            )}
            .
          </p>
        )}
      </div>
    </Section>
  );
}

/** A switch row without its own outer padding, for inside a grid. */
function SwitchRowPlain({ label, hint, on, onChange }: { label: string; hint: ReactNode; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="mt-0.5 text-sm text-gray-500">{hint}</p>
      </div>
      <Switch on={on} onChange={onChange} label={label} />
    </div>
  );
}

function QueueSection({ form, set, displayPath }: { form: ClinicSettingsForm; set: SetFn; displayPath: string }) {
  const optimising = form.automations.autoQueueOptimization === true;
  return (
    <Section id="queue" title="Queue">
      <div className="divide-y divide-gray-100">
        <SwitchRow
          id="set-autoAssignRooms"
          label="Give waiting patients a free room"
          hint={
            <>
              Assigns an open room nobody is in when the queue is reordered. Rooms are listed on{' '}
              <Link href="/admin/rooms" className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                Rooms
              </Link>
              .
            </>
          }
          on={form.autoAssignRooms}
          onChange={(v) => set('autoAssignRooms', v)}
        >
          {form.autoAssignRooms && !optimising && <Warn>Only happens while “Reorder the queue” is on under Automations.</Warn>}
        </SwitchRow>
        <SwitchRow
          id="set-displayQueuePublicly"
          label="Let a waiting-room screen show the queue without signing in"
          hint={
            <>
              Queue numbers and initials only, on the clinic’s own address. The app has no waiting-room screen of its own yet; this opens the feed at{' '}
              <span className="font-mono text-xs">{displayPath}</span> for one set up separately. Signed-in staff can always read it.
            </>
          }
          on={form.displayQueuePublicly}
          onChange={(v) => set('displayQueuePublicly', v)}
        />
      </div>
    </Section>
  );
}

function PrescriptionsSection({ form, set }: { form: ClinicSettingsForm; set: SetFn }) {
  const ids = useId();
  const sizes = [
    { value: 'A5', label: 'A5', hint: '148 × 210 mm, half a sheet' },
    { value: 'A4', label: 'A4', hint: '210 × 297 mm, a full sheet' },
  ] as const;
  return (
    <Section id="prescriptions" title="Prescriptions" description="How printed prescriptions come out.">
      <fieldset className="p-5">
        <legend className="mb-1.5 text-sm font-semibold text-gray-800">Paper size</legend>
        <div className="grid max-w-md grid-cols-2 gap-1 rounded-md border border-gray-300 bg-white p-1">
          {sizes.map((s) => {
            const on = form.prescriptionPaperSize === s.value;
            return (
              <label key={s.value} className={`${SEGMENT} ${on ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                <input type="radio" name={`${ids}-paper`} value={s.value} checked={on} onChange={() => set('prescriptionPaperSize', s.value)} className="sr-only" />
                <span className="block font-semibold">{s.label}</span>
                <span className={`block text-xs ${on ? 'text-white' : 'text-gray-500'}`}>{s.hint}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="border-t border-gray-100">
        <SwitchRow
          id="set-prescriptionDigitalSignatureEnabled"
          label="Print the doctor’s signature"
          hint="Uses the signature drawn on the prescription. Off, the line is left blank to sign by hand."
          on={form.prescriptionDigitalSignatureEnabled}
          onChange={(v) => set('prescriptionDigitalSignatureEnabled', v)}
        />
      </div>
    </Section>
  );
}

function AutomationsSection({
  form,
  base,
  onChange,
  services,
}: {
  form: ClinicSettingsForm;
  base: ClinicSettingsForm;
  onChange: (key: string, on: boolean) => void;
  services: ClinicSettingsPageData['services'];
}) {
  const onCount = AUTOMATIONS.filter((a) => form.automations[a.key]).length;
  const canMessage = services.sms || services.email;
  return (
    <Section
      id="automations"
      title="Automations"
      description={
        <>
          <p>
            What the system does on its own, at the times shown (clinic time). <span className="font-mono tabular-nums text-gray-900">{onCount}</span> of{' '}
            <span className="font-mono tabular-nums text-gray-900">{AUTOMATIONS.length}</span> are on.
          </p>
          {!canMessage && <p className="mt-2 text-amber-800">Text and email aren’t set up, so automations that message patients send nothing but in-app notices.</p>}
        </>
      }
    >
      {AUTOMATION_GROUPS.map((g: AutomationGroup, gi) => {
        const items = AUTOMATIONS.filter((a) => a.group === g.key);
        if (!items.length) return null;
        return (
          <div key={g.key} className={gi > 0 ? 'border-t border-gray-200' : ''}>
            <h3 className="flex items-baseline justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-2 text-sm font-semibold text-gray-900">
              {g.title}
              <span className="font-mono text-xs font-medium tabular-nums text-gray-500">
                {items.filter((a) => form.automations[a.key]).length} of {items.length} on
              </span>
            </h3>
            <ul className="divide-y divide-gray-100">
              {items.map((a) => {
                const on = form.automations[a.key] === true;
                const changed = on !== base.automations[a.key];
                return (
                  <li key={a.key} className={changed ? 'bg-brand-teal-light/25' : ''}>
                    <SwitchRow
                      id={`set-auto-${a.key}`}
                      label={a.label}
                      hint={
                        <>
                          {a.does}
                          <span className="mt-0.5 block text-xs text-gray-500">{whenText(a.when, form.timezone)}</span>
                        </>
                      }
                      on={on}
                      onChange={(v) => onChange(a.key, v)}
                    >
                      {a.caution && on && <Warn>{a.caution}</Warn>}
                      {changed && <p className="mt-1 text-xs font-semibold text-brand-teal-deep">{on ? 'Will be turned on' : 'Will be turned off'}</p>}
                    </SwitchRow>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </Section>
  );
}

function ServicesSection({ services }: { services: ClinicSettingsPageData['services'] }) {
  const rows = [
    { key: 'email', label: 'Email', ok: services.email, means: 'Reminders, receipts, results and invites by email.', vars: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM (optional)'] },
    { key: 'sms', label: 'Text messages', ok: services.sms, means: 'Reminders and notices by SMS through Twilio.', vars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'] },
    { key: 'files', label: 'File storage', ok: services.files, means: 'Documents and images kept on Cloudinary; without it, files are stored in the database.', vars: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] },
  ];
  return (
    <Section id="services" title="Outside services" description="Set up on the server by whoever runs it, not here. Changes need a restart.">
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => (
          <li key={r.key} className="px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{r.label}</p>
                <p className="mt-0.5 text-sm text-gray-500">{r.means}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 text-sm font-medium ${r.ok ? 'text-emerald-800' : 'text-gray-600'}`}>
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${r.ok ? 'bg-emerald-600' : 'ring-1 ring-inset ring-gray-400'}`} />
                {r.ok ? 'Set up' : 'Not set up'}
              </span>
            </div>
            {!r.ok && (
              <details className="mt-2 text-sm">
                <summary className={`cursor-pointer rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>What the server needs</summary>
                <ul className="mt-2 space-y-0.5 font-mono text-xs text-gray-700">
                  {r.vars.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
