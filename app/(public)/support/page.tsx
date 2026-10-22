import Link from 'next/link';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { Icon, icons, NavyBand, PageHero, SectionHeading, SUPPORT_EMAIL, SupportHours } from '@/components/PublicPage';

export const metadata: Metadata = pageMetadata({
  title: 'Help Center',
  path: '/support',
  description: 'Get help with MyClinicSoft: find answers to common questions, browse guides, and contact our support team.',
});

const paths = [
  {
    icon: icons.lifebuoy,
    audience: 'Clinic admins',
    title: 'Open a support request',
    description: 'Log in and send a request from your clinic. You’ll get replies in the app and by email. Other staff can ask their clinic admin.',
    href: '/admin/support',
    cta: 'Go to support requests',
    featured: true,
  },
  {
    icon: icons.question,
    audience: 'Everyone',
    title: 'Browse the FAQ',
    description: 'Quick answers about pricing, features, security, and the eMCR app.',
    href: '/faq',
    cta: 'Read the FAQ',
    featured: false,
  },
  {
    icon: icons.mail,
    audience: 'Patients & visitors',
    title: 'Send us a message',
    description: 'Not a clinic user, or can’t log in? Write to us and we’ll help.',
    href: '/contact',
    cta: 'Contact us',
    featured: false,
  },
];

const quickLinks = [
  { title: 'Feature overview', href: '/features', icon: icons.book },
  { title: 'Plans & pricing', href: '/pricing', icon: icons.checkCircle },
  { title: 'Security & privacy', href: '/security', icon: icons.shield },
  { title: 'Integrations & API', href: '/integrations', icon: icons.key },
  { title: 'Get the eMCR app', href: '/download', icon: icons.phone },
  { title: 'Report a bug', href: '/contact', icon: icons.bug },
];

const enterprise = [
  { label: 'Availability', value: '24/7' },
  { label: 'Response time', value: '1–2 hours' },
  { label: 'Dedicated manager', value: 'Included' },
];

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-white">
      <PageHero eyebrow="Help center" title="How can we" accent="help you today?">
        Pick the path that fits — clinic admins get the fastest help from inside the app.
      </PageHero>

      {/* Paths */}
      <section className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="container mx-auto max-w-7xl">
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {paths.map((p) => (
              <li key={p.title}>
                <Link
                  href={p.href}
                  className={`group flex h-full flex-col rounded-xl p-6 transition-shadow duration-200 hover:shadow-[0_12px_40px_rgb(15,23,42,0.08)] ${
                    p.featured ? 'bg-brand-teal text-white' : 'border border-gray-200 bg-white'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-md flex items-center justify-center mb-4 ${
                      p.featured ? 'bg-white/15 text-white' : 'bg-brand-teal-light text-brand-teal-dark'
                    }`}
                  >
                    <Icon d={p.icon} />
                  </div>
                  <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${p.featured ? 'text-white/80' : 'text-gray-500'}`}>
                    {p.audience}
                  </p>
                  <h2 className={`text-lg font-bold tracking-tight mt-1 ${p.featured ? 'text-white' : 'text-gray-900'}`}>{p.title}</h2>
                  <p className={`text-sm mt-1.5 leading-relaxed ${p.featured ? 'text-white/90' : 'text-gray-600'}`}>{p.description}</p>
                  <span
                    className={`mt-auto pt-5 inline-flex items-center gap-1.5 text-sm font-semibold ${
                      p.featured ? 'text-white' : 'text-brand-teal-dark'
                    }`}
                  >
                    {p.cta}
                    <Icon d={icons.arrow} className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Quick links + hours */}
      <section className="border-t border-gray-200 bg-gray-50/70 px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="container mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[1fr_24rem] gap-10 lg:gap-14">
          <div>
            <SectionHeading title="Quick links">Guides and pages people look for most.</SectionHeading>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {quickLinks.map((l) => (
                <li key={l.title}>
                  <Link
                    href={l.href}
                    className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3.5 transition-colors duration-150 hover:border-brand-teal/50"
                  >
                    <Icon d={l.icon} className="w-5 h-5 shrink-0 text-brand-teal-dark" />
                    <span className="flex-1 font-medium text-gray-900">{l.title}</span>
                    <Icon
                      d={icons.chevron}
                      className="w-4 h-4 text-gray-300 transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-brand-teal"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <SectionHeading title="Support hours" />
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 mb-3">Standard</p>
                <SupportHours />
              </div>
              <div className="border-t border-gray-200 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal-dark mb-3">Enterprise</p>
                <dl className="divide-y divide-gray-100 text-sm">
                  {enterprise.map((e) => (
                    <div key={e.label} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                      <dt className="text-gray-600">{e.label}</dt>
                      <dd className="font-mono font-semibold text-gray-900 tabular-nums">{e.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </div>
      </section>

      <NavyBand
        title="Still need help?"
        actions={[
          { href: `mailto:${SUPPORT_EMAIL}`, label: 'Email support', icon: icons.mail, primary: true },
          { href: '/contact', label: 'Contact us', icon: icons.chat },
        ]}
      >
        Reach our support team directly and we&apos;ll get back to you as soon as we can.
      </NavyBand>
    </div>
  );
}
