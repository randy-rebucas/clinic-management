import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { verifySession } from '@/app/lib/dal';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'My Clinic Software — Clinic Management Made Simple',
  description:
    'Manage patients, appointments, queues, and billing — all in one place. The complete clinic management solution for modern healthcare providers.',
};

// Edge-fades an image so it dissolves into the section background instead of sitting in a hard box.
const blendMask = {
  maskImage: 'radial-gradient(ellipse 78% 80% at 50% 48%, black 52%, transparent 100%)',
  WebkitMaskImage: 'radial-gradient(ellipse 78% 80% at 50% 48%, black 52%, transparent 100%)',
} as const;

const features = [
  {
    title: 'Patient Management',
    description:
      'Comprehensive patient records, complete medical history, and instant access to all patient information in one centralized, secure location.',
    image:
      'https://images.unsplash.com/photo-1551601651-2a8555f1a136?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=900&q=80',
    accent: 'teal' as const,
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    ),
  },
  {
    title: 'Appointment Scheduling',
    description:
      'Seamless online booking for patients, paired with scheduling tools that optimize staff workflow and reduce no-shows.',
    image:
      'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=900&q=80',
    accent: 'blue' as const,
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    ),
  },
  {
    title: 'Medical Records',
    description:
      'Secure, cloud-based storage for prescriptions, lab results, and diagnostic images, with instant retrieval when it matters.',
    image:
      'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=900&q=80',
    accent: 'teal' as const,
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    ),
  },
  {
    title: 'Billing & Invoicing',
    description:
      'Automated billing with professional invoice generation, real-time payment tracking, and comprehensive financial reporting.',
    image:
      'https://images.unsplash.com/photo-1554224155-6726b3ff858f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=900&q=80',
    accent: 'blue' as const,
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
];

const quickLinks = [
  {
    href: '/onboard',
    title: 'New Patient',
    desc: 'Register here',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
    ),
  },
  {
    href: '/book',
    title: 'Book Appointment',
    desc: 'Schedule online',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    ),
  },
  {
    href: '/patient/login',
    title: 'Patient Portal',
    desc: 'Access your records',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    ),
  },
  {
    href: '/login',
    title: 'Staff Login',
    desc: 'MyClinicSoft',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    ),
  },
];

