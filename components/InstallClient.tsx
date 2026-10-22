'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Icon, icons } from '@/components/PublicPage';

interface InstallCheck {
  nodeVersion?: string;
  nodeVersionValid: boolean;
  dependenciesInstalled: boolean;
  envLocalExists?: boolean;
  environmentConfigured: boolean;
  databaseConnected: boolean;
  databaseReset: boolean;
  errors: string[];
  warnings: string[];
}

type Notice = { tone: 'error' | 'info' | 'success'; text: string } | null;

// The first step whose requirements aren't met yet.
function firstIncompleteStep(checks: InstallCheck) {
  if (!(checks.nodeVersionValid && checks.dependenciesInstalled)) return 1;
  if (!(checks.environmentConfigured && checks.databaseConnected)) return 2;
  if (!checks.databaseReset) return 3;
  return 4;
}

const STEPS = [
  { number: 1, title: 'Prerequisites' },
  { number: 2, title: 'Environment' },
  { number: 3, title: 'Database' },
  { number: 4, title: 'Complete' },
];

const INSTALL_AUTH_ERROR =
  'The install secret was rejected. It must match the INSTALL_SECRET set on the server (at least 32 characters).';

const xIcon = 'M6 18L18 6M6 6l12 12';
const dbIcon = 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4';
const lockIcon = 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z';

const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-md bg-brand-teal px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-teal-dark disabled:cursor-not-allowed disabled:opacity-50';
const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors duration-150 hover:border-gray-900 hover:text-gray-900 disabled:opacity-50';

function Spinner() {
  return <span className="h-4 w-4 rounded-full border-2 border-current/30 border-t-current animate-spin" aria-hidden="true" />;
}

