import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Features: EMR, Scheduling, Queues & Billing',
  path: '/features',
  description: 'Every MyClinicSoft module in one place: patient records, appointments, queue management, prescriptions, lab results, referrals, billing, inventory, reports, and audit logs.',
});

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
  briefcase: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  chart: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  document: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  flask: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
  chip: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
  swap: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
  clipboard: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  money: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  cube: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  sparkle: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  bell: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  phone: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
  chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  lock: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
};

type Feature = {
  title: string;
  description: string;
  icon: string;
  points: string[];
  image?: string;
};

type Category = {
  id: string;
  title: string;
  blurb: string;
  features: Feature[];
};

const unsplash = (id: string) =>
  `https://images.unsplash.com/photo-${id}?ixlib=rb-4.0.3&auto=format&fit=crop&w=900&h=600&q=80`;

const categories: Category[] = [
  {
    id: 'core',
    title: 'Core',
    blurb: 'The records, people, and calendar every clinic runs on.',
    features: [
      {
        title: 'Patient Management',
        description: 'Complete records with medical history, allergies, medications, and files — in one secure place.',
        icon: icons.users,
        image: unsplash('1551601651-2a8555f1a136'),
        points: ['Registration & profiles', 'Medical history', 'Allergies & medications', 'File attachments', 'Patient alerts', 'QR code login'],
      },
      {
        title: 'Doctor & Staff',
        description: 'Profiles, specializations, schedules, and roles for everyone on your team.',
        icon: icons.briefcase,
        image: unsplash('1559839734-2b71ea197ec2'),
        points: ['Doctor profiles', 'Specializations', 'Availability', 'Role assignment', 'Productivity reports', 'Medical reps'],
      },
      {
        title: 'Appointment Scheduling',
        description: 'Online booking plus staff scheduling, with SMS and email reminders that cut no-shows.',
        icon: icons.calendar,
        image: unsplash('1519494026892-80bbd2d6fd0d'),
        points: ['Calendar view', 'Online booking', 'SMS & email reminders', 'Confirmations', 'Waitlist', 'Recurring visits'],
      },
      {
        title: 'Dashboard',
        description: 'A live view of today’s visits, revenue, and quick actions — tailored to each role.',
        icon: icons.chart,
        image: unsplash('1551288049-bebda4e38f71'),
        points: ['Real-time stats', 'Role-based views', 'Quick actions', 'Revenue tracking', 'Patient statistics'],
      },
    ],
  },
  {
    id: 'clinical',
    title: 'Clinical',
    blurb: 'Documentation and care tools built around the consult room.',
    features: [
      {
        title: 'Visit Management',
        description: 'SOAP notes, ICD-10 diagnoses, vitals, and treatment plans for every encounter.',
        icon: icons.document,
        points: ['SOAP notes', 'ICD-10 coding', 'Vital signs', 'Physical exam', 'Treatment plans', 'Medical certificates'],
      },
      {
        title: 'Prescriptions',
        description: 'E-prescriptions with interaction checks, dosage help, and clean printouts.',
        icon: icons.flask,
        points: ['E-prescriptions', 'Interaction checks', 'Dosage calculations', 'Printing', 'Medication history', 'Dispense tracking'],
      },
      {
        title: 'Laboratory Results',
        description: 'Request, receive, and share lab results — patients are notified when they land.',
        icon: icons.chip,
        points: ['Lab requests', 'Third-party labs', 'Patient notifications', 'Result history', 'Secure sharing'],
      },
      {
        title: 'Referrals',
        description: 'Refer to specialists and follow each referral through to the outcome.',
        icon: icons.swap,
        points: ['Referral tracking', 'Specialist directory', 'Status updates', 'Notes & history', 'Follow-ups'],
      },
      {
        title: 'Queue Management',
        description: 'QR check-in, display screens, and live status so the waiting room runs itself.',
        icon: icons.clipboard,
        points: ['Digital queue', 'QR check-in', 'Display screens', 'Priority lanes', 'Live status', 'Queue analytics'],
      },
    ],
  },
  {
    id: 'administrative',
    title: 'Administrative',
    blurb: 'Money, stock, paperwork, and the trail that proves it all.',
    features: [
      {
        title: 'Billing & Invoices',
        description: 'Invoices, receipts, balances, and payment reminders — with HMO claims reporting.',
        icon: icons.money,
        points: ['Auto invoicing', 'Payment tracking', 'Receipts', 'Outstanding balances', 'Payment reminders', 'Multiple methods'],
      },
      {
        title: 'Inventory',
        description: 'Medicines and supplies with low-stock alerts and expiry tracking.',
        icon: icons.cube,
        points: ['Stock levels', 'Low-stock alerts', 'Reordering', 'Expiry dates', 'Adjustments', 'Inventory reports'],
      },
      {
        title: 'Documents',
        description: 'Upload, organize, and find medical documents and images in seconds.',
        icon: icons.document,
        points: ['Secure storage', 'Categories', 'Search', 'File sharing'],
      },
      {
        title: 'Reports & Analytics',
        description: 'Consultations, income, demographics, and HMO claims — export-ready.',
        icon: icons.chart,
        points: ['Consultations', 'Income', 'Demographics', 'HMO claims', 'Export'],
      },
      {
        title: 'Audit Logging',
        description: 'Every action and record access is logged for compliance and peace of mind.',
        icon: icons.shield,
        points: ['Full audit trail', 'User actions', 'Data access logs', 'Security monitoring', 'Audit reports'],
      },
      {
        title: 'Membership & Loyalty',
        description: 'Membership tiers, points, and referral rewards that bring patients back.',
        icon: icons.sparkle,
        points: ['Membership tiers', 'Points & rewards', 'Referral tracking', 'Retention tools'],
      },
    ],
  },
  {
    id: 'connect',
    title: 'Communication & access',
    blurb: 'How patients, rooms, and messages stay connected to the clinic.',
    features: [
      {
        title: 'eMCR Patient App',
        description: 'Patients book visits, follow their queue live, and keep results and prescriptions in their pocket.',
        icon: icons.phone,
        points: ['Online booking', 'Live queue status', 'Lab results', 'Prescriptions', 'Family profiles', 'One login across clinics'],
      },
      {
        title: 'Notifications',
        description: 'In-app alerts for appointments, results, and updates — with per-user preferences.',
        icon: icons.bell,
        points: ['Appointment reminders', 'Result alerts', 'Preferences', 'Unread tracking'],
      },
      {
        title: 'SMS',
        description: 'Automated reminders, confirmations, and bulk messages straight to patients’ phones.',
        icon: icons.chat,
        points: ['Reminders', 'Confirmations', 'Bulk sending', 'Templates'],
      },
      {
        title: 'Email',
        description: 'Appointment, result, and invoice emails from templates you control.',
        icon: icons.mail,
        points: ['Appointment emails', 'Result emails', 'Invoice emails', 'Templates'],
      },
      {
        title: 'Rooms',
        description: 'Assign visits to rooms and see utilization across your clinic.',
        icon: icons.home,
        points: ['Room assignment', 'Availability', 'Utilization', 'Multi-room'],
      },
      {
        title: 'Services & Pricing',
        description: 'A service catalog with prices that flows straight into billing.',
        icon: icons.briefcase,
        points: ['Service catalog', 'Pricing', 'Categories', 'Service-based billing', 'Service reports'],
      },
      {
        title: 'Security & Compliance',
        description: 'Built for the PH Data Privacy Act with role-based access and secure sign-in.',
        icon: icons.lock,
        points: ['PH DPA compliance', 'Data encryption', 'Role-based access', 'Secure authentication', 'Backup & recovery'],
      },
    ],
  },
];

