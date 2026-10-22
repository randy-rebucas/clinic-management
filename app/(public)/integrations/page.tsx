import Link from 'next/link';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { Icon, icons, NavyBand, PageHero, SectionHeading, buttonPrimary, buttonSecondary } from '@/components/PublicPage';

export const metadata: Metadata = pageMetadata({
  title: 'Integrations',
  path: '/integrations',
  description: 'SMS reminders, email, file storage, PhilHealth and HMO claims built in — plus a REST API and signed webhooks to connect MyClinicSoft with your own systems.',
});

const document = 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
const cloud = 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z';
const card = 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z';

// Services MyClinicSoft runs for every clinic — no accounts or keys for the clinic to set up.
const builtIn = [
  { icon: icons.chat, title: 'SMS reminders', description: 'Appointment confirmations and reminders texted to patients automatically.' },
  { icon: icons.mail, title: 'Email', description: 'Appointment, lab result, and invoice emails sent from templates.' },
  { icon: cloud, title: 'Secure file storage', description: 'Upload documents, images, and lab files to each patient’s record.' },
  { icon: document, title: 'PhilHealth claims', description: 'Track claims against case rates and export them as CSV for filing.' },
  { icon: card, title: 'HMO claims', description: 'Prepare and follow HMO claims alongside each visit’s billing.' },
  { icon: icons.phone, title: 'eMCR patient app', description: 'Bookings, live queue, results, and prescriptions sync to patients’ phones.' },
];

const endpoints = [
  { method: 'GET', path: '/me', scope: 'any key' },
  { method: 'GET', path: '/patients', scope: 'patients:read' },
  { method: 'GET', path: '/patients/{id}', scope: 'patients:read' },
  { method: 'POST', path: '/patients', scope: 'patients:write' },
  { method: 'GET', path: '/appointments', scope: 'appointments:read' },
  { method: 'GET', path: '/appointments/{id}', scope: 'appointments:read' },
  { method: 'POST', path: '/appointments', scope: 'appointments:write' },
  { method: 'GET', path: '/doctors', scope: 'doctors:read' },
  { method: 'GET', path: '/invoices', scope: 'invoices:read' },
  { method: 'GET', path: '/invoices/{id}', scope: 'invoices:read' },
];

const events = [
  { name: 'patient.created', when: 'A patient is registered' },
  { name: 'appointment.created', when: 'An appointment is booked' },
  { name: 'appointment.status_changed', when: 'An appointment’s status changes' },
  { name: 'invoice.paid', when: 'An invoice is fully paid' },
];

const apiFacts = [
  'Keys are scoped, shown once, and revocable instantly',
  'Each key only ever sees its own clinic’s records',
  '120 requests a minute per key, with rate-limit headers',
  'Cursor pagination and consistent JSON errors',
];

const useCases = [
  { title: 'Lab system', description: 'Pull today’s appointments and match patients to orders.' },
  { title: 'Booking website', description: 'Book straight into your doctors’ real schedules.' },
  { title: 'Accounting', description: 'Sync paid invoices into your books as they happen.' },
  { title: 'Data warehouse', description: 'Feed patients, visits, and billing into your reports.' },
];