function StatusRow({
  icon,
  title,
  ok,
  okLabel,
  badLabel,
  tone = 'error',
  children,
}: {
  icon: string;
  title: string;
  ok: boolean;
  okLabel: string;
  badLabel: string;
  tone?: 'error' | 'warn';
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-3 font-semibold text-gray-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-50 text-gray-500">
            <Icon d={icon} className="w-4 h-4" />
          </span>
          {title}
        </span>
        {ok ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-teal-light px-2.5 py-0.5 text-xs font-semibold text-brand-teal-deep">
            <Icon d={icons.check} className="w-3.5 h-3.5" />
            {okLabel}
          </span>
        ) : (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              tone === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'
            }`}
          >
            {badLabel}
          </span>
        )}
      </div>
      {children && <div className="mt-3 pl-11 text-sm text-gray-600">{children}</div>}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[13px] text-gray-900">{children}</code>;
}

export default function InstallClient({ enabled }: { enabled: boolean }) {
  const [installSecret, setInstallSecret] = useState('');
  const [checks, setChecks] = useState<InstallCheck | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const installFetch = async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${installSecret}`);
    const response = await fetch(url, { ...init, headers });
    if (response.status === 401 || response.status === 403) {
      setNotice({ tone: 'error', text: INSTALL_AUTH_ERROR });
      return null;
    }
    return response;
  };

  /** Load (or reload) the checks; only works with a valid install secret. */
  const loadChecks = async (jumpToFirstIncomplete: boolean) => {
    setLoading(true);
    try {
      const response = await installFetch('/api/install/check');
      if (!response) return;
      const data = await response.json();
      if (!data.success) {
        setNotice({ tone: 'error', text: data.error || 'Failed to check installation status.' });
        return;
      }
      setChecks(data.checks);
      if (jumpToFirstIncomplete) setCurrentStep(firstIncompleteStep(data.checks));
      setNotice(null);
    } catch {
      setNotice({ tone: 'error', text: 'Could not reach the server. Is it running?' });
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = (e: FormEvent) => {
    e.preventDefault();
    if (installSecret) loadChecks(true);
  };

  const handleInstallDependencies = async () => {
    setInstalling(true);
    try {
      const response = await installFetch('/api/install/dependencies', { method: 'POST' });
      if (!response) return;
      const data = await response.json();
      setNotice({
        tone: 'info',
        text: data.success
          ? 'Run "npm install" in your terminal, then refresh the checks.'
          : data.error || 'Run "npm install" in your terminal.',
      });
    } catch {
      setNotice({ tone: 'info', text: 'Run "npm install" in your terminal, then refresh the checks.' });
    } finally {
      setInstalling(false);
    }
  };

  const handleResetDatabase = async () => {
    if (!resetConfirm) return;
    setResetting(true);
    try {
      const response = await installFetch('/api/install/reset', { method: 'POST' });
      if (!response) return;
      const data = await response.json();
      if (data.success) {
        setNotice({ tone: 'success', text: 'Database reset.' });
        await loadChecks(false);
      } else {
        setNotice({ tone: 'error', text: data.error || 'Failed to reset database.' });
      }
    } catch (err: any) {
      setNotice({ tone: 'error', text: err.message || 'Failed to reset database.' });
    } finally {
      setResetting(false);
      setResetConfirm(false);
    }
  };

  const refreshButton = (
    <button type="button" onClick={() => loadChecks(false)} disabled={loading} className={btnSecondary}>
      {loading && <Spinner />}
      Refresh
    </button>
  );

  return (
    <div className="relative min-h-[80vh] bg-white overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[24rem]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 70% 70% at 50% 0%, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 0%, black 20%, transparent 75%)',
        }}
      />
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal-dark mb-3">Setup</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Installation wizard</h1>
          <p className="text-gray-600 mt-2">Check the server, configure the environment, and prepare the database.</p>
        </header>

        <div className="rounded-xl border border-gray-200 bg-white shadow-[0_20px_50px_rgb(15,23,42,0.06)]">
          {!enabled ? (
            <div className="p-6 sm:p-8">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <Icon d={lockIcon} />
              </div>
              <h2 className="text-lg font-bold text-gray-900">The installer is disabled</h2>
              <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                Set <Code>INSTALL_SECRET</Code> (at least 32 characters) on the server and restart it to use this wizard.
                Remove it again once setup is done.
              </p>
            </div>
          ) : !checks ? (
            /* Unlock */
            <form onSubmit={handleUnlock} className="p-6 sm:p-8">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand-teal-light text-brand-teal-dark">
                <Icon d={lockIcon} />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Enter the install secret</h2>
              <p className="text-sm text-gray-600 mt-1.5">
                It must match <Code>INSTALL_SECRET</Code> on the server. Server checks are only shown after it&apos;s verified.
              </p>
              <label htmlFor="install-secret" className="sr-only">
                Install secret
              </label>
              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <input
                  id="install-secret"
                  type="password"
                  autoComplete="off"
                  value={installSecret}
                  onChange={(e) => setInstallSecret(e.target.value)}
                  aria-invalid={notice?.tone === 'error' ? true : undefined}
                  className="flex-1 rounded-md border border-gray-300 px-3.5 py-2.5 font-mono text-sm focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
                  placeholder="Install secret"
                />
                <button type="submit" disabled={!installSecret || loading} className={btnPrimary}>
                  {loading && <Spinner />}
                  Unlock
                </button>
              </div>
              {notice && (
                <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {notice.text}
                </p>
              )}
            </form>
          ) : (
            <>
              {/* Progress */}
              <ol className="grid grid-cols-4 gap-2 border-b border-gray-200 px-5 sm:px-8 pt-5 pb-4">
                {STEPS.map((step) => {
                  const done = currentStep > step.number;
                  const active = currentStep === step.number;
                  return (
                    <li key={step.number} aria-current={active ? 'step' : undefined}>
                      <span className={`block h-1 rounded-full ${done || active ? 'bg-brand-teal' : 'bg-gray-200'}`} />
                      <span className="mt-2.5 flex items-center gap-2">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold ${
                            done ? 'bg-brand-teal text-white' : active ? 'bg-brand-teal-light text-brand-teal-deep' : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {done ? <Icon d={icons.check} className="w-3 h-3" /> : step.number}
                          {done && <span className="sr-only">Completed: </span>}
                        </span>
                        <span className={`hidden sm:inline text-sm font-semibold ${active ? 'text-gray-900' : 'text-gray-400'}`}>
                          {step.title}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>

              <div className="p-5 sm:p-8 space-y-6">
                {notice && (
                  <p
                    role={notice.tone === 'error' ? 'alert' : 'status'}
                    className={`rounded-md border px-4 py-3 text-sm ${
                      notice.tone === 'error'
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : notice.tone === 'success'
                          ? 'border-brand-teal/30 bg-brand-teal-light/60 text-brand-teal-deep'
                          : 'border-blue-200 bg-blue-50 text-blue-900'
                    }`}
                  >
                    {notice.text}
                  </p>
                )}

                {/* Step 1: Prerequisites */}
                {currentStep === 1 && (
                  <>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 tracking-tight">System prerequisites</h2>
                      <p className="text-sm text-gray-600 mt-1">Make sure the server can run MyClinicSoft.</p>
                    </div>
                    <div className="space-y-3">
                      <StatusRow
                        icon={icons.checkCircle}
                        title="Node.js"
                        ok={checks.nodeVersionValid}
                        okLabel={checks.nodeVersion || 'Valid'}
                        badLabel="Too old"
                      >
                        Requires Node.js 20.9 or higher.
                      </StatusRow>
                      <StatusRow
                        icon={icons.book}
                        title="Dependencies"
                        ok={checks.dependenciesInstalled}
                        okLabel="Installed"
                        badLabel="Not installed"
                        tone="warn"
                      >
                        {!checks.dependenciesInstalled && (
                          <div className="flex flex-wrap items-center gap-3">
                            <button type="button" onClick={handleInstallDependencies} disabled={installing} className={btnPrimary}>
                              {installing && <Spinner />}
                              Install dependencies
                            </button>
                            <span className="text-xs text-gray-500">
                              or run <Code>npm install</Code>
                            </span>
                          </div>
                        )}
                      </StatusRow>
                    </div>
                  </>
                )}

                {/* Step 2: Environment */}
                {currentStep === 2 && (
                  <>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 tracking-tight">Environment</h2>
                      <p className="text-sm text-gray-600 mt-1">
                        Set the required variables in <Code>.env.local</Code> (or your host&apos;s environment settings).
                      </p>
                    </div>
                    <dl className="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm">
                      <div className="p-4">
                        <dt className="font-mono font-semibold text-gray-900">MONGODB_URI</dt>
                        <dd className="text-gray-600 mt-1">
                          A MongoDB connection string, e.g. <Code>mongodb://localhost:27017/myclinicsoft</Code> or a MongoDB
                          Atlas URI.
                        </dd>
                      </div>
                      <div className="p-4">
                        <dt className="font-mono font-semibold text-gray-900">SESSION_SECRET</dt>
                        <dd className="text-gray-600 mt-1">
                          A random string of at least 32 characters. Generate one with <Code>openssl rand -base64 32</Code>.
                        </dd>
                      </div>
                    </dl>
                    <StatusRow
                      icon={lockIcon}
                      title="Environment variables"
                      ok={checks.environmentConfigured}
                      okLabel="Configured"
                      badLabel="Not configured"
                      tone="warn"
                    >
                      {!checks.environmentConfigured &&
                        (checks.envLocalExists ? (
                          <>
                            <Code>.env.local</Code> exists but needs valid <Code>MONGODB_URI</Code> and{' '}
                            <Code>SESSION_SECRET</Code> values.
                          </>
                        ) : (
                          <>
                            Create <Code>.env.local</Code> in the project root with the variables above.
                          </>
                        ))}
                    </StatusRow>
                    <StatusRow
                      icon={dbIcon}
                      title="Database connection"
                      ok={checks.databaseConnected}
                      okLabel="Connected"
                      badLabel="Not connected"
                    >
                      {!checks.databaseConnected && (
                        <>
                          Check <Code>MONGODB_URI</Code> and that MongoDB is reachable from this server.
                        </>
                      )}
                    </StatusRow>
                  </>
                )}

                {/* Step 3: Database reset */}
                {currentStep === 3 && (
                  <>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 tracking-tight">Prepare the database</h2>
                      <p className="text-sm text-gray-600 mt-1">Start from a clean database for a fresh installation.</p>
                    </div>
                    {checks.databaseReset ? (
                      <StatusRow icon={dbIcon} title="Database" ok okLabel="Clean" badLabel="" />
                    ) : (
                      <div className="rounded-lg border border-red-200 bg-red-50/60 p-5">
                        <p className="flex items-center gap-2 font-semibold text-red-800">
                          <Icon d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" className="w-5 h-5" />
                          This deletes everything in the database
                        </p>
                        <ul className="mt-3 space-y-1 text-sm text-red-700">
                          <li>All patients, appointments, and medical records</li>
                          <li>All users, roles, and permissions</li>
                          <li>All invoices, documents, and settings</li>
                        </ul>
                        <p className="mt-3 text-sm font-semibold text-red-800">It cannot be undone.</p>
                        <label className="mt-4 flex items-start gap-2.5 text-sm text-gray-800">
                          <input
                            type="checkbox"
                            checked={resetConfirm}
                            onChange={(e) => setResetConfirm(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                          />
                          I understand this will delete all data and want to proceed.
                        </label>
                        {!checks.databaseConnected && (
                          <p className="mt-3 text-xs text-red-700">Connect the database first (step 2).</p>
                        )}
                        <button
                          type="button"
                          onClick={handleResetDatabase}
                          disabled={!resetConfirm || resetting || !checks.databaseConnected}
                          className="mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {resetting && <Spinner />}
                          Reset database
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Step 4: Complete */}
                {currentStep === 4 && (
                  <div className="py-4 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-teal-light text-brand-teal-dark">
                      <Icon d={icons.check} className="w-7 h-7" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Installation complete</h2>
                    <p className="text-sm text-gray-600 mt-1.5">
                      MyClinicSoft is ready. Remove <Code>INSTALL_SECRET</Code> from the server to switch this wizard off.
                    </p>
                    <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                      <Link href="/tenant-onboard" className={btnPrimary}>
                        Register the first clinic
                      </Link>
                      <Link href="/login" className={btnSecondary}>
                        Go to login
                      </Link>
                    </div>
                  </div>
                )}

                {/* Errors and warnings from the checks */}
                {currentStep < 4 && (checks.errors.length > 0 || checks.warnings.length > 0) && (
                  <div className="space-y-3">
                    {checks.errors.length > 0 && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                        <p className="text-sm font-semibold text-red-800 mb-1.5">Errors</p>
                        <ul className="space-y-1 text-sm text-red-700">
                          {checks.errors.map((e) => (
                            <li key={e} className="flex gap-2">
                              <Icon d={xIcon} className="w-4 h-4 mt-0.5 shrink-0" />
                              {e}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {checks.warnings.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm font-semibold text-amber-900 mb-1.5">Warnings</p>
                        <ul className="space-y-1 text-sm text-amber-800 list-disc pl-5">
                          {checks.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Navigation */}
                {currentStep < 4 && (
                  <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
                    {currentStep > 1 && (
                      <button type="button" onClick={() => setCurrentStep(currentStep - 1)} className={btnSecondary}>
                        Back
                      </button>
                    )}
                    {refreshButton}
                    <button
                      type="button"
                      onClick={() => setCurrentStep(currentStep + 1)}
                      disabled={
                        currentStep === 1
                          ? !checks.nodeVersionValid || !checks.dependenciesInstalled
                          : currentStep === 2
                            ? !checks.environmentConfigured || !checks.databaseConnected
                            : !checks.databaseConnected || !checks.databaseReset
                      }
                      className={`${btnPrimary} ml-auto`}
                    >
                      {currentStep === 3 ? 'Finish' : 'Continue'}
                      <Icon d={icons.arrow} className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
