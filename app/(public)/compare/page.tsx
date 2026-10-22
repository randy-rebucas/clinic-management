import Link from 'next/link';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { PHP_MONTHLY } from '@/lib/subscription-period';
import { Icon, icons, NavyBand, PageHero, SectionHeading, buttonPrimary, buttonSecondary } from '@/components/PublicPage';

export const metadata: Metadata = pageMetadata({
  title: 'Compare Clinic Management Software',
  path: '/compare',
  description: 'Paper charts, spreadsheets and chat apps, or one clinic system? See how MyClinicSoft compares for records, scheduling, queues, billing, PhilHealth and HMO claims, and data privacy.',
});

type Tone = 'bad' | 'meh' | 'good';
type Cell = { text: string; tone: Tone };

const columns = ['Paper charts', 'Spreadsheets & chat apps', 'MyClinicSoft'];

const rows: { task: string; cells: [Cell, Cell, Cell] }[] = [
  {
    task: 'Find a patient’s full history',
    cells: [
      { text: 'Pull the folder by hand', tone: 'bad' },
      { text: 'Scattered across files and threads', tone: 'meh' },
      { text: 'Searchable in seconds, every visit linked', tone: 'good' },
    ],
  },
  {
    task: 'Bookings and reminders',
    cells: [
      { text: 'Logbook and phone calls', tone: 'bad' },
      { text: 'Manual messages, one by one', tone: 'meh' },
      { text: 'Online booking with automatic SMS reminders', tone: 'good' },
    ],
  },
  {
    task: 'Waiting room',
    cells: [
      { text: 'Paper numbers, crowded lobby', tone: 'bad' },
      { text: 'No live view', tone: 'bad' },
      { text: 'QR check-in and a live queue on patients’ phones', tone: 'good' },
    ],
  },
  {
    task: 'Prescriptions and lab results',
    cells: [
      { text: 'Handwritten, easy to lose', tone: 'bad' },
      { text: 'Photos sent over chat', tone: 'meh' },
      { text: 'Printed or delivered to the eMCR app', tone: 'good' },
    ],
  },
  {
    task: 'Billing, PhilHealth and HMO claims',
    cells: [
      { text: 'Receipts and manual tallies', tone: 'bad' },
      { text: 'Formulas that break', tone: 'meh' },
      { text: 'Invoices, payments, and claims tracked per visit', tone: 'good' },
    ],
  },
  {
    task: 'Medicine inventory',
    cells: [
      { text: 'Count the shelves', tone: 'bad' },
      { text: 'Updated when someone remembers', tone: 'meh' },
      { text: 'Stock levels, low-stock alerts, expiry dates', tone: 'good' },
    ],
  },
  {
    task: 'Data Privacy Act',
    cells: [
      { text: 'Anyone with the cabinet key', tone: 'bad' },
      { text: 'Shared files, personal phones', tone: 'bad' },
      { text: 'Role-based access and an audit trail', tone: 'good' },
    ],
  },
  {
    task: 'If disaster strikes',
    cells: [
      { text: 'Fire or flood loses everything', tone: 'bad' },
      { text: 'Depends on one laptop', tone: 'meh' },
      { text: 'Cloud-hosted, with backups you can take any time', tone: 'good' },
    ],
  },
];

const toneStyle: Record<Tone, { icon: string; className: string; label: string }> = {
  bad: { icon: 'M6 18L18 6M6 6l12 12', className: 'text-red-500', label: 'Weak' },
  meh: { icon: 'M20 12H4', className: 'text-amber-500', label: 'Partial' },
  good: { icon: icons.check, className: 'text-brand-teal', label: 'Strong' },
};

const basicPrice = PHP_MONTHLY.basic.toLocaleString('en-PH');

const vendorQuestions = [
  { q: 'Is it built for Philippine clinics?', a: 'Yes — PhilHealth and HMO claims and the Data Privacy Act are built in, not bolted on.' },
  { q: 'Can patients use it too?', a: 'Yes — the eMCR app gives patients bookings, a live queue, and their results.' },
  { q: 'Can I try it before paying?', a: '14 days free with full access. No credit card needed.' },
  { q: 'Is the pricing public?', a: `Yes. Plans start at ₱${basicPrice} a month, and annual billing gets 2 months free.` },
  { q: 'Can I take my data with me?', a: 'Yes — paid plans include data export, so your records are never locked in.' },
  { q: 'Can it connect to other systems?', a: 'Professional and Enterprise plans include a REST API and signed webhooks.' },
];

