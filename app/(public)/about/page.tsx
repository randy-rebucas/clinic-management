import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { Icon, icons, NavyBand, PageHero, SectionHeading, buttonPrimary, buttonSecondary } from '@/components/PublicPage';

export const metadata: Metadata = pageMetadata({
  title: 'About Us',
  path: '/about',
  description: 'MyClinicSoft is clinic management software built for Philippine clinics by DevCom Digital. Learn about our mission, our values, and our commitment to patient data security.',
});

const values = [
  {
    icon: icons.shield,
    title: 'Security first',
    description: 'Patient data is protected with encryption, role-based access, and audit logs — built around the Data Privacy Act.',
  },
  {
    icon: icons.bolt,
    title: 'Practical innovation',
    description: 'We ship tools that remove real work from the front desk and the consult room, not features for their own sake.',
  },
  {
    icon: icons.users,
    title: 'Patient-centered',
    description: 'Everything we build is designed with patients and the people who care for them in mind.',
  },
  {
    icon: icons.checkCircle,
    title: 'Reliability',
    description: 'We aim for 99.9% uptime so your clinic keeps running, from first patient to last.',
  },
];

const reasons = [
  {
    title: 'One system',
    description: 'Patients, scheduling, queues, billing, and inventory in one platform — integrated, not bolted together.',
  },
  {
    title: 'Easy to pick up',
    description: 'Designed for healthcare staff, not IT teams. Most clinics are up and running with minimal training.',
  },
  {
    title: 'Always improving',
    description: 'Regular updates shaped by feedback from the doctors and staff who use it every day.',
  },
];

const products = [
  {
    name: 'MyClinicSoft',
    audience: 'For clinic teams',
    description: 'Records, appointments, queues, billing, PhilHealth and HMO claims, and inventory — for the front desk, doctors, and admins.',
    href: '/features',
    cta: 'Explore features',
  },
  {
    name: 'eMCR',
    audience: 'For patients',
    description: 'The Electronic MyClinic Record app: book visits, follow your queue live, and keep results and prescriptions in your pocket.',
    href: '/download',
    cta: 'Get the app',
  },
];

// Product facts only: usage or uptime figures go here once there's data to back them.
const stats = [
  { value: '14', label: 'Day free trial' },
  { value: '2FA', label: 'For staff sign-in' },
  { value: 'eMCR', label: 'Patient app' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <PageHero eyebrow="About us" title="Clinic software," accent="made for Philippine clinics">
        MyClinicSoft is built by DevCom Digital to take the paperwork out of running a clinic — so doctors and staff can
        spend their time on patients.
      </PageHero>

      {/* Mission */}
      <section className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-14 sm:py-16 lg:py-20">
        <div className="container mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal-dark mb-3">Our mission</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-5">
              Less admin, more patient care
            </h2>
            <div className="space-y-4 text-gray-600 leading-relaxed">
              <p>
                We believe healthcare providers should focus on what matters most: their patients. Our mission is to
                remove administrative burden and streamline clinic operations with technology that simply works.
              </p>
              <p>
                That means a complete, easy-to-use platform that helps clinics of every size deliver great care while
                meeting the highest standards of security and privacy.
              </p>
              <p>
                Every feature and every update is guided by one belief: better tools lead to better healthcare.
              </p>
            </div>
            <dl className="mt-8 grid grid-cols-3 gap-6 max-w-md border-t border-gray-200 pt-6">
              {stats.map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd className="font-mono text-2xl sm:text-3xl font-semibold text-gray-900 tabular-nums">{s.value}</dd>
                  <dd className="text-sm text-gray-500">{s.label}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative h-72 sm:h-96 lg:h-[28rem] overflow-hidden rounded-xl bg-brand-navy">
            <Image
              src="https://images.unsplash.com/photo-1551601651-2a8555f1a136?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=900&q=80"
              alt="Clinic team at work"
              fill
              className="object-cover opacity-90"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/60 to-brand-navy/0" />
            <div className="absolute bottom-5 left-5 right-5 sm:right-auto rounded-lg bg-white p-4 shadow-[0_8px_30px_rgb(15,23,42,0.15)] sm:max-w-[16rem]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 shrink-0 rounded-md bg-brand-teal-light text-brand-teal-dark flex items-center justify-center">
                  <Icon d={icons.shield} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Built for the PH Data Privacy Act</p>
                  <p className="text-xs text-gray-500">Audit-logged by design</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="border-y border-gray-200 bg-gray-50/70 px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="container mx-auto max-w-7xl">
          <SectionHeading title="Two products, one connected record">
            Clinics run on MyClinicSoft; their patients carry the same record in eMCR.
          </SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {products.map((p, i) => (
              <Link
                key={p.name}
                href={p.href}
                className={`group flex flex-col rounded-xl p-6 sm:p-8 transition-shadow duration-200 hover:shadow-[0_12px_40px_rgb(15,23,42,0.08)] ${
                  i === 0 ? 'bg-white border border-gray-200' : 'bg-brand-teal text-white'
                }`}
              >
                <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${i === 0 ? 'text-brand-teal-dark' : 'text-white/80'}`}>
                  {p.audience}
                </p>
                <h3 className={`text-2xl font-extrabold tracking-tight mt-2 ${i === 0 ? 'text-gray-900' : 'text-white'}`}>{p.name}</h3>
                <p className={`mt-2 leading-relaxed ${i === 0 ? 'text-gray-600' : 'text-white/90'}`}>{p.description}</p>
                <span className={`mt-6 inline-flex items-center gap-1.5 text-sm font-semibold ${i === 0 ? 'text-brand-teal-dark' : 'text-white'}`}>
                  {p.cta}
                  <Icon d={icons.arrow} className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="px-4 sm:px-6 lg:px-8 py-14 sm:py-16 lg:py-20">
        <div className="container mx-auto max-w-7xl">
          <SectionHeading title="What we value">The principles behind every decision we make.</SectionHeading>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {values.map((v) => (
              <li key={v.title} className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="w-10 h-10 rounded-md bg-brand-teal-light text-brand-teal-dark flex items-center justify-center mb-4">
                  <Icon d={v.icon} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 tracking-tight">{v.title}</h3>
                <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{v.description}</p>
              </li>
            ))}
          </ul>

          <div className="mt-14">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-6">Why clinics choose MyClinicSoft</h2>
            <ol className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
              {reasons.map((r, i) => (
                <li key={r.title} className="border-t border-gray-200 pt-4">
                  <span className="font-mono text-[11px] font-semibold text-gray-400">0{i + 1}</span>
                  <h3 className="font-semibold text-gray-900 mt-1">{r.title}</h3>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">{r.description}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-12 flex flex-col sm:flex-row gap-3">
            <Link href="/tenant-onboard" className={buttonPrimary}>
              Start 14-day free trial
              <Icon d={icons.arrow} className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
            </Link>
            <Link href="/security" className={buttonSecondary}>
              <Icon d={icons.shield} className="w-4 h-4 text-brand-teal-dark" />
              How we protect data
            </Link>
          </div>
        </div>
      </section>

      <NavyBand
        title="Want to talk to the team?"
        actions={[
          { href: '/contact', label: 'Contact us', icon: icons.chat, primary: true },
          { href: '/tenant-onboard', label: 'Start free trial', icon: icons.arrow },
        ]}
      >
        Questions about MyClinicSoft or eMCR — we answer patients and clinics alike.
      </NavyBand>
    </div>
  );
}
