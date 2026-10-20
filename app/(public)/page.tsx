import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { verifySession } from '@/app/lib/dal';
import { redirect } from 'next/navigation';
import { BRAND_GRADIENT } from '@/lib/brand-mark';

export const metadata: Metadata = {
  title: 'My Clinic Software — Clinic Management Made Simple',
  description:
    'Manage patients, appointments, queues, and billing — all in one place. The complete clinic management solution for modern healthcare providers.',
};

function Icon({ d, className = 'w-5 h-5' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

const icons = {
  arrow: 'M13 7l5 5m0 0l-5 5m5-5H6',
  users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  userPlus: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  document: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  money: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  qr: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z',
  phone: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
  briefcase: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  check: 'M5 13l4 4L19 7',
  mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  chat: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  question: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

// The four modules shown as photo cards; the first one leads the bento grid.
const features = [
  {
    title: 'Patient Management',
    description:
      'Complete records and medical history in one secure place — searchable in seconds, linked across every visit.',
    image:
      'https://images.unsplash.com/photo-1551601651-2a8555f1a136?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=900&q=80',
    icon: icons.users,
  },
  {
    title: 'Appointment Scheduling',
    description: 'Online booking plus staff scheduling that cuts no-shows.',
    image:
      'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=900&q=80',
    icon: icons.calendar,
  },
  {
    title: 'Medical Records',
    description: 'Prescriptions, lab results, and imaging in the cloud.',
    image:
      'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=900&q=80',
    icon: icons.document,
  },
  {
    title: 'Billing & Invoicing',
    description: 'Invoices, payment tracking, and financial reports.',
    image:
      'https://images.unsplash.com/photo-1554224155-6726b3ff858f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=900&q=80',
    icon: icons.money,
  },
];

const moreModules = [
  'Queue management',
  'Lab results',
  'Prescriptions',
  'Referrals',
  'Inventory',
  'Room management',
  'Reports & analytics',
  'Audit logging',
  'SMS & email',
  'Membership & loyalty',
];

const journey = [
  { step: '01', title: 'Register once', desc: 'Create your patient record online in a few minutes.', icon: icons.userPlus },
  { step: '02', title: 'Book a visit', desc: 'Pick a doctor and a schedule that works for you.', icon: icons.calendar },
  { step: '03', title: 'Check in by QR', desc: 'Scan at the clinic and follow your place in the queue.', icon: icons.qr },
  { step: '04', title: 'Get results in eMCR', desc: 'Lab results and prescriptions land in the app.', icon: icons.phone },
];

const audiences = [
  {
    title: 'For patients',
    icon: icons.userPlus,
    points: ['One login across partner clinics', 'Live queue status on your phone', 'Results, prescriptions, family profiles'],
    primary: { href: '/onboard', label: 'Register as patient' },
    secondary: { href: '/book', label: 'Book appointment' },
    featured: true,
  },
  {
    title: 'For clinic teams',
    icon: icons.shield,
    points: ['Front desk, doctors, and billing in sync', 'Templates, e-signatures, and PDF records', 'Reports and full audit trail'],
    primary: { href: '/tenant-onboard', label: 'Start 14-day free trial' },
    secondary: { href: '/login', label: 'Staff login' },
    featured: false,
  },
  {
    title: 'For medical reps',
    icon: icons.briefcase,
    points: ['Register your company profile online', 'Account activated after verification', 'Reach clinics on the platform'],
    primary: { href: '/medical-representatives/onboard', label: 'Rep sign up' },
    secondary: { href: '/contact', label: 'Ask a question' },
    featured: false,
  },
];

const storeBadges = [
  {
    store: 'App Store',
    caption: 'Download on the',
    href: null as string | null,
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.24 2.73 2.2 1.1-.05 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.41 1.2-2.47-.03-.01-2.3-.88-2.32-3.5zM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.64-1.05 1.67-.92 2.66.97.08 1.96-.49 2.56-1.21z" />
      </svg>
    ),
  },
  {
    store: 'Google Play',
    caption: 'GET IT ON',
    href: 'https://play.google.com/store/apps/details?id=solutions.myclinicsoft.emcr',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.6 2.3 13.4 12l-9.8 9.7c-.35-.2-.6-.6-.6-1.1V3.4c0-.5.25-.9.6-1.1z" fill="#34A853" />
        <path d="m16.8 8.6-3.4 3.4-9.8-9.7c.3-.18.7-.2 1.1 0l12.1 6.3z" fill="#4285F4" />
        <path d="M16.8 15.4 4.7 21.7c-.4.2-.8.18-1.1 0l9.8-9.7 3.4 3.4z" fill="#EA4335" />
        <path d="m20.4 13.3-3.6 2.1-3.4-3.4 3.4-3.4 3.6 2.1c.8.45.8 2.15 0 2.6z" fill="#FBBC04" />
      </svg>
    ),
  },
];

const stats = [
  { value: '1,000+', label: 'Patients' },
  { value: '50+', label: 'Clinics' },
  { value: '99.9%', label: 'Uptime' },
];

export default async function HomePage() {
  // Check if user is already logged in, redirect to dashboard
  const session = await verifySession();
  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden px-4 sm:px-6 lg:px-8">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 30% 20%, black 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 30% 20%, black 20%, transparent 75%)',
          }}
        />

        <div className="container relative mx-auto max-w-7xl py-12 sm:py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <div className="animate-fade-up-in inline-flex items-center gap-2 rounded-full border border-brand-teal/30 bg-brand-teal-light/70 px-3 py-1 text-xs sm:text-sm font-medium text-brand-teal-deep mb-5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-brand-teal opacity-60 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-teal" />
                </span>
                Built for Philippine clinics · PH DPA compliant
              </div>

              <h1 className="animate-fade-up-in text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold text-gray-900 mb-5 tracking-tight leading-[1.06]">
                Clinic operations,
                <br />
                <span className="text-brand-teal-dark">run from one system</span>
              </h1>

              <p
                className="animate-fade-up-in text-base sm:text-lg text-gray-600 mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed"
                style={{ animationDelay: '90ms' }}
              >
                MyClinicSoft brings patient records, scheduling, queues, billing, and inventory into a
                single platform — and puts every patient&apos;s records in their pocket with the eMCR app.
              </p>

              <div
                className="animate-fade-up-in flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-4"
                style={{ animationDelay: '160ms' }}
              >
                <Link
                  href="/onboard"
                  className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-teal text-white rounded-md font-semibold hover:bg-brand-teal-dark transition-colors duration-150 shadow-[0_6px_20px_rgba(14,165,164,0.3)]"
                >
                  Register as Patient
                  <Icon d={icons.arrow} className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/book"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-900 rounded-md font-semibold border border-gray-300 hover:border-gray-900 transition-colors duration-150"
                >
                  <Icon d={icons.calendar} className="w-4 h-4 text-brand-teal-dark" />
                  Book Appointment
                </Link>
              </div>

              <p
                className="animate-fade-up-in text-sm text-gray-500 mb-8"
                style={{ animationDelay: '200ms' }}
              >
                Clinic staff?{' '}
                <Link href="/login" className="font-semibold text-brand-teal-dark hover:underline underline-offset-2">
                  Log in
                </Link>
                <span className="mx-2 text-gray-300">·</span>
                Medical rep?{' '}
                <Link href="/medical-representatives/onboard" className="font-semibold text-brand-blue hover:underline underline-offset-2">
                  Sign up
                </Link>
              </p>

              <dl
                className="animate-fade-up-in grid grid-cols-3 gap-6 max-w-md mx-auto lg:mx-0 pt-6 border-t border-gray-200"
                style={{ animationDelay: '250ms' }}
              >
                {stats.map((s) => (
                  <div key={s.label} className="text-center lg:text-left">
                    <dt className="sr-only">{s.label}</dt>
                    <dd className="font-mono text-2xl sm:text-3xl font-semibold text-gray-900 tabular-nums">{s.value}</dd>
                    <dd className="text-sm text-gray-500">{s.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Product mockup: dashboard behind the eMCR patient app */}
            <div className="relative hidden lg:block h-[520px]">
              <div className="absolute -inset-16 rounded-full blur-3xl opacity-20 bg-brand-teal" />

              {/* Dashboard card (desktop console) */}
              <div className="absolute top-0 left-0 w-[470px] rounded-lg bg-white border border-gray-200 shadow-[0_20px_50px_rgb(15,23,42,0.12)] overflow-hidden">
                <div className="flex items-center gap-1.5 px-5 py-3 border-b border-gray-100">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                  <span className="ml-3 text-sm font-medium text-gray-400">Clinic Dashboard</span>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-3.5 w-32 rounded bg-gray-200" />
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-brand-teal-light px-2.5 py-1 text-xs font-semibold text-brand-teal-deep">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-teal motion-safe:animate-pulse" />
                      Now serving · Q-07
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {[
                      { label: 'Today', value: '24' },
                      { label: 'Waiting', value: '6' },
                      { label: 'Done', value: '18' },
                    ].map((s) => (
                      <div key={s.label} className="rounded-md border border-gray-100 p-3.5">
                        <div className="font-mono text-2xl font-semibold text-gray-900">{s.value}</div>
                        <div className="text-xs text-gray-500">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {[70, 45, 85, 30].map((w, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-gray-100 shrink-0" />
                        <div className="h-2.5 rounded-full bg-gray-100 flex-1 overflow-hidden">
                          <div
                            className="motion-bar-grow h-full rounded-full bg-brand-teal-light"
                            style={{ width: `${w}%`, animationDelay: `${300 + idx * 80}ms` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Mobile patient EMR portal — photoreal iPhone frame asset */}
              <div className="absolute bottom-0 right-4 w-[210px] drop-shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                <Image
                  src="/iphone-frame-v1.png"
                  alt=""
                  aria-hidden="true"
                  width={1114}
                  height={2249}
                  className="w-full h-auto block"
                />
                {/* eMCR app screenshot, fitted to the frame's display area */}
                <div
                  className="absolute overflow-hidden rounded-[13%/6%] bg-white"
                  style={{ left: '6.3%', right: '6.1%', top: '2.75%', bottom: '2.9%' }}
                >
                  <Image
                    src="/59cdd8b4-c027-42a8-a9a9-05dd16be61b6.png"
                    alt="eMCR patient app home screen"
                    fill
                    className="object-cover object-top"
                    sizes="210px"
                  />
                </div>
                {/* Dynamic island, redrawn above the screenshot */}
                <div
                  className="absolute rounded-full bg-black"
                  style={{ left: '36.2%', width: '27.8%', top: '3.9%', height: '4.15%' }}
                />
              </div>

              {/* Floating credential card */}
              <div className="absolute bottom-8 left-6 bg-white rounded-lg p-4 border border-gray-200 shadow-[0_8px_30px_rgb(15,23,42,0.1)] max-w-[15rem]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 shrink-0 bg-brand-teal-light rounded-md flex items-center justify-center text-brand-teal-dark">
                    <Icon d={icons.shield} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">PH DPA compliant</h3>
                    <p className="text-xs text-gray-500">Audit-logged by design</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Patient journey */}
      <section className="border-y border-gray-200 bg-gray-50/70 px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="container mx-auto max-w-7xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal-dark mb-6 text-center lg:text-left">
            Your visit, start to finish
          </p>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-0">
            {journey.map((j, i) => (
              <li key={j.step} className="relative flex items-start gap-4 lg:flex-col lg:gap-3 lg:pr-8">
                <div className="w-11 h-11 shrink-0 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-brand-teal-dark">
                  <Icon d={j.icon} />
                </div>
                {i < journey.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="hidden lg:block absolute top-[22px] left-14 right-3 border-t border-dashed border-gray-300"
                  />
                )}
                <div>
                  <span className="font-mono text-[11px] font-semibold text-gray-400">{j.step}</span>
                  <h3 className="font-semibold text-gray-900 leading-tight">{j.title}</h3>
                  <p className="text-sm text-gray-500 mt-1 leading-snug">{j.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features — bento grid */}
      <section className="px-4 sm:px-6 lg:px-8 py-14 sm:py-18 lg:py-20">
        <div className="container mx-auto max-w-7xl">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 sm:mb-10">
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                Everything a clinic needs, built in
              </h2>
              <p className="text-gray-600 mt-2 max-w-xl">
                One login for the front desk, doctors, lab, and billing — no more switching tools.
              </p>
            </div>
            <Link
              href="/features"
              className="group inline-flex items-center gap-2 text-brand-teal-dark font-semibold hover:text-brand-teal shrink-0"
            >
              View all features
              <Icon d={icons.arrow} className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2 gap-4 lg:h-[520px]">
            {features.map((feature, i) => {
              const lead = i === 0;
              return (
                <Link
                  key={feature.title}
                  href="/features"
                  className={`group relative overflow-hidden rounded-xl bg-brand-navy ${
                    lead ? 'sm:col-span-2 lg:row-span-2 h-80 sm:h-96 lg:h-auto' : 'h-56 lg:h-auto'
                  }`}
                >
                  <Image
                    src={feature.image}
                    alt={feature.title}
                    fill
                    className="object-cover opacity-90 transition-transform duration-500 ease-out group-hover:scale-105"
                    sizes={lead ? '(max-width: 1024px) 100vw, 50vw' : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw'}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-navy via-brand-navy/55 to-brand-navy/0" />
                  <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                    <div className="w-9 h-9 rounded-md bg-white/15 backdrop-blur-sm flex items-center justify-center text-white mb-3">
                      <Icon d={feature.icon} />
                    </div>
                    <h3 className={`font-bold text-white tracking-tight ${lead ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>
                      {feature.title}
                    </h3>
                    <p className={`text-slate-200 leading-snug mt-1 ${lead ? 'text-base max-w-md' : 'text-sm'}`}>
                      {feature.description}
                    </p>
                  </div>
                </Link>
              );
            })}

            {/* Remaining modules */}
            <div className="rounded-xl border border-gray-200 bg-brand-teal-light/50 p-5 sm:p-6 flex flex-col">
              <p className="font-mono text-3xl font-semibold text-brand-teal-deep">15+</p>
              <p className="text-sm font-semibold text-gray-900 mb-3">more modules included</p>
              <ul className="flex flex-wrap gap-1.5 mb-4">
                {moreModules.map((m) => (
                  <li
                    key={m}
                    className="rounded-full bg-white border border-gray-200 px-2.5 py-0.5 text-xs text-gray-700"
                  >
                    {m}
                  </li>
                ))}
              </ul>
              <Link
                href="/pricing"
                className="mt-auto text-sm font-semibold text-brand-teal-dark hover:text-brand-teal"
              >
                See pricing →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* eMCR mobile app — store listings pending release */}
      <section className="px-4 sm:px-6 lg:px-8 pb-14 sm:pb-18 lg:pb-20">
        <div
          className="container mx-auto max-w-7xl relative overflow-hidden rounded-2xl"
          style={{ background: BRAND_GRADIENT }}
        >
          {/* Faint pulse line echoing the app icon */}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-40 text-white/10"
            viewBox="0 0 1200 160"
            preserveAspectRatio="none"
            fill="none"
          >
            <path d="M0 90H420L460 40L510 140L560 10L600 90H1200" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          </svg>

          <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-center p-6 sm:p-10 lg:px-14 lg:py-0">
            <div className="lg:py-12 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-4">
                <Image
                  src="/assets/icon.png"
                  alt="eMCR app icon"
                  width={56}
                  height={56}
                  className="rounded-[14px] ring-1 ring-white/30 shadow-lg"
                />
                <div className="text-left">
                  <p className="text-2xl font-extrabold text-white leading-none tracking-tight">eMCR</p>
                  <p className="text-sm text-white/75">Electronic MyClinic Record</p>
                </div>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
                Your appointments, results &amp; bills — in your pocket
              </h2>
              <p className="text-white/80 max-w-lg mx-auto md:mx-0 mb-5">
                Book visits, follow your queue live, and keep your family&apos;s records together in one app.
              </p>
              <ul className="flex flex-wrap justify-center md:justify-start gap-2 mb-7">
                {['Appointments', 'My Queue', 'Lab results', 'Prescriptions', 'Family profiles'].map((f) => (
                  <li key={f} className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white">
                    {f}
                  </li>
                ))}
              </ul>

              {/* Store badges — live listings link out; others stay blurred until they go live */}
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white mb-3">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-70 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                  </span>
                  Now on Android · iOS coming soon
                </p>
                <div className="flex flex-wrap justify-center md:justify-start gap-3">
                  {storeBadges.map((b) =>
                    b.href ? (
                      <a
                        key={b.store}
                        href={b.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Get eMCR on ${b.store}`}
                        className="flex items-center gap-2.5 rounded-xl border border-white/25 bg-black/85 pl-3.5 pr-5 py-2 text-white shadow-lg transition hover:bg-black hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-teal-deep"
                      >
                        {b.icon}
                        <span className="text-left leading-tight">
                          <span className="block text-[10px]">{b.caption}</span>
                          <span className="block text-base font-semibold -mt-0.5">{b.store}</span>
                        </span>
                      </a>
                    ) : (
                    <div
                      aria-hidden="true"
                      key={b.store}
                      className="relative overflow-hidden rounded-xl border border-white/25 select-none cursor-not-allowed"
                      title={`${b.store} — coming soon`}
                    >
                      <div className="flex items-center gap-2.5 bg-black/85 pl-3.5 pr-5 py-2 text-white blur-[2px]">
                        {b.icon}
                        <span className="text-left leading-tight">
                          <span className="block text-[10px]">{b.caption}</span>
                          <span className="block text-base font-semibold -mt-0.5">{b.store}</span>
                        </span>
                      </div>
                      {/* Frosted veil + corner tag */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/15 to-white/0" />
                      <span className="absolute top-1 right-1 rounded-full bg-white px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-brand-teal-deep shadow">
                        Soon
                      </span>
                    </div>
                    ),
                  )}
                </div>
              </div>
            </div>

            {/* App screen, cropped so the phone rises out of the band */}
            <div className="hidden md:block relative w-[220px] lg:w-[240px] h-[300px] lg:h-[340px] self-end">
              <div className="absolute inset-x-0 top-6 lg:top-10 rounded-t-[2.2rem] border-[7px] border-b-0 border-gray-900 bg-gray-900 overflow-hidden shadow-[0_-10px_40px_rgba(0,0,0,0.25)] h-[400px]">
                <div className="relative w-full h-full rounded-t-[1.7rem] overflow-hidden bg-white">
                  <Image
                    src="/59cdd8b4-c027-42a8-a9a9-05dd16be61b6.png"
                    alt="eMCR patient app home screen"
                    fill
                    className="object-cover object-top"
                    sizes="240px"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="px-4 sm:px-6 lg:px-8 pb-14 sm:pb-18 lg:pb-20">
        <div className="container mx-auto max-w-7xl">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-8">
            Where do you want to start?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {audiences.map((a) => (
              <div
                key={a.title}
                className={`rounded-xl p-6 flex flex-col transition-shadow duration-200 hover:shadow-[0_12px_40px_rgb(15,23,42,0.08)] ${
                  a.featured ? 'bg-brand-teal text-white' : 'bg-white border border-gray-200'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-md flex items-center justify-center mb-4 ${
                    a.featured ? 'bg-white/15 text-white' : 'bg-brand-teal-light text-brand-teal-dark'
                  }`}
                >
                  <Icon d={a.icon} />
                </div>
                <h3 className={`text-lg font-bold mb-3 ${a.featured ? 'text-white' : 'text-gray-900'}`}>{a.title}</h3>
                <ul className="space-y-2 mb-6">
                  {a.points.map((p) => (
                    <li
                      key={p}
                      className={`flex items-start gap-2 text-sm ${a.featured ? 'text-white/90' : 'text-gray-600'}`}
                    >
                      <Icon
                        d={icons.check}
                        className={`w-4 h-4 mt-0.5 shrink-0 ${a.featured ? 'text-white' : 'text-brand-teal'}`}
                      />
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Link
                    href={a.primary.href}
                    className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-colors duration-150 ${
                      a.featured
                        ? 'bg-white text-brand-teal-deep hover:bg-brand-teal-light'
                        : 'bg-gray-900 text-white hover:bg-brand-navy'
                    }`}
                  >
                    {a.primary.label}
                  </Link>
                  <Link
                    href={a.secondary.href}
                    className={`text-sm font-semibold hover:underline underline-offset-2 ${
                      a.featured ? 'text-white' : 'text-brand-teal-dark'
                    }`}
                  >
                    {a.secondary.label}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Help / closing CTA */}
      <section className="relative bg-brand-navy px-4 sm:px-6 lg:px-8 py-12 sm:py-14 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to right, #ffffff10 1px, transparent 1px), linear-gradient(to bottom, #ffffff10 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 80%)',
          }}
        />
        <div className="container relative mx-auto max-w-7xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
          <div className="text-center lg:text-left">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">Need help?</h2>
            <p className="text-slate-300 max-w-lg mx-auto lg:mx-0">
              Our support team answers questions from patients and clinics alike.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="mailto:support@myclinicsoft.solutions"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-brand-navy rounded-md font-semibold hover:bg-slate-100 transition-colors duration-150 text-sm"
            >
              <Icon d={icons.mail} className="w-4 h-4" />
              Email support
            </a>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 text-white rounded-md font-semibold border border-white/30 hover:border-white/60 transition-colors duration-150 text-sm"
            >
              <Icon d={icons.chat} className="w-4 h-4" />
              Contact us
            </Link>
            <Link
              href="/faq"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 text-white rounded-md font-semibold border border-white/30 hover:border-white/60 transition-colors duration-150 text-sm"
            >
              <Icon d={icons.question} className="w-4 h-4" />
              FAQ
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