const totalModules = categories.reduce((n, c) => n + c.features.length, 0);

function PointChips({ points }: { points: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {points.map((p) => (
        <li key={p} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-700">
          {p}
        </li>
      ))}
    </ul>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <li className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow duration-200 hover:shadow-[0_12px_40px_rgb(15,23,42,0.08)] sm:[&:last-child:nth-child(odd)]:col-span-2">
      {feature.image && (
        <div className="relative h-44 overflow-hidden bg-brand-navy">
          <Image
            src={feature.image}
            alt=""
            fill
            className="object-cover opacity-90 transition-transform duration-500 ease-out group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/80 via-brand-navy/20 to-brand-navy/0" />
          <div className="absolute bottom-4 left-5 w-9 h-9 rounded-md bg-white/15 backdrop-blur-sm flex items-center justify-center text-white">
            <Icon d={feature.icon} />
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start gap-4 mb-4">
          {!feature.image && (
            <div className="w-10 h-10 shrink-0 rounded-md bg-brand-teal-light text-brand-teal-dark flex items-center justify-center">
              <Icon d={feature.icon} />
            </div>
          )}
          <div>
            <h3 className="text-lg font-bold text-gray-900 tracking-tight">{feature.title}</h3>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">{feature.description}</p>
          </div>
        </div>
        <div className="mt-auto">
          <PointChips points={feature.points} />
        </div>
      </div>
    </li>
  );
}

export default function FeaturesPage() {
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
            maskImage: 'radial-gradient(ellipse 80% 70% at 30% 10%, black 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 30% 10%, black 20%, transparent 75%)',
          }}
        />
        <div className="container relative mx-auto max-w-7xl py-12 sm:py-16 lg:py-20">
          <div className="max-w-3xl text-center lg:text-left mx-auto lg:mx-0">
            <div className="animate-fade-up-in inline-flex items-center gap-2 rounded-full border border-brand-teal/30 bg-brand-teal-light/70 px-3 py-1 text-xs sm:text-sm font-medium text-brand-teal-deep mb-5">
              <span className="h-2 w-2 rounded-full bg-brand-teal" />
              {totalModules} modules · one login
            </div>
            <h1 className="animate-fade-up-in text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold text-gray-900 mb-5 tracking-tight leading-[1.06]">
              Every tool your clinic needs,
              <br />
              <span className="text-brand-teal-dark">already built in</span>
            </h1>
            <p
              className="animate-fade-up-in text-base sm:text-lg text-gray-600 mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed"
              style={{ animationDelay: '90ms' }}
            >
              From the front desk to the consult room to billing, MyClinicSoft covers the whole visit —
              in one system your whole team shares.
            </p>
            <div
              className="animate-fade-up-in flex flex-col sm:flex-row gap-3 justify-center lg:justify-start"
              style={{ animationDelay: '160ms' }}
            >
              <Link
                href="/tenant-onboard"
                className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-teal text-white rounded-md font-semibold hover:bg-brand-teal-dark transition-colors duration-150 shadow-[0_6px_20px_rgba(14,165,164,0.3)]"
              >
                Start 14-day free trial
                <Icon d={icons.arrow} className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-900 rounded-md font-semibold border border-gray-300 hover:border-gray-900 transition-colors duration-150"
              >
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Category index */}
      <nav aria-label="Feature categories" className="border-y border-gray-200 bg-gray-50/70 px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="container mx-auto max-w-7xl">
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {categories.map((c, i) => (
              <li key={c.id}>
                <a
                  href={`#${c.id}`}
                  className="group flex h-full items-start gap-4 rounded-lg border border-transparent p-3 -m-px transition-colors duration-150 hover:border-gray-200 hover:bg-white"
                >
                  <span className="font-mono text-[11px] font-semibold text-gray-400 pt-1">0{i + 1}</span>
                  <span className="flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-gray-900 group-hover:text-brand-teal-dark">{c.title}</span>
                      <span className="font-mono text-xs text-gray-500 tabular-nums">{c.features.length}</span>
                    </span>
                    <span className="block text-sm text-gray-500 mt-1 leading-snug">{c.blurb}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      {/* Categories */}
      {categories.map((c, i) => (
        <section
          key={c.id}
          id={c.id}
          aria-labelledby={`${c.id}-heading`}
          className={`scroll-mt-20 px-4 sm:px-6 lg:px-8 py-14 sm:py-16 lg:py-20 ${i > 0 ? 'border-t border-gray-200' : ''}`}
        >
          <div className="container mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-8 lg:gap-12">
            <header className="lg:sticky lg:top-28 lg:self-start">
              <p className="font-mono text-xs font-semibold text-brand-teal-dark">0{i + 1}</p>
              <h2 id={`${c.id}-heading`} className="text-3xl font-extrabold text-gray-900 tracking-tight mt-1">
                {c.title}
              </h2>
              <p className="text-gray-600 mt-2 max-w-md">{c.blurb}</p>
              <p className="mt-4 text-sm text-gray-500">
                <span className="font-mono font-semibold text-gray-900">{c.features.length}</span> modules
              </p>
            </header>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {c.features.map((f) => (
                <FeatureCard key={f.title} feature={f} />
              ))}
            </ul>
          </div>
        </section>
      ))}

      {/* Closing CTA */}
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
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
              See it running in your clinic
            </h2>
            <p className="text-slate-300 max-w-lg mx-auto lg:mx-0">
              Try every module free for 14 days, then pick the plan that fits.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/tenant-onboard"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-brand-navy rounded-md font-semibold hover:bg-slate-100 transition-colors duration-150 text-sm"
            >
              Start free trial
              <Icon d={icons.arrow} className="w-4 h-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 text-white rounded-md font-semibold border border-white/30 hover:border-white/60 transition-colors duration-150 text-sm"
            >
              <Icon d={icons.money} className="w-4 h-4" />
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