const switchSteps = [
  { title: 'Start your free trial', description: 'Set up your clinic, doctors, and schedules in minutes.' },
  { title: 'Bring your records over', description: 'Send us your existing spreadsheets and we’ll help import them.' },
  { title: 'Go live', description: 'Most clinics are fully running within 1–2 weeks.' },
];

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-white">
      <PageHero
        eyebrow="Compare"
        title="One system vs."
        accent="paper, sheets & chat"
        actions={
          <>
            <Link href="/tenant-onboard" className={buttonPrimary}>
              Start 14-day free trial
              <Icon d={icons.arrow} className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
            </Link>
            <Link href="/pricing" className={buttonSecondary}>
              See pricing
            </Link>
          </>
        }
      >
        Many clinics still run on paper charts, a spreadsheet, and a group chat. Here&apos;s what changes when it all
        lives in one place.
      </PageHero>

      {/* Comparison */}
      <section className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-14 sm:py-16 lg:py-20">
        <div className="container mx-auto max-w-7xl">
          <SectionHeading title="Side by side">The everyday jobs of a clinic, done three ways.</SectionHeading>

          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <caption className="sr-only">MyClinicSoft compared with paper charts and spreadsheets or chat apps</caption>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/70">
                  <th scope="col" className="w-[22%] px-5 py-4 text-left font-semibold text-gray-500">
                    Task
                  </th>
                  {columns.map((c, i) => (
                    <th
                      key={c}
                      scope="col"
                      className={`px-5 py-4 text-left font-semibold ${
                        i === 2 ? 'bg-brand-teal-light/60 text-brand-teal-deep' : 'text-gray-900'
                      }`}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.task}>
                    <th scope="row" className="px-5 py-4 text-left font-semibold text-gray-900 align-top">
                      {r.task}
                    </th>
                    {r.cells.map((cell, i) => {
                      const t = toneStyle[cell.tone];
                      return (
                        <td key={i} className={`px-5 py-4 align-top ${i === 2 ? 'bg-brand-teal-light/30' : ''}`}>
                          <span className="flex items-start gap-2.5">
                            <Icon d={t.icon} className={`w-4 h-4 mt-0.5 shrink-0 ${t.className}`} />
                            <span className="sr-only">{t.label}:</span>
                            <span className={i === 2 ? 'font-medium text-gray-900' : 'text-gray-600'}>{cell.text}</span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden space-y-3">
            {rows.map((r) => (
              <li key={r.task} className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="font-semibold text-gray-900 mb-3">{r.task}</h3>
                <dl className="space-y-2 text-sm">
                  {r.cells.map((cell, i) => {
                    const t = toneStyle[cell.tone];
                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-2.5 rounded-md px-2.5 py-2 ${i === 2 ? 'bg-brand-teal-light/50' : ''}`}
                      >
                        <Icon d={t.icon} className={`w-4 h-4 mt-0.5 shrink-0 ${t.className}`} />
                        <div>
                          <dt className="text-xs text-gray-500">{columns[i]}</dt>
                          <dd className={i === 2 ? 'font-medium text-gray-900' : 'text-gray-600'}>{cell.text}</dd>
                        </div>
                      </div>
                    );
                  })}
                </dl>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Vendor questions */}
      <section className="border-y border-gray-200 bg-gray-50/70 px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="container mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-8 lg:gap-14 items-start">
          <div className="lg:sticky lg:top-28">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Comparing software? Ask every vendor these.
            </h2>
            <p className="text-gray-600 mt-3 max-w-md">
              Six questions that separate clinic software you&apos;ll keep from software you&apos;ll replace. Here are our
              answers.
            </p>
          </div>
          <dl className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
            {vendorQuestions.map((v) => (
              <div key={v.q} className="px-5 py-4">
                <dt className="font-semibold text-gray-900">{v.q}</dt>
                <dd className="mt-1 flex items-start gap-2 text-sm text-gray-600">
                  <Icon d={icons.check} className="w-4 h-4 mt-0.5 shrink-0 text-brand-teal" />
                  {v.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Switching */}
      <section className="px-4 sm:px-6 lg:px-8 py-14 sm:py-16 lg:py-20">
        <div className="container mx-auto max-w-7xl">
          <SectionHeading title="Switching is easier than you think">No IT team needed.</SectionHeading>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
            {switchSteps.map((s, i) => (
              <li key={s.title} className="border-t border-gray-200 pt-4">
                <span className="font-mono text-[11px] font-semibold text-gray-400">0{i + 1}</span>
                <h3 className="font-semibold text-gray-900 mt-1">{s.title}</h3>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{s.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <NavyBand
        title="Ready to make the switch?"
        actions={[
          { href: '/tenant-onboard', label: 'Start free trial', icon: icons.arrow, primary: true },
          { href: '/contact', label: 'Talk to us', icon: icons.chat },
        ]}
      >
        Try every feature free for 14 days, or ask us anything first.
      </NavyBand>
    </div>
  );
}
