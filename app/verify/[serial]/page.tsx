import { Metadata } from 'next';
import Link from 'next/link';
import { verifySeal, SealStatus } from '@/lib/document-seal';
import VerifySerialForm from '../VerifySerialForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Document Verification',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const STATUS_UI: Record<SealStatus, { title: string; tone: string; badge: string; icon: 'check' | 'warn' | 'x' }> = {
  valid: {
    title: 'Genuine document',
    tone: 'border-green-200 bg-green-50 text-green-900',
    badge: 'bg-green-600',
    icon: 'check',
  },
  modified: {
    title: 'Record changed after printing',
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
    badge: 'bg-amber-500',
    icon: 'warn',
  },
  revoked: {
    title: 'Not valid — revoked',
    tone: 'border-red-200 bg-red-50 text-red-900',
    badge: 'bg-red-600',
    icon: 'x',
  },
  invalid: {
    title: 'Seal is invalid',
    tone: 'border-red-200 bg-red-50 text-red-900',
    badge: 'bg-red-600',
    icon: 'x',
  },
  not_found: {
    title: 'Document not found',
    tone: 'border-red-200 bg-red-50 text-red-900',
    badge: 'bg-red-600',
    icon: 'x',
  },
};

function StatusIcon({ icon }: { icon: 'check' | 'warn' | 'x' }) {
  const paths = {
    check: 'M5 13l4 4L19 7',
    warn: 'M12 9v4m0 4h.01',
    x: 'M6 18L18 6M6 6l12 12',
  };
  return (
    <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[icon]} />
    </svg>
  );
}

function formatDateTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
}

export default async function VerifySerialPage({ params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  const result = await verifySeal(serial);
  const ui = STATUS_UI[result.status];
  const hasDetails = result.status !== 'not_found' && result.status !== 'invalid';

  const details: { label: string; value?: string | number }[] = hasDetails
    ? [
        { label: 'Issued by', value: result.clinicName },
        { label: 'Document', value: result.documentLabel },
        { label: 'Patient', value: result.patientName },
        { label: 'Physician / issuer', value: result.issuedBy },
        { label: 'Printed', value: formatDateTime(result.issuedAt) },
        { label: 'Printed by', value: result.printedBy },
        {
          label: 'Copy',
          value: result.printNumber
            ? `#${result.printNumber} of ${result.totalPrints}${result.copyType === 'clinic' ? ' (clinic file copy)' : ''}`
            : undefined,
        },
      ]
    : [];

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className={`rounded-xl border p-5 sm:p-6 ${ui.tone}`} role="status">
          <div className="flex items-start gap-4">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ui.badge}`}>
              <StatusIcon icon={ui.icon} />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">{ui.title}</h1>
              <p className="mt-1 text-sm">{result.message}</p>
              {result.serial && (
                <p className="mt-3 font-mono text-sm tracking-wider">
                  Serial {result.serial}
                  {result.fingerprint && <span className="ml-3 opacity-75">Fingerprint {result.fingerprint}</span>}
                </p>
              )}
            </div>
          </div>
        </div>

        {result.warnings.length > 0 && (
          <ul className="space-y-2">
            {result.warnings.map((warning) => (
              <li key={warning} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {warning}
              </li>
            ))}
          </ul>
        )}

        {hasDetails && (
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-base font-semibold text-gray-900">Clinic record</h2>
            <p className="mt-1 text-sm text-gray-600">
              Compare these details with the paper. If anything differs, the paper has been altered.
            </p>
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {details
                .filter((d) => d.value !== undefined && d.value !== '')
                .map((d) => (
                  <div key={d.label}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{d.label}</dt>
                    <dd className="mt-0.5 text-sm text-gray-900">{d.value}</dd>
                  </div>
                ))}
            </dl>
            {result.facts && result.facts.length > 0 && (
              <dl className="mt-5 divide-y divide-gray-100 border-t border-gray-100">
                {result.facts.map((fact, i) => (
                  <div key={`${fact.label}-${i}`} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-3 sm:gap-4">
                    <dt className="text-sm font-medium text-gray-600">{fact.label}</dt>
                    <dd className="text-sm text-gray-900 sm:col-span-2">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-gray-900">Check another document</h2>
          <VerifySerialForm />
          <p className="mt-4 text-xs text-gray-500">
            Only documents that verify here were issued by the clinic. Patient names are partially hidden for privacy.{' '}
            <Link href="/verify" className="text-blue-700 underline">
              How verification works
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