export default async function HomePage() {
  // Check if user is already logged in, redirect to dashboard
  const session = await verifySession();
  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
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

        <div className="container relative mx-auto max-w-7xl py-20 sm:py-24 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left Column - Text Content */}
            <div className="text-center lg:text-left">
              <h1 className="animate-fade-up-in text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6 tracking-tight leading-[1.08]">
                Clinic operations,
                <br />
                run from one system
              </h1>

              <p
                className="animate-fade-up-in text-lg sm:text-xl text-gray-600 mb-10 max-w-xl mx-auto lg:mx-0 leading-relaxed"
                style={{ animationDelay: '90ms' }}
              >
                MyClinicSoft brings patient records, scheduling, billing, and inventory into a single
                platform — so your team spends less time switching tools and more time on patient care.
              </p>

              {/* CTA Buttons */}
              <div
                className="animate-fade-up-in flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-12"
                style={{ animationDelay: '160ms' }}
              >
                <Link
                  href="/onboard"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-brand-teal text-white rounded-md font-semibold text-base hover:bg-brand-teal-dark transition-colors duration-150"
                >
                  Register as Patient
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>

                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-900 rounded-md font-semibold text-base border border-gray-300 hover:border-gray-900 transition-colors duration-150"
                >
                  Staff Login
                </Link>
              </div>

              {/* Secondary access */}
              <div
                className="animate-fade-up-in flex flex-wrap gap-x-6 gap-y-2 justify-center lg:justify-start text-sm mb-12"
                style={{ animationDelay: '200ms' }}
              >
                <Link href="/medical-representatives/onboard" className="text-brand-blue font-medium hover:underline underline-offset-2">
                  Medical Rep Sign Up
                </Link>
                <Link href="/medical-representatives/login" className="text-gray-600 font-medium hover:text-gray-900 hover:underline underline-offset-2">
                  Medical Rep Login
                </Link>
              </div>

              {/* Stats */}
              <div
                className="animate-fade-up-in grid grid-cols-3 gap-6 max-w-md mx-auto lg:mx-0 pt-8 border-t border-gray-200"
                style={{ animationDelay: '250ms' }}
              >
                <div className="text-center lg:text-left">
                  <div className="font-mono text-2xl sm:text-3xl font-semibold text-gray-900 tabular-nums">1,000+</div>
                  <div className="text-sm text-gray-500">Patients</div>
                </div>
                <div className="text-center lg:text-left">
                  <div className="font-mono text-2xl sm:text-3xl font-semibold text-gray-900 tabular-nums">50+</div>
                  <div className="text-sm text-gray-500">Clinics</div>
                </div>
                <div className="text-center lg:text-left">
                  <div className="font-mono text-2xl sm:text-3xl font-semibold text-gray-900 tabular-nums">99.9%</div>
                  <div className="text-sm text-gray-500">Uptime</div>
                </div>
              </div>
            </div>

            {/* Right Column - Product mockup: dashboard behind a mobile patient EMR view */}
            <div className="relative hidden lg:block h-[600px]">
              {/* Brand tint the mockup sits in front of */}
              <div className="absolute -inset-16 rounded-full blur-3xl opacity-20 bg-brand-teal" />

              {/* Dashboard card (desktop console) */}
              <div className="absolute top-2 left-0 w-[500px] rounded-lg bg-white border border-gray-200 shadow-[0_20px_50px_rgb(15,23,42,0.12)] overflow-hidden">
                <div className="flex items-center gap-1.5 px-5 py-3.5 border-b border-gray-100">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                  <span className="ml-3 text-sm font-medium text-gray-400">Clinic Dashboard</span>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div className="h-3.5 w-32 rounded bg-gray-200" />
                    <div className="h-7 w-24 rounded-md bg-brand-teal-light" />
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {[
                      { label: 'Today', value: '24' },
                      { label: 'Waiting', value: '6' },
                      { label: 'Done', value: '18' },
                    ].map((s) => (
                      <div key={s.label} className="rounded-md border border-gray-100 p-4">
                        <div className="font-mono text-2xl font-semibold text-gray-900">{s.value}</div>
                        <div className="text-xs text-gray-500">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {[70, 45, 85, 30].map((w, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
                        <div className="h-3 rounded-full bg-gray-100 flex-1 overflow-hidden">
                          <div className="h-full rounded-full bg-brand-teal-light" style={{ width: `${w}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Mobile patient EMR portal — photoreal iPhone frame asset */}
              <div className="absolute bottom-0 right-2 w-[220px] drop-shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                <Image
                  src="/iphone-frame-v1.png"
                  alt=""
                  aria-hidden="true"
                  width={1114}
                  height={2249}
                  className="w-full h-auto block"
                />
                {/* Status bar, flanking the dynamic island */}
                <div
                  className="absolute flex items-center justify-between"
                  style={{ left: '8.5%', right: '8.3%', top: '2.6%', height: '5.3%' }}
                >
                  <span className="text-[11px] font-semibold text-gray-900">9:41</span>
                  <div className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-gray-900" viewBox="0 0 16 16" fill="currentColor"><path d="M1 11h2v3H1zM5 8h2v6H5zM9 5h2v9H9zM13 2h2v12h-2z"/></svg>
                    <svg className="w-3.5 h-3.5 text-gray-900" viewBox="0 0 16 16" fill="currentColor"><path d="M8 12.5a1.1 1.1 0 100-2.2 1.1 1.1 0 000 2.2zM4.6 9.1a5 5 0 016.8 0l-1.1 1.2a3.4 3.4 0 00-4.6 0zM2.3 6.7a8.4 8.4 0 0111.4 0L12.6 8a6.7 6.7 0 00-9.2 0z"/></svg>
                    <span className="w-5 h-2.5 rounded-[3px] border border-gray-900 relative">
                      <span className="absolute inset-[1.5px] right-1 rounded-[1px] bg-emerald-500" />
                    </span>
                  </div>
                </div>

                {/* Screen content, positioned inside the frame's display area, below the dynamic island */}
                <div
                  className="absolute overflow-hidden rounded-b-[1.4rem] bg-white"
                  style={{ left: '8.5%', right: '8.3%', top: '9%', bottom: '2.9%' }}
                >
                  {/* App header */}
                  <div className="bg-brand-teal px-4 pt-3 pb-5">
                    <p className="text-[11px] text-white/70 mb-1">Patient Portal</p>
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-semibold">
                        MR
                      </div>
                      <div>
                        <p className="text-white text-sm font-semibold leading-tight">Maria Reyes</p>
                        <p className="text-white/70 text-[11px] leading-tight">Patient ID · 00931</p>
                      </div>
                    </div>
                  </div>

                  {/* Vitals */}
                  <div className="px-3 -mt-3 mb-4">
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: 'HR', value: '76' },
                        { label: 'BP', value: '118/76' },
                        { label: 'Temp', value: '36.7°' },
                      ].map((v) => (
                        <div key={v.label} className="bg-white rounded-lg border border-gray-100 shadow-sm px-1.5 py-2 text-center">
                          <div className="font-mono text-xs font-bold text-gray-900">{v.value}</div>
                          <div className="text-[9px] text-gray-500">{v.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Upcoming appointment */}
                  <div className="px-3 pb-5">
                    <p className="text-[11px] font-semibold text-gray-900 mb-2">Next visit</p>
                    <div className="flex items-center gap-2.5 rounded-lg bg-brand-teal-light px-2.5 py-2.5">
                      <div className="w-8 h-8 rounded-md bg-white flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-brand-teal-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-900 leading-tight">Dr. Santos · Cardiology</p>
                        <p className="text-[11px] text-gray-500 leading-tight">Fri, Sep 25 · 10:30 AM</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating credential card */}
              <div className="absolute bottom-6 left-0 bg-white rounded-lg p-5 border border-gray-200 shadow-[0_8px_30px_rgb(15,23,42,0.1)] max-w-[15rem]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 shrink-0 bg-brand-teal-light rounded-md flex items-center justify-center">
                    <svg className="w-5 h-5 text-brand-teal-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
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

      {/* Features Section */}
      <section className="px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-28">
        <div className="container mx-auto max-w-7xl">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 max-w-xl tracking-tight">
              Everything a clinic needs, built in
            </h2>
            <Link
              href="/features"
              className="inline-flex items-center gap-2 text-brand-teal-dark font-semibold hover:text-brand-teal shrink-0"
            >
              View all features
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>

          <div className="space-y-20 sm:space-y-24">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center ${
                  i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''
                }`}
              >
                <div className="relative h-72 sm:h-96 lg:h-[420px]">
                  <div
                    className={`absolute -inset-10 rounded-full blur-3xl opacity-20 ${
                      feature.accent === 'teal' ? 'bg-brand-teal' : 'bg-brand-blue'
                    }`}
                  />
                  <div className="relative h-full w-full" style={blendMask}>
                    <Image
                      src={feature.image}
                      alt={feature.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                  </div>
                </div>
                <div>
                  <div
                    className={`w-11 h-11 rounded-md flex items-center justify-center mb-5 ${
                      feature.accent === 'teal' ? 'bg-brand-teal-light' : 'bg-blue-50'
                    }`}
                  >
                    <svg
                      className={`w-5 h-5 ${feature.accent === 'teal' ? 'text-brand-teal-dark' : 'text-brand-blue'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      {feature.icon}
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed max-w-md">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Links Section */}
      <section className="border-t border-gray-200 bg-brand-teal-light/40 px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
        <div className="container mx-auto max-w-7xl">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-10 tracking-tight">
            Quick access
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group bg-white p-6 hover:bg-brand-teal-light/60 transition-colors duration-150"
              >
                <div className="w-10 h-10 bg-brand-teal-light rounded-md flex items-center justify-center mb-4 group-hover:bg-brand-teal transition-colors duration-150">
                  <svg className="w-5 h-5 text-brand-teal-dark group-hover:text-white transition-colors duration-150" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {link.icon}
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{link.title}</h3>
                <p className="text-sm text-gray-500">{link.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="relative bg-brand-navy px-4 sm:px-6 lg:px-8 py-20 sm:py-24 overflow-hidden">
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
        <div className="container relative mx-auto max-w-4xl text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 tracking-tight">
            Need help?
          </h2>
          <p className="text-base sm:text-lg text-slate-300 mb-10 max-w-xl mx-auto leading-relaxed">
            Our support team is here to assist you. Contact us for any questions or concerns.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <a
              href="mailto:support@myclinicsoft.com"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-brand-navy rounded-md font-semibold hover:bg-slate-100 transition-colors duration-150 text-sm sm:text-base"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email Support
            </a>
            <a
              href="tel:+1234567890"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-transparent text-white rounded-md font-semibold border border-white/30 hover:border-white/60 transition-colors duration-150 text-sm sm:text-base"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call Us
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