export default function IntegrationsPage() {
  return (
    <div className="min-h-screen bg-white">
      <PageHero
        eyebrow="Integrations"
        title="Connected out of the box,"
        accent="open when you need it"
        actions={
          <>
            <a href="#api" className={buttonPrimary}>
              Explore the API
              <Icon d={icons.arrow} className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
            </a>
            <Link href="/pricing" className={buttonSecondary}>
              Compare plans
            </Link>
          </>
        }
      >
        SMS, email, file storage, and claims work from day one. On Professional and Enterprise plans, a REST API and
        signed webhooks connect MyClinicSoft to anything else you run.
      </PageHero>

      {/* Built in */}
      <section className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-14 sm:py-16 lg:py-20">
        <div className="container mx-auto max-w-7xl">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-8 sm:mb-10">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Built in, nothing to set up</h2>
              <p className="text-gray-600 mt-2 max-w-xl">We run these services for you — no extra accounts, keys, or bills.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-teal-light px-3 py-1 text-xs font-semibold text-brand-teal-deep">
              <Icon d={icons.check} className="w-3.5 h-3.5" />
              Every plan
            </span>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {builtIn.map((b) => (
              <li key={b.title} className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5">
                <div className="w-10 h-10 shrink-0 rounded-md bg-brand-teal-light text-brand-teal-dark flex items-center justify-center">
                  <Icon d={b.icon} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{b.title}</h3>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">{b.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* API */}
      <section id="api" className="scroll-mt-20 border-t border-gray-200 bg-gray-50/70 px-4 sm:px-6 lg:px-8 py-14 sm:py-16 lg:py-20">
        <div className="container mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-14 items-start">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/25 bg-blue-50 px-3 py-1 text-xs font-semibold text-brand-blue mb-4">
                Professional &amp; Enterprise
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">REST API</h2>
              <p className="text-gray-600 mt-3 leading-relaxed max-w-lg">
                A clinic admin creates API keys under <span className="font-semibold text-gray-900">Admin → Developers</span>{' '}
                and picks exactly what each key may do.
              </p>
              <ul className="mt-6 space-y-2.5">
                {apiFacts.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <Icon d={icons.check} className="w-4 h-4 mt-0.5 shrink-0 text-brand-teal" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* Example request */}
              <div className="mt-8 overflow-hidden rounded-xl bg-brand-navy">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                  <span className="font-mono text-xs text-slate-400">Example request</span>
                  <span className="font-mono text-[11px] text-slate-500">curl</span>
                </div>
                <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-slate-200">
                  <code>
                    <span className="text-brand-teal">curl</span> https://&lt;your domain&gt;/api/v1/patients?limit=25 \{'\n'}
                    {'  '}-H <span className="text-amber-300">&quot;Authorization: Bearer mcs_&lt;key id&gt;_&lt;secret&gt;&quot;</span>
                  </code>
                </pre>
              </div>
            </div>

            {/* Endpoints */}
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 px-5 py-3.5">
                <h3 className="font-semibold text-gray-900">Endpoints</h3>
                <span className="font-mono text-xs text-gray-500">/api/v1</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {endpoints.map((e) => (
                  <li key={`${e.method} ${e.path}`} className="grid grid-cols-[3.5rem_1fr] sm:grid-cols-[3.5rem_1fr_auto] items-center gap-x-3 gap-y-0.5 px-5 py-2.5">
                    <span
                      className={`w-fit rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                        e.method === 'GET' ? 'bg-brand-teal-light text-brand-teal-deep' : 'bg-blue-50 text-brand-blue'
                      }`}
                    >
                      {e.method}
                    </span>
                    <span className="font-mono text-sm text-gray-900">{e.path}</span>
                    <span className="col-start-2 sm:col-start-auto font-mono text-xs text-gray-400">{e.scope}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Webhooks */}
          <div className="mt-14 grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-14 items-start">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Webhooks</h2>
              <p className="text-gray-600 mt-3 leading-relaxed max-w-lg">
                Get a POST the moment something happens — whether it changed in the clinic app, the eMCR app, online
                booking, or the API.
              </p>
              <dl className="mt-6 space-y-4 text-sm">
                <div>
                  <dt className="font-semibold text-gray-900">Signed</dt>
                  <dd className="text-gray-600 mt-0.5">
                    Every request carries an <code className="font-mono text-[13px] text-gray-900">MCS-Signature</code> header —
                    an HMAC-SHA256 of the body with your endpoint&apos;s secret.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-gray-900">Retried</dt>
                  <dd className="text-gray-600 mt-0.5">
                    Failed deliveries are retried 6 more times with back-off over about 20 hours, and you can send a test
                    event any time.
                  </dd>
                </div>
              </dl>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-5 py-3.5">
                <h3 className="font-semibold text-gray-900">Events</h3>
              </div>
              <ul className="divide-y divide-gray-100">
                {events.map((e) => (
                  <li key={e.name} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-4 px-5 py-3">
                    <span className="font-mono text-sm text-gray-900">{e.name}</span>
                    <span className="text-sm text-gray-500">{e.when}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="container mx-auto max-w-7xl">
          <SectionHeading title="What clinics connect">A few ways teams use the API and webhooks.</SectionHeading>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {useCases.map((u, i) => (
              <li key={u.title} className="border-t border-gray-200 pt-4">
                <span className="font-mono text-[11px] font-semibold text-gray-400">0{i + 1}</span>
                <h3 className="font-semibold text-gray-900 mt-1">{u.title}</h3>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{u.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <NavyBand
        title="Need the full API reference?"
        actions={[
          { href: '/contact', label: 'Talk to us', icon: icons.chat, primary: true },
          { href: '/tenant-onboard', label: 'Start free trial', icon: icons.arrow },
        ]}
      >
        We&apos;ll share the complete reference and help Enterprise clinics plan custom integrations.
      </NavyBand>
    </div>
  );
}
